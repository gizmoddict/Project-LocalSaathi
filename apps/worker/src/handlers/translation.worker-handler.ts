// ==============================================================================
// LocalSaathi — Translation Queue Worker Handler (Phase 20)
// Asynchronous Multilingual Content Localization for Jobs & Worker Profiles
// ==============================================================================

import Redis from 'ioredis';
import {
  JobContract,
  QueueName,
  TranslationJobPayload,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class TranslationWorkerHandler extends BaseJobHandler<TranslationJobPayload> {
  readonly queueName = QueueName.TRANSLATION;
  readonly defaultTimeoutMs = 20000;

  constructor(redis: Redis, dlqService: DeadLetterQueueService) {
    super(redis, dlqService);
  }

  protected async process(job: JobContract<TranslationJobPayload>): Promise<void> {
    const { entityType, entityId, sourceLang, targetLangs, fieldsToTranslate } = job.payload;

    // eslint-disable-next-line no-console
    console.info(
      `[TranslationWorker] Translating ${entityType}:${entityId} from ${sourceLang} into [${targetLangs.join(', ')}]...`,
    );

    // Simulated translation provider roundtrip (Google Cloud Translation / Bhashini API)
    await new Promise((resolve) => setTimeout(resolve, 20));

    // eslint-disable-next-line no-console
    console.info(
      `[TranslationWorker] Completed translation of ${Object.keys(fieldsToTranslate).length} field(s) for ${entityType}:${entityId}`,
    );
  }
}
