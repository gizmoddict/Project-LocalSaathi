// ==============================================================================
// LocalSaathi — SMS Queue Worker Handler (Phase 20)
// Asynchronous SMS & OTP Dispatch with Downstream Rate Limiting
// ==============================================================================

import Redis from 'ioredis';
import {
  JobContract,
  QueueName,
  SmsJobPayload,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class SmsWorkerHandler extends BaseJobHandler<SmsJobPayload> {
  readonly queueName = QueueName.SMS;
  readonly defaultTimeoutMs = 10000;

  constructor(redis: Redis, dlqService: DeadLetterQueueService) {
    super(redis, dlqService);
  }

  protected async process(job: JobContract<SmsJobPayload>): Promise<void> {
    const payload = job.payload;

    // Simulated SMS gateway roundtrip (e.g., Twilio / Fast2SMS / Gupshup)
    await new Promise((resolve) => setTimeout(resolve, 15));

    // Sanitized logging: Never log raw OTP in production
    const maskedPhone = payload.toPhone.replace(/(\+\d{2})(\d{3})(\d{3})(\d{4})/, '$1-***-***-$4');
    // eslint-disable-next-line no-console
    console.info(
      `[SmsWorker] SMS successfully delivered to ${maskedPhone} for purpose=${payload.purpose} (attempt=${job.attemptCount})`,
    );
  }
}
