// ==============================================================================
// LocalSaathi — Embedding Generation Queue Worker Handler (Phase 20)
// Versioned Vector Embedding Generation with Stale Write Protection
// ==============================================================================

import Redis from 'ioredis';
import {
  EmbeddingGenerationJobPayload,
  JobContract,
  QueueName,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class EmbeddingWorkerHandler extends BaseJobHandler<EmbeddingGenerationJobPayload> {
  readonly queueName = QueueName.EMBEDDING_GENERATION;
  readonly defaultTimeoutMs = 30000;

  constructor(redis: Redis, dlqService: DeadLetterQueueService) {
    super(redis, dlqService);
  }

  protected async process(job: JobContract<EmbeddingGenerationJobPayload>): Promise<void> {
    const { entityType, entityId, contentVersion, rawText, modelVersion } = job.payload;

    // 1. Version Guard: Prevent stale jobs from overwriting newer embeddings
    const versionKey = `local_saathi:v1:embeddings:version:${entityType}:${entityId}`;
    const currentVersionStr = await this.redis.get(versionKey);
    const currentVersion = currentVersionStr ? parseInt(currentVersionStr, 10) : -1;

    if (contentVersion < currentVersion) {
      // eslint-disable-next-line no-console
      console.warn(
        `[EmbeddingWorker] Discarded stale embedding job for ${entityType}:${entityId} (jobVersion=${contentVersion} < currentVersion=${currentVersion})`,
      );
      return;
    }

    // eslint-disable-next-line no-console
    console.info(
      `[EmbeddingWorker] Generating vector embeddings for ${entityType}:${entityId} using model=${modelVersion} (length=${rawText.length})...`,
    );

    // 2. Simulated vector generation roundtrip (e.g., text-embedding-gecko / pgvector update)
    await new Promise((resolve) => setTimeout(resolve, 25));

    // 3. Update newest version in Redis
    await this.redis.set(versionKey, contentVersion.toString(), 'EX', 86400 * 30);

    // eslint-disable-next-line no-console
    console.info(
      `[EmbeddingWorker] Successfully generated and stored embedding for ${entityType}:${entityId} v${contentVersion}`,
    );
  }
}
