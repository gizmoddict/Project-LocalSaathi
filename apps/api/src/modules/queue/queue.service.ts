// ==============================================================================
// LocalSaathi — Unified Background Queue Producer Service (Phase 20)
// Centralized Job Enqueueing, Payload Validation, Idempotency & Outbox Bridging
// ==============================================================================

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisOptions } from 'ioredis';
import { randomUUID } from 'crypto';
import {
  JobContract,
  JobPriority,
  QueueName,
  QueueHealthStats,
} from '@localsaathi/types';
import {
  getPayloadSchemaForQueue,
  jobContractSchema,
} from '@localsaathi/validation';
import { getApiConfig } from '../../config/env.config';
import { MetricsService } from '../../common/observability/metrics.service';
import { Optional } from '@nestjs/common';

export interface EnqueueOptions {
  priority?: JobPriority;
  correlationId?: string;
  sourceEventId?: string;
  idempotencyKey?: string;
  delayMs?: number;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();
  private redisOptions: RedisOptions = {};
  private isConnected = false;

  constructor(@Optional() private readonly metricsService?: MetricsService) {}

  async onModuleInit(): Promise<void> {
    await this.initializeQueues();
  }

  async onModuleDestroy(): Promise<void> {
    for (const [name, queue] of this.queues.entries()) {
      try {
        await queue.close();
      } catch (err: any) {
        this.logger.warn(`Error closing queue ${name}: ${err.message}`);
      }
    }
    this.queues.clear();
  }

  private async initializeQueues(): Promise<void> {
    try {
      const config = getApiConfig();
      const host = config.REDIS_HOST || 'localhost';
      const port = config.REDIS_PORT || 6379;
      const password = config.REDIS_PASSWORD || undefined;

      this.redisOptions = {
        host,
        port,
        password,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };

      for (const queueName of Object.values(QueueName)) {
        const queue = new Queue(queueName, {
          connection: this.redisOptions,
          defaultJobOptions: {
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          },
        });
        this.queues.set(queueName, queue);
      }

      this.isConnected = true;
      this.logger.log(`QueueService initialized with ${this.queues.size} BullMQ queues`);
    } catch (err: any) {
      this.logger.warn(`Redis Queue connection error (running in degraded offline mode): ${err.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Enqueues a typed, schema-validated job to the specified queue.
   */
  async enqueueJob<T = Record<string, unknown>>(
    queueName: QueueName,
    jobName: string,
    payload: T,
    options: EnqueueOptions = {},
  ): Promise<JobContract<T>> {
    // 1. Validate payload using queue-specific Zod schema
    const payloadSchema = getPayloadSchemaForQueue(queueName);
    const parsedPayload = payloadSchema.parse(payload) as T;

    const jobId = options.idempotencyKey || `job-${randomUUID()}`;
    const idempotencyKey = options.idempotencyKey || `${queueName}:${jobId}`;

    const contract: JobContract<T> = {
      jobName,
      schemaVersion: 1,
      jobId,
      correlationId: options.correlationId,
      payload: parsedPayload,
      createdAt: new Date().toISOString(),
      attemptCount: 0,
      priority: options.priority || JobPriority.NORMAL,
      idempotencyKey,
      sourceEventId: options.sourceEventId,
    };

    // 2. Validate envelope schema
    jobContractSchema.parse(contract);

    // 3. Dispatch to BullMQ Queue if connected
    const queue = this.queues.get(queueName);
    if (!queue || !this.isConnected) {
      this.logger.warn(
        `Queue ${queueName} is offline; job ${jobId} buffered in domain outbox state`,
      );
      return contract;
    }

    try {
      await queue.add(jobName, contract, {
        jobId: idempotencyKey, // BullMQ deduplication by custom jobId
        priority: contract.priority,
        delay: options.delayMs || 0,
      });

      this.logger.debug(
        `Enqueued job ${jobId} (${jobName}) to ${queueName} [priority=${contract.priority}]`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to enqueue job ${jobId} to ${queueName}: ${err.message}`);
      throw err;
    }

    return contract;
  }

  /**
   * Returns operational status across all queues.
   */
  async getQueueStats(): Promise<Record<string, QueueHealthStats>> {
    const stats: Record<string, QueueHealthStats> = {};

    for (const [name, queue] of this.queues.entries()) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        stats[name] = {
          queueName: name,
          isPaused: await queue.isPaused(),
          waitingCount: counts.waiting || 0,
          activeCount: counts.active || 0,
          completedCount: counts.completed || 0,
          failedCount: counts.failed || 0,
          delayedCount: counts.delayed || 0,
          dlqCount: 0,
          throughputPerMinute: 0,
        };

        if (this.metricsService) {
          this.metricsService.setGauge('queue_jobs_waiting', counts.waiting || 0, { queue: name });
          this.metricsService.setGauge('queue_jobs_active', counts.active || 0, { queue: name });
        }
      } catch {
        stats[name] = {
          queueName: name,
          isPaused: false,
          waitingCount: 0,
          activeCount: 0,
          completedCount: 0,
          failedCount: 0,
          delayedCount: 0,
          dlqCount: 0,
          throughputPerMinute: 0,
        };
      }
    }

    return stats;
  }
}
