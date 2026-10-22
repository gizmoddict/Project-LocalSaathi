// ==============================================================================
// LocalSaathi — Email Queue Worker Handler (Phase 20)
// Asynchronous Transactional Email Delivery
// ==============================================================================

import Redis from 'ioredis';
import {
  EmailJobPayload,
  JobContract,
  QueueName,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class EmailWorkerHandler extends BaseJobHandler<EmailJobPayload> {
  readonly queueName = QueueName.EMAIL;
  readonly defaultTimeoutMs = 20000;

  constructor(redis: Redis, dlqService: DeadLetterQueueService) {
    super(redis, dlqService);
  }

  protected async process(job: JobContract<EmailJobPayload>): Promise<void> {
    const payload = job.payload;

    // Simulated email SMTP/SES provider roundtrip
    await new Promise((resolve) => setTimeout(resolve, 20));

    // eslint-disable-next-line no-console
    console.info(
      `[EmailWorker] Email "${payload.subject}" successfully sent to ${payload.toEmail} using template=${payload.templateName}`,
    );
  }
}
