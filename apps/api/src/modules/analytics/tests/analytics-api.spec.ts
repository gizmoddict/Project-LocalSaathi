// ==============================================================================
// LocalSaathi — Product Analytics API Tests (Phase 16)
// End-to-end Controller & Guard Tests (Public Ingest, RBAC, Admin Explorer & Metrics)
// ==============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from '../analytics.controller';
import { AnalyticsService } from '../services/analytics.service';
import { AnalyticsMetricsService } from '../services/analytics-metrics.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { BadRequestException } from '@nestjs/common';
import { AnalyticsEventName, AnalyticsEventSource } from '@localsaathi/types';

import { TokenService } from '../../auth/services/token.service';
import { AuthRateLimiterService } from '../../auth/services/rate-limiter.service';

describe('Analytics API Controller Tests', () => {
  let controller: AnalyticsController;
  let analyticsService: any;
  let metricsService: any;
  let tokenService: any;
  let rateLimiterService: any;

  beforeEach(async () => {
    analyticsService = {
      ingestClientEvents: jest.fn(),
      listEvents: jest.fn(),
      anonymizeUserEvents: jest.fn(),
    };

    metricsService = {
      getMetrics: jest.fn(),
    };

    tokenService = {
      verifyAccessToken: jest.fn().mockResolvedValue({ userId: 'mock-user' }),
    };

    rateLimiterService = {
      checkRateLimit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: analyticsService },
        { provide: AnalyticsMetricsService, useValue: metricsService },
        { provide: TokenService, useValue: tokenService },
        { provide: AuthRateLimiterService, useValue: rateLimiterService },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  describe('Public Telemetry Ingest: POST /analytics/events', () => {
    it('should successfully ingest a single valid client interaction event', async () => {
      analyticsService.ingestClientEvents.mockResolvedValue({
        accepted: 1,
        rejected: 0,
        duplicates: 0,
      });

      const req = { user: { userId: 'user-123' } };
      const body = {
        eventId: 'evt-cli-101',
        eventName: AnalyticsEventName.JOB_VIEWED,
        metadata: { jobId: 'job-999' },
      };

      const result = await controller.trackEvent(body, req);

      expect(result.success).toBe(true);
      expect(result.accepted).toBe(1);
      expect(analyticsService.ingestClientEvents).toHaveBeenCalledWith(
        [expect.objectContaining({ eventId: 'evt-cli-101' })],
        'user-123',
      );
    });

    it('should throw BadRequestException if payload contains prohibited sensitive metadata', async () => {
      const req = {};
      const body = {
        eventId: 'evt-cli-102',
        eventName: AnalyticsEventName.JOB_VIEWED,
        metadata: {
          userPassword: 'plaintextpassword123',
        },
      };

      await expect(controller.trackEvent(body, req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid event names', async () => {
      const req = {};
      const body = {
        eventId: 'evt-cli-103',
        eventName: 'invalid_unrecognized_custom_event_name',
      };

      await expect(controller.trackEvent(body, req)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Batch Ingest: POST /analytics/events/batch', () => {
    it('should process a batch of events', async () => {
      analyticsService.ingestClientEvents.mockResolvedValue({
        accepted: 2,
        rejected: 0,
        duplicates: 0,
      });

      const req = {};
      const body = {
        events: [
          {
            eventId: 'evt-batch-1',
            eventName: AnalyticsEventName.VOICE_SEARCH_USED,
          },
          {
            eventId: 'evt-batch-2',
            eventName: AnalyticsEventName.LANGUAGE_SWITCHED,
          },
        ],
      };

      const result = await controller.trackBatch(body, req);
      expect(result.accepted).toBe(2);
    });

    it('should reject empty batch', async () => {
      const req = {};
      const body = { events: [] };
      await expect(controller.trackBatch(body, req)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Admin Explorer: GET /analytics/admin/events', () => {
    it('should return paginated events list for admin query', async () => {
      analyticsService.listEvents.mockResolvedValue({
        data: [
          {
            id: 'uuid-1',
            eventId: 'evt-1',
            eventName: AnalyticsEventName.JOB_POST_PUBLISHED,
            source: AnalyticsEventSource.SERVER_AUTHORITATIVE,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await controller.getEventsExplorer({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
      expect(result.data.length).toBe(1);
    });
  });

  describe('Admin Metrics: GET /analytics/admin/metrics', () => {
    it('should return aggregated product metrics for requested timeframe', async () => {
      metricsService.getMetrics.mockResolvedValue({
        timeframe: '30d',
        acquisition: { signupConversionRate: 85.0 },
      });

      const result = await controller.getProductMetrics({ timeframe: '30d' });
      expect(result.timeframe).toBe('30d');
      expect(metricsService.getMetrics).toHaveBeenCalledWith('30d');
    });
  });
});
