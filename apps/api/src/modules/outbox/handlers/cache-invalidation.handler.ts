// ==============================================================================
// LocalSaathi — Cache Invalidation Outbox Domain Event Handler (Phase 19)
// Transactionally Consistent Event-Driven Cache Purging (Post-Commit Only)
// ==============================================================================

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DomainEventHandler } from './domain-event-handler.interface';
import { DomainEventEnvelope } from '@localsaathi/types';
import { CacheService } from '../../cache/cache.service';
import { CacheKeys } from '../../cache/cache-keys';

@Injectable()
export class CacheInvalidationHandler implements DomainEventHandler {
  readonly handlerName = 'CacheInvalidationHandler';
  private readonly logger = new Logger(CacheInvalidationHandler.name);

  // List of domain event prefixes or types that invalidate cache entries
  private static readonly INVALIDATION_EVENT_PREFIXES = [
    'JOB_',
    'EMPLOYER_',
    'SKILL_',
    'BOOKING_',
  ];

  constructor(@Optional() private readonly cacheService?: CacheService) {}

  canHandle(eventType: string): boolean {
    return CacheInvalidationHandler.INVALIDATION_EVENT_PREFIXES.some((prefix) =>
      eventType.startsWith(prefix),
    );
  }

  async handle(event: DomainEventEnvelope): Promise<void> {
    if (!this.cacheService) return;
    const { eventType, aggregateId } = event;

    try {
      if (eventType.startsWith('JOB_')) {
        // Invalidate specific job details DTO
        if (aggregateId) {
          await this.cacheService.del(CacheKeys.jobDetail(aggregateId));
        }

        // Invalidate spatial nearby candidate query caches (as job availability/distance changes)
        await this.cacheService.delPattern(CacheKeys.allGeoWildcard());

        // Invalidate admin metrics counter rollups on job state changes
        if (
          ['JOB_PUBLISHED', 'JOB_PAUSED', 'JOB_CANCELLED', 'JOB_FILLED'].includes(
            eventType,
          )
        ) {
          await this.cacheService.del(CacheKeys.adminOverviewMetrics());
        }

        this.logger.debug(
          `[CacheInvalidationHandler] Purged job cache for ID=${aggregateId} on event=${eventType}`,
        );
      } else if (eventType.startsWith('EMPLOYER_')) {
        // Invalidate public employer cache
        if (aggregateId) {
          await this.cacheService.delPattern(CacheKeys.employerWildcard(aggregateId));
        }
        this.logger.debug(
          `[CacheInvalidationHandler] Purged employer cache for ID=${aggregateId} on event=${eventType}`,
        );
      } else if (eventType.startsWith('SKILL_')) {
        // Invalidate static skill catalog
        await this.cacheService.delPattern(CacheKeys.skillsWildcard());
        this.logger.debug(
          `[CacheInvalidationHandler] Purged skill catalog cache on event=${eventType}`,
        );
      } else if (eventType.startsWith('BOOKING_')) {
        // Booking transitions may invalidate admin metrics
        if (['BOOKING_CREATED', 'BOOKING_COMPLETED', 'BOOKING_CANCELLED'].includes(eventType)) {
          await this.cacheService.del(CacheKeys.adminOverviewMetrics());
        }
      }
    } catch (err: any) {
      // Invalidation errors are logged; never crash outbox event loop
      this.logger.warn(
        `[CacheInvalidationHandler] Invalidation error for event ${eventType} (${aggregateId}): ${err.message}`,
      );
    }
  }
}
