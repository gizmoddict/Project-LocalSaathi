// ==============================================================================
// LocalSaathi — Outbox Domain Event Analytics Handler (Phase 16)
// Automatically Bridges Authoritative Domain Events to Product Analytics Events
// ==============================================================================

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DomainEventHandler } from './domain-event-handler.interface';
import {
  DomainEventEnvelope,
  DomainEventType,
  QueueName,
  AnalyticsJobPayload,
} from '@localsaathi/types';
import { AnalyticsService } from '../../analytics/services/analytics.service';
import { DOMAIN_EVENT_TO_ANALYTICS_MAP } from '../../analytics/analytics.constants';
import { QueueService } from '../../queue/queue.service';

@Injectable()
export class AnalyticsHandler implements DomainEventHandler {
  readonly handlerName = 'AnalyticsHandler';
  private readonly logger = new Logger(AnalyticsHandler.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    @Optional() private readonly queueService?: QueueService,
  ) {}

  canHandle(eventType: string): boolean {
    // Bridges any mapped domain event to canonical product analytics
    return eventType in DOMAIN_EVENT_TO_ANALYTICS_MAP || true;
  }

  async handle(event: DomainEventEnvelope): Promise<void> {
    const canonicalName = DOMAIN_EVENT_TO_ANALYTICS_MAP[event.eventType as DomainEventType] || event.eventType.toLowerCase();

    const payload = (event.payload as Record<string, unknown>) || {};
    const metadata = (event.metadata as Record<string, unknown>) || {};

    const actorId = event.actorId || (payload.actorId as string) || (payload.userId as string) || null;
    const correlationId = (metadata.correlationId as string) || (metadata.requestId as string) || null;

    try {
      await this.analyticsService.recordServerEvent({
        eventId: `server-${event.eventId}`,
        eventName: canonicalName,
        userId: actorId,
        platform: 'BACKEND',
        appVersion: '1.0.0',
        correlationId,
        metadata: {
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          domainEventType: event.eventType,
        },
        occurredAt: new Date(event.occurredAt),
      });

      this.logger.debug(
        `[AnalyticsHandler] Bridged domain event: ${event.eventType} -> canonical: ${canonicalName} (event.eventId=${event.eventId})`,
      );

      // Asynchronously buffer in analytics background worker queue
      if (this.queueService) {
        try {
          await this.queueService.enqueueJob<AnalyticsJobPayload>(
            QueueName.ANALYTICS,
            'record-analytics-event',
            {
              batchId: `batch-${event.eventId}`,
              events: [
                {
                  eventId: `server-${event.eventId}`,
                  eventName: canonicalName,
                  userId: actorId,
                  occurredAt: new Date(event.occurredAt).toISOString(),
                  metadata: {
                    aggregateType: event.aggregateType,
                    aggregateId: event.aggregateId,
                    domainEventType: event.eventType,
                  },
                },
              ],
            },
            {
              idempotencyKey: `analytics:event:${event.eventId}`,
              sourceEventId: event.eventId,
              correlationId: correlationId || (event.metadata as any)?.correlationId || undefined,
            },
          );
        } catch (queueErr: any) {
          this.logger.warn(`Failed to enqueue analytics job to queue: ${queueErr?.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`[AnalyticsHandler] Error recording analytics event: ${err.message}`, err.stack);
    }
  }
}
