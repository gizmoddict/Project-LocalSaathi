import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/database.module';
import { DomainEventHandler } from './domain-event-handler.interface';
import {
  DomainEventEnvelope,
  DomainEventType,
  DomainEventPayload,
  NotificationDeliveryStatus,
  QueueName,
  NotificationJobPayload,
} from '@localsaathi/types';
import { NOTIFICATION_TEMPLATES } from '../../notification/notification.constants';
import { NotificationDispatcherService } from '../realtime/notification-dispatcher.service';
import { QueueService } from '../../queue/queue.service';

@Injectable()
export class NotificationHandler implements DomainEventHandler {
  readonly handlerName = 'NotificationHandler';
  private readonly logger = new Logger(NotificationHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcherService,
    @Optional() private readonly queueService?: QueueService,
  ) {}

  canHandle(eventType: string): boolean {
    return Object.prototype.hasOwnProperty.call(NOTIFICATION_TEMPLATES, eventType);
  }

  async handle(event: DomainEventEnvelope<DomainEventPayload>): Promise<void> {
    const templates = NOTIFICATION_TEMPLATES[event.eventType as DomainEventType];
    if (!templates || templates.length === 0) return;

    const payload = event.payload ?? {};

    for (const template of templates) {
      const recipientUserId = await this.resolveRecipientUserId(
        template.recipient,
        event.aggregateType,
        event.aggregateId,
        payload,
        event.actorId,
      );

      if (!recipientUserId) {
        this.logger.warn(
          `Recipient could not be resolved for event ${event.eventId} (type=${event.eventType})`,
        );
        continue;
      }

      // Check recipient preferences
      const allowed = await this.checkPreference(recipientUserId, template.type);
      if (!allowed) {
        this.logger.debug(
          `Notification skipped by user preference: userId=${recipientUserId}, type=${template.type}`,
        );
        continue;
      }

      let createdNotification: any = null;

      // Safely resolve sourceEventId to a valid domain_events record to satisfy foreign key
      let sourceEventId: string | null = (event.metadata as any)?.sourceDomainEventId ?? null;
      if (!sourceEventId) {
        const matchingDomainEvent = await this.prisma.domainEvent.findUnique({
          where: { id: event.eventId },
          select: { id: true },
        });
        if (matchingDomainEvent) {
          sourceEventId = matchingDomainEvent.id;
        }
      }

      const defaultExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30-day retention

      try {
        createdNotification = await this.prisma.notification.create({
          data: {
            recipientId: recipientUserId,
            type: template.type,
            title: template.title(payload as Record<string, unknown>),
            body: template.body(payload as Record<string, unknown>),
            priority: template.priority as unknown as import('@prisma/client').NotificationPriority,
            entityType: template.entityType,
            entityId: event.aggregateId,
            sourceEventId,
            expiresAt: defaultExpiresAt,
            payload: payload as unknown as Prisma.InputJsonValue,
            deliveryStatus: NotificationDeliveryStatus.CREATED,
          },
        });
      } catch (err: unknown) {
        // Unique constraint violation (P2002) = already generated for this source event + recipient
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          this.logger.debug(
            `Idempotent duplicate avoided for notification (sourceEventId=${sourceEventId}, recipient=${recipientUserId})`,
          );
          // Fetch existing notification to ensure real-time consistency if needed
          if (sourceEventId) {
            createdNotification = await this.prisma.notification.findFirst({
              where: {
                sourceEventId,
                recipientId: recipientUserId,
              },
            });
          }
        } else {
          throw err;
        }
      }

      if (createdNotification) {
        const unreadCount = await this.prisma.notification.count({
          where: {
            recipientId: recipientUserId,
            isRead: false,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        });

        // Dispatch in real time via Redis Pub/Sub / WebSocket
        await this.dispatcher.dispatch({
          recipientId: recipientUserId,
          notificationId: createdNotification.id,
          eventType: 'notification.created',
          notification: {
            id: createdNotification.id,
            type: createdNotification.type,
            title: createdNotification.title,
            body: createdNotification.body,
            priority: createdNotification.priority,
            entityType: createdNotification.entityType,
            entityId: createdNotification.entityId,
            payload: createdNotification.payload,
            sourceEventId: createdNotification.sourceEventId,
            deliveryStatus: createdNotification.deliveryStatus,
            isRead: createdNotification.isRead,
            readAt: createdNotification.readAt?.toISOString() ?? null,
            expiresAt: createdNotification.expiresAt?.toISOString() ?? null,
            createdAt: createdNotification.createdAt.toISOString(),
          },
          unreadCount,
        });

        // 3. Dispatch to background QueueService for push / external delivery processing
        if (this.queueService) {
          try {
            await this.queueService.enqueueJob<NotificationJobPayload>(
              QueueName.NOTIFICATIONS,
              'send-notification',
              {
                recipientUserId,
                notificationType: createdNotification.type,
                title: createdNotification.title,
                body: createdNotification.body,
                priority: createdNotification.priority,
                entityType: createdNotification.entityType,
                entityId: createdNotification.entityId,
                channel: 'PUSH',
                metadata: {
                  sourceEventId: createdNotification.sourceEventId,
                  notificationId: createdNotification.id,
                },
              },
              {
                idempotencyKey: `notification:push:${createdNotification.id}`,
                sourceEventId: createdNotification.sourceEventId || undefined,
                correlationId: (event.metadata as any)?.correlationId || (event.metadata as any)?.requestId || undefined,
              },
            );
          } catch (enqueueErr: any) {
            this.logger.warn(`Failed to enqueue background notification job: ${enqueueErr?.message}`);
          }
        }
      }
    }
  }

  private async resolveRecipientUserId(
    recipientRole: 'worker' | 'employer' | 'recipient',
    entityType: string,
    entityId: string,
    payload: DomainEventPayload,
    actorId?: string | null,
  ): Promise<string | null> {
    if (payload['recipientId'] && typeof payload['recipientId'] === 'string') {
      return payload['recipientId'] as string;
    }
    if (payload['userId'] && typeof payload['userId'] === 'string') {
      return payload['userId'] as string;
    }
    if (recipientRole === 'worker' && payload.workerId) {
      return payload.workerId;
    }
    if (recipientRole === 'employer' && payload.employerId) {
      return payload.employerId;
    }

    // Direct User entity (e.g. USER_BLOCKED)
    if (entityType === 'User') {
      return entityId;
    }

    // Fallback: look up entity from database
    if (entityType === 'JobApplication') {
      const app = await this.prisma.jobApplication.findUnique({
        where: { id: entityId },
        include: {
          workerProfile: { select: { userId: true } },
          jobPost: {
            include: { employerProfile: { select: { userId: true } } },
          },
        },
      });
      if (!app) return null;
      return recipientRole === 'worker'
        ? app.workerProfile.userId
        : app.jobPost.employerProfile.userId;
    }

    if (entityType === 'Booking') {
      const booking = await this.prisma.booking.findUnique({
        where: { id: entityId },
        include: {
          workerProfile: { select: { userId: true } },
          employerProfile: { select: { userId: true } },
        },
      });
      if (!booking) return null;
      return recipientRole === 'worker'
        ? booking.workerProfile.userId
        : booking.employerProfile.userId;
    }

    if (entityType === 'JobPost') {
      const job = await this.prisma.jobPost.findUnique({
        where: { id: entityId },
        include: { employerProfile: { select: { userId: true } } },
      });
      return job ? job.employerProfile.userId : null;
    }

    if (entityType === 'Conversation') {
      const members = await this.prisma.conversationMember.findMany({
        where: { conversationId: entityId },
        select: { userId: true },
      });
      const otherMember = members.find((m) => m.userId !== actorId);
      return otherMember ? otherMember.userId : (members[0]?.userId ?? null);
    }

    return null;
  }

  private async checkPreference(
    userId: string,
    notificationType: string,
  ): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!pref) return true; // defaults are true

    if (notificationType.startsWith('APPLICATION_')) return pref.applicationUpdates;
    if (notificationType.startsWith('BOOKING_')) return pref.bookingUpdates;
    if (notificationType.startsWith('JOB_')) return pref.jobUpdates;
    if (
      notificationType.startsWith('MESSAGE_') ||
      notificationType === 'CONVERSATION_CREATED'
    ) {
      return pref.messageUpdates ?? true;
    }
    // Mandatory system notifications (USER_BLOCKED, SYSTEM_*) cannot be disabled
    if (
      notificationType === 'USER_BLOCKED' ||
      notificationType === 'SYSTEM_NOTIFICATION'
    ) {
      return true;
    }

    return true;
  }
}
