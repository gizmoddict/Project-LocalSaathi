// ==============================================================================
// LocalSaathi — Image Processing Queue Worker Handler (Phase 20)
// Asynchronous Derivative Generation, Thumbnails & Optimization with Phase 17 Antivirus Guard
// ==============================================================================

import Redis from 'ioredis';
import {
  ImageProcessingJobPayload,
  JobContract,
  QueueName,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class ImageProcessingWorkerHandler extends BaseJobHandler<ImageProcessingJobPayload> {
  readonly queueName = QueueName.IMAGE_PROCESSING;
  readonly defaultTimeoutMs = 30000;

  constructor(redis: Redis, dlqService: DeadLetterQueueService) {
    super(redis, dlqService);
  }

  protected async process(job: JobContract<ImageProcessingJobPayload>): Promise<void> {
    const { sourceFilePath, targetStorageKey, userId, operations, antivirusChecked } = job.payload;

    // Security Gate: Reject immediately if antivirus verification is missing
    if (!antivirusChecked) {
      throw new Error(
        `Security policy violation: Image ${sourceFilePath} has not been verified by antivirus quarantine scan`,
      );
    }

    // eslint-disable-next-line no-console
    console.info(
      `[ImageWorker] Processing ${operations.length} derivative(s) for user=${userId} (source=${sourceFilePath})...`,
    );

    for (const op of operations) {
      await this.generateDerivative(op, sourceFilePath, targetStorageKey);
    }

    // eslint-disable-next-line no-console
    console.info(
      `[ImageWorker] Finished image processing derivatives for ${targetStorageKey}`,
    );
  }

  private async generateDerivative(
    operation: string,
    _source: string,
    target: string,
  ): Promise<void> {
    // Simulated image processing latency (Sharp / WebP conversion)
    await new Promise((resolve) => setTimeout(resolve, 25));
    // eslint-disable-next-line no-console
    console.debug(`[ImageWorker] Generated derivative: ${operation} -> ${target}_${operation.toLowerCase()}`);
  }
}
