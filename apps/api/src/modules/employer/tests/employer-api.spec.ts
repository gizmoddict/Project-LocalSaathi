import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmployerController } from '../employer.controller';
import { EmployerService } from '../employer.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  UserRole,
  AuthenticatedUser,
  OnboardingStatus,
  VerificationStatus,
} from '@localsaathi/types';

describe('Employer API Controller & Role Guard Tests', () => {
  let controller: EmployerController;
  let employerService: jest.Mocked<EmployerService>;
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

  const sampleProfileResponse = {
    id: 'emp-101',
    userId: 'user-employer-1',
    businessName: 'Patel Logistics & Warehousing',
    description: 'Premier regional warehouse operator.',
    businessType: 'Logistics',
    contactPreferences: ['PHONE', 'IN_APP'],
    verificationState: VerificationStatus.UNVERIFIED,
    totalJobsPosted: 5,
    totalHires: 3,
    addressLine: 'Plot 4, Sector 7',
    locality: 'Whitefield',
    city: 'Bengaluru',
    state: 'Karnataka',
    pinCode: '560066',
    onboardingStatus: OnboardingStatus.IN_PROGRESS,
    onboardingCompletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<EmployerService>> = {
      getProfile: jest.fn().mockResolvedValue(sampleProfileResponse),
      updateProfile: jest.fn().mockResolvedValue(sampleProfileResponse),
      getCompletion: jest.fn().mockResolvedValue({
        completionPercentage: 80,
        completedSteps: ['businessName', 'description', 'businessType', 'contactPreferences'],
        remainingSteps: ['location'],
        isComplete: false,
        details: {
          businessName: true,
          description: true,
          businessType: true,
          contactPreferences: true,
          location: false,
        },
      }),
      completeOnboarding: jest.fn().mockResolvedValue({
        success: true,
        onboardingStatus: 'COMPLETED',
        completionPercentage: 100,
      }),
      getDashboard: jest.fn().mockResolvedValue({
        profile: sampleProfileResponse,
        completion: {
          completionPercentage: 100,
          completedSteps: ['businessName', 'description', 'businessType', 'contactPreferences', 'location'],
          remainingSteps: [],
          isComplete: true,
          details: {
            businessName: true,
            description: true,
            businessType: true,
            contactPreferences: true,
            location: true,
          },
        },
        activeJobsCount: 2,
        totalJobsCount: 5,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployerController],
      providers: [
        {
          provide: EmployerService,
          useValue: mockService,
        },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EmployerController>(EmployerController);
    employerService = module.get(EmployerService);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
  });

  describe('GET /employers/me', () => {
    it('should return employer profile for authenticated EMPLOYER', async () => {
      const result = await controller.getProfile(mockEmployerUser);
      expect(employerService.getProfile).toHaveBeenCalledWith('user-employer-1');
      expect(result.businessName).toBe('Patel Logistics & Warehousing');
    });
  });

  describe('PATCH /employers/me', () => {
    it('should delegate update to EmployerService', async () => {
      const updateDto = { businessName: 'Updated Name' };
      const result = await controller.updateProfile(mockEmployerUser, updateDto);
      expect(employerService.updateProfile).toHaveBeenCalledWith('user-employer-1', updateDto);
      expect(result).toBeDefined();
    });
  });

  describe('GET /employers/me/completion', () => {
    it('should return completion breakdown', async () => {
      const result = await controller.getCompletion(mockEmployerUser);
      expect(employerService.getCompletion).toHaveBeenCalledWith('user-employer-1');
      expect(result.completionPercentage).toBe(80);
      expect(result.isComplete).toBe(false);
    });
  });

  describe('POST /employers/me/onboarding/complete', () => {
    it('should finalize onboarding', async () => {
      const result = await controller.completeOnboarding(mockEmployerUser);
      expect(employerService.completeOnboarding).toHaveBeenCalledWith('user-employer-1');
      expect(result.success).toBe(true);
      expect(result.onboardingStatus).toBe('COMPLETED');
    });
  });

  describe('GET /employers/me/dashboard', () => {
    it('should retrieve employer dashboard', async () => {
      const result = await controller.getDashboard(mockEmployerUser);
      expect(employerService.getDashboard).toHaveBeenCalledWith('user-employer-1');
      expect(result.activeJobsCount).toBe(2);
      expect(result.totalJobsCount).toBe(5);
    });
  });

  describe('RBAC RolesGuard protection', () => {
    function createMockContext(user?: AuthenticatedUser): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
        getHandler: () => EmployerController.prototype.getProfile,
        getClass: () => EmployerController,
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

    it('should FORBID access when unauthenticated (no user on request)', () => {
      const context = createMockContext(undefined);
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
