import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from '../admin.controller';
import { AdminMetricsService } from '../services/admin-metrics.service';
import { AdminUsersService } from '../services/admin-users.service';
import { AdminJobsService } from '../services/admin-jobs.service';
import { AdminOperationsService } from '../services/admin-operations.service';
import { AdminPaymentsService } from '../services/admin-payments.service';
import { AdminAuditService } from '../services/admin-audit.service';
import { AdminHealthService } from '../services/admin-health.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@localsaathi/types';

describe('Admin API Controller Tests (Phase 15)', () => {
  let controller: AdminController;
  let mockMetricsService: any;
  let mockUsersService: any;
  let mockJobsService: any;
  let mockOperationsService: any;
  let mockPaymentsService: any;
  let mockAuditService: any;
  let mockHealthService: any;

  beforeEach(async () => {
    mockMetricsService = {
      getOverviewMetrics: jest.fn().mockResolvedValue({ dau: 12, mau: 45 }),
      getAnalytics: jest.fn().mockResolvedValue({ timeframe: '30d' }),
    };
    mockUsersService = {
      listUsers: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      getUserDetail: jest.fn().mockResolvedValue({ id: 'u1' }),
      suspendUser: jest.fn().mockResolvedValue({ success: true }),
      reinstateUser: jest.fn().mockResolvedValue({ success: true }),
      listWorkers: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      listEmployers: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };
    mockJobsService = {
      listJobs: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      pauseJob: jest.fn().mockResolvedValue({ success: true }),
      resumeJob: jest.fn().mockResolvedValue({ success: true }),
    };
    mockOperationsService = {
      listReports: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      listDisputes: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      listVerifications: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      listModerationCases: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      claimModerationCase: jest.fn().mockResolvedValue({ success: true }),
      resolveModerationCase: jest.fn().mockResolvedValue({ success: true }),
    };
    mockPaymentsService = {
      listPayments: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };
    mockAuditService = {
      listAuditLogs: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };
    mockHealthService = {
      checkHealth: jest.fn().mockResolvedValue({ status: 'HEALTHY' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminMetricsService, useValue: mockMetricsService },
        { provide: AdminUsersService, useValue: mockUsersService },
        { provide: AdminJobsService, useValue: mockJobsService },
        { provide: AdminOperationsService, useValue: mockOperationsService },
        { provide: AdminPaymentsService, useValue: mockPaymentsService },
        { provide: AdminAuditService, useValue: mockAuditService },
        { provide: AdminHealthService, useValue: mockHealthService },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('delegates getOverview to AdminMetricsService', async () => {
    const res = await controller.getOverview({});
    expect(res).toEqual({ dau: 12, mau: 45 });
    expect(mockMetricsService.getOverviewMetrics).toHaveBeenCalled();
  });

  it('delegates listUsers to AdminUsersService with bounded pagination', async () => {
    const query = { page: 1, limit: 20 };
    await controller.listUsers(query);
    expect(mockUsersService.listUsers).toHaveBeenCalledWith(query);
  });

  it('delegates suspendUser with actor extraction', async () => {
    const req = { user: { id: 'admin_1', role: UserRole.ADMIN } };
    await controller.suspendUser(req as any, 'target_u', { reason: 'Violation' });
    expect(mockUsersService.suspendUser).toHaveBeenCalledWith('admin_1', 'target_u', { reason: 'Violation' });
  });

  it('delegates pauseJob with actor extraction', async () => {
    const req = { user: { id: 'admin_1', role: UserRole.ADMIN } };
    await controller.pauseJob(req as any, 'job_1', { reason: 'Administrative hold' });
    expect(mockJobsService.pauseJob).toHaveBeenCalledWith('admin_1', 'job_1', { reason: 'Administrative hold' });
  });

  it('delegates getSystemHealth to AdminHealthService', async () => {
    mockHealthService.getSystemHealth = jest.fn().mockResolvedValue({ status: 'HEALTHY' });
    const res = await controller.getSystemHealth();
    expect(res).toEqual({ status: 'HEALTHY' });
    expect(mockHealthService.getSystemHealth).toHaveBeenCalled();
  });
});
