// ==============================================================================
// LocalSaathi — Recommendations Queue Worker Handler (Phase 20)
// Asynchronous Candidate Re-ranking & Personalized Matching Generation
// ==============================================================================

import Redis from 'ioredis';
import {
  JobContract,
  QueueName,
  RecommendationsJobPayload,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class RecommendationsWorkerHandler extends BaseJobHandler<RecommendationsJobPayload> {
  readonly queueName = QueueName.RECOMMENDATIONS;
  readonly defaultTimeoutMs = 20000;

  constructor(redis: Redis, dlqService: DeadLetterQueueService) {
    super(redis, dlqService);
  }

  protected async process(job: JobContract<RecommendationsJobPayload>): Promise<void> {
    const { workerUserId, radiusKm, limit, triggerEvent } = job.payload;

    // eslint-disable-next-line no-console
    console.info(
      `[RecommendationsWorker] Computing recommendations for worker=${workerUserId} (radius=${radiusKm}km, limit=${limit}, trigger=${triggerEvent || 'SCHEDULED'})...`,
    );

    // Simulated candidate ranking computation
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Store cached recommendation list in Redis with 1-hour TTL
    const cacheKey = `local_saathi:v1:recommendations:${workerUserId}`;
    await this.redis.set(
      cacheKey,
      JSON.stringify({ calculatedAt: Date.now(), items: [] }),
      'EX',
      3600,
    );

    // eslint-disable-next-line no-console
    console.info(
      `[RecommendationsWorker] Cached recommendations for worker=${workerUserId}`,
    );
  }
}
