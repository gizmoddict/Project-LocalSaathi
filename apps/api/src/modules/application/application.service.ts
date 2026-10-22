import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.module';
import {
  createApplicationSchema,
  workerApplicationsQuerySchema,
  employerApplicationsQuerySchema,
  CreateApplicationInput,
  WorkerApplicationsQueryOutput,
  EmployerApplicationsQueryOutput,
} from '@localsaathi/validation';
import {
  ApplicationStatus,
  JobStatus,
  WageType,
  JobUrgency,
  WorkerApplicationSummary,
  WorkerApplicationDetail,
  WorkerApplicationListResponse,
  EmployerApplicationItem,
  EmployerApplicationListResponse,
  ApplicantWorkerInfo,
} from '@localsaathi/types';
import {
  WORKER_PERMITTED_TRANSITIONS,
  EMPLOYER_PERMITTED_TRANSITIONS,
} from './application.constants';
import {
  evaluateWorkerJobMatch,
  MatchingWorkerData,
  MatchingJobData,
} from '../matching/matching.engine';
import { DomainEventService } from '../notification/domain-event.service';
import { DomainEventType } from '@localsaathi/types';

/**
 * Standard Haversine distance calculator in kilometers.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

@Injectable()
export class ApplicationService {
  private readonly logger = new Logger(ApplicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventService: DomainEventService,
  ) {}


  /**
   * Submit an application to a published job post on behalf of the authenticated worker.
   */
  async applyToJob(
    workerUserId: string,
    jobId: string,
    rawDto?: CreateApplicationInput | unknown
  ): Promise<{
    id: string;
    jobId: string;
    status: ApplicationStatus;
    appliedAt: string;
  }> {
    const parseResult = createApplicationSchema.safeParse(rawDto ?? {});
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new BadRequestException(`Validation failed: ${issues}`);
    }
    const dto = parseResult.data;

    // 1. Verify worker profile exists
    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    if (!worker) {
      throw new NotFoundException('Worker profile not found');
    }

    const applyRestriction = await this.prisma.userRestriction?.findFirst?.({
      where: {
        userId: workerUserId,
        restrictionType: 'CANNOT_APPLY' as any,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (applyRestriction) {
      throw new ForbiddenException({
        code: 'USER_RESTRICTED',
        message: `Job applications are restricted on your account: ${applyRestriction.reason}`,
      });
    }

    // 2. Verify job post exists and is currently PUBLISHED
    const job = await this.prisma.jobPost.findFirst({
      where: { id: jobId, deletedAt: null },
      include: { employerProfile: true },
    });
    if (!job) {
      throw new NotFoundException('Job post not found or no longer available');
    }

    if (job.status !== JobStatus.PUBLISHED) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'JOB_NOT_PUBLISHED',
        message: `Cannot apply to a job with status ${job.status}. Applications are only accepted for PUBLISHED jobs.`,
      });
    }

    // 3. Pre-check for duplicate application
    const existing = await this.prisma.jobApplication.findUnique({
      where: {
        jobPostId_workerProfileId: {
          jobPostId: jobId,
          workerProfileId: worker.id,
        },
      },
    });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        error: 'ALREADY_APPLIED',
        message: 'You have already submitted an application for this job.',
      });
    }

    // 4. Create JobApplication with P2002 duplicate conflict catch
    try {
      let createdEventId: string | null = null;
      const created = await this.prisma.$transaction(async (tx) => {
        const app = await tx.jobApplication.create({
          data: {
            jobPostId: jobId,
            workerProfileId: worker.id,
            status: ApplicationStatus.APPLIED,
            applicationMessage: dto.message?.trim() || null,
          },
        });

        // Atomic Transactional Outbox Event Ingestion
        createdEventId = await this.domainEventService.createEvent(
          {
            type: DomainEventType.APPLICATION_CREATED,
            actorId: workerUserId,
            entityType: 'JobApplication',
            entityId: app.id,
            payload: {
              jobTitle: job.title,
              jobId: jobId,
              applicationId: app.id,
              workerId: workerUserId,
              employerId: job.employerProfile.userId,
            },
          },
          tx,
        );

        return app;
      });

      this.logger.log(
        `Application submitted: ID=${created.id}, JobId=${jobId}, WorkerId=${worker.id}`
      );

      // Async dispatch trigger after atomic commit
      if (createdEventId) {
        this.domainEventService
          .processEvent(createdEventId)
          .catch((err: unknown) =>
            this.logger.error(`Domain event failed for APPLICATION_CREATED: ${err}`)
          );
      }

      return {
        id: created.id,
        jobId: created.jobPostId,
        status: created.status as ApplicationStatus,
        appliedAt: created.appliedAt.toISOString(),
      };
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          error: 'ALREADY_APPLIED',
          message: 'You have already submitted an application for this job.',
        });
      }
      throw err;
    }
  }


  /**
   * List applications submitted by the authenticated worker.
   */
  async getWorkerApplications(
    workerUserId: string,
    rawQuery?: Partial<WorkerApplicationsQueryOutput> | Record<string, unknown>
  ): Promise<WorkerApplicationListResponse> {
    const parseResult = workerApplicationsQuerySchema.safeParse(rawQuery ?? {});
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new BadRequestException(`Validation failed: ${issues}`);
    }
    const query = parseResult.data;

    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
      include: {
        workerLocation: true,
        workerSkills: { include: { skill: true } },
        availabilities: true,
      },
    });
    if (!worker) {
      throw new NotFoundException('Worker profile not found');
    }

    const where: Prisma.JobApplicationWhereInput = {
      workerProfileId: worker.id,
    };
    if (query.status) {
      where.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;

    const [applications, total] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where,
        include: {
          jobPost: {
            include: {
              employerProfile: true,
              jobLocation: true,
              jobRequiredSkills: { include: { skill: true } },
            },
          },
        },
        orderBy: {
          appliedAt: query.sort === 'applied_at_asc' ? 'asc' : 'desc',
        },
        skip,
        take: query.limit,
      }),
      this.prisma.jobApplication.count({ where }),
    ]);

    const items: WorkerApplicationSummary[] = applications.map((app) => {
      let matchScore: number | null = null;
      if (app.jobPost.jobLocation && worker.workerLocation) {
        const dist = calculateHaversineDistanceKm(
          worker.workerLocation.latitude,
          worker.workerLocation.longitude,
          app.jobPost.jobLocation.latitude,
          app.jobPost.jobLocation.longitude
        );
        const workerData: MatchingWorkerData = {
          experienceYears: worker.experienceYears,
          expectedWage: worker.expectedWage ? Number(worker.expectedWage) : null,
          wageType: worker.wageType,
          preferredRadiusKm: worker.preferredRadiusKm,
          isAvailable: worker.isAvailable,
          skills: worker.workerSkills.map((ws) => ({
            skillId: ws.skillId,
            proficiency: ws.proficiency,
            experienceYears: ws.experienceYears,
          })),
          availabilities: worker.availabilities.map((a) => ({
            date: a.date,
            startTime: a.startTime,
            endTime: a.endTime,
            status: a.status,
          })),
        };
        const jobData: MatchingJobData = {
          id: app.jobPost.id,
          startDate: app.jobPost.startDate,
          startTime: app.jobPost.startTime,
          durationDays: app.jobPost.durationDays,
          wageAmount: Number(app.jobPost.wageAmount),
          wageType: app.jobPost.wageType,
          requiredSkills: app.jobPost.jobRequiredSkills.map((jrs) => ({
            skillId: jrs.skillId,
            name: jrs.skill.name,
            category: jrs.skill.category,
            isRequired: jrs.isRequired,
            minExperienceYears: jrs.minExperienceYears,
          })),
        };
        const evalResult = evaluateWorkerJobMatch(
          workerData,
          jobData,
          dist,
          worker.preferredRadiusKm
        );
        matchScore = evalResult.match.score;
      }

      return {
        id: app.id,
        jobId: app.jobPostId,
        jobTitle: app.jobPost.title,
        jobCategory: app.jobPost.category,
        employerBusinessName: app.jobPost.employerProfile.businessName,
        employerLocality: app.jobPost.employerProfile.locality,
        employerCity: app.jobPost.employerProfile.city,
        wageType: app.jobPost.wageType as WageType,
        wageAmount: Number(app.jobPost.wageAmount),
        jobStatus: app.jobPost.status as JobStatus,
        status: app.status as ApplicationStatus,
        appliedAt: app.appliedAt.toISOString(),
        shortlistedAt: app.shortlistedAt ? app.shortlistedAt.toISOString() : null,
        rejectedAt: app.rejectedAt ? app.rejectedAt.toISOString() : null,
        acceptedAt: app.acceptedAt ? app.acceptedAt.toISOString() : null,
        withdrawnAt: app.withdrawnAt ? app.withdrawnAt.toISOString() : null,
        matchScore,
      };
    });

    const totalPages = Math.ceil(total / query.limit) || 1;

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
      },
    };
  }

  /**
   * Retrieve single application detail for the applicant worker.
   */
  async getWorkerApplicationDetail(
    workerUserId: string,
    applicationId: string
  ): Promise<WorkerApplicationDetail> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
      include: {
        workerLocation: true,
        workerSkills: { include: { skill: true } },
        availabilities: true,
      },
    });
    if (!worker) {
      throw new NotFoundException('Worker profile not found');
    }

    const app = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        jobPost: {
          include: {
            employerProfile: true,
            jobLocation: true,
            jobRequiredSkills: { include: { skill: true } },
          },
        },
      },
    });

    // IDOR protection: worker cannot inspect applications of other workers
    if (!app || app.workerProfileId !== worker.id) {
      throw new NotFoundException('Application not found');
    }

    let matchBreakdown = null;
    let matchReasons: string[] = [];
    let matchScore: number | null = null;

    if (app.jobPost.jobLocation && worker.workerLocation) {
      const dist = calculateHaversineDistanceKm(
        worker.workerLocation.latitude,
        worker.workerLocation.longitude,
        app.jobPost.jobLocation.latitude,
        app.jobPost.jobLocation.longitude
      );
      const workerData: MatchingWorkerData = {
        experienceYears: worker.experienceYears,
        expectedWage: worker.expectedWage ? Number(worker.expectedWage) : null,
        wageType: worker.wageType,
        preferredRadiusKm: worker.preferredRadiusKm,
        isAvailable: worker.isAvailable,
        skills: worker.workerSkills.map((ws) => ({
          skillId: ws.skillId,
          proficiency: ws.proficiency,
          experienceYears: ws.experienceYears,
        })),
        availabilities: worker.availabilities.map((a) => ({
          date: a.date,
          startTime: a.startTime,
          endTime: a.endTime,
          status: a.status,
        })),
      };
      const jobData: MatchingJobData = {
        id: app.jobPost.id,
        startDate: app.jobPost.startDate,
        startTime: app.jobPost.startTime,
        durationDays: app.jobPost.durationDays,
        wageAmount: Number(app.jobPost.wageAmount),
        wageType: app.jobPost.wageType,
        requiredSkills: app.jobPost.jobRequiredSkills.map((jrs) => ({
          skillId: jrs.skillId,
          name: jrs.skill.name,
          category: jrs.skill.category,
          isRequired: jrs.isRequired,
          minExperienceYears: jrs.minExperienceYears,
        })),
      };
      const evalResult = evaluateWorkerJobMatch(
        workerData,
        jobData,
        dist,
        worker.preferredRadiusKm
      );
      matchScore = evalResult.match.score;
      matchBreakdown = evalResult.match.breakdown;
      matchReasons = evalResult.match.reasons;
    }

    return {
      id: app.id,
      jobId: app.jobPostId,
      jobTitle: app.jobPost.title,
      jobCategory: app.jobPost.category,
      employerBusinessName: app.jobPost.employerProfile.businessName,
      employerLocality: app.jobPost.employerProfile.locality,
      employerCity: app.jobPost.employerProfile.city,
      wageType: app.jobPost.wageType as WageType,
      wageAmount: Number(app.jobPost.wageAmount),
      jobStatus: app.jobPost.status as JobStatus,
      status: app.status as ApplicationStatus,
      applicationMessage: app.applicationMessage,
      jobStartDate: app.jobPost.startDate.toISOString().slice(0, 10),
      jobStartTime: app.jobPost.startTime,
      jobDurationDays: app.jobPost.durationDays,
      jobUrgency: app.jobPost.urgency as JobUrgency,
      jobLocation: app.jobPost.jobLocation
        ? {
            id: app.jobPost.jobLocation.id,
            jobPostId: app.jobPost.jobLocation.jobPostId,
            latitude: app.jobPost.jobLocation.latitude,
            longitude: app.jobPost.jobLocation.longitude,
            addressLine: app.jobPost.jobLocation.addressLine,
            locality: app.jobPost.jobLocation.locality,
            city: app.jobPost.jobLocation.city,
            state: app.jobPost.jobLocation.state,
            pinCode: app.jobPost.jobLocation.pinCode,
          }
        : null,
      appliedAt: app.appliedAt.toISOString(),
      shortlistedAt: app.shortlistedAt ? app.shortlistedAt.toISOString() : null,
      rejectedAt: app.rejectedAt ? app.rejectedAt.toISOString() : null,
      acceptedAt: app.acceptedAt ? app.acceptedAt.toISOString() : null,
      withdrawnAt: app.withdrawnAt ? app.withdrawnAt.toISOString() : null,
      matchScore,
      matchBreakdown,
      matchReasons,
    };
  }

  /**
   * Retrieve worker's application for a specific job post.
   */
  async getWorkerApplicationForJob(
    workerUserId: string,
    jobId: string
  ): Promise<WorkerApplicationDetail> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    if (!worker) {
      throw new NotFoundException('Worker profile not found');
    }

    const app = await this.prisma.jobApplication.findUnique({
      where: {
        jobPostId_workerProfileId: {
          jobPostId: jobId,
          workerProfileId: worker.id,
        },
      },
    });

    if (!app) {
      throw new NotFoundException('No application found for this job post');
    }

    return this.getWorkerApplicationDetail(workerUserId, app.id);
  }

  /**
   * Withdraw an application by the applicant worker.
   * Permitted only from APPLIED or SHORTLISTED states.
   */
  async withdrawApplication(
    workerUserId: string,
    applicationId: string
  ): Promise<WorkerApplicationDetail> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    if (!worker) {
      throw new NotFoundException('Worker profile not found');
    }

    const app = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: { jobPost: { include: { employerProfile: true } } },
    });

    if (!app || app.workerProfileId !== worker.id) {
      throw new NotFoundException('Application not found');
    }

    const currentStatus = app.status as ApplicationStatus;
    const allowed = WORKER_PERMITTED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(ApplicationStatus.WITHDRAWN)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'INVALID_TRANSITION',
        message: `Cannot withdraw application with status ${currentStatus}. Applications in terminal states or unpermitted states cannot be withdrawn.`,
      });
    }

    let createdEventId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.jobApplication.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.WITHDRAWN,
          withdrawnAt: new Date(),
        },
      });

      createdEventId = await this.domainEventService.createEvent(
        {
          type: DomainEventType.APPLICATION_WITHDRAWN,
          actorId: workerUserId,
          entityType: 'JobApplication',
          entityId: applicationId,
          payload: {
            jobTitle: app.jobPost.title,
            jobId: app.jobPostId,
            applicationId,
            workerId: workerUserId,
            employerId: app.jobPost.employerProfile.userId,
          },
        },
        tx,
      );
    });

    this.logger.log(`Worker ${worker.id} withdrew Application ${applicationId}`);

    if (createdEventId) {
      this.domainEventService
        .processEvent(createdEventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event failed for APPLICATION_WITHDRAWN: ${err}`)
        );
    }

    return this.getWorkerApplicationDetail(workerUserId, applicationId);
  }


  /**
   * List applications for an employer's job post with applicant profiles and matching scores.
   * Enforces strict employer ownership: Employer A cannot inspect Employer B's job applications.
   */
  async getEmployerJobApplications(
    employerUserId: string,
    jobId: string,
    rawQuery?: Partial<EmployerApplicationsQueryOutput> | Record<string, unknown>
  ): Promise<EmployerApplicationListResponse> {
    const parseResult = employerApplicationsQuerySchema.safeParse(rawQuery ?? {});
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new BadRequestException(`Validation failed: ${issues}`);
    }
    const query = parseResult.data;

    // 1. Verify employer ownership
    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId: employerUserId },
    });
    if (!employer) {
      throw new NotFoundException('Employer profile not found');
    }

    const job = await this.prisma.jobPost.findFirst({
      where: {
        id: jobId,
        employerProfileId: employer.id,
        deletedAt: null,
      },
      include: {
        jobLocation: true,
        jobRequiredSkills: { include: { skill: true } },
      },
    });

    // IDOR protection: return 404 if job does not exist or belongs to another employer
    if (!job) {
      throw new NotFoundException('Job post not found');
    }

    // 2. Compute application metrics for this job
    const [total, pending, shortlisted, accepted, rejected, withdrawn] = await Promise.all([
      this.prisma.jobApplication.count({ where: { jobPostId: jobId } }),
      this.prisma.jobApplication.count({
        where: { jobPostId: jobId, status: ApplicationStatus.APPLIED },
      }),
      this.prisma.jobApplication.count({
        where: { jobPostId: jobId, status: ApplicationStatus.SHORTLISTED },
      }),
      this.prisma.jobApplication.count({
        where: { jobPostId: jobId, status: ApplicationStatus.ACCEPTED },
      }),
      this.prisma.jobApplication.count({
        where: { jobPostId: jobId, status: ApplicationStatus.REJECTED },
      }),
      this.prisma.jobApplication.count({
        where: { jobPostId: jobId, status: ApplicationStatus.WITHDRAWN },
      }),
    ]);

    // 3. Query applicant records with relations
    const where: Prisma.JobApplicationWhereInput = {
      jobPostId: jobId,
    };
    if (query.status) {
      where.status = query.status;
    }

    const applications = await this.prisma.jobApplication.findMany({
      where,
      include: {
        workerProfile: {
          include: {
            workerLocation: true,
            workerSkills: { include: { skill: true } },
            availabilities: true,
          },
        },
      },
    });

    // 4. Transform and evaluate deterministic match for each applicant
    const jobData: MatchingJobData = {
      id: job.id,
      startDate: job.startDate,
      startTime: job.startTime,
      durationDays: job.durationDays,
      wageAmount: Number(job.wageAmount),
      wageType: job.wageType,
      requiredSkills: job.jobRequiredSkills.map((jrs) => ({
        skillId: jrs.skillId,
        name: jrs.skill.name,
        category: jrs.skill.category,
        isRequired: jrs.isRequired,
        minExperienceYears: jrs.minExperienceYears,
      })),
    };

    const items: EmployerApplicationItem[] = applications.map((app) => {
      const wp = app.workerProfile;
      let distanceKm = 0;
      if (job.jobLocation && wp.workerLocation) {
        distanceKm = calculateHaversineDistanceKm(
          job.jobLocation.latitude,
          job.jobLocation.longitude,
          wp.workerLocation.latitude,
          wp.workerLocation.longitude
        );
      }

      const workerData: MatchingWorkerData = {
        experienceYears: wp.experienceYears,
        expectedWage: wp.expectedWage ? Number(wp.expectedWage) : null,
        wageType: wp.wageType,
        preferredRadiusKm: wp.preferredRadiusKm,
        isAvailable: wp.isAvailable,
        skills: wp.workerSkills.map((ws) => ({
          skillId: ws.skillId,
          proficiency: ws.proficiency,
          experienceYears: ws.experienceYears,
        })),
        availabilities: wp.availabilities.map((a) => ({
          date: a.date,
          startTime: a.startTime,
          endTime: a.endTime,
          status: a.status,
        })),
      };

      const evalResult = evaluateWorkerJobMatch(
        workerData,
        jobData,
        distanceKm,
        wp.preferredRadiusKm
      );

      const applicantWorker: ApplicantWorkerInfo = {
        workerId: wp.id,
        displayName: wp.displayName,
        bio: wp.bio,
        experienceYears: wp.experienceYears,
        skills: wp.workerSkills.map((ws) => ({
          skillId: ws.skillId,
          name: ws.skill.name,
          proficiency: ws.proficiency,
          experienceYears: ws.experienceYears,
        })),
        languages: wp.languages,
        expectedWage: wp.expectedWage ? Number(wp.expectedWage) : null,
        wageType: wp.wageType as WageType,
        locality: wp.workerLocation ? wp.workerLocation.locality : null,
        city: wp.workerLocation ? wp.workerLocation.city : null,
        reliabilityScore: Number(wp.reliabilityScore),
        completedJobsCount: wp.completedJobsCount,
      };

      return {
        id: app.id,
        jobId: app.jobPostId,
        worker: applicantWorker,
        applicationMessage: app.applicationMessage,
        status: app.status as ApplicationStatus,
        appliedAt: app.appliedAt.toISOString(),
        shortlistedAt: app.shortlistedAt ? app.shortlistedAt.toISOString() : null,
        rejectedAt: app.rejectedAt ? app.rejectedAt.toISOString() : null,
        acceptedAt: app.acceptedAt ? app.acceptedAt.toISOString() : null,
        withdrawnAt: app.withdrawnAt ? app.withdrawnAt.toISOString() : null,
        distanceKm,
        match: evalResult.match,
      };
    });

    // 5. Deterministic sorting
    items.sort((a, b) => {
      switch (query.sort) {
        case 'applied_at_desc':
          return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
        case 'applied_at_asc':
          return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
        case 'distance_asc':
          return a.distanceKm - b.distanceKm || b.match.score - a.match.score;
        case 'match_score_desc':
        default:
          return b.match.score - a.match.score || a.distanceKm - b.distanceKm;
      }
    });

    // 6. Pagination
    const totalCount = items.length;
    const page = query.page;
    const limit = query.limit;
    const startIndex = (page - 1) * limit;
    const paginatedItems = items.slice(startIndex, startIndex + limit);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    return {
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNextPage: page < totalPages,
      },
      metrics: {
        total,
        pending,
        shortlisted,
        accepted,
        rejected,
        withdrawn,
      },
    };
  }

  /**
   * Retrieve single application detail for employer evaluation.
   */
  async getEmployerApplicationDetail(
    employerUserId: string,
    applicationId: string
  ): Promise<EmployerApplicationItem> {
    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId: employerUserId },
    });
    if (!employer) {
      throw new NotFoundException('Employer profile not found');
    }

    const app = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        jobPost: {
          include: {
            jobLocation: true,
            jobRequiredSkills: { include: { skill: true } },
          },
        },
        workerProfile: {
          include: {
            workerLocation: true,
            workerSkills: { include: { skill: true } },
            availabilities: true,
          },
        },
      },
    });

    // IDOR protection: employer cannot inspect applications for jobs they don't own
    if (!app || app.jobPost.employerProfileId !== employer.id) {
      throw new NotFoundException('Application not found');
    }

    const job = app.jobPost;
    const wp = app.workerProfile;

    let distanceKm = 0;
    if (job.jobLocation && wp.workerLocation) {
      distanceKm = calculateHaversineDistanceKm(
        job.jobLocation.latitude,
        job.jobLocation.longitude,
        wp.workerLocation.latitude,
        wp.workerLocation.longitude
      );
    }

    const jobData: MatchingJobData = {
      id: job.id,
      startDate: job.startDate,
      startTime: job.startTime,
      durationDays: job.durationDays,
      wageAmount: Number(job.wageAmount),
      wageType: job.wageType,
      requiredSkills: job.jobRequiredSkills.map((jrs) => ({
        skillId: jrs.skillId,
        name: jrs.skill.name,
        category: jrs.skill.category,
        isRequired: jrs.isRequired,
        minExperienceYears: jrs.minExperienceYears,
      })),
    };

    const workerData: MatchingWorkerData = {
      experienceYears: wp.experienceYears,
      expectedWage: wp.expectedWage ? Number(wp.expectedWage) : null,
      wageType: wp.wageType,
      preferredRadiusKm: wp.preferredRadiusKm,
      isAvailable: wp.isAvailable,
      skills: wp.workerSkills.map((ws) => ({
        skillId: ws.skillId,
        proficiency: ws.proficiency,
        experienceYears: ws.experienceYears,
      })),
      availabilities: wp.availabilities.map((a) => ({
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
      })),
    };

    const evalResult = evaluateWorkerJobMatch(
      workerData,
      jobData,
      distanceKm,
      wp.preferredRadiusKm
    );

    const applicantWorker: ApplicantWorkerInfo = {
      workerId: wp.id,
      displayName: wp.displayName,
      bio: wp.bio,
      experienceYears: wp.experienceYears,
      skills: wp.workerSkills.map((ws) => ({
        skillId: ws.skillId,
        name: ws.skill.name,
        proficiency: ws.proficiency,
        experienceYears: ws.experienceYears,
      })),
      languages: wp.languages,
      expectedWage: wp.expectedWage ? Number(wp.expectedWage) : null,
      wageType: wp.wageType as WageType,
      locality: wp.workerLocation ? wp.workerLocation.locality : null,
      city: wp.workerLocation ? wp.workerLocation.city : null,
      reliabilityScore: Number(wp.reliabilityScore),
      completedJobsCount: wp.completedJobsCount,
    };

    return {
      id: app.id,
      jobId: app.jobPostId,
      worker: applicantWorker,
      applicationMessage: app.applicationMessage,
      status: app.status as ApplicationStatus,
      appliedAt: app.appliedAt.toISOString(),
      shortlistedAt: app.shortlistedAt ? app.shortlistedAt.toISOString() : null,
      rejectedAt: app.rejectedAt ? app.rejectedAt.toISOString() : null,
      acceptedAt: app.acceptedAt ? app.acceptedAt.toISOString() : null,
      withdrawnAt: app.withdrawnAt ? app.withdrawnAt.toISOString() : null,
      distanceKm,
      match: evalResult.match,
    };
  }

  /**
   * Transition application: APPLIED -> SHORTLISTED
   */
  async shortlistApplication(
    employerUserId: string,
    applicationId: string
  ): Promise<EmployerApplicationItem> {
    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId: employerUserId },
    });
    if (!employer) {
      throw new NotFoundException('Employer profile not found');
    }

    const app = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: { jobPost: true, workerProfile: true },
    });

    if (!app || app.jobPost.employerProfileId !== employer.id) {
      throw new NotFoundException('Application not found');
    }

    const currentStatus = app.status as ApplicationStatus;
    const allowed = EMPLOYER_PERMITTED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(ApplicationStatus.SHORTLISTED)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'INVALID_TRANSITION',
        message: `Cannot shortlist application with status ${currentStatus}. Only APPLIED applications can be shortlisted.`,
      });
    }

    let createdEventId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.jobApplication.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.SHORTLISTED,
          shortlistedAt: new Date(),
        },
      });

      createdEventId = await this.domainEventService.createEvent(
        {
          type: DomainEventType.APPLICATION_SHORTLISTED,
          actorId: employerUserId,
          entityType: 'JobApplication',
          entityId: applicationId,
          payload: {
            jobTitle: app.jobPost.title,
            jobId: app.jobPostId,
            applicationId,
            workerId: app.workerProfile.userId,
            employerId: employerUserId,
          },
        },
        tx,
      );
    });

    this.logger.log(`Application ${applicationId} transitioned to SHORTLISTED`);

    if (createdEventId) {
      this.domainEventService
        .processEvent(createdEventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event failed for APPLICATION_SHORTLISTED: ${err}`)
        );
    }

    return this.getEmployerApplicationDetail(employerUserId, applicationId);
  }


  /**
   * Transition application: APPLIED / SHORTLISTED -> REJECTED
   */
  async rejectApplication(
    employerUserId: string,
    applicationId: string
  ): Promise<EmployerApplicationItem> {
    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId: employerUserId },
    });
    if (!employer) {
      throw new NotFoundException('Employer profile not found');
    }

    const app = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: { jobPost: true, workerProfile: true },
    });

    if (!app || app.jobPost.employerProfileId !== employer.id) {
      throw new NotFoundException('Application not found');
    }

    const currentStatus = app.status as ApplicationStatus;
    const allowed = EMPLOYER_PERMITTED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(ApplicationStatus.REJECTED)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'INVALID_TRANSITION',
        message: `Cannot reject application with status ${currentStatus}. Only APPLIED or SHORTLISTED applications can be rejected.`,
      });
    }

    let createdEventId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.jobApplication.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.REJECTED,
          rejectedAt: new Date(),
        },
      });

      createdEventId = await this.domainEventService.createEvent(
        {
          type: DomainEventType.APPLICATION_REJECTED,
          actorId: employerUserId,
          entityType: 'JobApplication',
          entityId: applicationId,
          payload: {
            jobTitle: app.jobPost.title,
            jobId: app.jobPostId,
            applicationId,
            workerId: app.workerProfile.userId,
            employerId: employerUserId,
          },
        },
        tx,
      );
    });

    this.logger.log(`Application ${applicationId} transitioned to REJECTED`);

    if (createdEventId) {
      this.domainEventService
        .processEvent(createdEventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event failed for APPLICATION_REJECTED: ${err}`)
        );
    }

    return this.getEmployerApplicationDetail(employerUserId, applicationId);
  }

  /**
   * Transition application: SHORTLISTED -> ACCEPTED
   */
  async acceptApplication(
    employerUserId: string,
    applicationId: string
  ): Promise<EmployerApplicationItem> {
    const employer = await this.prisma.employerProfile.findUnique({
      where: { userId: employerUserId },
    });
    if (!employer) {
      throw new NotFoundException('Employer profile not found');
    }

    const app = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: { jobPost: true, workerProfile: true },
    });

    if (!app || app.jobPost.employerProfileId !== employer.id) {
      throw new NotFoundException('Application not found');
    }

    const currentStatus = app.status as ApplicationStatus;
    const allowed = EMPLOYER_PERMITTED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(ApplicationStatus.ACCEPTED)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'INVALID_TRANSITION',
        message: `Cannot accept application with status ${currentStatus}. Applications must be SHORTLISTED before acceptance.`,
      });
    }

    let createdEventId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.jobApplication.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      createdEventId = await this.domainEventService.createEvent(
        {
          type: DomainEventType.APPLICATION_ACCEPTED,
          actorId: employerUserId,
          entityType: 'JobApplication',
          entityId: applicationId,
          payload: {
            jobTitle: app.jobPost.title,
            jobId: app.jobPostId,
            applicationId,
            workerId: app.workerProfile.userId,
            employerId: employerUserId,
          },
        },
        tx,
      );
    });

    this.logger.log(`Application ${applicationId} transitioned to ACCEPTED`);

    if (createdEventId) {
      this.domainEventService
        .processEvent(createdEventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event failed for APPLICATION_ACCEPTED: ${err}`)
        );
    }

    return this.getEmployerApplicationDetail(employerUserId, applicationId);
  }
}

