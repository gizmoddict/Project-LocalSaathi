import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.module';
import {
  OutboxStatus,
  DomainEventEnvelope,
  OutboxListResponse,
  OutboxEventItem,
  AdminEventStatsResponse,
} from '@localsaathi/types';
import { OutboxQueryInput } from '@localsaathi/validation';
import { OUTBOX_CONSTANTS, OUTBOX_ERROR_CODES } from './outbox.constants';
import { CorrelationContextManager } from '../../common/observability/correlation-context';
import { MetricsService } from '../../common/observability/metrics.service';

export interface CreateOutboxEventInput<T = Record<string, unknown>> {
  eventType: string;
  eventVersion?: number;
  aggregateType: string;
  aggregateId: string;
  actorId?: string;
  payload: T;
  metadata?: {
    requestId?: string;
    correlationId?: string;
    traceId?: string;
    [key: string]: unknown;
  };
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  /**
   * Atomic Event Ingestion: Inserts an OutboxEvent inside the provided database transaction.
   * Business mutation + outbox event commit together atomically.
   */
  async createEvent<T = Record<string, unknown>>(
    input: CreateOutboxEventInput<T>,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const eventVersion = input.eventVersion ?? 1;

    // Propagate ambient Request / Correlation / W3C Trace context
    const ambientCtx = CorrelationContextManager.get();
    const metadata: Record<string, unknown> = {
      ...(input.metadata ?? {}),
      requestId: input.metadata?.requestId || ambientCtx?.requestId,
      correlationId: input.metadata?.correlationId || ambientCtx?.correlationId,
      traceId: input.metadata?.traceId || ambientCtx?.traceContext.traceId,
    };

    const event = await client.outboxEvent.create({
      data: {
        eventType: input.eventType,
        eventVersion,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        actorId: input.actorId,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        metadata: metadata as unknown as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
        attemptCount: 0,
        maxAttempts: OUTBOX_CONSTANTS.MAX_ATTEMPTS,
        availableAt: new Date(),
      },
    });

    if (this.metricsService) {
      this.metricsService.incrementCounter('outbox_events_created_total', {
        event_type: input.eventType,
      });
    }

    this.logger.debug(
      `OutboxEvent created: ID=${event.id}, Type=${input.eventType}, Aggregate=${input.aggregateType}:${input.aggregateId}`,
    );

    return event.id;
  }

  /**
   * High-throughput, distributed event claiming using PostgreSQL `FOR UPDATE SKIP LOCKED`.
   * Safely claims a batch of events for a specific worker instance without concurrency conflicts.
   */
  async claimBatch(
    workerId: string,
    limit: number = OUTBOX_CONSTANTS.BATCH_SIZE,
  ): Promise<OutboxEventItem[]> {
    const lockTtlSeconds = OUTBOX_CONSTANTS.LOCK_TTL_SECONDS;

    // PostgreSQL atomic lock query with SKIP LOCKED
    const claimedRows = await this.prisma.$queryRaw<Array<any>>`
      UPDATE outbox_events
      SET status = 'PROCESSING',
          locked_at = NOW(),
          locked_by = ${workerId},
          attempt_count = attempt_count + 1,
          updated_at = NOW()
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE status IN ('PENDING', 'FAILED')
          AND (
            locked_at IS NULL
            OR locked_at < NOW() - MAKE_INTERVAL(secs => ${lockTtlSeconds})
          )
          AND available_at <= NOW()
          AND attempt_count < max_attempts
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING *;
    `;

    return claimedRows.map((row) => this.mapToItem(row));
  }

  /**
   * Idempotent Execution Check: Checks whether the handler has already processed this event.
   */
  async isAlreadyProcessed(eventId: string, handlerName: string): Promise<boolean> {
    const record = await this.prisma.eventProcessing.findUnique({
      where: {
        eventId_handlerName: {
          eventId,
          handlerName,
        },
      },
    });

    return record !== null && record.status === 'PROCESSED';
  }

  /**
   * Records execution of an event handler for idempotency tracking.
   */
  async recordProcessing(
    eventId: string,
    handlerName: string,
    status: 'PROCESSED' | 'FAILED' = 'PROCESSED',
    error?: string,
  ): Promise<void> {
    await this.prisma.eventProcessing.upsert({
      where: {
        eventId_handlerName: {
          eventId,
          handlerName,
        },
      },
      update: {
        status,
        lastError: error ?? null,
        processedAt: new Date(),
        attemptCount: { increment: 1 },
      },
      create: {
        eventId,
        handlerName,
        status,
        lastError: error ?? null,
        processedAt: new Date(),
        attemptCount: 1,
      },
    });
  }

  /**
   * Mark an outbox event as successfully processed.
   */
  async markProcessed(eventId: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: OutboxStatus.PROCESSED,
        processedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });

    this.logger.debug(`OutboxEvent marked PROCESSED: ${eventId}`);
  }

  /**
   * Handles failure with exponential backoff or dead-letter escalation.
   */
  async markFailed(
    eventId: string,
    error: string,
    isRetryable: boolean = true,
  ): Promise<void> {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) return;

    const currentAttempts = event.attemptCount;
    const shouldDeadLetter = !isRetryable || currentAttempts >= event.maxAttempts;

    if (shouldDeadLetter) {
      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          status: OutboxStatus.DEAD_LETTER,
          failedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: error,
        },
      });

      this.logger.error(
        `OutboxEvent DEAD_LETTER: ID=${eventId}, Attempts=${currentAttempts}, Error=${error}`,
      );
    } else {
      // Exponential backoff
      const backoffIndex = Math.min(
        currentAttempts,
        OUTBOX_CONSTANTS.RETRY_BACKOFF_MS.length - 1,
      );
      const delayMs = OUTBOX_CONSTANTS.RETRY_BACKOFF_MS[backoffIndex] ?? 5000;
      const nextAvailableAt = new Date(Date.now() + delayMs);

      await this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          status: OutboxStatus.FAILED,
          availableAt: nextAvailableAt,
          lockedAt: null,
          lockedBy: null,
          lastError: error,
        },
      });

      this.logger.warn(
        `OutboxEvent FAILED (Retryable): ID=${eventId}, Attempt=${currentAttempts}/${event.maxAttempts}, NextRetryIn=${delayMs}ms, Error=${error}`,
      );
    }
  }

  /**
   * Resets stale locked events back to PENDING if a worker crashed without releasing lock.
   */
  async recoverStaleEvents(maxStaleAgeSeconds: number = OUTBOX_CONSTANTS.LOCK_TTL_SECONDS): Promise<number> {
    const staleThreshold = new Date(Date.now() - maxStaleAgeSeconds * 1000);
    const result = await this.prisma.outboxEvent.updateMany({
      where: {
        status: OutboxStatus.PROCESSING,
        lockedAt: { lt: staleThreshold },
      },
      data: {
        status: OutboxStatus.PENDING,
        lockedAt: null,
        lockedBy: null,
      },
    });

    if (result.count > 0) {
      this.logger.warn(`Recovered ${result.count} stale locked outbox events back to PENDING.`);
    }
    return result.count;
  }

  /**
   * Admin API: Queries outbox events with pagination and filtering.
   */
  async getEvents(query: OutboxQueryInput): Promise<OutboxListResponse> {
    const { page, limit, status, eventType, aggregateType, aggregateId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OutboxEventWhereInput = {
      ...(status ? { status } : {}),
      ...(eventType ? { eventType } : {}),
      ...(aggregateType ? { aggregateType } : {}),
      ...(aggregateId ? { aggregateId } : {}),
    };

    const [events, total] = await Promise.all([
      this.prisma.outboxEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.outboxEvent.count({ where }),
    ]);

    return {
      events: events.map((e) => this.mapToItem(e)),
      total,
      page,
      limit,
      hasMore: skip + events.length < total,
    };
  }

  /**
   * Admin API: Get event details including processing logs.
   */
  async getEventById(eventId: string): Promise<OutboxEventItem & { processings: any[] }> {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: eventId },
      include: { processings: true },
    });

    if (!event) {
      throw new NotFoundException({
        statusCode: 404,
        error: OUTBOX_ERROR_CODES.NOT_FOUND,
        message: `Outbox event not found: ${eventId}`,
      });
    }

    return {
      ...this.mapToItem(event),
      processings: event.processings,
    };
  }

  /**
   * Admin API: Retries a dead-lettered or failed event.
   */
  async retryEvent(eventId: string): Promise<OutboxEventItem> {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException({
        statusCode: 404,
        error: OUTBOX_ERROR_CODES.NOT_FOUND,
        message: `Outbox event not found: ${eventId}`,
      });
    }

    const updated = await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: OutboxStatus.PENDING,
        attemptCount: 0,
        availableAt: new Date(),
        failedAt: null,
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      },
    });

    return this.mapToItem(updated);
  }

  /**
   * Admin API: Discard an event permanently.
   */
  async discardEvent(eventId: string): Promise<{ success: boolean }> {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException({
        statusCode: 404,
        error: OUTBOX_ERROR_CODES.NOT_FOUND,
        message: `Outbox event not found: ${eventId}`,
      });
    }

    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: OutboxStatus.PROCESSED,
        lockedAt: null,
        lockedBy: null,
        lastError: 'Discarded by admin',
      },
    });

    return { success: true };
  }

  /**
   * Dead-Letter Queue Helper: Retries event and returns action response.
   */
  async retryDeadLetter(eventId: string): Promise<{ success: boolean; message: string; eventId: string }> {
    await this.retryEvent(eventId);
    return { success: true, message: 'Event scheduled for retry', eventId };
  }

  /**
   * Dead-Letter Queue Helper: Discards event and returns action response.
   */
  async discardDeadLetter(eventId: string): Promise<{ success: boolean; message: string; eventId: string }> {
    await this.discardEvent(eventId);
    return { success: true, message: 'Event discarded', eventId };
  }

  /**
   * Dead-Letter Queue Helper: Lists dead letter events with pagination.
   */
  async getDeadLetterEvents(page: number = 1, limit: number = 20): Promise<OutboxListResponse> {
    return this.getEvents({ page, limit, status: OutboxStatus.DEAD_LETTER });
  }

  /**
   * Admin API: Summarizes counts by status.
   */
  async getStats(): Promise<AdminEventStatsResponse> {
    const [pendingCount, processingCount, processedCount, failedCount, deadLetterCount] =
      await Promise.all([
        this.prisma.outboxEvent.count({ where: { status: OutboxStatus.PENDING } }),
        this.prisma.outboxEvent.count({ where: { status: OutboxStatus.PROCESSING } }),
        this.prisma.outboxEvent.count({ where: { status: OutboxStatus.PROCESSED } }),
        this.prisma.outboxEvent.count({ where: { status: OutboxStatus.FAILED } }),
        this.prisma.outboxEvent.count({ where: { status: OutboxStatus.DEAD_LETTER } }),
      ]);

    return {
      pendingCount,
      processingCount,
      processedCount,
      failedCount,
      deadLetterCount,
    };
  }

  /**
   * Converts raw database row / Prisma entity to standard DomainEventEnvelope.
   */
  toEnvelope<T = Record<string, unknown>>(item: OutboxEventItem): DomainEventEnvelope<T> {
    return {
      eventId: item.id,
      eventType: item.eventType,
      eventVersion: item.eventVersion,
      occurredAt: item.createdAt,
      aggregateType: item.aggregateType,
      aggregateId: item.aggregateId,
      actorId: item.actorId ?? undefined,
      payload: item.payload as T,
      metadata: (item.metadata ?? {}) as DomainEventEnvelope['metadata'],
    };
  }

  private mapToItem(row: any): OutboxEventItem {
    return {
      id: row.id,
      eventType: row.eventType ?? row.event_type,
      eventVersion: Number(row.eventVersion ?? row.event_version ?? 1),
      aggregateType: row.aggregateType ?? row.aggregate_type,
      aggregateId: row.aggregateId ?? row.aggregate_id,
      actorId: row.actorId ?? row.actor_id ?? null,
      payload: (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload) ?? {},
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      status: (row.status as OutboxStatus) ?? OutboxStatus.PENDING,
      attemptCount: Number(row.attemptCount ?? row.attempt_count ?? 0),
      maxAttempts: Number(row.maxAttempts ?? row.max_attempts ?? 5),
      availableAt: (row.availableAt ?? row.available_at ?? new Date()).toISOString(),
      processedAt: (row.processedAt ?? row.processed_at)
        ? new Date(row.processedAt ?? row.processed_at).toISOString()
        : null,
      failedAt: (row.failedAt ?? row.failed_at)
        ? new Date(row.failedAt ?? row.failed_at).toISOString()
        : null,
      lockedAt: (row.lockedAt ?? row.locked_at)
        ? new Date(row.lockedAt ?? row.locked_at).toISOString()
        : null,
      lockedBy: row.lockedBy ?? row.locked_by ?? null,
      lastError: row.lastError ?? row.last_error ?? null,
      createdAt: (row.createdAt ?? row.created_at ?? new Date()).toISOString(),
      updatedAt: (row.updatedAt ?? row.updated_at ?? new Date()).toISOString(),
    };
  }
}
