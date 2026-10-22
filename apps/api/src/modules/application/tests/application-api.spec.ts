import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkerApplicationController } from '../worker-application.controller';
import { EmployerApplicationController } from '../employer-application.controller';
import { ApplicationService } from '../application.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  UserRole,
  AuthenticatedUser,
  ApplicationStatus,
} from '@localsaathi/types';

describe('Application Controllers & RBAC Guard Tests', () => {
  let workerController: WorkerApplicationController;
  let employerController: EmployerApplicationController;
  let applicationService: jest.Mocked<ApplicationService>;
  let rolesGuard: RolesGuard;

  const mockWorkerUser: AuthenticatedUser = {
    userId: 'worker-user-uuid',
    sessionId: 'sess-worker',
    role: UserRole.WORKER,
  };

  const mockEmployerUser: AuthenticatedUser = {
    userId: 'employer-user-uuid',
    sessionId: 'sess-employer',
    role: UserRole.EMPLOYER,
  };

  beforeEach(async () => {
    const mockAppService = {
      applyToJob: jest.fn().mockResolvedValue({
        id: 'app-uuid',
        jobId: 'job-uuid',
        status: ApplicationStatus.APPLIED,
        appliedAt: new Date().toISOString(),
      }),
      getWorkerApplications: jest.fn().mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1, hasNextPage: false },
      }),
      getWorkerApplicationDetail: jest.fn().mockResolvedValue({
        id: 'app-uuid',
        jobId: 'job-uuid',
        status: ApplicationStatus.APPLIED,
      }),
      getWorkerApplicationForJob: jest.fn().mockResolvedValue({
        id: 'app-uuid',
        jobId: 'job-uuid',
        status: ApplicationStatus.APPLIED,
      }),
      withdrawApplication: jest.fn().mockResolvedValue({
        id: 'app-uuid',
        jobId: 'job-uuid',
        status: ApplicationStatus.WITHDRAWN,
      }),
      getEmployerJobApplications: jest.fn().mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1, hasNextPage: false },
        metrics: { total: 0, pending: 0, shortlisted: 0, accepted: 0, rejected: 0, withdrawn: 0 },
      }),
      getEmployerApplicationDetail: jest.fn().mockResolvedValue({
        id: 'app-uuid',
        jobId: 'job-uuid',
        status: ApplicationStatus.APPLIED,
      }),
      shortlistApplication: jest.fn().mockResolvedValue({
        id: 'app-uuid',
        jobId: 'job-uuid',
        status: ApplicationStatus.SHORTLISTED,
      }),
      rejectApplication: jest.fn().mockResolvedValue({
        id: 'app-uuid',
        jobId: 'job-uuid',
        status: ApplicationStatus.REJECTED,
      }),
      acceptApplication: jest.fn().mockResolvedValue({
        id: 'app-uuid',
        jobId: 'job-uuid',
        status: ApplicationStatus.ACCEPTED,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkerApplicationController, EmployerApplicationController],
      providers: [
        { provide: ApplicationService, useValue: mockAppService },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    workerController = module.get(WorkerApplicationController);
    employerController = module.get(EmployerApplicationController);
    applicationService = module.get(ApplicationService);
    rolesGuard = module.get(RolesGuard);
  });

  function createMockExecutionContext(
    user: AuthenticatedUser,
    handler: any,
    targetClass: any
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => handler,
      getClass: () => targetClass,
    } as unknown as ExecutionContext;
  }

  describe('1. Worker Controller RBAC & Delegation', () => {
    it('1.1 Allows WORKER role on applyToJob', () => {
      const ctx = createMockExecutionContext(
        mockWorkerUser,
        workerController.applyToJob,
        WorkerApplicationController
      );
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('1.2 Rejects EMPLOYER role with 403 Forbidden on applyToJob', () => {
      const ctx = createMockExecutionContext(
        mockEmployerUser,
        workerController.applyToJob,
        WorkerApplicationController
      );
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('1.3 Rejects EMPLOYER role with 403 Forbidden on withdrawApplication', () => {
      const ctx = createMockExecutionContext(
        mockEmployerUser,
        workerController.withdrawApplication,
        WorkerApplicationController
      );
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('1.4 applyToJob delegates with authenticated worker userId', async () => {
      const result = await workerController.applyToJob(
        mockWorkerUser,
        'job-uuid-1',
        { message: 'Test cover note' }
      );
      expect(applicationService.applyToJob).toHaveBeenCalledWith(
        'worker-user-uuid',
        'job-uuid-1',
        { message: 'Test cover note' }
      );
      expect(result.status).toBe(ApplicationStatus.APPLIED);
    });
  });

  describe('2. Employer Controller RBAC & Delegation', () => {
    it('2.1 Allows EMPLOYER role on getJobApplications', () => {
      const ctx = createMockExecutionContext(
        mockEmployerUser,
        employerController.getJobApplications,
        EmployerApplicationController
      );
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('2.2 Rejects WORKER role with 403 Forbidden on getJobApplications', () => {
      const ctx = createMockExecutionContext(
        mockWorkerUser,
        employerController.getJobApplications,
        EmployerApplicationController
      );
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('2.3 Rejects WORKER role with 403 Forbidden on shortlistApplication', () => {
      const ctx = createMockExecutionContext(
        mockWorkerUser,
        employerController.shortlistApplication,
        EmployerApplicationController
      );
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('2.4 Rejects WORKER role with 403 Forbidden on acceptApplication', () => {
      const ctx = createMockExecutionContext(
        mockWorkerUser,
        employerController.acceptApplication,
        EmployerApplicationController
      );
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('2.5 shortlistApplication delegates with authenticated employer userId', async () => {
      const result = await employerController.shortlistApplication(
        mockEmployerUser,
        'app-uuid-1'
      );
      expect(applicationService.shortlistApplication).toHaveBeenCalledWith(
        'employer-user-uuid',
        'app-uuid-1'
      );
      expect(result.status).toBe(ApplicationStatus.SHORTLISTED);
    });
  });
});
