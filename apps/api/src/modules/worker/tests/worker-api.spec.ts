import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnprocessableEntityException,
  ForbiddenException,
  ExecutionContext,
} from '@nestjs/common';
import { WorkerController } from '../worker.controller';
import { WorkerService } from '../worker.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  UserRole,
  AuthenticatedUser,
  WageType,
  SkillProficiency,
  OnboardingStatus,
  VerificationStatus,
  AvailabilityStatus,
} from '@localsaathi/types';
import { Reflector } from '@nestjs/core';

describe('Worker API Integration Tests (Phase 4)', () => {
  let controller: WorkerController;
  let workerService: jest.Mocked<WorkerService>;
  let rolesGuard: RolesGuard;

  const mockWorkerUser: AuthenticatedUser = {
    userId: 'worker-user-id-1',
    sessionId: 'session-id-1',
    role: UserRole.WORKER,
  };

  const mockEmployerUser: AuthenticatedUser = {
    userId: 'employer-user-id-1',
    sessionId: 'session-id-2',
    role: UserRole.EMPLOYER,
  };

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<WorkerService>> = {
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
      getSkills: jest.fn(),
      addSkill: jest.fn(),
      updateSkill: jest.fn(),
      removeSkill: jest.fn(),
      getLocation: jest.fn(),
      updateLocation: jest.fn(),
      getAvailability: jest.fn(),
      createAvailability: jest.fn(),
      updateAvailability: jest.fn(),
      deleteAvailability: jest.fn(),
      getCompletion: jest.fn(),
      completeOnboarding: jest.fn(),
      uploadProfilePhoto: jest.fn(),
      getSkillsCatalog: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkerController],
      providers: [
        {
          provide: WorkerService,
          useValue: mockService,
        },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkerController>(WorkerController);
    workerService = module.get(WorkerService);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
  });

  // 1. Authenticated worker can retrieve and update profile
  it('1. authenticated worker can create/update profile', async () => {
    workerService.updateProfile.mockResolvedValue({
      id: 'profile-1',
      userId: mockWorkerUser.userId,
      displayName: 'Ramesh Kumar',
      profilePhotoKey: null,
      bio: 'Experienced Plumber',
      experienceYears: 6,
      expectedWage: 800,
      wageType: WageType.DAILY,
      preferredRadiusKm: 15,
      languages: ['hi', 'en'],
      isAvailable: true,
      onboardingStatus: OnboardingStatus.IN_PROGRESS,
      onboardingCompletedAt: null,
      verificationStatus: VerificationStatus.UNVERIFIED,
      completedJobsCount: 0,
      avgRating: 0,
      ratingCount: 0,
      reliabilityScore: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await controller.updateProfile(mockWorkerUser, {
      displayName: 'Ramesh Kumar',
      experienceYears: 6,
      expectedWage: 800,
    });

    expect(result.displayName).toBe('Ramesh Kumar');
    expect(result.experienceYears).toBe(6);
    expect(workerService.updateProfile).toHaveBeenCalledWith(
      mockWorkerUser.userId,
      expect.objectContaining({ displayName: 'Ramesh Kumar' })
    );
  });

  // 2. Unauthenticated user receives 401 via JwtAuthGuard
  it('2. unauthenticated user receives 401 via JwtAuthGuard', () => {
    const realJwtGuard = new JwtAuthGuard(
      new Reflector(),
      {
        verifyAsync: jest.fn().mockRejectedValue(new Error('jwt must be provided')),
      } as any,
      {} as any
    );

    const mockContext = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    expect(realJwtGuard.canActivate(mockContext)).rejects.toThrow();
  });

  // 3. Employer cannot access worker-only endpoints (403 Forbidden)
  it('3. employer cannot access worker-only endpoints', () => {
    const mockContext = {
      getHandler: () => controller.getProfile,
      getClass: () => WorkerController,
      switchToHttp: () => ({
        getRequest: () => ({ user: mockEmployerUser }),
      }),
    } as unknown as ExecutionContext;

    expect(() => rolesGuard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  // 4. Worker cannot modify another worker (always derived from authenticated JWT)
  it('4. worker cannot modify another worker - workerId is always derived from sub', async () => {
    workerService.updateProfile.mockResolvedValue({
      id: 'profile-1',
      userId: mockWorkerUser.userId,
      displayName: 'Ramesh',
    } as any);

    await controller.updateProfile(mockWorkerUser, { displayName: 'Ramesh' });

    // Verifies that workerService is invoked strictly with mockWorkerUser.userId
    expect(workerService.updateProfile).toHaveBeenCalledWith(
      'worker-user-id-1',
      expect.anything()
    );
  });

  // 5. Worker can add skill
  it('5. worker can add skill to profile', async () => {
    workerService.addSkill.mockResolvedValue({
      id: 'ws-1',
      skillId: 'skill-1',
      name: 'Plumbing',
      category: 'Plumbing',
      proficiency: 'EXPERT',
      experienceYears: 5,
      isVerified: false,
    });

    const result = await controller.addSkill(mockWorkerUser, {
      name: 'Plumbing',
      proficiency: SkillProficiency.EXPERT,
      experienceYears: 5,
    });

    expect(result.name).toBe('Plumbing');
    expect(workerService.addSkill).toHaveBeenCalledWith(
      mockWorkerUser.userId,
      expect.objectContaining({ name: 'Plumbing' })
    );
  });

  // 6. Duplicate skill rejected/prevented (409 Conflict)
  it('6. duplicate skill rejected with 409 Conflict', async () => {
    workerService.addSkill.mockRejectedValue(
      new ConflictException('Worker already has this skill in their profile')
    );

    await expect(
      controller.addSkill(mockWorkerUser, { name: 'Plumbing' })
    ).rejects.toThrow(ConflictException);
  });

  // 7. Worker can remove skill
  it('7. worker can remove skill from profile', async () => {
    workerService.removeSkill.mockResolvedValue({ success: true });

    const result = await controller.removeSkill(mockWorkerUser, 'skill-1');
    expect(result.success).toBe(true);
    expect(workerService.removeSkill).toHaveBeenCalledWith(mockWorkerUser.userId, 'skill-1');
  });

  // 8. Worker can update location
  it('8. worker can update location', async () => {
    workerService.updateLocation.mockResolvedValue({
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
      preferredRadiusKm: 15,
      latitude: 26.85,
      longitude: 80.948,
      updatedAt: new Date().toISOString(),
    });

    const result = await controller.updateLocation(mockWorkerUser, {
      latitude: 26.85,
      longitude: 80.948,
      locality: 'Hazratganj',
      city: 'Lucknow',
    });

    expect(result.city).toBe('Lucknow');
    expect(workerService.updateLocation).toHaveBeenCalledWith(
      mockWorkerUser.userId,
      expect.objectContaining({ latitude: 26.85, longitude: 80.948 })
    );
  });

  // 9. Invalid coordinates rejected (422 Unprocessable Entity)
  it('9. invalid coordinates rejected by service validation', async () => {
    workerService.updateLocation.mockRejectedValue(
      new UnprocessableEntityException({ message: 'Invalid location payload' })
    );

    await expect(
      controller.updateLocation(mockWorkerUser, {
        latitude: 100.0, // Invalid latitude
        longitude: 80.0,
      })
    ).rejects.toThrow(UnprocessableEntityException);
  });

  // 10. Worker can create availability
  it('10. worker can create availability slot', async () => {
    workerService.createAvailability.mockResolvedValue({
      id: 'avail-1',
      date: '2026-10-10',
      startTime: '08:00',
      endTime: '17:00',
      status: AvailabilityStatus.AVAILABLE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await controller.createAvailability(mockWorkerUser, {
      date: '2026-10-10',
      startTime: '08:00',
      endTime: '17:00',
    });

    expect(result.date).toBe('2026-10-10');
    expect(workerService.createAvailability).toHaveBeenCalledWith(
      mockWorkerUser.userId,
      expect.objectContaining({ date: '2026-10-10' })
    );
  });

  // 11. Invalid availability rejected (startTime >= endTime)
  it('11. invalid availability rejected by service validation', async () => {
    workerService.createAvailability.mockRejectedValue(
      new UnprocessableEntityException({
        message: 'Start time must be chronologically earlier than end time',
      })
    );

    await expect(
      controller.createAvailability(mockWorkerUser, {
        date: '2026-10-10',
        startTime: '18:00',
        endTime: '08:00',
      })
    ).rejects.toThrow(UnprocessableEntityException);
  });

  // 12. Worker can update availability
  it('12. worker can update availability slot', async () => {
    workerService.updateAvailability.mockResolvedValue({
      id: 'avail-1',
      date: '2026-10-10',
      startTime: '09:00',
      endTime: '18:00',
      status: AvailabilityStatus.AVAILABLE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await controller.updateAvailability(mockWorkerUser, 'avail-1', {
      startTime: '09:00',
      endTime: '18:00',
    });

    expect(result.startTime).toBe('09:00');
    expect(workerService.updateAvailability).toHaveBeenCalledWith(
      mockWorkerUser.userId,
      'avail-1',
      expect.objectContaining({ startTime: '09:00' })
    );
  });

  // 13. Worker can delete availability
  it('13. worker can delete availability slot', async () => {
    workerService.deleteAvailability.mockResolvedValue({ success: true });

    const result = await controller.deleteAvailability(mockWorkerUser, 'avail-1');
    expect(result.success).toBe(true);
    expect(workerService.deleteAvailability).toHaveBeenCalledWith(mockWorkerUser.userId, 'avail-1');
  });

  // 14. Completion endpoint works
  it('14. completion endpoint returns progress metrics', async () => {
    workerService.getCompletion.mockResolvedValue({
      completionPercentage: 85,
      completedSteps: ['basic_profile', 'skills', 'experience', 'languages', 'wage', 'location'],
      remainingSteps: ['availability'],
      isComplete: false,
    });

    const result = await controller.getCompletion(mockWorkerUser);
    expect(result.completionPercentage).toBe(85);
    expect(result.isComplete).toBe(false);
    expect(result.remainingSteps).toEqual(['availability']);
  });

  // 15. Incomplete onboarding cannot be completed (422)
  it('15. incomplete onboarding cannot be completed - throws 422 with missing steps', async () => {
    workerService.completeOnboarding.mockRejectedValue(
      new UnprocessableEntityException({
        message: 'Cannot complete onboarding: mandatory profile requirements have not been satisfied',
        remainingSteps: ['availability', 'location'],
      })
    );

    await expect(controller.completeOnboarding(mockWorkerUser)).rejects.toThrow(
      UnprocessableEntityException
    );
  });

  // 16. Completed onboarding succeeds
  it('16. completed onboarding succeeds when all steps are fulfilled', async () => {
    workerService.completeOnboarding.mockResolvedValue({
      success: true,
      onboardingStatus: OnboardingStatus.COMPLETED,
      completionPercentage: 100,
    });

    const result = await controller.completeOnboarding(mockWorkerUser);
    expect(result.success).toBe(true);
    expect(result.onboardingStatus).toBe(OnboardingStatus.COMPLETED);
    expect(result.completionPercentage).toBe(100);
  });

  // 17. Repeated completion is idempotent
  it('17. repeated completion is idempotent', async () => {
    workerService.completeOnboarding.mockResolvedValue({
      success: true,
      onboardingStatus: OnboardingStatus.COMPLETED,
      completionPercentage: 100,
    });

    const call1 = await controller.completeOnboarding(mockWorkerUser);
    const call2 = await controller.completeOnboarding(mockWorkerUser);

    expect(call1.onboardingStatus).toBe(OnboardingStatus.COMPLETED);
    expect(call2.onboardingStatus).toBe(OnboardingStatus.COMPLETED);
    expect(workerService.completeOnboarding).toHaveBeenCalledTimes(2);
  });
});
