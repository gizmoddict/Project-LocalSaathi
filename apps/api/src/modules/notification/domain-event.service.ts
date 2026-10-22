import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.module';
import { DomainEventType, DomainEventPayload } from '@localsaathi/types';
import { NOTIFICATION_TEMPLATES } from './notification.constants';

export interface CreateDomainEventInput {
  type: DomainEventType;
  actorId?: string;
  entityType: string;
  entityId: string;
  payload: DomainEventPayload;
}

/**
 * DomainEventService — creates domain events and processes them synchronously.
 *
 * Design:
 *  1. Caller creates a DomainEvent inside the same DB transaction as the mutation.
 *  2. After commit, caller calls processEvent() as a fire-and-forget.
 *  3. processEvent() reads PENDING events, creates Notifications (idempotent via
 *     partial unique index on source_event_id+recipient_id), marks event PROCESSED.
 */
@Injectable()
export class DomainEventService {
  private readonly logger = new Logger(DomainEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a DomainEvent record inside the given transaction (or a new one).
   * Returns the event id so the caller can fire processEvent() after commit.
   */
  async createEvent(
    input: CreateDomainEventInput,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const event = await client.domainEvent.create({
      data: {
        type: input.type as unknown as import('@prisma/client').DomainEventType,
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: input.payload as unknown as Prisma.InputJsonValue,
      },
    });

    // Also persist into outbox_events inside the exact same database transaction
    if (client.outboxEvent) {
      await client.outboxEvent.create({
        data: {
          eventType: input.type,
          eventVersion: 1,
          aggregateType: input.entityType,
          aggregateId: input.entityId,
          actorId: input.actorId,
          payload: input.payload as unknown as Prisma.InputJsonValue,
          metadata: { sourceDomainEventId: event.id } as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
          attemptCount: 0,
          maxAttempts: 5,
          availableAt: new Date(),
        },
      });
    }

    return event.id;
  }

  /**
   * Process a single PENDING event: look up recipients, create Notifications.
   * Safe to call multiple times — idempotent via partial unique index.
   */
  async processEvent(eventId: string): Promise<void> {
    let event: Awaited<
      ReturnType<typeof this.prisma.domainEvent.findUnique>
    > | null = null;

    try {
      event = await this.prisma.domainEvent.findUnique({
        where: { id: eventId },
      });

      if (!event || event.status !== 'PENDING') return;

      const templates = NOTIFICATION_TEMPLATES[event.type as DomainEventType];
      if (!templates || templates.length === 0) {
        // No templates = mark processed, nothing to notify
        await this.prisma.domainEvent.update({
          where: { id: eventId },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        return;
      }

      const payload = event.payload as DomainEventPayload;

      for (const template of templates) {
        // Resolve recipient user id based on template.recipient field
        const recipientUserId = await this.resolveRecipientUserId(
          template.recipient,
          event.entityType,
          event.entityId,
          payload,
        );

        if (!recipientUserId) {
          this.logger.warn(
            `Could not resolve recipient for event ${eventId} template ${template.type}`,
          );
          continue;
        }

        // Check preferences before creating notification
        const allowed = await this.checkPreference(
          recipientUserId,
          template.type,
        );
        if (!allowed) continue;

        // Upsert notification — idempotent via partial unique index on (source_event_id, recipient_id)
        // Use createMany with skipDuplicates=false; instead use a try/catch on unique violation
        try {
          await this.prisma.notification.create({
            data: {
              recipientId: recipientUserId,
              type: template.type,
              title: template.title(payload as Record<string, unknown>),
              body: template.body(payload as Record<string, unknown>),
              priority: template.priority as unknown as import('@prisma/client').NotificationPriority,
              entityType: template.entityType,
              entityId: event.entityId,
              sourceEventId: event.id,
              payload: payload as unknown as Prisma.InputJsonValue,
            },
          });
        } catch (err: unknown) {
          // P2002 = unique constraint violation — idempotent, skip
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            this.logger.debug(
              `Idempotent skip: notification for event ${eventId} already exists for user ${recipientUserId}`,
            );
          } else {
            throw err;
          }
        }
      }

      // Mark event as processed
      await this.prisma.domainEvent.update({
        where: { id: eventId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to process domain event ${eventId}: ${msg}`);

      if (event) {
        await this.prisma.domainEvent
          .update({
            where: { id: eventId },
            data: { status: 'FAILED', errorReason: msg },
          })
          .catch(() => undefined);
      }
    }
  }

  /**
   * Resolve which user ID should receive this notification.
   * Uses the event payload which contains workerId / employerId.
   */
  private async resolveRecipientUserId(
    recipientRole: 'worker' | 'employer',
    entityType: string,
    entityId: string,
    payload: DomainEventPayload,
  ): Promise<string | null> {
    void entityType; // Used for context but resolution is payload-driven
    void entityId;

    if (recipientRole === 'worker') {
      if (typeof payload['workerId'] === 'string') return payload['workerId'];
    }

    if (recipientRole === 'employer') {
      if (typeof payload['employerId'] === 'string')
        return payload['employerId'];
    }

    if ((recipientRole as string) === 'payer') {
      if (typeof payload['payerId'] === 'string') return payload['payerId'];
      if (typeof payload['employerId'] === 'string') return payload['employerId'];
    }

    if ((recipientRole as string) === 'payee') {
      if (typeof payload['payeeId'] === 'string') return payload['payeeId'];
      if (typeof payload['workerId'] === 'string') return payload['workerId'];
    }

    if ((recipientRole as string) === 'recipient') {
      if (typeof payload['recipientId'] === 'string') return payload['recipientId'];
      if (typeof payload['userId'] === 'string') return payload['userId'];
      if (typeof payload['payerId'] === 'string') return payload['payerId'];
      if (typeof payload['workerId'] === 'string') return payload['workerId'];
      if (typeof payload['employerId'] === 'string') return payload['employerId'];
    }

    return null;
  }

  /**
   * Check notification preferences for a user.
   * If no preference record exists, defaults to true (all enabled).
   */
  private async checkPreference(
    userId: string,
    notificationType: string,
  ): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!pref) return true; // Default: all enabled

    if (
      notificationType.startsWith('APPLICATION_') &&
      !pref.applicationUpdates
    )
      return false;
    if (notificationType.startsWith('BOOKING_') && !pref.bookingUpdates)
      return false;
    if (notificationType.startsWith('JOB_') && !pref.jobUpdates) return false;

    return true;
  }
}
