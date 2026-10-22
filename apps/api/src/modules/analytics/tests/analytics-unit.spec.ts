// ==============================================================================
// LocalSaathi — Product Analytics Unit Tests (Phase 16)
// ==============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from '../services/analytics.service';
import { AnalyticsMetricsService } from '../services/analytics-metrics.service';
import { PrismaService } from '../../database/database.module';
import {
  AnalyticsEventName,
  AnalyticsEventSource,
} from '@localsaathi/types';

describe('Analytics Unit Tests', () => {
  let analyticsService: AnalyticsService;
  let metricsService: AnalyticsMetricsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      analyticsEvent: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      payment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 150000 } }),
      },
      rating: {
        aggregate: jest.fn().mockResolvedValue({ _count: { id: 10 }, _avg: { rating: 4.8 } }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        AnalyticsMetricsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    analyticsService = module.get<AnalyticsService>(AnalyticsService);
    metricsService = module.get<AnalyticsMetricsService>(AnalyticsMetricsService);
  });

  describe('Privacy & Sanitization', () => {
    it('should strictly redact prohibited PII and secrets in metadata', () => {
      const sensitiveMeta = {
        searchTerm: 'plumber near me',
        password: 'supersecretpassword123',
        authToken: 'jwt.token.abc',
        card_number: '4111111111111111',
        cvv: '123',
        messageContent: 'hello world raw chat message',
        userIdent: 'safe_public_id',
      };

      const sanitized = analyticsService.sanitizeMetadata(sensitiveMeta);

      expect(sanitized.searchTerm).toBe('plumber near me');
      expect(sanitized.userIdent).toBe('safe_public_id');
      expect(sanitized.password).toBe('[REDACTED_PRIVACY]');
      expect(sanitized.authToken).toBe('[REDACTED_PRIVACY]');
      expect(sanitized.card_number).toBe('[REDACTED_PRIVACY]');
      expect(sanitized.cvv).toBe('[REDACTED_PRIVACY]');
      expect(sanitized.messageContent).toBe('[REDACTED_PRIVACY]');
    });

    it('should recursively sanitize nested metadata objects', () => {
      const nested = {
        outer: {
          allowed: 123,
          nestedToken: 'secret',
        },
      };

      const sanitized = analyticsService.sanitizeMetadata(nested);
      expect((sanitized.outer as any).allowed).toBe(123);
      expect((sanitized.outer as any).nestedToken).toBe('[REDACTED_PRIVACY]');
    });
  });

  describe('Server-Authoritative Ingestion & Idempotency', () => {
    it('should record server authoritative event with correct source', async () => {
      prisma.analyticsEvent.create.mockResolvedValue({ id: 'uuid-1' });

      const res = await analyticsService.recordServerEvent({
        eventId: 'evt-server-1',
        eventName: AnalyticsEventName.JOB_POST_PUBLISHED,
        userId: 'user-uuid-1',
        metadata: { category: 'Plumbing' },
      });

      expect(res).toBe(true);
      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId: 'evt-server-1',
            eventName: AnalyticsEventName.JOB_POST_PUBLISHED,
            source: AnalyticsEventSource.SERVER_AUTHORITATIVE,
          }),
        }),
      );
    });

    it('should idempotently handle duplicate eventId without crashing', async () => {
      prisma.analyticsEvent.create.mockRejectedValue({ code: 'P2002' });

      const res = await analyticsService.recordServerEvent({
        eventId: 'evt-duplicate-1',
        eventName: AnalyticsEventName.JOB_POST_PUBLISHED,
      });

      expect(res).toBe(false);
    });
  });

  describe('Client-Interaction Ingestion & Permissions', () => {
    it('should reject unauthorized server events posted to client telemetry', async () => {
      const result = await analyticsService.ingestClientEvents([
        {
          eventId: 'evt-fake-server-1',
          eventName: 'payment_settled_fake_unauthorized_event',
        },
      ]);

      expect(result.rejected).toBe(1);
      expect(result.accepted).toBe(0);
      expect(result.errors?.[0]?.reason).toContain('not permitted');
    });

    it('should accept valid client interaction events and mark duplicates correctly', async () => {
      prisma.analyticsEvent.create
        .mockResolvedValueOnce({ id: 'uuid-1' })
        .mockRejectedValueOnce({ code: 'P2002' });

      const result = await analyticsService.ingestClientEvents([
        {
          eventId: 'client-evt-1',
          eventName: AnalyticsEventName.JOB_VIEWED,
        },
        {
          eventId: 'client-evt-duplicate',
          eventName: AnalyticsEventName.VOICE_SEARCH_USED,
        },
      ]);

      expect(result.accepted).toBe(1);
      expect(result.duplicates).toBe(1);
      expect(result.rejected).toBe(0);
    });
  });

  describe('Compliance & Anonymization', () => {
    it('should anonymize user events on account deletion request', async () => {
      prisma.analyticsEvent.findMany.mockResolvedValue([
        { id: 'ev-1', metadata: { foo: 'bar' } },
        { id: 'ev-2', metadata: { test: 1 } },
      ]);
      prisma.analyticsEvent.update.mockResolvedValue({});

      const count = await analyticsService.anonymizeUserEvents('target-user-id');

      expect(count).toBe(2);
      expect(prisma.analyticsEvent.update).toHaveBeenCalledTimes(2);
      expect(prisma.analyticsEvent.update).toHaveBeenCalledWith({
        where: { id: 'ev-1' },
        data: expect.objectContaining({
          userId: null,
          anonymousSessionId: null,
        }),
      });
    });
  });

  describe('Product Analytics Metrics Calculations', () => {
    it('should aggregate domain metrics correctly', async () => {
      prisma.analyticsEvent.count
        .mockResolvedValueOnce(10) // signupStartedCount
        .mockResolvedValueOnce(8)  // signupCompletedCount
        .mockResolvedValueOnce(20) // loginCompletedCount
        .mockResolvedValueOnce(50) // totalInteractions
        .mockResolvedValueOnce(25) // jobViewsCount
        .mockResolvedValueOnce(15) // searchesCount
        .mockResolvedValueOnce(5)  // recommendationClicksCount
        .mockResolvedValueOnce(3)  // voiceSearchesCount
        .mockResolvedValueOnce(10) // matchScoredCount
        .mockResolvedValueOnce(8)  // applicationsSubmittedCount
        .mockResolvedValueOnce(4)  // applicationsShortlistedCount
        .mockResolvedValueOnce(2)  // applicationsAcceptedCount
        .mockResolvedValueOnce(5)  // bookingsOfferedCount
        .mockResolvedValueOnce(4)  // bookingsAcceptedCount
        .mockResolvedValueOnce(4)  // bookingsCompletedCount
        .mockResolvedValueOnce(0)  // bookingsDisputedCount
        .mockResolvedValueOnce(4)  // paymentIntentsCount
        .mockResolvedValueOnce(4)  // paymentCapturedCount
        .mockResolvedValueOnce(0)  // paymentFailedCount
        .mockResolvedValueOnce(0)  // refundsSettledCount
        .mockResolvedValueOnce(1)  // reportsSubmittedCount
        .mockResolvedValueOnce(0)  // usersBlockedCount
        .mockResolvedValueOnce(0); // usersSuspendedCount

      prisma.analyticsEvent.findMany
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]) // distinct users
        .mockResolvedValueOnce([{ metadata: { language: 'hi' } }]); // language events

      const metrics = await metricsService.getMetrics('30d');

      expect(metrics.acquisition.signupConversionRate).toBe(80.0);
      expect(metrics.engagement.voiceUsagePercentage).toBe(20.0);
      expect(metrics.fulfillment.bookingCompletionRate).toBe(100.0);
      expect(metrics.payments.paymentSuccessRate).toBe(100.0);
      expect(metrics.trustSafety.averageRating).toBe(4.8);
    });
  });
});
