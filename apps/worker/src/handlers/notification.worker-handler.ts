// ==============================================================================
// LocalSaathi — Notification Queue Worker Handler (Phase 20)
// Asynchronous In-App & Push Notification Delivery with User Preferences & Idempotency
// ==============================================================================

import Redis from 'ioredis';
import { PrismaClient } from '@localsaathi/database';
import {
  JobContract,
  NotificationJobPayload,
  QueueName,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class NotificationWorkerHandler extends BaseJobHandler<NotificationJobPayload> {
  readonly queueName = QueueName.NOTIFICATIONS;
  readonly defaultTimeoutMs = 15000;

  constructor(
    redis: Redis,
    dlqService: DeadLetterQueueService,
    private readonly prisma: PrismaClient,
  ) {
    super(redis, dlqService);
  }

  protected async process(job: JobContract<NotificationJobPayload>): Promise<void> {
    const payload = job.payload;

    // 1. Check user notification preferences if set
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId: payload.recipientUserId },
    });

    if (preference) {
      const typeLower = payload.notificationType.toLowerCase();
      if (typeLower.includes('job') && !preference.jobUpdates) return;
      if (typeLower.includes('booking') && !preference.bookingUpdates) return;
      if (typeLower.includes('application') && !preference.applicationUpdates) return;
      if (typeLower.includes('message') && !preference.messageUpdates) return;
    }

    // 2. Persist in-app notification row idempotently
    if (payload.channel === 'IN_APP' || payload.channel === 'ALL') {
      try {
        await this.prisma.notification.create({
          data: {
            recipientId: payload.recipientUserId,
            type: payload.notificationType,
            title: payload.title,
            body: payload.body,
            entityType: payload.entityType || null,
            entityId: payload.entityId || null,
            priority: (payload.priority as any) || 'MEDIUM',
            payload: payload.metadata ? JSON.parse(JSON.stringify(payload.metadata)) : undefined,
            sourceEventId: job.sourceEventId || null,
          },
        });
      } catch (err: any) {
        // Handle PostgreSQL unique constraint on (source_event_id, recipient_id)
        if (err.code === 'P2002') {
          // eslint-disable-next-line no-console
          console.info(
            `[NotificationWorker] Duplicate in-app notification detected (sourceEventId=${job.sourceEventId}). Idempotently ignored.`,
          );
          return;
        }
        throw err;
      }
    }

    // 3. Dispatch Push Notification (mock provider bridge)
    if (payload.channel === 'PUSH' || payload.channel === 'ALL') {
      await this.dispatchPush(payload.recipientUserId, payload.title, payload.body);
    }
  }

  private async dispatchPush(userId: string, title: string, _body: string): Promise<void> {
    // Simulated push provider latency (FCM / APNs)
    await new Promise((resolve) => setTimeout(resolve, 10));
    // eslint-disable-next-line no-console
    console.debug(`[NotificationWorker] Push notification dispatched to user=${userId}: "${title}"`);
  }
}
