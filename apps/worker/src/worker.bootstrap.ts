// ==============================================================================
// LocalSaathi — Background Worker Bootstrap & Lifecycle Engine (Phase 20)
// Worker Isolation, Concurrency Bounds, Health Observability & Graceful Shutdown
// ==============================================================================

import Redis from 'ioredis';
import { Worker, Queue, Job } from 'bullmq';
import { PrismaClient } from '@localsaathi/database';
import {
  QueueName,
  WorkerPlatformHealth,
  QueueHealthStats,
} from '@localsaathi/types';
import { getRedisConnectionOptions } from './config/redis.config';
import { QUEUE_CONFIG_POLICIES } from './config/queue.config';
import { DeadLetterQueueService } from './dlq/dlq.service';
import { ScheduledJobsManager } from './scheduler/scheduled-jobs.manager';

// Handlers
import { NotificationWorkerHandler } from './handlers/notification.worker-handler';
import { SmsWorkerHandler } from './handlers/sms.worker-handler';
import { EmailWorkerHandler } from './handlers/email.worker-handler';
import { AnalyticsWorkerHandler } from './handlers/analytics.worker-handler';
import { SearchIndexingWorkerHandler } from './handlers/search-indexing.worker-handler';
import { PaymentReconciliationWorkerHandler } from './handlers/payment-reconciliation.worker-handler';
import { ImageProcessingWorkerHandler } from './handlers/image-processing.worker-handler';
import { VoiceProcessingWorkerHandler } from './handlers/voice-processing.worker-handler';
import { TranslationWorkerHandler } from './handlers/translation.worker-handler';
import { EmbeddingWorkerHandler } from './handlers/embedding.worker-handler';
import { RecommendationsWorkerHandler } from './handlers/recommendations.worker-handler';
import { CleanupWorkerHandler } from './handlers/cleanup.worker-handler';
import { BaseJobHandler } from './handlers/base.handler';

export class WorkerBootstrap {
  private isRunning = false;
  private redisRetryTimer: NodeJS.Timeout | null = null;
  private isInitializing = false;
  private readonly startTime = Date.now();
  private redisClient: Redis | null = null;
  private prismaClient: PrismaClient | null = null;
  private dlqService: DeadLetterQueueService | null = null;
  private scheduler: ScheduledJobsManager | null = null;

  private readonly workers = new Map<QueueName, Worker>();
  private readonly queues = new Map<QueueName, Queue>();
  private readonly handlers = new Map<QueueName, BaseJobHandler<any>>();

  // Internal counters for observability
  private completedCount = 0;
  private failedCount = 0;

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // eslint-disable-next-line no-console
    console.info('[LocalSaathi Worker] Starting unified background worker platform...');

    await this.initializePlatform();
  }

  private async initializePlatform(): Promise<void> {
    if (!this.isRunning || this.isInitializing || this.redisClient) return;
    this.isInitializing = true;

    try {
      // 1. Initialize Redis and Prisma
      const redisOptions = getRedisConnectionOptions();
      const redisClient = new Redis(redisOptions);
      this.redisClient = redisClient;
      redisClient.on('error', () => {
        // Redis may be down during local development; keep the worker idle without crashing the process.
      });

      try {
        if (redisClient.status === 'wait') {
          await redisClient.connect();
        }
        await redisClient.ping();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `[LocalSaathi Worker] Redis connection failed at ${redisOptions.host}:${redisOptions.port}: ${
            error instanceof Error ? error.message : String(error)
          }. Retrying in 5 seconds.`,
        );
        redisClient.disconnect();
        if (this.redisClient === redisClient) this.redisClient = null;
        this.dlqService = null;
        this.prismaClient = null;
        this.scheduleRedisRetry();
        return;
      }

      if (!this.isRunning || this.redisClient !== redisClient) {
        redisClient.disconnect();
        return;
      }

      this.prismaClient = new PrismaClient();
      this.dlqService = new DeadLetterQueueService(redisClient);

      // 2. Initialize Handlers
      this.initializeHandlers();

      // 3. Initialize BullMQ Queues and Workers per policy
      for (const [queueName, policy] of Object.entries(QUEUE_CONFIG_POLICIES)) {
        const qName = queueName as QueueName;
        const handler = this.handlers.get(qName);

        if (!handler) {
          // eslint-disable-next-line no-console
          console.warn(`[LocalSaathi Worker] No handler registered for queue: ${qName}`);
          continue;
        }

        // Initialize Queue instance
        const queue = new Queue(qName, {
          connection: redisOptions,
          defaultJobOptions: {
            attempts: policy.maxRetries,
            backoff: {
              type: 'exponential',
              delay: policy.initialBackoffMs,
            },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          },
        });
        this.queues.set(qName, queue);

        // Initialize BullMQ Worker with isolated concurrency
        const worker = new Worker(
          qName,
          async (job: Job) => {
            // Increment attempt counter in contract
            const data = job.data;
            if (data && typeof data === 'object') {
              data.attemptCount = job.attemptsMade;
            }
            await handler.execute(data);
          },
          {
            connection: redisOptions,
            concurrency: policy.concurrency,
            limiter: policy.rateLimit
              ? {
                  max: policy.rateLimit.max,
                  duration: policy.rateLimit.durationMs,
                }
              : undefined,
          },
        );

        // Setup Worker-level telemetry events (does NOT crash on individual job failure)
        worker.on('completed', (job: Job) => {
          this.completedCount++;
          // eslint-disable-next-line no-console
          console.debug(`[${qName}] Job ${job.id} marked COMPLETED in queue`);
        });

        worker.on('failed', (job: Job | undefined, err: Error) => {
          this.failedCount++;
          // eslint-disable-next-line no-console
          console.error(`[${qName}] Job ${job?.id || 'unknown'} FAILED: ${err.message}`);
        });

        worker.on('error', (err: Error) => {
          // eslint-disable-next-line no-console
          console.error(`[${qName}] Worker process error: ${err.message}`);
        });

        this.workers.set(qName, worker);
      }

      // 4. Initialize and start distributed scheduler
      this.scheduler = new ScheduledJobsManager(redisClient, this.queues);
      this.scheduler.start();

      // eslint-disable-next-line no-console
      console.info(
        `[LocalSaathi Worker] Platform successfully initialized with ${this.workers.size} active worker queues.`,
      );
    } finally {
      this.isInitializing = false;
    }
  }

  private scheduleRedisRetry(): void {
    if (!this.isRunning || this.redisRetryTimer) return;

    this.redisRetryTimer = setTimeout(() => {
      this.redisRetryTimer = null;
      void this.initializePlatform().catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[LocalSaathi Worker] Failed to initialize after Redis became available:', error);
        this.scheduleRedisRetry();
      });
    }, 5000);
  }

  private initializeHandlers(): void {
    if (!this.redisClient || !this.dlqService || !this.prismaClient) return;

    this.handlers.set(
      QueueName.NOTIFICATIONS,
      new NotificationWorkerHandler(this.redisClient, this.dlqService, this.prismaClient),
    );
    this.handlers.set(
      QueueName.SMS,
      new SmsWorkerHandler(this.redisClient, this.dlqService),
    );
    this.handlers.set(
      QueueName.EMAIL,
      new EmailWorkerHandler(this.redisClient, this.dlqService),
    );
    this.handlers.set(
      QueueName.ANALYTICS,
      new AnalyticsWorkerHandler(this.redisClient, this.dlqService, this.prismaClient),
    );
    this.handlers.set(
      QueueName.SEARCH_INDEXING,
      new SearchIndexingWorkerHandler(this.redisClient, this.dlqService),
    );
    this.handlers.set(
      QueueName.PAYMENT_RECONCILIATION,
      new PaymentReconciliationWorkerHandler(this.redisClient, this.dlqService, this.prismaClient),
    );
    this.handlers.set(
      QueueName.IMAGE_PROCESSING,
      new ImageProcessingWorkerHandler(this.redisClient, this.dlqService),
    );
    this.handlers.set(
      QueueName.VOICE_PROCESSING,
      new VoiceProcessingWorkerHandler(this.redisClient, this.dlqService),
    );
    this.handlers.set(
      QueueName.TRANSLATION,
      new TranslationWorkerHandler(this.redisClient, this.dlqService),
    );
    this.handlers.set(
      QueueName.EMBEDDING_GENERATION,
      new EmbeddingWorkerHandler(this.redisClient, this.dlqService),
    );
    this.handlers.set(
      QueueName.RECOMMENDATIONS,
      new RecommendationsWorkerHandler(this.redisClient, this.dlqService),
    );
    this.handlers.set(
      QueueName.CLEANUP,
      new CleanupWorkerHandler(this.redisClient, this.dlqService, this.prismaClient),
    );
  }

  /**
   * Retrieves operational health and telemetry metrics for the worker platform.
   */
  async getHealthStatus(): Promise<WorkerPlatformHealth> {
    const queueStats: Record<string, QueueHealthStats> = {};
    let dlqCount = 0;

    if (this.dlqService) {
      try {
        dlqCount = await this.dlqService.getCount();
      } catch {
        // Redis may be temporarily unreachable
      }
    }

    for (const [qName, queue] of this.queues.entries()) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        queueStats[qName] = {
          queueName: qName,
          isPaused: await queue.isPaused(),
          waitingCount: counts.waiting || 0,
          activeCount: counts.active || 0,
          completedCount: counts.completed || 0,
          failedCount: counts.failed || 0,
          delayedCount: counts.delayed || 0,
          dlqCount,
          throughputPerMinute: 0,
        };
      } catch {
        queueStats[qName] = {
          queueName: qName,
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

    const redisConnected = this.redisClient ? this.redisClient.status === 'ready' : false;

    return {
      status: this.isRunning && redisConnected ? 'HEALTHY' : 'DEGRADED',
      workerProcessId: process.pid,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      redisConnected,
      activeWorkerCount: this.workers.size,
      queues: queueStats,
      totalCompletedJobs: this.completedCount,
      totalFailedJobs: this.failedCount,
      totalDlqJobs: dlqCount,
    };
  }

  /**
   * Graceful Shutdown:
   * 1. Stops scheduler timers.
   * 2. Closes all workers, allowing in-flight jobs to complete.
   * 3. Closes BullMQ queues and Redis connections.
   * 4. Disconnects Prisma.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    // eslint-disable-next-line no-console
    console.info('[LocalSaathi Worker] Initiating graceful shutdown sequence...');

    if (this.redisRetryTimer) {
      clearTimeout(this.redisRetryTimer);
      this.redisRetryTimer = null;
    }

    if (this.scheduler) {
      this.scheduler.stop();
    }

    // Close all workers (bounded 10s wait for in-flight tasks)
    const workerClosePromises = Array.from(this.workers.values()).map((w) =>
      w.close().catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[LocalSaathi Worker] Error closing worker: ${err.message}`);
      }),
    );
    await Promise.all(workerClosePromises);
    this.workers.clear();

    // Close all queues
    const queueClosePromises = Array.from(this.queues.values()).map((q) =>
      q.close().catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[LocalSaathi Worker] Error closing queue: ${err.message}`);
      }),
    );
    await Promise.all(queueClosePromises);
    this.queues.clear();

    // Disconnect Redis
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch {
        this.redisClient.disconnect();
      }
      this.redisClient = null;
    }

    // Disconnect Prisma
    if (this.prismaClient) {
      await this.prismaClient.$disconnect().catch(() => undefined);
      this.prismaClient = null;
    }

    this.isRunning = false;
    // eslint-disable-next-line no-console
    console.info('[LocalSaathi Worker] Graceful shutdown completed. All resources released.');
  }

  getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}
