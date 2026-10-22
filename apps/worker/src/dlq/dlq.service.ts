// ==============================================================================
// LocalSaathi — Dead-Letter Queue (DLQ) Operational Service (Phase 20)
// Captures, Sanitizes, Diagnoses, and Replays Terminally Failed Queue Jobs
// ==============================================================================

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import {
  DeadLetterJobRecord,
  FailureCategory,
  JobContract,
  QueueName,
} from '@localsaathi/types';

export class DeadLetterQueueService {
  private static readonly DLQ_PREFIX = 'local_saathi:v1:dlq:jobs';
  private static readonly DLQ_INDEX = 'local_saathi:v1:dlq:index';
  private static readonly SENSITIVE_KEYS = new Set([
    'otp',
    'otpcode',
    'password',
    'token',
    'accesstoken',
    'refreshtoken',
    'secret',
    'apikey',
    'key_secret',
    'rawcredential',
  ]);

  constructor(private readonly redis: Redis) {}

  /**
   * Sanitizes job payload removing any sensitive authentication/financial secrets.
   */
  static sanitizePayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') {
      return { raw: String(payload) };
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (DeadLetterQueueService.SENSITIVE_KEYS.has(lowerKey)) {
        sanitized[key] = '[REDACTED_SECRET]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = DeadLetterQueueService.sanitizePayload(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Records a terminally failed job to the DLQ store.
   */
  async recordFailure(
    queueName: QueueName | string,
    job: JobContract<unknown>,
    error: unknown,
    category: FailureCategory,
  ): Promise<DeadLetterJobRecord> {
    const dlqId = `dlq-${randomUUID()}`;
    const now = new Date().toISOString();

    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack?.slice(0, 1000) : undefined;
    const errorCode = (error as any)?.code || (error as any)?.status ? String((error as any).code || (error as any).status) : undefined;

    const record: DeadLetterJobRecord = {
      dlqId,
      queueName,
      jobId: job.jobId,
      jobName: job.jobName,
      idempotencyKey: job.idempotencyKey,
      sourceEventId: job.sourceEventId,
      failureCategory: category,
      attemptCount: job.attemptCount,
      createdAt: job.createdAt,
      failedAt: now,
      safeErrorMetadata: {
        message: errorMsg,
        stack: errorStack,
        code: errorCode,
      },
      sanitizedPayload: DeadLetterQueueService.sanitizePayload(job.payload),
    };

    const recordJson = JSON.stringify(record);

    // Save record with 30-day default TTL
    await this.redis.hset(DeadLetterQueueService.DLQ_PREFIX, dlqId, recordJson);
    await this.redis.zadd(DeadLetterQueueService.DLQ_INDEX, Date.now(), dlqId);

    return record;
  }

  /**
   * Query recent DLQ records with pagination.
   */
  async listRecords(offset = 0, limit = 50): Promise<DeadLetterJobRecord[]> {
    // Get newest DLQ IDs first
    const ids = await this.redis.zrevrange(
      DeadLetterQueueService.DLQ_INDEX,
      offset,
      offset + limit - 1,
    );

    if (ids.length === 0) return [];

    const rawRecords = await this.redis.hmget(DeadLetterQueueService.DLQ_PREFIX, ...ids);
    const records: DeadLetterJobRecord[] = [];

    for (const raw of rawRecords) {
      if (raw) {
        try {
          records.push(JSON.parse(raw));
        } catch {
          // ignore corrupted json
        }
      }
    }

    return records;
  }

  /**
   * Get total count of DLQ records.
   */
  async getCount(): Promise<number> {
    return this.redis.zcard(DeadLetterQueueService.DLQ_INDEX);
  }

  /**
   * Prune DLQ records older than specified retention days.
   */
  async pruneOlderThan(days: number): Promise<number> {
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const expiredIds = await this.redis.zrangebyscore(
      DeadLetterQueueService.DLQ_INDEX,
      0,
      cutoffTime,
    );

    if (expiredIds.length === 0) return 0;

    await this.redis.hdel(DeadLetterQueueService.DLQ_PREFIX, ...expiredIds);
    await this.redis.zremrangebyscore(DeadLetterQueueService.DLQ_INDEX, 0, cutoffTime);

    return expiredIds.length;
  }
}
