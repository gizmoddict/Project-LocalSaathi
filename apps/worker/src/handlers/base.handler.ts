// ==============================================================================
// LocalSaathi — Base Queue Job Handler Architecture (Phase 20)
// Universal Validation, Idempotency Sentinel, Error Taxonomy, Timeout & DLQ Routing
// ==============================================================================

import Redis from 'ioredis';
import { UnrecoverableError } from 'bullmq';
import { ZodError } from 'zod';
import {
  FailureCategory,
  JobContract,
  QueueName,
} from '@localsaathi/types';
import {
  jobContractSchema,
  getPayloadSchemaForQueue,
} from '@localsaathi/validation';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export abstract class BaseJobHandler<T = Record<string, unknown>> {
  abstract readonly queueName: QueueName;
  abstract readonly defaultTimeoutMs: number;

  constructor(
    protected readonly redis: Redis,
    protected readonly dlqService: DeadLetterQueueService,
  ) {}

  /**
   * Abstract business execution logic implemented by specific queue worker.
   */
  protected abstract process(job: JobContract<T>): Promise<void>;

  /**
   * Main entrypoint called by BullMQ Worker processor.
   */
  async execute(rawJobData: unknown): Promise<void> {
    const startTime = Date.now();
    let validatedEnvelope: JobContract<T> | null = null;

    try {
      // 1. Strict Schema Validation (Envelope & Queue-Specific Payload)
      validatedEnvelope = this.validateEnvelope(rawJobData);

      // 2. Dual-Layer Idempotency Guard (Redis Sentinel Key)
      const isNew = await this.acquireIdempotencyLock(
        this.queueName,
        validatedEnvelope.idempotencyKey,
      );

      if (!isNew) {
        // eslint-disable-next-line no-console
        console.info(
          `[${this.queueName}] Idempotent skip: Job already executed (idempotencyKey=${validatedEnvelope.idempotencyKey})`,
        );
        return;
      }

      // 3. Execution with Bounded Timeout
      await this.executeWithTimeout(
        () => this.process(validatedEnvelope!),
        this.defaultTimeoutMs,
      );

      // 4. Mark execution permanently completed in idempotency cache (24h retention)
      await this.markIdempotencyCompleted(
        this.queueName,
        validatedEnvelope.idempotencyKey,
      );

      const durationMs = Date.now() - startTime;
      const corrTag = validatedEnvelope.correlationId ? ` [correlationId=${validatedEnvelope.correlationId}]` : '';
      // eslint-disable-next-line no-console
      console.info(
        `[${this.queueName}] Successfully processed job ${validatedEnvelope.jobId} (${validatedEnvelope.jobName}) in ${durationMs}ms${corrTag}`,
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const { isRetryable, category } = this.classifyError(err);
      const corrTag = validatedEnvelope?.correlationId ? ` [correlationId=${validatedEnvelope.correlationId}]` : '';

      // eslint-disable-next-line no-console
      console.error(
        `[${this.queueName}] Job failure (category=${category}, retryable=${isRetryable}): ${errorMsg}${corrTag}`,
      );

      // If envelope could be parsed, check if non-retryable or final attempt
      if (validatedEnvelope) {
        if (!isRetryable) {
          // Immediately record to DLQ and halt BullMQ retries
          await this.dlqService.recordFailure(
            this.queueName,
            validatedEnvelope,
            err,
            category,
          );
          throw new UnrecoverableError(`Non-retryable failure: ${errorMsg}`);
        }
      } else {
        // Validation of envelope itself failed: fatal non-retryable
        const fallbackContract: JobContract<any> = {
          jobName: 'unknown.malformed',
          schemaVersion: 1,
          jobId: 'unknown',
          createdAt: new Date().toISOString(),
          attemptCount: 1,
          priority: 10,
          idempotencyKey: `malformed-${Date.now()}`,
          payload: { raw: String(rawJobData) },
        };
        await this.dlqService.recordFailure(
          this.queueName,
          fallbackContract,
          err,
          'VALIDATION_FAILED',
        );
        throw new UnrecoverableError(`Malformed job payload: ${errorMsg}`);
      }

      // Re-throw retryable error to trigger BullMQ exponential backoff
      throw err;
    }
  }

  /**
   * Validates both outer JobContract envelope and inner domain payload using Zod.
   */
  private validateEnvelope(raw: unknown): JobContract<T> {
    const envelopeResult = jobContractSchema.safeParse(raw);
    if (!envelopeResult.success) {
      throw new ZodError(envelopeResult.error.issues);
    }

    const payloadSchema = getPayloadSchemaForQueue(this.queueName);
    const payloadResult = payloadSchema.safeParse(envelopeResult.data.payload);
    if (!payloadResult.success) {
      throw new ZodError(payloadResult.error.issues);
    }

    return {
      ...envelopeResult.data,
      payload: payloadResult.data as T,
    };
  }

  /**
   * Redis Idempotency Key management:
   * Sets key with NX flag. If key exists, job was already claimed or processed.
   */
  private async acquireIdempotencyLock(
    queue: QueueName,
    key: string,
  ): Promise<boolean> {
    const lockKey = `local_saathi:v1:worker:idempotency:${queue}:${key}`;
    // 300 second processing lease
    const result = await this.redis.set(lockKey, 'IN_PROGRESS', 'EX', 300, 'NX');
    return result === 'OK';
  }

  private async markIdempotencyCompleted(
    queue: QueueName,
    key: string,
  ): Promise<void> {
    const lockKey = `local_saathi:v1:worker:idempotency:${queue}:${key}`;
    // 24-hour completed TTL
    await this.redis.set(lockKey, 'COMPLETED', 'EX', 86400);
  }

  /**
   * Wraps promise execution with strict timeout cancellation.
   */
  private async executeWithTimeout(
    fn: () => Promise<void>,
    timeoutMs: number,
  ): Promise<void> {
    let timerId: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error(`Job processing timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  }

  /**
   * Comprehensive error categorization:
   * Identifies transient vs permanent errors.
   */
  protected classifyError(err: unknown): {
    isRetryable: boolean;
    category: FailureCategory;
  } {
    if (err instanceof ZodError) {
      return { isRetryable: false, category: 'VALIDATION_FAILED' };
    }

    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

    if (
      msg.includes('validation') ||
      msg.includes('invalid') ||
      msg.includes('malformed') ||
      msg.includes('syntax')
    ) {
      return { isRetryable: false, category: 'VALIDATION_FAILED' };
    }

    if (
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('permission') ||
      msg.includes('rejected') ||
      msg.includes('not permitted')
    ) {
      return { isRetryable: false, category: 'BUSINESS_REJECTED' };
    }

    if (msg.includes('timed out') || msg.includes('timeout')) {
      return { isRetryable: true, category: 'TIMEOUT' };
    }

    if (
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('etimedout') ||
      msg.includes('network') ||
      msg.includes('connection lost')
    ) {
      return { isRetryable: true, category: 'TRANSIENT_NETWORK' };
    }

    if (
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('rate limit') ||
      msg.includes('throttl')
    ) {
      return { isRetryable: true, category: 'PROVIDER_OUTAGE' };
    }

    // Default system error
    return { isRetryable: true, category: 'FATAL_SYSTEM' };
  }
}
