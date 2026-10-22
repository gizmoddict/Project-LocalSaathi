import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JobController } from '../job.controller';
import { JobService } from '../job.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  UserRole,
  AuthenticatedUser,
  JobStatus,
  WageType,
  JobUrgency,
} from '@localsaathi/types';

describe('Job API Controller & Role Guard Tests', () => {
  let controller: JobController;
  let jobService: jest.Mocked<JobService>;
  let rolesGuard: RolesGuard;

  const mockEmployerUser: AuthenticatedUser = {
    userId: 'user-employer-1',
    sessionId: 'sess-1',
    role: UserRole.EMPLOYER,
  };

  const mockWorkerUser: AuthenticatedUser = {
    userId: 'user-worker-1',
    sessionId: 'sess-2',
    role: UserRole.WORKER,
  };

  const sampleJobResponse = {
    id: 'job-101',
    employerProfileId: 'emp-101',
    title: 'Warehouse Helper',
    description: 'General loading, unloading, and inventory organization.',
    status: JobStatus.DRAFT,
    category: 'Logistics',
    wageType: WageType.DAILY,
    wageAmount: 1000,
    workerCount: 3,
    durationDays: 2,
    startDate: '2026-11-10',
    startTime: '08:00',
    urgency: JobUrgency.STANDARD,
    requirements: ['Physical fitness'],
    languageRequirements: ['hi'],
    publishedAt: null,
    expiresAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    requiredSkills: [
      {
        id: 'rs-1',
        skillId: 'sk-1',
        name: 'Loading/Unloading',
        category: 'Logistics',
        isRequired: true,
        minExperienceYears: 1,
      },
    ],
    location: {
      id: 'loc-1',
      jobPostId: 'job-101',
      latitude: 12.9716,
      longitude: 77.5946,
      addressLine: 'Gate 4, Inland Depot',
      locality: 'Whitefield',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560066',
    },
  };

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<JobService>> = {
      createJob: jest.fn().mockResolvedValue(sampleJobResponse),
      getJobs: jest.fn().mockResolvedValue({
        jobs: [sampleJobResponse],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
      getJobById: jest.fn().mockResolvedValue(sampleJobResponse),
      updateJob: jest.fn().mockResolvedValue({
        ...sampleJobResponse,
        title: 'Updated Warehouse Helper',
      }),
      deleteJob: jest.fn().mockResolvedValue({ success: true }),
      publishJob: jest.fn().mockResolvedValue({
        ...sampleJobResponse,
        status: JobStatus.PUBLISHED,
        publishedAt: '2026-10-02T10:00:00.000Z',
      }),
      pauseJob: jest.fn().mockResolvedValue({
        ...sampleJobResponse,
        status: JobStatus.PAUSED,
      }),
      resumeJob: jest.fn().mockResolvedValue({
        ...sampleJobResponse,
        status: JobStatus.PUBLISHED,
      }),
      fillJob: jest.fn().mockResolvedValue({
        ...sampleJobResponse,
        status: JobStatus.FILLED,
      }),
      closeJob: jest.fn().mockResolvedValue({
        ...sampleJobResponse,
        status: JobStatus.CANCELLED,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobController],
      providers: [
        {
          provide: JobService,
          useValue: mockService,
        },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<JobController>(JobController);
    jobService = module.get(JobService);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
  });

  describe('POST /employers/me/jobs', () => {
    it('should create a new draft job', async () => {
      const dto = {
        title: 'Warehouse Helper',
        description: 'General loading and unloading.',
        category: 'Logistics',
        wageType: 'DAILY' as const,
        wageAmount: 1000,
        startDate: '2026-11-10',
      };
      const result = await controller.createJob(mockEmployerUser, dto);
      expect(jobService.createJob).toHaveBeenCalledWith('user-employer-1', dto);
      expect(result.id).toBe('job-101');
      expect(result.status).toBe(JobStatus.DRAFT);
    });
  });

  describe('GET /employers/me/jobs', () => {
    it('should list employer jobs with query filters', async () => {
      const query = { page: 1, limit: 10 };
      const result = await controller.getJobs(mockEmployerUser, query);
      expect(jobService.getJobs).toHaveBeenCalledWith('user-employer-1', query);
      expect(result.jobs.length).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  describe('GET /employers/me/jobs/:jobId', () => {
    it('should retrieve single job by ID', async () => {
      const result = await controller.getJobById(mockEmployerUser, 'job-101');
      expect(jobService.getJobById).toHaveBeenCalledWith('user-employer-1', 'job-101');
      expect(result.id).toBe('job-101');
    });
  });

  describe('PATCH /employers/me/jobs/:jobId', () => {
    it('should update job attributes', async () => {
      const updateDto = { title: 'Updated Warehouse Helper' };
      const result = await controller.updateJob(mockEmployerUser, 'job-101', updateDto);
      expect(jobService.updateJob).toHaveBeenCalledWith('user-employer-1', 'job-101', updateDto);
      expect(result.title).toBe('Updated Warehouse Helper');
    });
  });

  describe('DELETE /employers/me/jobs/:jobId', () => {
    it('should delete a draft job', async () => {
      const result = await controller.deleteJob(mockEmployerUser, 'job-101');
      expect(jobService.deleteJob).toHaveBeenCalledWith('user-employer-1', 'job-101');
      expect(result.success).toBe(true);
    });
  });

  describe('Lifecycle Transition Endpoints', () => {
    it('POST /publish should transition job to PUBLISHED', async () => {
      const result = await controller.publishJob(mockEmployerUser, 'job-101');
      expect(jobService.publishJob).toHaveBeenCalledWith('user-employer-1', 'job-101');
      expect(result.status).toBe(JobStatus.PUBLISHED);
    });

    it('POST /pause should transition job to PAUSED', async () => {
      const result = await controller.pauseJob(mockEmployerUser, 'job-101');
      expect(jobService.pauseJob).toHaveBeenCalledWith('user-employer-1', 'job-101');
      expect(result.status).toBe(JobStatus.PAUSED);
    });

    it('POST /resume should transition job to PUBLISHED', async () => {
      const result = await controller.resumeJob(mockEmployerUser, 'job-101');
      expect(jobService.resumeJob).toHaveBeenCalledWith('user-employer-1', 'job-101');
      expect(result.status).toBe(JobStatus.PUBLISHED);
    });

    it('POST /fill should transition job to FILLED', async () => {
      const result = await controller.fillJob(mockEmployerUser, 'job-101');
      expect(jobService.fillJob).toHaveBeenCalledWith('user-employer-1', 'job-101');
      expect(result.status).toBe(JobStatus.FILLED);
    });

    it('POST /close should transition job to CANCELLED', async () => {
      const result = await controller.closeJob(mockEmployerUser, 'job-101');
      expect(jobService.closeJob).toHaveBeenCalledWith('user-employer-1', 'job-101');
      expect(result.status).toBe(JobStatus.CANCELLED);
    });
  });

  describe('RBAC RolesGuard protection', () => {
    function createMockContext(user?: AuthenticatedUser): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
        getHandler: () => JobController.prototype.createJob,
        getClass: () => JobController,
      } as unknown as ExecutionContext;
    }

    it('should ALLOW access for user with EMPLOYER role', () => {
      const context = createMockContext(mockEmployerUser);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should FORBID access for user with WORKER role', () => {
      const context = createMockContext(mockWorkerUser);
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should FORBID access when unauthenticated', () => {
      const context = createMockContext(undefined);
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
