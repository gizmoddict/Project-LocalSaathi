import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../database/database.module';
import { UpdateEmployerProfileDto } from './dto';
import { updateEmployerProfileSchema } from '@localsaathi/validation';
import {
  EmployerProfileResponse,
  EmployerCompletionResponse,
  EmployerDashboardResponse,
  JobStatus,
} from '@localsaathi/types';
import { EmployerMapper, EmployerProfileEntity } from './mappers/employer.mapper';
import { EmployerCompletionService } from './services/employer-completion.service';
import { CacheService } from '../cache/cache.service';
import { CacheKeys } from '../cache/cache-keys';
import { CACHE_CONSTANTS } from '../cache/cache.constants';
import { PublicEmployerCachedDto } from '@localsaathi/types';

@Injectable()
export class EmployerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completionService: EmployerCompletionService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  /**
   * Internal helper: Query employer profile by userId or auto-provision initial record.
   */
  async findEmployerByUserId(userId: string): Promise<EmployerProfileEntity> {
    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId },
    });

    if (!employer) {
      return this.createInitialEmployerProfile(userId);
    }

    return employer as EmployerProfileEntity;
  }

  /**
   * Auto-provision baseline employer profile on first authenticated access.
   */
  private async createInitialEmployerProfile(userId: string): Promise<EmployerProfileEntity> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const created = await this.prisma.employerProfile.create({
      data: {
        userId,
        businessName: 'My Business',
        contactPreferences: ['PHONE', 'IN_APP'],
        onboardingStatus: 'NOT_STARTED',
      },
    });

    return created as EmployerProfileEntity;
  }

  /**
   * Retrieve authenticated employer's profile.
   */
  async getProfile(userId: string): Promise<EmployerProfileResponse> {
    const employer = await this.findEmployerByUserId(userId);
    return EmployerMapper.toProfileResponse(employer);
  }

  /**
   * Update employer profile fields.
   */
  async updateProfile(
    userId: string,
    dto: UpdateEmployerProfileDto
  ): Promise<EmployerProfileResponse> {
    const parseResult = updateEmployerProfileSchema.safeParse(dto);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new UnprocessableEntityException(`Validation failed: ${issues}`);
    }

    const current = await this.findEmployerByUserId(userId);

    const updateData: Record<string, unknown> = {};

    if (dto.businessName !== undefined) updateData.businessName = dto.businessName;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.businessType !== undefined) updateData.businessType = dto.businessType;
    if (dto.contactPreferences !== undefined) updateData.contactPreferences = dto.contactPreferences;
    if (dto.addressLine !== undefined) updateData.addressLine = dto.addressLine;
    if (dto.locality !== undefined) updateData.locality = dto.locality;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.state !== undefined) updateData.state = dto.state;
    if (dto.pinCode !== undefined) updateData.pinCode = dto.pinCode;

    // Advance onboarding status to IN_PROGRESS if currently NOT_STARTED
    if (current.onboardingStatus === 'NOT_STARTED') {
      updateData.onboardingStatus = 'IN_PROGRESS';
    }

    const updated = await this.prisma.employerProfile.update({
      where: { id: current.id },
      data: updateData,
    });

    // Invalidate public employer cache
    if (this.cacheService) {
      await this.cacheService.delPattern(CacheKeys.employerWildcard(current.id));
    }

    return EmployerMapper.toProfileResponse(updated as EmployerProfileEntity);
  }

  /**
   * Retrieve cached public employer projection (safe for worker/public consumption).
   */
  async getPublicEmployerProfile(employerId: string): Promise<PublicEmployerCachedDto | null> {
    const fetchFn = async () => {
      const employer = await this.prisma.employerProfile.findUnique({
        where: { id: employerId },
      });
      if (!employer) return null;
      return {
        businessName: employer.businessName,
        businessType: employer.businessType || 'Independent',
        locality: employer.locality || '',
        city: employer.city || '',
        verificationState: employer.verificationState || 'UNVERIFIED',
        totalJobsPosted: employer.totalJobsPosted || 0,
      };
    };

    if (!this.cacheService) {
      return fetchFn();
    }

    const cacheKey = CacheKeys.employerPublic(employerId);
    return this.cacheService.wrap(
      cacheKey,
      fetchFn,
      {
        ttl: CACHE_CONSTANTS.TTL.EMPLOYER_PUBLIC,
        stampedeProtect: true,
        negativeCache: true,
      },
    );
  }

  /**
   * Compute employer onboarding completion state.
   */
  async getCompletion(userId: string): Promise<EmployerCompletionResponse> {
    const employer = await this.findEmployerByUserId(userId);
    return this.completionService.calculateCompletion(employer);
  }

  /**
   * Finalize employer onboarding after verifying all required fields server-side.
   */
  async completeOnboarding(userId: string): Promise<{
    success: boolean;
    onboardingStatus: string;
    completionPercentage: number;
  }> {
    const employer = await this.findEmployerByUserId(userId);
    const completion = this.completionService.calculateCompletion(employer);

    if (!completion.isComplete) {
      throw new UnprocessableEntityException({
        message: 'Cannot complete onboarding: required profile fields are missing.',
        completionPercentage: completion.completionPercentage,
        remainingSteps: completion.remainingSteps,
      });
    }

    const updated = await this.prisma.employerProfile.update({
      where: { id: employer.id },
      data: {
        onboardingStatus: 'COMPLETED',
        onboardingCompletedAt: new Date(),
      },
    });

    return {
      success: true,
      onboardingStatus: updated.onboardingStatus,
      completionPercentage: 100,
    };
  }

  /**
   * Retrieve aggregate dashboard data for authenticated employer.
   */
  async getDashboard(userId: string): Promise<EmployerDashboardResponse> {
    const employer = await this.findEmployerByUserId(userId);
    const completion = this.completionService.calculateCompletion(employer);

    const [
      activeJobsCount,
      totalJobsCount,
      totalApplicationsCount,
      pendingApplicationsCount,
      shortlistedApplicationsCount,
      acceptedApplicationsCount,
    ] = await Promise.all([
      this.prisma.jobPost.count({
        where: {
          employerProfileId: employer.id,
          status: JobStatus.PUBLISHED,
          deletedAt: null,
        },
      }),
      this.prisma.jobPost.count({
        where: {
          employerProfileId: employer.id,
          deletedAt: null,
        },
      }),
      this.prisma.jobApplication.count({
        where: {
          jobPost: { employerProfileId: employer.id },
        },
      }),
      this.prisma.jobApplication.count({
        where: {
          jobPost: { employerProfileId: employer.id },
          status: 'APPLIED',
        },
      }),
      this.prisma.jobApplication.count({
        where: {
          jobPost: { employerProfileId: employer.id },
          status: 'SHORTLISTED',
        },
      }),
      this.prisma.jobApplication.count({
        where: {
          jobPost: { employerProfileId: employer.id },
          status: 'ACCEPTED',
        },
      }),
    ]);

    return {
      profile: EmployerMapper.toProfileResponse(employer),
      completion,
      activeJobsCount,
      totalJobsCount,
      totalApplicationsCount,
      pendingApplicationsCount,
      shortlistedApplicationsCount,
      acceptedApplicationsCount,
    };
  }
}
