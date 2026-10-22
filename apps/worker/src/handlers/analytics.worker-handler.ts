// ==============================================================================
// LocalSaathi — Analytics Queue Worker Handler (Phase 20)
// High-Throughput Asynchronous Telemetry Batch Persistence
// ==============================================================================

import Redis from 'ioredis';
import { PrismaClient } from '@localsaathi/database';
import {
  AnalyticsJobPayload,
  JobContract,
  QueueName,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class AnalyticsWorkerHandler extends BaseJobHandler<AnalyticsJobPayload> {
  readonly queueName = QueueName.ANALYTICS;
  readonly defaultTimeoutMs = 10000;

  constructor(
    redis: Redis,
    dlqService: DeadLetterQueueService,
    private readonly prisma: PrismaClient,
  ) {
    super(redis, dlqService);
  }

  protected async process(job: JobContract<AnalyticsJobPayload>): Promise<void> {
    const { batchId, events } = job.payload;
    if (!events || events.length === 0) return;

    const rows = events.map((ev) => ({
      eventId: ev.eventId,
      eventName: ev.eventName,
      userId: ev.userId || null,
      occurredAt: new Date(ev.occurredAt),
      metadata: ev.metadata ? JSON.parse(JSON.stringify(ev.metadata)) : undefined,
    }));

    // Perform bulk insertion with duplicate conflict skipping
    const result = await this.prisma.analyticsEvent.createMany({
      data: rows as any,
      skipDuplicates: true,
    });

    // eslint-disable-next-line no-console
    console.info(
      `[AnalyticsWorker] Inserted ${result.count} analytics event(s) for batch=${batchId}`,
    );
  }
}
