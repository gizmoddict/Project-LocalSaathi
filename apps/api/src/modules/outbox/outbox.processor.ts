import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OutboxService } from './outbox.service';
import { DomainEventHandler } from './handlers/domain-event-handler.interface';
import { NotificationHandler } from './handlers/notification.handler';
import { SearchIndexHandler } from './handlers/search-index.handler';
import { AnalyticsHandler } from './handlers/analytics.handler';
import { CacheInvalidationHandler } from './handlers/cache-invalidation.handler';
import { OUTBOX_CONSTANTS } from './outbox.constants';
import { domainEventEnvelopeSchema } from '@localsaathi/validation';

@Injectable()
export class OutboxProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  private readonly handlers: DomainEventHandler[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isShuttingDown = false;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly notificationHandler: NotificationHandler,
    private readonly searchIndexHandler: SearchIndexHandler,
    private readonly analyticsHandler: AnalyticsHandler,
    private readonly cacheInvalidationHandler: CacheInvalidationHandler,
  ) {
    this.handlers = [
      this.notificationHandler,
      this.searchIndexHandler,
      this.analyticsHandler,
      this.cacheInvalidationHandler,
    ];
  }

  onModuleInit() {
    this.startPolling();
    this.logger.log(`OutboxProcessor active: workerId=${this.workerId}`);
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  startPolling(intervalMs: number = OUTBOX_CONSTANTS.POLL_INTERVAL_MS): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.processNextBatch().catch((err) =>
        this.logger.error(`Error in outbox poll cycle: ${err}`),
      );
    }, intervalMs);
  }

  stopPolling(): void {
    this.isShuttingDown = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Immediately triggers processing of pending events (low latency signal).
   */
  async triggerNow(): Promise<number> {
    return this.processNextBatch();
  }

  /**
   * Claims a batch via PostgreSQL FOR UPDATE SKIP LOCKED and dispatches handlers idempotently.
   */
  async processNextBatch(): Promise<number> {
    if (this.isProcessing || this.isShuttingDown) return 0;
    this.isProcessing = true;

    try {
      const batch = await this.outboxService.claimBatch(this.workerId);
      if (batch.length === 0) return 0;

      this.logger.debug(
        `Worker ${this.workerId} claimed ${batch.length} outbox event(s)`,
      );

      for (const event of batch) {
        await this.processSingleEvent(event);
      }

      return batch.length;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to claim or process batch: ${msg}`);
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  private async processSingleEvent(event: any): Promise<void> {
    const startTime = Date.now();
    const envelope = this.outboxService.toEnvelope(event);

    // 1. Schema Validation
    const validation = domainEventEnvelopeSchema.safeParse(envelope);
    if (!validation.success) {
      const validationError = `Schema validation failed: ${JSON.stringify(validation.error.format())}`;
      this.logger.error(`Event ${event.id} rejected: ${validationError}`);
      // Non-retryable error -> directly to DEAD_LETTER
      await this.outboxService.markFailed(event.id, validationError, false);
      return;
    }

    // 2. Handler execution
    const matchingHandlers = this.handlers.filter((h) =>
      h.canHandle(event.eventType),
    );

    if (matchingHandlers.length === 0) {
      // No handlers for this event type -> mark processed
      await this.outboxService.markProcessed(event.id);
      return;
    }

    let hasFailure = false;
    let failureReason = '';
    let isRetryable = true;

    for (const handler of matchingHandlers) {
      // 3. Idempotency check: has this handler already executed for this event?
      const alreadyHandled = await this.outboxService.isAlreadyProcessed(
        event.id,
        handler.handlerName,
      );

      if (alreadyHandled) {
        this.logger.debug(
          `Idempotent skip: Handler ${handler.handlerName} already processed event ${event.id}`,
        );
        continue;
      }

      try {
        await handler.handle(envelope);
        await this.outboxService.recordProcessing(
          event.id,
          handler.handlerName,
          'PROCESSED',
        );
      } catch (err: unknown) {
        hasFailure = true;
        const msg = err instanceof Error ? err.message : String(err);
        failureReason = `Handler ${handler.handlerName} failed: ${msg}`;
        this.logger.error(`Handler ${handler.handlerName} failed for event ${event.id}: ${msg}`);

        // Classify retryable vs non-retryable
        isRetryable = this.isErrorRetryable(err);

        await this.outboxService.recordProcessing(
          event.id,
          handler.handlerName,
          'FAILED',
          msg,
        );
        break; // Stop remaining handlers until retry
      }
    }

    const duration = Date.now() - startTime;

    if (hasFailure) {
      await this.outboxService.markFailed(event.id, failureReason, isRetryable);
    } else {
      await this.outboxService.markProcessed(event.id);
      this.logger.debug(
        `Event ${event.id} (${event.eventType}) completed in ${duration}ms`,
      );
    }
  }

  /**
   * Error classification: Network, database connection, timeout, and Redis errors are retryable.
   * Semantic errors, invalid payloads, or syntax violations are non-retryable.
   */
  private isErrorRetryable(err: unknown): boolean {
    if (!err) return false;
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

    if (
      msg.includes('validation') ||
      msg.includes('syntax') ||
      msg.includes('malformed') ||
      msg.includes('unsupported')
    ) {
      return false;
    }

    // Default: connection, network, lock errors are retryable
    return true;
  }
}
