import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MatchingController } from '../matching.controller';
import { MatchingService } from '../matching.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  UserRole,
  AuthenticatedUser,
  WorkerJobDiscoveryResponse,
  WorkerJobDetailResponse,
  JobStatus,
  JobUrgency,
  WageType,
} from '@localsaathi/types';

describe('Matching Controller & Role Guard Tests', () => {
  let controller: MatchingController;
  let matchingService: jest.Mocked<MatchingService>;
  let rolesGuard: RolesGuard;

  const mockWorkerUser: AuthenticatedUser = {
    userId: 'worker-user-1',
    sessionId: 'sess-worker',
    role: UserRole.WORKER,
  };

  const mockEmployerUser: AuthenticatedUser = {
    userId: 'employer-user-1',
    sessionId: 'sess-employer',
    role: UserRole.EMPLOYER,
  };

  const sampleDiscoveryResponse: WorkerJobDiscoveryResponse = {
    items: [
      {
        id: 'job-101',
        title: 'Emergency Residential Pipe Replacement',
        description: 'Fixing burst kitchen pipe.',
        category: 'Plumbing',
        status: JobStatus.PUBLISHED,
        urgency: JobUrgency.IMMEDIATE,
        wageType: WageType.DAILY,
        wageAmount: 1200,
        workerCount: 1,
        durationDays: 1,
        startDate: '2026-10-05',
        startTime: '08:00',
        requirements: ['Own plumbing kit'],
        languageRequirements: ['hi'],
        publishedAt: '2026-10-01T00:00:00.000Z',
        createdAt: '2026-10-01T00:00:00.000Z',
        location: {
          locality: 'Connaught Place',
          city: 'New Delhi',
          state: 'Delhi',
          pinCode: '110001',
          addressLine: 'Block C',
        },
        employer: {
          businessName: 'Apex Facilities',
          businessType: 'Contractor',
          locality: 'Connaught Place',
          city: 'New Delhi',
          verificationState: 'VERIFIED',
          totalJobsPosted: 5,
        },
        requiredSkills: [
          {
            skillId: 'sk-1',
            name: 'Pipe Repair',
            category: 'Plumbing',
            isRequired: true,
            minExperienceYears: 2,
          },
        ],
        distanceKm: 2.4,
        match: {
          eligible: true,
          score: 94,
          reasons: [
            'Within your 15 km service area (2.4 km away)',
            'All 1 required skill(s) matched: Pipe Repair',
            'Your experience satisfies job prerequisites',
          ],
          breakdown: {
            distanceKm: 2.4,
            effectiveRadiusKm: 15,
            distanceScore: 84,
            matchedSkillsCount: 1,
            totalRequiredSkillsCount: 1,
            skillCoveragePercentage: 100,
            skillScore: 100,
            experienceMet: true,
            experienceScore: 100,
            availabilityCompatible: true,
            availabilityReason: 'Available on the job date',
            availabilityScore: 100,
            wageCompatible: true,
            wageComparisonText: 'Offered ₹1,200 meets or exceeds your expected ₹800',
            wageScore: 100,
          },
        },
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
    },
  };

  const sampleDetailResponse: WorkerJobDetailResponse = {
    ...sampleDiscoveryResponse.items[0]!,
    skillDetails: [
      {
        skillId: 'sk-1',
        name: 'Pipe Repair',
        category: 'Plumbing',
        isRequired: true,
        minExperienceYears: 2,
        workerHasSkill: true,
        workerProficiency: 'EXPERT',
        workerExperienceYears: 5,
        experienceMet: true,
      },
    ],
  };

  beforeEach(async () => {
    const mockMatchingService = {
      discoverJobsForWorker: jest.fn().mockResolvedValue(sampleDiscoveryResponse),
      getNearbyJobsForWorker: jest.fn().mockResolvedValue(sampleDiscoveryResponse),
      getJobDetailForWorker: jest.fn().mockResolvedValue(sampleDetailResponse),
      recommendJobsForWorker: jest.fn().mockResolvedValue(sampleDiscoveryResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchingController],
      providers: [
        { provide: MatchingService, useValue: mockMatchingService },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MatchingController>(MatchingController);
    matchingService = module.get(MatchingService);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
  });

  function createMockExecutionContext(user: AuthenticatedUser, handler: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => handler,
      getClass: () => MatchingController,
    } as unknown as ExecutionContext;
  }

  describe('1. RBAC Guard Enforcement', () => {
    it('1.1 Allows WORKER role on discoverJobs', () => {
      const context = createMockExecutionContext(mockWorkerUser, controller.discoverJobs);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('1.2 Rejects EMPLOYER role with 403 Forbidden on discoverJobs', () => {
      const context = createMockExecutionContext(mockEmployerUser, controller.discoverJobs);
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('1.3 Rejects EMPLOYER role with 403 Forbidden on getNearbyJobs', () => {
      const context = createMockExecutionContext(mockEmployerUser, controller.getNearbyJobs);
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('1.4 Rejects EMPLOYER role with 403 Forbidden on getJobDetail', () => {
      const context = createMockExecutionContext(mockEmployerUser, controller.getJobDetail);
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('1.5 Rejects EMPLOYER role with 403 Forbidden on getRecommendedJobs', () => {
      const context = createMockExecutionContext(mockEmployerUser, controller.getRecommendedJobs);
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('2. Controller Routing & Delegation', () => {
    it('2.1 GET /api/v1/workers/me/jobs delegates strictly with authenticated worker sub', async () => {
      const query = { page: 1, limit: 10, sort: 'score_desc' as const };
      const result = await controller.discoverJobs(mockWorkerUser, query);

      expect(matchingService.discoverJobsForWorker).toHaveBeenCalledWith('worker-user-1', query);
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.title).toBe('Emergency Residential Pipe Replacement');
      expect(result.items[0]?.match.score).toBe(94);
    });

    it('2.2 GET /api/v1/workers/me/jobs/nearby delegates with worker sub', async () => {
      const query = { radiusKm: 10, page: 1, limit: 10 };
      const result = await controller.getNearbyJobs(mockWorkerUser, query);

      expect(matchingService.getNearbyJobsForWorker).toHaveBeenCalledWith('worker-user-1', query);
      expect(result.items.length).toBe(1);
    });

    it('2.3 GET /api/v1/workers/jobs/:jobId returns single job with skillDetails', async () => {
      const result = await controller.getJobDetail(mockWorkerUser, 'job-101');

      expect(matchingService.getJobDetailForWorker).toHaveBeenCalledWith('worker-user-1', 'job-101');
      expect(result.id).toBe('job-101');
      expect(result.skillDetails.length).toBe(1);
      expect(result.skillDetails[0]?.workerHasSkill).toBe(true);
      expect(result.employer.businessName).toBe('Apex Facilities');
    });

    it('2.4 GET /api/v1/workers/me/jobs/recommendations delegates with worker sub', async () => {
      const query = { page: 1, limit: 10, category: 'Plumbing' };
      const result = await controller.getRecommendedJobs(mockWorkerUser, query);

      expect(matchingService.recommendJobsForWorker).toHaveBeenCalledWith('worker-user-1', query);
      expect(result.items.length).toBe(1);
    });
  });
});
