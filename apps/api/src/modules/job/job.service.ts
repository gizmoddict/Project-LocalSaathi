import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../database/database.module';
import { CreateJobDto, UpdateJobDto, JobFilterDto, JobSkillDto } from './dto';
import {
  createJobSchema,
  updateJobSchema,
  jobFilterQuerySchema,
} from '@localsaathi/validation';
import {
  JobResponse,
  JobListResponse,
  JobStatus,
} from '@localsaathi/types';
import { JobMapper, JobEntityWithRelations } from './mappers/job.mapper';
import { EmployerService } from '../employer/employer.service';
import { CacheService } from '../cache/cache.service';
import { CacheKeys } from '../cache/cache-keys';

@Injectable()
export class JobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employerService: EmployerService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  private async invalidateJobCaches(jobId: string): Promise<void> {
    if (!this.cacheService) return;
    try {
      await this.cacheService.del(CacheKeys.jobDetail(jobId));
      await this.cacheService.delPattern(CacheKeys.allGeoWildcard());
      await this.cacheService.del(CacheKeys.adminOverviewMetrics());
    } catch {
      // Invalidation errors do not break primary transaction
    }
  }

  /**
   * Helper: Normalize custom skill name into lowercase slug.
   */
  private normalizeSkillName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Resolve or provision a Skill entity by ID or custom name.
   */
  private async resolveSkill(skillInput: JobSkillDto, defaultCategory: string): Promise<string> {
    if (skillInput.skillId) {
      const existing = await this.prisma.skill.findUnique({
        where: { id: skillInput.skillId },
      });
      if (!existing) {
        throw new NotFoundException(`Skill with ID ${skillInput.skillId} not found in catalog`);
      }
      return existing.id;
    }

    if (skillInput.name) {
      const normalizedName = this.normalizeSkillName(skillInput.name);
      const skill = await this.prisma.skill.upsert({
        where: { normalizedName },
        update: {},
        create: {
          name: skillInput.name.trim(),
          normalizedName,
          category: defaultCategory || 'General',
          isActive: true,
        },
      });
      return skill.id;
    }

    throw new BadRequestException('Either skillId or skill name must be provided');
  }

  /**
   * Query full Job entity with relations and enforce strict IDOR isolation.
   */
  async findEmployerJobOrThrow(userId: string, jobId: string): Promise<JobEntityWithRelations> {
    const employer = await this.employerService.findEmployerByUserId(userId);

    const job = await this.prisma.jobPost.findFirst({
      where: {
        id: jobId,
        employerProfileId: employer.id,
        deletedAt: null,
      },
      include: {
        jobRequiredSkills: {
          include: {
            skill: {
              select: {
                name: true,
                category: true,
              },
            },
          },
        },
        jobLocation: true,
      },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    return job as unknown as JobEntityWithRelations;
  }

  /**
   * Create a new job in DRAFT state.
   */
  async createJob(userId: string, dto: CreateJobDto): Promise<JobResponse> {
    const parseResult = createJobSchema.safeParse(dto);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new UnprocessableEntityException(`Validation failed: ${issues}`);
    }

    const employer = await this.employerService.findEmployerByUserId(userId);

    const jobPostRestriction = await this.prisma.userRestriction?.findFirst?.({
      where: {
        userId,
        restrictionType: 'CANNOT_POST_JOBS' as any,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (jobPostRestriction) {
      throw new ForbiddenException({
        code: 'USER_RESTRICTED',
        message: `Job posting is restricted on your account: ${jobPostRestriction.reason}`,
      });
    }

    // Parse start date safely as UTC midnight date
    const parsedStartDate = new Date(`${dto.startDate}T00:00:00.000Z`);

    // Create draft job
    const createdJob = await this.prisma.jobPost.create({
      data: {
        employerProfileId: employer.id,
        title: dto.title.trim(),
        description: dto.description.trim(),
        status: JobStatus.DRAFT,
        category: dto.category.trim(),
        wageType: dto.wageType,
        wageAmount: dto.wageAmount,
        workerCount: dto.workerCount ?? 1,
        durationDays: dto.durationDays ?? 1,
        startDate: parsedStartDate,
        startTime: dto.startTime ?? null,
        urgency: dto.urgency ?? 'STANDARD',
        requirements: dto.requirements ?? [],
        languageRequirements: dto.languageRequirements ?? [],
      },
    });

    // Handle required skills if supplied
    if (dto.skills && dto.skills.length > 0) {
      for (const s of dto.skills) {
        const skillId = await this.resolveSkill(s, dto.category);
        await this.prisma.jobRequiredSkill.upsert({
          where: {
            jobPostId_skillId: {
              jobPostId: createdJob.id,
              skillId,
            },
          },
          update: {
            isRequired: s.isRequired ?? true,
            minExperienceYears: s.minExperienceYears ?? 0,
          },
          create: {
            jobPostId: createdJob.id,
            skillId,
            isRequired: s.isRequired ?? true,
            minExperienceYears: s.minExperienceYears ?? 0,
          },
        });
      }
    }

    // Handle location if supplied
    if (dto.location) {
      await this.prisma.jobLocation.create({
        data: {
          jobPostId: createdJob.id,
          latitude: dto.location.latitude,
          longitude: dto.location.longitude,
          addressLine: dto.location.addressLine ?? null,
          locality: dto.location.locality.trim(),
          city: dto.location.city.trim(),
          state: dto.location.state.trim(),
          pinCode: dto.location.pinCode.trim(),
        },
      });
    }

    // Increment totalJobsPosted on employer profile
    await this.prisma.employerProfile.update({
      where: { id: employer.id },
      data: { totalJobsPosted: { increment: 1 } },
    });

    return this.getJobById(userId, createdJob.id);
  }

  /**
   * Retrieve single job by ID with IDOR protection.
   */
  async getJobById(userId: string, jobId: string): Promise<JobResponse> {
    const job = await this.findEmployerJobOrThrow(userId, jobId);
    return JobMapper.toJobResponse(job);
  }

  /**
   * List authenticated employer's jobs with filtering and pagination.
   */
  async getJobs(userId: string, query: JobFilterDto): Promise<JobListResponse> {
    const parseResult = jobFilterQuerySchema.safeParse(query);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new UnprocessableEntityException(`Validation failed: ${issues}`);
    }

    const employer = await this.employerService.findEmployerByUserId(userId);
    const { status, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const whereClause: Record<string, unknown> = {
      employerProfileId: employer.id,
      deletedAt: null,
    };

    if (status) {
      whereClause.status = status;
    }

    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      this.prisma.jobPost.findMany({
        where: whereClause,
        include: {
          jobRequiredSkills: {
            include: {
              skill: {
                select: {
                  name: true,
                  category: true,
                },
              },
            },
          },
          jobLocation: true,
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip,
        take: limit,
      }),
      this.prisma.jobPost.count({
        where: whereClause,
      }),
    ]);

    return JobMapper.toListResponse(
      jobs as unknown as JobEntityWithRelations[],
      total,
      page,
      limit
    );
  }

  /**
   * Update an existing job. Draft jobs allow full editing; active jobs forbid changing status or past dates.
   */
  async updateJob(userId: string, jobId: string, dto: UpdateJobDto): Promise<JobResponse> {
    const parseResult = updateJobSchema.safeParse(dto);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new UnprocessableEntityException(`Validation failed: ${issues}`);
    }

    const existing = await this.findEmployerJobOrThrow(userId, jobId);

    if (existing.status === JobStatus.COMPLETED || existing.status === JobStatus.CANCELLED) {
      throw new BadRequestException(`Cannot update a job with terminal status ${existing.status}`);
    }

    const updateData: Record<string, unknown> = {};

    if (dto.title !== undefined) updateData.title = dto.title.trim();
    if (dto.description !== undefined) updateData.description = dto.description.trim();
    if (dto.category !== undefined) updateData.category = dto.category.trim();
    if (dto.wageType !== undefined) updateData.wageType = dto.wageType;
    if (dto.wageAmount !== undefined) updateData.wageAmount = dto.wageAmount;
    if (dto.workerCount !== undefined) updateData.workerCount = dto.workerCount;
    if (dto.durationDays !== undefined) updateData.durationDays = dto.durationDays;
    if (dto.startDate !== undefined) {
      updateData.startDate = new Date(`${dto.startDate}T00:00:00.000Z`);
    }
    if (dto.startTime !== undefined) updateData.startTime = dto.startTime;
    if (dto.urgency !== undefined) updateData.urgency = dto.urgency;
    if (dto.requirements !== undefined) updateData.requirements = dto.requirements;
    if (dto.languageRequirements !== undefined) updateData.languageRequirements = dto.languageRequirements;

    await this.prisma.jobPost.update({
      where: { id: jobId },
      data: updateData,
    });

    // Handle skills update if provided
    if (dto.skills !== undefined) {
      // Remove existing required skills
      await this.prisma.jobRequiredSkill.deleteMany({
        where: { jobPostId: jobId },
      });

      const defaultCat = dto.category || existing.category;
      for (const s of dto.skills) {
        const skillId = await this.resolveSkill(s, defaultCat);
        await this.prisma.jobRequiredSkill.create({
          data: {
            jobPostId: jobId,
            skillId,
            isRequired: s.isRequired ?? true,
            minExperienceYears: s.minExperienceYears ?? 0,
          },
        });
      }
    }

    // Handle location update if provided
    if (dto.location !== undefined) {
      await this.prisma.jobLocation.upsert({
        where: { jobPostId: jobId },
        update: {
          latitude: dto.location.latitude,
          longitude: dto.location.longitude,
          addressLine: dto.location.addressLine ?? null,
          locality: dto.location.locality.trim(),
          city: dto.location.city.trim(),
          state: dto.location.state.trim(),
          pinCode: dto.location.pinCode.trim(),
        },
        create: {
          jobPostId: jobId,
          latitude: dto.location.latitude,
          longitude: dto.location.longitude,
          addressLine: dto.location.addressLine ?? null,
          locality: dto.location.locality.trim(),
          city: dto.location.city.trim(),
          state: dto.location.state.trim(),
          pinCode: dto.location.pinCode.trim(),
        },
      });
    }

    await this.invalidateJobCaches(jobId);
    return this.getJobById(userId, jobId);
  }

  /**
   * Delete a job (only allowed if status is DRAFT).
   */
  async deleteJob(userId: string, jobId: string): Promise<{ success: boolean }> {
    const existing = await this.findEmployerJobOrThrow(userId, jobId);

    if (existing.status !== JobStatus.DRAFT) {
      throw new BadRequestException(
        `Only DRAFT jobs can be deleted. Use close to terminate a ${existing.status} job.`
      );
    }

    await this.prisma.jobPost.delete({
      where: { id: jobId },
    });

    await this.invalidateJobCaches(jobId);
    return { success: true };
  }

  /**
   * Validate and transition a job from DRAFT -> PUBLISHED.
   */
  async publishJob(userId: string, jobId: string): Promise<JobResponse> {
    const job = await this.findEmployerJobOrThrow(userId, jobId);

    if (job.status === JobStatus.PUBLISHED) {
      return JobMapper.toJobResponse(job);
    }

    if (job.status !== JobStatus.DRAFT && job.status !== JobStatus.PAUSED) {
      throw new BadRequestException(
        `Cannot publish a job with status ${job.status}. Only DRAFT or PAUSED jobs can be published.`
      );
    }

    // Server-side readiness validation
    const missing: string[] = [];

    if (!job.title || job.title.trim().length < 3) missing.push('title (min 3 characters)');
    if (!job.description || job.description.trim().length < 10) missing.push('description (min 10 characters)');
    if (!job.category) missing.push('category');
    if (!job.wageType) missing.push('wageType');
    if (!job.wageAmount || Number(job.wageAmount) <= 0) missing.push('wageAmount (> 0)');
    if (!job.workerCount || job.workerCount < 1) missing.push('workerCount (min 1)');
    if (!job.startDate) missing.push('startDate');
    if (!job.jobLocation) missing.push('location (address & coordinates required)');
    if (!job.jobRequiredSkills || job.jobRequiredSkills.length === 0) {
      missing.push('skills (at least 1 required skill must be attached)');
    }

    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Job is incomplete and cannot be published.',
        missingFields: missing,
      });
    }

    const now = new Date();
    // Default expiration: 30 days after publish
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.jobPost.update({
      where: { id: jobId },
      data: {
        status: JobStatus.PUBLISHED,
        publishedAt: job.publishedAt ?? now,
        expiresAt: job.expiresAt ?? expiresAt,
      },
    });

    await this.invalidateJobCaches(jobId);
    return this.getJobById(userId, updated.id);
  }

  /**
   * Transition PUBLISHED -> PAUSED.
   */
  async pauseJob(userId: string, jobId: string): Promise<JobResponse> {
    const job = await this.findEmployerJobOrThrow(userId, jobId);

    if (job.status !== JobStatus.PUBLISHED) {
      throw new BadRequestException(
        `Cannot pause a job with status ${job.status}. Only PUBLISHED jobs can be paused.`
      );
    }

    await this.prisma.jobPost.update({
      where: { id: jobId },
      data: { status: JobStatus.PAUSED },
    });

    await this.invalidateJobCaches(jobId);
    return this.getJobById(userId, jobId);
  }

  /**
   * Transition PAUSED -> PUBLISHED.
   */
  async resumeJob(userId: string, jobId: string): Promise<JobResponse> {
    const job = await this.findEmployerJobOrThrow(userId, jobId);

    if (job.status !== JobStatus.PAUSED) {
      throw new BadRequestException(
        `Cannot resume a job with status ${job.status}. Only PAUSED jobs can be resumed.`
      );
    }

    await this.prisma.jobPost.update({
      where: { id: jobId },
      data: { status: JobStatus.PUBLISHED },
    });

    await this.invalidateJobCaches(jobId);
    return this.getJobById(userId, jobId);
  }

  /**
   * Transition PUBLISHED / PAUSED -> FILLED.
   */
  async fillJob(userId: string, jobId: string): Promise<JobResponse> {
    const job = await this.findEmployerJobOrThrow(userId, jobId);

    if (job.status !== JobStatus.PUBLISHED && job.status !== JobStatus.PAUSED) {
      throw new BadRequestException(
        `Cannot mark job as FILLED from status ${job.status}. Job must be PUBLISHED or PAUSED.`
      );
    }

    await this.prisma.jobPost.update({
      where: { id: jobId },
      data: { status: JobStatus.FILLED },
    });

    await this.invalidateJobCaches(jobId);
    return this.getJobById(userId, jobId);
  }

  /**
   * Transition PUBLISHED / PAUSED / FILLED -> CANCELLED / CLOSED.
   */
  async closeJob(userId: string, jobId: string): Promise<JobResponse> {
    const job = await this.findEmployerJobOrThrow(userId, jobId);

    if (job.status === JobStatus.CANCELLED || job.status === JobStatus.COMPLETED) {
      throw new BadRequestException(`Job is already in terminal status ${job.status}`);
    }

    await this.prisma.jobPost.update({
      where: { id: jobId },
      data: { status: JobStatus.CANCELLED },
    });

    await this.invalidateJobCaches(jobId);
    return this.getJobById(userId, jobId);
  }
}
