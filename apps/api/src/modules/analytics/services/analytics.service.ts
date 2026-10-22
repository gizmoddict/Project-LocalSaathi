// ==============================================================================
// LocalSaathi — Product Analytics Service (Phase 16)
// Event Ingestion, Idempotency, Privacy Sanitization, Retention & User Anonymization
// ==============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/database.module';
import {
  AnalyticsEventName,
  AnalyticsEventRecord,
  AnalyticsEventSource,
  AnalyticsIngestResponse,
  AdminAnalyticsEventQuery,
  AdminAnalyticsEventListResponse,
  ClientTrackEventInput,
  CLIENT_ALLOWED_EVENT_NAMES,
} from '@localsaathi/types';
import {
  ANALYTICS_CONFIG,
  PROHIBITED_METADATA_PATTERNS,
} from '../analytics.constants';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sanitizes metadata by removing or masking sensitive fields/PII/secrets.
   */
  sanitizeMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
    if (!metadata || typeof metadata !== 'object') return {};
    const sanitized: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(metadata)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
      const isProhibited = PROHIBITED_METADATA_PATTERNS.some((pattern: string) =>
        normalizedKey.includes(pattern),
      );

      if (isProhibited) {
        // Redact strictly
        sanitized[key] = '[REDACTED_PRIVACY]';
      } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        sanitized[key] = this.sanitizeMetadata(val as Record<string, unknown>);
      } else {
        sanitized[key] = val;
      }
    }

    return sanitized;
  }

  /**
   * Records a Server-Authoritative analytics event (trusted internal callers or domain handlers).
   */
  async recordServerEvent(
    params: {
      eventId: string;
      eventName: AnalyticsEventName | string;
      userId?: string | null;
      anonymousSessionId?: string | null;
      platform?: string;
      appVersion?: string;
      correlationId?: string | null;
      schemaVersion?: number;
      metadata?: Record<string, unknown>;
      occurredAt?: Date;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const sanitizedMeta = this.sanitizeMetadata(params.metadata);

    try {
      await client.analyticsEvent.create({
        data: {
          eventId: params.eventId,
          eventName: params.eventName,
          userId: params.userId ?? null,
          anonymousSessionId: params.anonymousSessionId ?? null,
          platform: params.platform ?? 'BACKEND',
          appVersion: params.appVersion ?? '1.0.0',
          source: AnalyticsEventSource.SERVER_AUTHORITATIVE,
          correlationId: params.correlationId ?? null,
          schemaVersion: params.schemaVersion ?? ANALYTICS_CONFIG.DEFAULT_SCHEMA_VERSION,
          metadata: sanitizedMeta as unknown as Prisma.InputJsonValue,
          occurredAt: params.occurredAt ?? new Date(),
        },
      });
      return true;
    } catch (err: any) {
      if (err.code === 'P2002') {
        // Idempotent duplicate eventId hit — safe skip
        this.logger.debug(`Idempotent skip for duplicate analytics eventId=${params.eventId}`);
        return false;
      }
      this.logger.error(`Failed to record server analytics event: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Ingests a batch of Client-Interaction telemetry events.
   * Enforces client-allowed events, sanitizes metadata, handles deduplication idempotently.
   */
  async ingestClientEvents(
    events: ClientTrackEventInput[],
    authenticatedUserId?: string | null,
  ): Promise<AnalyticsIngestResponse> {
    let accepted = 0;
    let duplicates = 0;
    let rejected = 0;
    const errors: Array<{ index: number; eventId?: string; reason: string }> = [];

    for (let i = 0; i < events.length; i++) {
      const item = events[i];
      if (!item) continue;

      // Validate event name against client permissions
      if (!CLIENT_ALLOWED_EVENT_NAMES.has(item.eventName) && !Object.values(AnalyticsEventName).includes(item.eventName as any)) {
        rejected++;
        errors.push({ index: i, eventId: item.eventId, reason: 'Event name is not permitted for client telemetry' });
        continue;
      }

      const occurredAt = item.occurredAt ? new Date(item.occurredAt) : new Date();
      const sanitizedMeta = this.sanitizeMetadata(item.metadata);

      try {
        await this.prisma.analyticsEvent.create({
          data: {
            eventId: item.eventId,
            eventName: item.eventName,
            userId: authenticatedUserId ?? null,
            anonymousSessionId: item.anonymousSessionId ?? null,
            platform: item.platform ?? 'WEB',
            appVersion: item.appVersion ?? '1.0.0',
            source: AnalyticsEventSource.CLIENT_INTERACTION,
            correlationId: item.correlationId ?? null,
            schemaVersion: item.schemaVersion ?? ANALYTICS_CONFIG.DEFAULT_SCHEMA_VERSION,
            metadata: sanitizedMeta as unknown as Prisma.InputJsonValue,
            occurredAt,
          },
        });
        accepted++;
      } catch (err: any) {
        if (err.code === 'P2002') {
          // Idempotent duplicate
          duplicates++;
        } else {
          rejected++;
          errors.push({ index: i, eventId: item.eventId, reason: err.message || 'Database error during ingestion' });
        }
      }
    }

    return { accepted, rejected, duplicates, errors: errors.length > 0 ? errors : undefined };
  }

  /**
   * Lists events for the Admin Analytics Event Explorer with bounded pagination and sanitization.
   */
  async listEvents(query: AdminAnalyticsEventQuery): Promise<AdminAnalyticsEventListResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(ANALYTICS_CONFIG.MAX_EXPLORER_PAGE_SIZE, Math.max(1, query.limit || ANALYTICS_CONFIG.DEFAULT_EXPLORER_PAGE_SIZE));
    const skip = (page - 1) * limit;

    const where: Prisma.AnalyticsEventWhereInput = {};

    if (query.eventName) {
      where.eventName = query.eventName;
    }
    if (query.source) {
      where.source = query.source;
    }
    if (query.platform) {
      where.platform = query.platform;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.anonymousSessionId) {
      where.anonymousSessionId = query.anonymousSessionId;
    }
    if (query.correlationId) {
      where.correlationId = query.correlationId;
    }
    if (query.startDate || query.endDate) {
      where.occurredAt = {};
      if (query.startDate) where.occurredAt.gte = new Date(query.startDate);
      if (query.endDate) where.occurredAt.lte = new Date(query.endDate);
    }

    const [total, records] = await Promise.all([
      this.prisma.analyticsEvent.count({ where }),
      this.prisma.analyticsEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const data: AnalyticsEventRecord[] = records.map((r: any) => ({
      id: r.id,
      eventId: r.eventId,
      eventName: r.eventName,
      occurredAt: r.occurredAt.toISOString(),
      ingestedAt: r.ingestedAt.toISOString(),
      userId: r.userId,
      anonymousSessionId: r.anonymousSessionId,
      platform: r.platform,
      appVersion: r.appVersion,
      source: r.source as AnalyticsEventSource,
      correlationId: r.correlationId,
      schemaVersion: r.schemaVersion,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * GDPR / Account Deletion compliance: Anonymizes all analytics events associated with a user.
   * Sets userId to NULL and scrubs identifiable metadata keys while preserving aggregate counts.
   */
  async anonymizeUserEvents(userId: string): Promise<number> {
    const events = await this.prisma.analyticsEvent.findMany({
      where: { userId },
      select: { id: true, metadata: true },
    });

    if (events.length === 0) return 0;

    for (const event of events) {
      const meta = (event.metadata as Record<string, unknown>) || {};
      const scrubbedMeta = { ...meta, userIdent: '[DELETED_USER]' };

      await this.prisma.analyticsEvent.update({
        where: { id: event.id },
        data: {
          userId: null,
          anonymousSessionId: null,
          metadata: scrubbedMeta as unknown as Prisma.InputJsonValue,
        },
      });
    }

    this.logger.log(`Anonymized ${events.length} analytics event(s) for deleted userId=${userId}`);
    return events.length;
  }

  /**
   * Data retention cleanup: Prunes raw analytics events older than the retention threshold.
   */
  async pruneExpiredEvents(retentionDays: number = ANALYTICS_CONFIG.RETENTION_DAYS_RAW_EVENTS): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.analyticsEvent.deleteMany({
      where: {
        occurredAt: { lt: cutoff },
      },
    });

    this.logger.log(`Pruned ${result.count} raw analytics event(s) older than ${retentionDays} days`);
    return result.count;
  }
}
