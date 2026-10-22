// ==============================================================================
// LocalSaathi — Admin Operations Controller (Phase 15)
// Endpoints, RBAC Protection, Query Validation & Operational Controls
// ==============================================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@localsaathi/types';
import { AdminMetricsService } from './services/admin-metrics.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminJobsService } from './services/admin-jobs.service';
import { AdminOperationsService } from './services/admin-operations.service';
import { AdminPaymentsService } from './services/admin-payments.service';
import { AdminAuditService } from './services/admin-audit.service';
import { AdminHealthService } from './services/admin-health.service';
import {
  adminOverviewQuerySchema,
  adminUserQuerySchema,
  adminWorkerQuerySchema,
  adminEmployerQuerySchema,
  adminJobQuerySchema,
  pauseJobSchema,
  adminReportQuerySchema,
  adminDisputeQuerySchema,
  adminVerificationQuerySchema,
  adminModerationQuerySchema,
  adminPaymentQuerySchema,
  adminAuditLogQuerySchema,
  adminSuspendUserSchema,
  adminReinstateUserSchema,
} from '@localsaathi/validation';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly metricsService: AdminMetricsService,
    private readonly usersService: AdminUsersService,
    private readonly jobsService: AdminJobsService,
    private readonly operationsService: AdminOperationsService,
    private readonly paymentsService: AdminPaymentsService,
    private readonly auditService: AdminAuditService,
    private readonly healthService: AdminHealthService,
  ) {}

  /**
   * Helper to retrieve authenticated actor's user ID.
   */
  private getActorId(req: any): string {
    return req.user?.userId || req.user?.id || '';
  }

  // ----------------------------------------------------------------------------
  // 1. Dashboard Overview Metrics
  // ----------------------------------------------------------------------------
  @Get('overview')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT)
  async getOverview(@Query() query: unknown) {
    const parsed = adminOverviewQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid query filters', errors: parsed.error.errors });
    }
    const startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : undefined;
    const endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : undefined;
    return this.metricsService.getOverviewMetrics(startDate, endDate);
  }

  // ----------------------------------------------------------------------------
  // 2. User Management
  // ----------------------------------------------------------------------------
  @Get('users')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT)
  async listUsers(@Query() query: unknown) {
    const parsed = adminUserQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid user query parameters', errors: parsed.error.errors });
    }
    return this.usersService.listUsers(parsed.data);
  }

  @Get('users/:id')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT)
  async getUserDetail(@Param('id') id: string) {
    return this.usersService.getUserDetail(id);
  }

  @Post('users/:id/suspend')
  @Roles(UserRole.ADMIN)
  async suspendUser(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const parsed = adminSuspendUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid suspension payload', errors: parsed.error.errors });
    }
    return this.usersService.suspendUser(this.getActorId(req), id, parsed.data);
  }

  @Post('users/:id/reinstate')
  @Roles(UserRole.ADMIN)
  async reinstateUser(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const parsed = adminReinstateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid reinstatement payload', errors: parsed.error.errors });
    }
    return this.usersService.reinstateUser(this.getActorId(req), id, parsed.data);
  }

  // ----------------------------------------------------------------------------
  // 3. Worker & Employer Management
  // ----------------------------------------------------------------------------
  @Get('workers')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT)
  async listWorkers(@Query() query: unknown) {
    const parsed = adminWorkerQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid worker query parameters', errors: parsed.error.errors });
    }
    return this.usersService.listWorkers(parsed.data);
  }

  @Get('employers')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT)
  async listEmployers(@Query() query: unknown) {
    const parsed = adminEmployerQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid employer query parameters', errors: parsed.error.errors });
    }
    return this.usersService.listEmployers(parsed.data);
  }

  // ----------------------------------------------------------------------------
  // 4. Job Management
  // ----------------------------------------------------------------------------
  @Get('jobs')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT)
  async listJobs(@Query() query: unknown) {
    const parsed = adminJobQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid job query parameters', errors: parsed.error.errors });
    }
    return this.jobsService.listJobs(parsed.data);
  }

  @Post('jobs/:id/pause')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async pauseJob(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const parsed = pauseJobSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid pause payload', errors: parsed.error.errors });
    }
    return this.jobsService.pauseJob(this.getActorId(req), id, parsed.data);
  }

  @Post('jobs/:id/resume')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async resumeJob(@Req() req: any, @Param('id') id: string) {
    return this.jobsService.resumeJob(this.getActorId(req), id);
  }

  // ----------------------------------------------------------------------------
  // 5. Operations: Reports, Disputes, Verifications, Moderation
  // ----------------------------------------------------------------------------
  @Get('reports')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async listReports(@Query() query: unknown) {
    const parsed = adminReportQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid report query parameters', errors: parsed.error.errors });
    }
    return this.operationsService.listReports(parsed.data);
  }

  @Get('disputes')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT)
  async listDisputes(@Query() query: unknown) {
    const parsed = adminDisputeQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid dispute query parameters', errors: parsed.error.errors });
    }
    return this.operationsService.listDisputes(parsed.data);
  }

  @Get('verifications')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async listVerifications(@Query() query: unknown) {
    const parsed = adminVerificationQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid verification query parameters', errors: parsed.error.errors });
    }
    return this.operationsService.listVerifications(parsed.data);
  }

  @Get('moderation')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async listModerationCases(@Query() query: unknown) {
    const parsed = adminModerationQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid moderation query parameters', errors: parsed.error.errors });
    }
    return this.operationsService.listModerationCases(parsed.data);
  }

  @Post('moderation/:id/claim')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async claimModerationCase(@Req() req: any, @Param('id') id: string) {
    return this.operationsService.claimModerationCase(this.getActorId(req), id);
  }

  @Post('moderation/:id/resolve')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async resolveModerationCase(
    @Req() req: any,
    @Param('id') id: string,
    @Body('action') action: any,
    @Body('notes') notes?: string,
  ) {
    if (!action) {
      throw new BadRequestException({ message: 'Resolution action is required' });
    }
    return this.operationsService.resolveModerationCase(this.getActorId(req), id, action, notes);
  }

  // ----------------------------------------------------------------------------
  // 6. Payments Management (ADMIN Only)
  // ----------------------------------------------------------------------------
  @Get('payments')
  @Roles(UserRole.ADMIN)
  async listPayments(@Query() query: unknown) {
    const parsed = adminPaymentQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid payment query parameters', errors: parsed.error.errors });
    }
    return this.paymentsService.listPayments(parsed.data);
  }

  // ----------------------------------------------------------------------------
  // 7. Domain Analytics
  // ----------------------------------------------------------------------------
  @Get('analytics')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  async getAnalytics(@Query('timeframe') timeframe?: string) {
    return this.metricsService.getAnalytics(timeframe);
  }

  // ----------------------------------------------------------------------------
  // 8. System Health Diagnostics (ADMIN Only)
  // ----------------------------------------------------------------------------
  @Get('system-health')
  @Roles(UserRole.ADMIN)
  async getSystemHealth() {
    return this.healthService.getSystemHealth();
  }

  // ----------------------------------------------------------------------------
  // 9. Immutable Audit Logs (ADMIN Only)
  // ----------------------------------------------------------------------------
  @Get('audit-logs')
  @Roles(UserRole.ADMIN)
  async listAuditLogs(@Query() query: unknown) {
    const parsed = adminAuditLogQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid audit log query parameters', errors: parsed.error.errors });
    }
    return this.auditService.listAuditLogs(parsed.data);
  }
}
