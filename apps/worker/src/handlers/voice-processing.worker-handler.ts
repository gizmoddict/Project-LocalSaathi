// ==============================================================================
// LocalSaathi — Voice Processing Queue Worker Handler (Phase 20)
// Asynchronous Speech-to-Text Transcription & Audio Intent Extraction
// ==============================================================================

import Redis from 'ioredis';
import {
  JobContract,
  QueueName,
  VoiceProcessingJobPayload,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class VoiceProcessingWorkerHandler extends BaseJobHandler<VoiceProcessingJobPayload> {
  readonly queueName = QueueName.VOICE_PROCESSING;
  readonly defaultTimeoutMs = 60000;

  constructor(redis: Redis, dlqService: DeadLetterQueueService) {
    super(redis, dlqService);
  }

  protected async process(job: JobContract<VoiceProcessingJobPayload>): Promise<void> {
    const { audioStoragePath, mimeType, purpose, callerUserId } = job.payload;

    // eslint-disable-next-line no-console
    console.info(
      `[VoiceWorker] Processing audio ${audioStoragePath} (${mimeType}) for purpose=${purpose} (caller=${callerUserId || 'ANON'})...`,
    );

    // Simulated Speech-to-Text roundtrip
    await new Promise((resolve) => setTimeout(resolve, 30));

    // eslint-disable-next-line no-console
    console.info(
      `[VoiceWorker] Audio transcription completed for ${audioStoragePath}`,
    );
  }
}
