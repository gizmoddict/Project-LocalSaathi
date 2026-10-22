// ==============================================================================
// LocalSaathi — Product Analytics Controller (Phase 16)
// Public Telemetry Ingest, Batch Processing, Admin Explorer & Product KPIs
// ==============================================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@localsaathi/types';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsMetricsService } from './services/analytics-metrics.service';
import {
  clientTrackEventSchema,
  clientTrackBatchSchema,
  adminAnalyticsEventQuerySchema,
  adminAnalyticsMetricsQuerySchema,
} from '@localsaathi/validation';

import { TokenService } from '../auth/services/token.service';
import { AuthRateLimiterService } from '../auth/services/rate-limiter.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly metricsService: AnalyticsMetricsService,
    private readonly tokenService: TokenService,
    private readonly rateLimiter: AuthRateLimiterService,
  ) {}

  /**
   * Helper to retrieve authenticated userId if token is present (optional on client telemetry)
   */
  private async getOptionalUserId(req: any): Promise<string | null> {
    if (req.user?.userId || req.user?.id) {
      return req.user.userId || req.user.id;
    }
    const authHeader = req.headers?.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      try {
        const payload = await this.tokenService.verifyAccessToken(token);
        return payload.userId || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  // ----------------------------------------------------------------------------
  // 1. Client Telemetry Ingestion (Single Event)
  // ----------------------------------------------------------------------------
  @Post('events')
  async trackEvent(@Body() body: unknown, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    await this.rateLimiter.checkRateLimit(`analytics_ingest_ip:${ip}`, 180, 60);

    const parsed = clientTrackEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid analytics event payload',
        errors: parsed.error.errors,
      });
    }

    const userId = await this.getOptionalUserId(req);
    const result = await this.analyticsService.ingestClientEvents([parsed.data], userId);
    return {
      success: result.accepted > 0 || result.duplicates > 0,
      accepted: result.accepted,
      duplicates: result.duplicates,
    };
  }

  // ----------------------------------------------------------------------------
  // 2. Client Telemetry Ingestion (Batch of Events)
  // ----------------------------------------------------------------------------
  @Post('events/batch')
  async trackBatch(@Body() body: unknown, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    await this.rateLimiter.checkRateLimit(`analytics_ingest_ip:${ip}`, 180, 60);

    const parsed = clientTrackBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid analytics event batch payload',
        errors: parsed.error.errors,
      });
    }

    const userId = await this.getOptionalUserId(req);
    const result = await this.analyticsService.ingestClientEvents(parsed.data.events, userId);
    return result;
  }

  // ----------------------------------------------------------------------------
  // 3. Admin Analytics Event Explorer (RBAC: ADMIN & MODERATOR)
  // ----------------------------------------------------------------------------
  @Get('admin/events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async getEventsExplorer(@Query() query: unknown) {
    const parsed = adminAnalyticsEventQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid analytics explorer query parameters',
        errors: parsed.error.errors,
      });
    }

    return this.analyticsService.listEvents(parsed.data as any);
  }

  // ----------------------------------------------------------------------------
  // 4. Admin Product Analytics Metrics (RBAC: ADMIN & MODERATOR)
  // ----------------------------------------------------------------------------
  @Get('admin/metrics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async getProductMetrics(@Query() query: unknown) {
    const parsed = adminAnalyticsMetricsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid analytics metrics query parameters',
        errors: parsed.error.errors,
      });
    }

    return this.metricsService.getMetrics(parsed.data.timeframe);
  }
}
