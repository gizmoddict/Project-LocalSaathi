import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { EmployerService } from '../employer.service';
import { EmployerCompletionService } from '../services/employer-completion.service';
import { PrismaService } from '../../database/database.module';
import { EmployerProfileEntity } from '../mappers/employer.mapper';

describe('EmployerService & EmployerCompletionService (Unit Tests)', () => {
  let employerService: EmployerService;
  let completionService: EmployerCompletionService;
  let prismaMock: {
    employerProfile: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    jobPost: {
      count: jest.Mock;
    };
    jobApplication: {
      count: jest.Mock;
    };
  };

  const sampleEmployer: EmployerProfileEntity = {
    id: 'emp-uuid-1',
    userId: 'user-uuid-1',
    businessName: 'Sharma Contractors',
    description: 'Specialized building contractors in North Bengaluru.',
    businessType: 'Construction',
    contactPreferences: ['PHONE', 'IN_APP'],
    verificationState: 'UNVERIFIED',
    totalJobsPosted: 2,
    totalHires: 1,
    addressLine: '12 Ring Road',
    locality: 'Hebbal',
    city: 'Bengaluru',
    state: 'Karnataka',
    pinCode: '560024',
    onboardingStatus: 'IN_PROGRESS',
    onboardingCompletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  };

  beforeEach(async () => {
    prismaMock = {
      employerProfile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      jobPost: {
        count: jest.fn(),
      },
      jobApplication: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployerService,
        EmployerCompletionService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    employerService = module.get<EmployerService>(EmployerService);
    completionService = module.get<EmployerCompletionService>(EmployerCompletionService);
  });

  describe('EmployerCompletionService', () => {
    it('should calculate 0% when no optional profile data is provided', () => {
      const minimalEmployer: EmployerProfileEntity = {
        ...sampleEmployer,
        businessName: '',
        description: null,
        businessType: null,
        contactPreferences: [],
        city: null,
        pinCode: null,
      };

      const result = completionService.calculateCompletion(minimalEmployer);
      expect(result.completionPercentage).toBe(0);
      expect(result.isComplete).toBe(false);
      expect(result.remainingSteps).toEqual([
        'businessName',
        'description',
        'businessType',
        'contactPreferences',
        'location',
      ]);
    });

    it('should calculate partial percentage (40%) when only businessName and contactPreferences are filled', () => {
      const partial: EmployerProfileEntity = {
        ...sampleEmployer,
        description: null,
        businessType: null,
        city: null,
        pinCode: null,
      };

      const result = completionService.calculateCompletion(partial);
      expect(result.completionPercentage).toBe(40);
      expect(result.completedSteps).toContain('businessName');
      expect(result.completedSteps).toContain('contactPreferences');
      expect(result.isComplete).toBe(false);
    });

    it('should calculate 100% when all 5 criteria are fulfilled', () => {
      const result = completionService.calculateCompletion(sampleEmployer);
      expect(result.completionPercentage).toBe(100);
      expect(result.isComplete).toBe(true);
      expect(result.remainingSteps.length).toBe(0);
      expect(result.details.businessName).toBe(true);
      expect(result.details.description).toBe(true);
      expect(result.details.businessType).toBe(true);
      expect(result.details.contactPreferences).toBe(true);
      expect(result.details.location).toBe(true);
    });
  });

  describe('EmployerService', () => {
    it('should auto-provision a profile if not found on first access', async () => {
      prismaMock.employerProfile.findUnique.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-uuid-1' });
      prismaMock.employerProfile.create.mockResolvedValue(sampleEmployer);

      const profile = await employerService.getProfile('user-uuid-1');

      expect(prismaMock.employerProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
      });
      expect(prismaMock.employerProfile.create).toHaveBeenCalled();
      expect(profile.businessName).toBe('Sharma Contractors');
    });

    it('should update profile and advance onboardingStatus from NOT_STARTED to IN_PROGRESS', async () => {
      const notStartedEmployer = { ...sampleEmployer, onboardingStatus: 'NOT_STARTED' };
      prismaMock.employerProfile.findUnique.mockResolvedValue(notStartedEmployer);
      prismaMock.employerProfile.update.mockResolvedValue({
        ...notStartedEmployer,
        businessName: 'Sharma Enterprise',
        onboardingStatus: 'IN_PROGRESS',
      });

      const updated = await employerService.updateProfile('user-uuid-1', {
        businessName: 'Sharma Enterprise',
      });

      expect(prismaMock.employerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessName: 'Sharma Enterprise',
            onboardingStatus: 'IN_PROGRESS',
          }),
        })
      );
      expect(updated.businessName).toBe('Sharma Enterprise');
    });

    it('should throw UnprocessableEntityException on invalid PIN code during profile update', async () => {
      prismaMock.employerProfile.findUnique.mockResolvedValue(sampleEmployer);

      await expect(
        employerService.updateProfile('user-uuid-1', {
          pinCode: '123', // invalid PIN format
        })
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should block onboarding completion if profile criteria are incomplete', async () => {
      const incomplete = {
        ...sampleEmployer,
        description: null,
      };
      prismaMock.employerProfile.findUnique.mockResolvedValue(incomplete);

      await expect(employerService.completeOnboarding('user-uuid-1')).rejects.toThrow(
        UnprocessableEntityException
      );
    });

    it('should finalize onboarding with COMPLETED status when profile is 100% complete', async () => {
      prismaMock.employerProfile.findUnique.mockResolvedValue(sampleEmployer);
      prismaMock.employerProfile.update.mockResolvedValue({
        ...sampleEmployer,
        onboardingStatus: 'COMPLETED',
        onboardingCompletedAt: new Date(),
      });

      const result = await employerService.completeOnboarding('user-uuid-1');

      expect(result.success).toBe(true);
      expect(result.onboardingStatus).toBe('COMPLETED');
      expect(result.completionPercentage).toBe(100);
    });

    it('should retrieve dashboard statistics correctly', async () => {
      prismaMock.employerProfile.findUnique.mockResolvedValue(sampleEmployer);
      prismaMock.jobPost.count.mockResolvedValueOnce(3); // active jobs
      prismaMock.jobPost.count.mockResolvedValueOnce(7); // total jobs

      const dashboard = await employerService.getDashboard('user-uuid-1');

      expect(dashboard.activeJobsCount).toBe(3);
      expect(dashboard.totalJobsCount).toBe(7);
      expect(dashboard.completion.isComplete).toBe(true);
    });
  });
});
