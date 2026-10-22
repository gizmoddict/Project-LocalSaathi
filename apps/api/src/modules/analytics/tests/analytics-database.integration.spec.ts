// ==============================================================================
// LocalSaathi — Product Analytics Database Integration Tests (Phase 16)
// Verifies real PostgreSQL constraints, idempotency, queries & anonymization
// ==============================================================================

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

import { PrismaClient } from '@prisma/client';
import { AnalyticsService } from '../services/analytics.service';
import { AnalyticsMetricsService } from '../services/analytics-metrics.service';
import { PrismaService } from '../../database/database.module';
import {
  AnalyticsEventName,
  AnalyticsEventSource,
} from '@localsaathi/types';

describe('Analytics PostgreSQL Integration Tests', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let analyticsService: AnalyticsService;
  let metricsService: AnalyticsMetricsService;

  const testEventPrefix = `test_int_${Date.now()}`;
  let testUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    prismaService = prisma as unknown as PrismaService;
    analyticsService = new AnalyticsService(prismaService);
    metricsService = new AnalyticsMetricsService(prismaService);

    // Create a temporary test user for relational checks
    const user = await prisma.user.create({
      data: {
        phone: `+9199999${Math.floor(10000 + Math.random() * 90000)}`,
        role: 'WORKER',
        accountStatus: 'ACTIVE',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up test events
    await prisma.analyticsEvent.deleteMany({
      where: {
        eventId: { startsWith: testEventPrefix },
      },
    });

    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } });
    }

    await prisma.$disconnect();
  });

  it('should insert a server authoritative event in PostgreSQL with sanitized metadata', async () => {
    const eventId = `${testEventPrefix}_server_1`;

    const success = await analyticsService.recordServerEvent({
      eventId,
      eventName: AnalyticsEventName.JOB_POST_PUBLISHED,
      userId: testUserId,
      platform: 'BACKEND',
      metadata: {
        category: 'Cleaning',
        sensitiveToken: 'secret_jwt_token',
      },
    });

    expect(success).toBe(true);

    const record = await prisma.analyticsEvent.findUnique({
      where: { eventId },
    });

    expect(record).toBeDefined();
    expect(record?.eventName).toBe(AnalyticsEventName.JOB_POST_PUBLISHED);
    expect(record?.source).toBe(AnalyticsEventSource.SERVER_AUTHORITATIVE);
    expect(record?.userId).toBe(testUserId);
    expect((record?.metadata as any).sensitiveToken).toBe('[REDACTED_PRIVACY]');
  });

  it('should enforce PostgreSQL unique constraint on eventId idempotently', async () => {
    const eventId = `${testEventPrefix}_idemp_1`;

    const first = await analyticsService.recordServerEvent({
      eventId,
      eventName: AnalyticsEventName.MATCH_SCORED,
      userId: testUserId,
    });
    expect(first).toBe(true);

    // Second insertion with identical eventId must safely return false
    const second = await analyticsService.recordServerEvent({
      eventId,
      eventName: AnalyticsEventName.MATCH_SCORED,
      userId: testUserId,
    });
    expect(second).toBe(false);
  });

  it('should ingest a batch of client interaction telemetry events into PostgreSQL', async () => {
    const eventId1 = `${testEventPrefix}_client_1`;
    const eventId2 = `${testEventPrefix}_client_2`;

    const result = await analyticsService.ingestClientEvents(
      [
        {
          eventId: eventId1,
          eventName: AnalyticsEventName.JOB_VIEWED,
          metadata: { jobId: 'job-123' },
        },
        {
          eventId: eventId2,
          eventName: AnalyticsEventName.VOICE_SEARCH_USED,
          metadata: { queryLang: 'hi' },
        },
      ],
      testUserId,
    );

    expect(result.accepted).toBe(2);
    expect(result.duplicates).toBe(0);

    const count = await prisma.analyticsEvent.count({
      where: {
        eventId: { in: [eventId1, eventId2] },
        source: AnalyticsEventSource.CLIENT_INTERACTION,
      },
    });
    expect(count).toBe(2);
  });

  it('should list paginated events with filters from PostgreSQL', async () => {
    const res = await analyticsService.listEvents({
      page: 1,
      limit: 10,
      userId: testUserId,
    });

    expect(res.data.length).toBeGreaterThanOrEqual(3);
    expect(res.total).toBeGreaterThanOrEqual(3);
    expect(res.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('should anonymize user events in PostgreSQL preserving record structure', async () => {
    const anonymizedCount = await analyticsService.anonymizeUserEvents(testUserId);
    expect(anonymizedCount).toBeGreaterThanOrEqual(3);

    const remainingWithUserId = await prisma.analyticsEvent.count({
      where: { userId: testUserId },
    });
    expect(remainingWithUserId).toBe(0);
  });

  it('should compute real metrics without SQL errors', async () => {
    const metrics = await metricsService.getMetrics('30d');
    expect(metrics).toBeDefined();
    expect(metrics.timeframe).toBe('30d');
    expect(typeof metrics.acquisition.uniqueActiveUsers).toBe('number');
    expect(typeof metrics.engagement.totalInteractions).toBe('number');
  });
});
