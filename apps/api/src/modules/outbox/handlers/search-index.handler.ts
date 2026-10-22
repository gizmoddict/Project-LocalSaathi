import { Injectable, Logger, Optional } from '@nestjs/common';
import { DomainEventHandler } from './domain-event-handler.interface';
import {
  DomainEventEnvelope,
  QueueName,
  SearchIndexingJobPayload,
} from '@localsaathi/types';
import { QueueService } from '../../queue/queue.service';

@Injectable()
export class SearchIndexHandler implements DomainEventHandler {
  readonly handlerName = 'SearchIndexHandler';
  private readonly logger = new Logger(SearchIndexHandler.name);

  constructor(@Optional() private readonly queueService?: QueueService) {}

  canHandle(eventType: string): boolean {
    return eventType.startsWith('JOB_') || eventType.startsWith('WORKER_');
  }

  async handle(event: DomainEventEnvelope): Promise<void> {
    this.logger.debug(
      `[SearchIndexHandler] Syncing document: Type=${event.eventType}, AggregateId=${event.aggregateId}`,
    );

    if (this.queueService) {
      try {
        const entityType = event.aggregateType === 'WORKER' ? 'WORKER' : 'JOB';
        const isDelete =
          event.eventType.includes('DELETED') ||
          event.eventType.includes('CANCELLED');

        const eventTs = event.occurredAt ? Date.parse(event.occurredAt) : 0;
        // Strict monotonic sequencing:
        // Multiply by 10 to leave headroom for action precedence.
        // DELETE actions receive a +1 weight over UPSERT actions at the exact same timestamp/version
        // ensuring an out-of-order UPSERT cannot resurrect a deleted entity.
        const baseVersion =
          event.eventVersion && event.eventVersion > 1
            ? event.eventVersion * 10
            : (eventTs > 0 ? eventTs * 10 : 10);
        const version = isDelete ? baseVersion + 1 : baseVersion;

        await this.queueService.enqueueJob<SearchIndexingJobPayload>(
          QueueName.SEARCH_INDEXING,
          'sync-search-index',
          {
            action: isDelete ? 'DELETE' : 'UPSERT',
            entityType,
            entityId: event.aggregateId,
            version,
            document: event.payload as Record<string, unknown>,
          },
          {
            idempotencyKey: `search:${entityType.toLowerCase()}:${event.aggregateId}:${event.eventId}`,
            sourceEventId: event.eventId,
            correlationId: (event.metadata as any)?.correlationId || (event.metadata as any)?.requestId || undefined,
          },
        );
      } catch (err: any) {
        this.logger.warn(`Failed to enqueue search indexing job: ${err?.message}`);
      }
    }
  }
}
