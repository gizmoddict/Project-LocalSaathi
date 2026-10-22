import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.module';
import {
  UpdateWorkerProfileDto,
  AddWorkerSkillDto,
  UpdateWorkerSkillDto,
  UpdateWorkerLocationDto,
  CreateWorkerAvailabilityDto,
  UpdateWorkerAvailabilityDto,
} from './dto';
import {
  updateWorkerProfileSchema,
  addWorkerSkillSchema,
  updateWorkerSkillSchema,
  updateWorkerLocationSchema,
  createWorkerAvailabilitySchema,
  updateWorkerAvailabilitySchema,
} from '@localsaathi/validation';
import {
  WorkerProfileResponse,
  WorkerSkillResponse,
  WorkerLocationResponse,
  WorkerAvailabilityResponse,
  WorkerCompletionResponse,
  SkillCatalogItem,
  OnboardingStatus,
  AvailabilityStatus,
} from '@localsaathi/types';
import { WorkerWithFullRelations } from './types/worker-internal.types';
import { WorkerMapper } from './mappers/worker.mapper';
import { WorkerCompletionService } from './services/worker-completion.service';
import { ProfileImageStorageService } from './services/profile-image-storage.service';
import { CacheService } from '../cache/cache.service';
import { CacheKeys } from '../cache/cache-keys';
import { CACHE_CONSTANTS } from '../cache/cache.constants';

@Injectable()
export class WorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completionService: WorkerCompletionService,
    private readonly imageStorageService: ProfileImageStorageService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  /**
   * Normalize skill name into a consistent lowercase slug.
   * e.g. "  Plumbing Specialist  " -> "plumbing_specialist"
   */
  static normalizeSkillName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Internal helper: Query worker profile with full relations or throw 404.
   */
  private async findWorkerByUserId(userId: string): Promise<WorkerWithFullRelations> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            role: true,
            accountStatus: true,
            verificationStatus: true,
            createdAt: true,
          },
        },
        workerSkills: {
          include: {
            skill: true,
          },
        },
        workerLocation: true,
        availabilities: {
          orderBy: {
            date: 'asc',
          },
        },
      },
    });

    if (!worker) {
      // Auto-provision base worker profile if it does not yet exist
      return this.createInitialWorkerProfile(userId);
    }

    return worker as unknown as WorkerWithFullRelations;
  }

  /**
   * Auto-provision initial worker profile on first authenticated access.
   */
  private async createInitialWorkerProfile(userId: string): Promise<WorkerWithFullRelations> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const created = await this.prisma.workerProfile.create({
      data: {
        userId,
        displayName: 'Worker',
        experienceYears: 0,
        preferredRadiusKm: 10,
        languages: ['hi', 'en'],
        onboardingStatus: 'NOT_STARTED',
      },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            role: true,
            accountStatus: true,
            verificationStatus: true,
            createdAt: true,
          },
        },
        workerSkills: {
          include: {
            skill: true,
          },
        },
        workerLocation: true,
        availabilities: {
          orderBy: {
            date: 'asc',
          },
        },
      },
    });

    return created as unknown as WorkerWithFullRelations;
  }

  /**
   * Retrieve current worker profile.
   */
  async getProfile(userId: string): Promise<WorkerProfileResponse> {
    const worker = await this.findWorkerByUserId(userId);
    return WorkerMapper.toProfileResponse(worker);
  }

  /**
   * Update worker profile basic info.
   */
  async updateProfile(userId: string, dto: UpdateWorkerProfileDto): Promise<WorkerProfileResponse> {
    const parsed = updateWorkerProfileSchema.safeParse(dto);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'Invalid profile payload',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const worker = await this.findWorkerByUserId(userId);
    const data = parsed.data;

    // Transition onboardingStatus to IN_PROGRESS if NOT_STARTED
    const newStatus =
      worker.onboardingStatus === 'NOT_STARTED' ? 'IN_PROGRESS' : worker.onboardingStatus;

    await this.prisma.workerProfile.update({
      where: { id: worker.id },
      data: {
        ...(data.displayName !== undefined && { displayName: data.displayName }),
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.experienceYears !== undefined && { experienceYears: data.experienceYears }),
        ...(data.expectedWage !== undefined && {
          expectedWage: data.expectedWage !== null ? data.expectedWage : null,
        }),
        ...(data.wageType !== undefined && { wageType: data.wageType }),
        ...(data.preferredRadiusKm !== undefined && { preferredRadiusKm: data.preferredRadiusKm }),
        ...(data.languages !== undefined && { languages: data.languages }),
        ...(data.isAvailable !== undefined && { isAvailable: data.isAvailable }),
        onboardingStatus: newStatus,
      },
    });

    const refreshed = await this.findWorkerByUserId(userId);
    return WorkerMapper.toProfileResponse(refreshed);
  }

  /**
   * Get all skills associated with worker profile.
   */
  async getSkills(userId: string): Promise<WorkerSkillResponse[]> {
    const worker = await this.findWorkerByUserId(userId);
    return worker.workerSkills.map((ws) => WorkerMapper.toSkillResponse(ws));
  }

  /**
   * Add a skill to the worker's profile.
   * Auto-resolves normalized skill or creates in catalog. Prevents duplicate association.
   */
  async addSkill(userId: string, dto: AddWorkerSkillDto): Promise<WorkerSkillResponse> {
    const parsed = addWorkerSkillSchema.safeParse(dto);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'Invalid skill payload',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const worker = await this.findWorkerByUserId(userId);
    const data = parsed.data;

    let targetSkillId: string;

    if (data.skillId) {
      const existing = await this.prisma.skill.findUnique({
        where: { id: data.skillId },
      });
      if (!existing || !existing.isActive) {
        throw new NotFoundException('Skill does not exist or is inactive in catalog');
      }
      targetSkillId = existing.id;
    } else if (data.name) {
      const normalizedName = WorkerService.normalizeSkillName(data.name);
      if (!normalizedName) {
        throw new BadRequestException('Skill name is invalid');
      }

      // Upsert skill in platform catalog
      const skill = await this.prisma.skill.upsert({
        where: { normalizedName },
        update: {},
        create: {
          name: data.name.trim(),
          normalizedName,
          category: 'General',
          isActive: true,
        },
      });
      targetSkillId = skill.id;
    } else {
      throw new BadRequestException('Either skillId or skill name must be provided');
    }

    // Check duplicate worker skill relation
    const duplicate = await this.prisma.workerSkill.findUnique({
      where: {
        workerProfileId_skillId: {
          workerProfileId: worker.id,
          skillId: targetSkillId,
        },
      },
    });

    if (duplicate) {
      throw new ConflictException('Worker already has this skill in their profile');
    }

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const ws = await tx.workerSkill.create({
        data: {
          workerProfileId: worker.id,
          skillId: targetSkillId,
          proficiency: data.proficiency,
          experienceYears: data.experienceYears,
          isVerified: false,
        },
        include: {
          skill: true,
        },
      });

      if (worker.onboardingStatus === 'NOT_STARTED') {
        await tx.workerProfile.update({
          where: { id: worker.id },
          data: { onboardingStatus: 'IN_PROGRESS' },
        });
      }

      return ws;
    });

    return WorkerMapper.toSkillResponse(created);
  }

  /**
   * Update proficiency or years of experience for a worker skill.
   */
  async updateSkill(
    userId: string,
    skillId: string,
    dto: UpdateWorkerSkillDto
  ): Promise<WorkerSkillResponse> {
    const parsed = updateWorkerSkillSchema.safeParse(dto);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'Invalid skill update payload',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const worker = await this.findWorkerByUserId(userId);
    const existing = await this.prisma.workerSkill.findUnique({
      where: {
        workerProfileId_skillId: {
          workerProfileId: worker.id,
          skillId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Skill not found in worker profile');
    }

    const data = parsed.data;
    const updated = await this.prisma.workerSkill.update({
      where: { id: existing.id },
      data: {
        ...(data.proficiency !== undefined && { proficiency: data.proficiency }),
        ...(data.experienceYears !== undefined && { experienceYears: data.experienceYears }),
      },
      include: {
        skill: true,
      },
    });

    return WorkerMapper.toSkillResponse(updated);
  }

  /**
   * Remove a skill from the worker's profile.
   */
  async removeSkill(userId: string, skillId: string): Promise<{ success: boolean }> {
    const worker = await this.findWorkerByUserId(userId);
    const existing = await this.prisma.workerSkill.findUnique({
      where: {
        workerProfileId_skillId: {
          workerProfileId: worker.id,
          skillId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Skill not found in worker profile');
    }

    await this.prisma.workerSkill.delete({
      where: { id: existing.id },
    });

    return { success: true };
  }

  /**
   * Retrieve worker location with exact coordinates for authorized self-inspection.
   */
  async getLocation(userId: string): Promise<WorkerLocationResponse | null> {
    const worker = await this.findWorkerByUserId(userId);
    return WorkerMapper.toLocationResponse(
      worker.workerLocation,
      worker.preferredRadiusKm,
      true
    );
  }

  /**
   * Upsert worker location coordinates and address metadata.
   * Atomically populates PostGIS geography Point with SRID 4326.
   */
  async updateLocation(
    userId: string,
    dto: UpdateWorkerLocationDto
  ): Promise<WorkerLocationResponse> {
    const parsed = updateWorkerLocationSchema.safeParse(dto);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'Invalid location payload',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const worker = await this.findWorkerByUserId(userId);
    const data = parsed.data;

    // Execute atomic location upsert and PostGIS spatial point population
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Upsert relational metadata in worker_locations
      await tx.workerLocation.upsert({
        where: { workerProfileId: worker.id },
        update: {
          latitude: data.latitude,
          longitude: data.longitude,
          accuracyMeters: data.accuracyMeters ?? null,
          addressLine: data.addressLine ?? null,
          locality: data.locality ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          pinCode: data.pinCode ?? null,
          isActive: true,
        },
        create: {
          workerProfileId: worker.id,
          latitude: data.latitude,
          longitude: data.longitude,
          accuracyMeters: data.accuracyMeters ?? null,
          addressLine: data.addressLine ?? null,
          locality: data.locality ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          pinCode: data.pinCode ?? null,
          isActive: true,
        },
      });

      // 2. Synchronize PostGIS geography point using parameterized raw SQL
      await tx.$executeRawUnsafe(
        `UPDATE worker_locations
         SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         WHERE worker_profile_id = $3::uuid`,
        data.longitude,
        data.latitude,
        worker.id
      );

      // 3. Update preferred radius if provided
      if (data.preferredRadiusKm !== undefined) {
        await tx.workerProfile.update({
          where: { id: worker.id },
          data: { preferredRadiusKm: data.preferredRadiusKm },
        });
      }

      // 4. Update onboarding status
      if (worker.onboardingStatus === 'NOT_STARTED') {
        await tx.workerProfile.update({
          where: { id: worker.id },
          data: { onboardingStatus: 'IN_PROGRESS' },
        });
      }
    });

    const refreshed = await this.findWorkerByUserId(userId);
    const locationResp = WorkerMapper.toLocationResponse(
      refreshed.workerLocation,
      refreshed.preferredRadiusKm,
      true
    );

    if (!locationResp) {
      throw new BadRequestException('Failed to retrieve updated location');
    }

    return locationResp;
  }

  /**
   * Get all availability slots scheduled for this worker.
   */
  async getAvailability(userId: string): Promise<WorkerAvailabilityResponse[]> {
    const worker = await this.findWorkerByUserId(userId);
    return worker.availabilities.map((a) => WorkerMapper.toAvailabilityResponse(a));
  }

  /**
   * Add a new availability slot for a specific date.
   * Throws 409 Conflict if an entry already exists for that date.
   */
  async createAvailability(
    userId: string,
    dto: CreateWorkerAvailabilityDto
  ): Promise<WorkerAvailabilityResponse> {
    const parsed = createWorkerAvailabilitySchema.safeParse(dto);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'Invalid availability payload',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const worker = await this.findWorkerByUserId(userId);
    const data = parsed.data;

    // Normalize date to UTC midnight
    const scheduledDate = new Date(`${data.date}T00:00:00.000Z`);
    if (isNaN(scheduledDate.getTime())) {
      throw new BadRequestException('Invalid date provided');
    }

    // Check unique constraint [workerProfileId, date]
    const existing = await this.prisma.availability.findUnique({
      where: {
        workerProfileId_date: {
          workerProfileId: worker.id,
          date: scheduledDate,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Availability slot for date ${data.date} already exists. Update the existing slot instead.`
      );
    }

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const avail = await tx.availability.create({
        data: {
          workerProfileId: worker.id,
          date: scheduledDate,
          startTime: data.startTime ?? null,
          endTime: data.endTime ?? null,
          status: data.status as AvailabilityStatus,
        },
      });

      if (worker.onboardingStatus === 'NOT_STARTED') {
        await tx.workerProfile.update({
          where: { id: worker.id },
          data: { onboardingStatus: 'IN_PROGRESS' },
        });
      }

      return avail;
    });

    return WorkerMapper.toAvailabilityResponse(created);
  }

  /**
   * Update an existing availability slot.
   */
  async updateAvailability(
    userId: string,
    id: string,
    dto: UpdateWorkerAvailabilityDto
  ): Promise<WorkerAvailabilityResponse> {
    const parsed = updateWorkerAvailabilitySchema.safeParse(dto);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'Invalid availability update payload',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const worker = await this.findWorkerByUserId(userId);
    const existing = await this.prisma.availability.findUnique({
      where: { id },
    });

    if (!existing || existing.workerProfileId !== worker.id) {
      throw new NotFoundException('Availability slot not found');
    }

    const data = parsed.data;
    const updated = await this.prisma.availability.update({
      where: { id },
      data: {
        ...(data.startTime !== undefined && { startTime: data.startTime }),
        ...(data.endTime !== undefined && { endTime: data.endTime }),
        ...(data.status !== undefined && { status: data.status as AvailabilityStatus }),
      },
    });

    return WorkerMapper.toAvailabilityResponse(updated);
  }

  /**
   * Delete an existing availability slot.
   */
  async deleteAvailability(userId: string, id: string): Promise<{ success: boolean }> {
    const worker = await this.findWorkerByUserId(userId);
    const existing = await this.prisma.availability.findUnique({
      where: { id },
    });

    if (!existing || existing.workerProfileId !== worker.id) {
      throw new NotFoundException('Availability slot not found');
    }

    await this.prisma.availability.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Retrieve platform skill catalog.
   */
  async getSkillsCatalog(category?: string, query?: string): Promise<SkillCatalogItem[]> {
    const fetchFn = async () => {
      const skills = await this.prisma.skill.findMany({
        where: {
          isActive: true,
          ...(category && { category }),
          ...(query && {
            name: {
              contains: query,
              mode: 'insensitive',
            },
          }),
        },
        orderBy: {
          name: 'asc',
        },
        take: 100,
      });

      return skills.map((s: { id: string; name: string; normalizedName: string; category: string; isActive: boolean }) => ({
        id: s.id,
        name: s.name,
        normalizedName: s.normalizedName,
        category: s.category,
        isActive: s.isActive,
      }));
    };

    if (!this.cacheService) {
      return fetchFn();
    }

    const cacheKey = CacheKeys.skillsCatalog(category, query);
    return this.cacheService.wrap(
      cacheKey,
      fetchFn,
      {
        ttl: CACHE_CONSTANTS.TTL.SKILLS_CATALOG,
        stampedeProtect: true,
      },
    );
  }

  /**
   * Upload and associate profile photo.
   */
  async uploadProfilePhoto(
    userId: string,
    buffer: Buffer,
    originalFilename: string
  ): Promise<{ profilePhotoKey: string; profilePhotoUrl: string }> {
    const worker = await this.findWorkerByUserId(userId);

    // Save image via storage abstraction
    const uploadResult = await this.imageStorageService.upload(buffer, originalFilename);

    // Update worker profile photo reference
    await this.prisma.workerProfile.update({
      where: { id: worker.id },
      data: {
        profilePhotoKey: uploadResult.key,
      },
    });

    return {
      profilePhotoKey: uploadResult.key,
      profilePhotoUrl: `/api/v1/workers/photo/${uploadResult.key}`,
    };
  }

  /**
   * Calculate profile completion score and missing steps.
   */
  async getCompletion(userId: string): Promise<WorkerCompletionResponse> {
    const worker = await this.findWorkerByUserId(userId);
    return this.completionService.calculate(worker);
  }

  /**
   * Complete worker onboarding.
   * Server-side gate verifies all mandatory requirements before transitioning to COMPLETED.
   * Idempotent: repeated calls succeed without error or state corruption.
   */
  async completeOnboarding(
    userId: string
  ): Promise<{ success: boolean; onboardingStatus: OnboardingStatus; completionPercentage: number }> {
    const worker = await this.findWorkerByUserId(userId);

    // If already completed, return idempotent success
    if (worker.onboardingStatus === 'COMPLETED') {
      return {
        success: true,
        onboardingStatus: OnboardingStatus.COMPLETED,
        completionPercentage: 100,
      };
    }

    const completion = this.completionService.calculate(worker);
    if (!completion.isComplete) {
      throw new UnprocessableEntityException({
        message: 'Cannot complete onboarding: mandatory profile requirements have not been satisfied',
        remainingSteps: completion.remainingSteps,
        completedSteps: completion.completedSteps,
        completionPercentage: completion.completionPercentage,
      });
    }

    await this.prisma.workerProfile.update({
      where: { id: worker.id },
      data: {
        onboardingStatus: 'COMPLETED',
        onboardingCompletedAt: new Date(),
      },
    });

    return {
      success: true,
      onboardingStatus: OnboardingStatus.COMPLETED,
      completionPercentage: 100,
    };
  }
}
