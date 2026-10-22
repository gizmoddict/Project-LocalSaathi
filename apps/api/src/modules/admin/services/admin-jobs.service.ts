// ==============================================================================
// LocalSaathi — Admin Jobs Service (Phase 15)
// Operational Job Ingress, Administrative Pause/Resume, & Lifecycle Audits
// ==============================================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import {
  AdminJobItem,
  AdminJobQuery,
  PauseJobDto,
  JobStatus,
} from '@localsaathi/types';
import { Prisma } from '@prisma/client';
import { ADMIN_ERROR_CODES, ADMIN_PAGINATION_LIMITS } from '../admin.constants';

@Injectable()
export class AdminJobsService {
  private readonly logger = new Logger(AdminJobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search and filter platform job postings with bounded pagination and employer details.
   */
  async listJobs(
    query: AdminJobQuery,
  ): Promise<{ data: AdminJobItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(query.page || ADMIN_PAGINATION_LIMITS.DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(query.limit || ADMIN_PAGINATION_LIMITS.DEFAULT_LIMIT, 1),
      ADMIN_PAGINATION_LIMITS.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.JobPostWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.city) {
      where.jobLocation = { city: { contains: query.city, mode: 'insensitive' } };
    }

    const [jobs, total] = await Promise.all([
      this.prisma.jobPost.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employerProfile: {
            select: {
              userId: true,
              businessName: true,
            },
          },
          jobLocation: {
            select: {
              locality: true,
              city: true,
            },
          },
          jobApplications: {
            select: { id: true },
          },
        },
      }),
      this.prisma.jobPost.count({ where }),
    ]);

    const data: AdminJobItem[] = jobs.map((j) => ({
      id: j.id,
      title: j.title,
      category: j.category,
      employerId: j.employerProfile.userId,
      employerBusinessName: j.employerProfile.businessName,
      status: j.status as JobStatus,
      wageAmount: Number(j.wageAmount),
      wageType: j.wageType,
      workerCount: j.workerCount,
      applicationsCount: j.jobApplications.length,
      reportsCount: 0,
      locality: j.jobLocation?.locality || null,
      city: j.jobLocation?.city || null,
      createdAt: j.createdAt.toISOString(),
    }));

    return { data, total, page, limit };
  }

  /**
   * Administratively pauses a job posting and writes an immutable audit record.
   */
  async pauseJob(
    actorId: string,
    jobId: string,
    dto: PauseJobDto,
  ): Promise<{ success: boolean; message: string }> {
    const job = await this.prisma.jobPost.findUnique({ where: { id: jobId } });

    if (!job) {
      throw new NotFoundException({
        code: ADMIN_ERROR_CODES.JOB_NOT_FOUND,
        message: `Job post with ID ${jobId} not found`,
      });
    }

    if (job.status !== JobStatus.PUBLISHED) {
      throw new BadRequestException({
        code: ADMIN_ERROR_CODES.INVALID_OPERATION,
        message: `Only PUBLISHED jobs can be paused. Current status is ${job.status}`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.jobPost.update({
        where: { id: jobId },
        data: { status: JobStatus.PAUSED },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ADMIN_PAUSE_JOB',
          entityType: 'JobPost',
          entityId: jobId,
          metadata: {
            reason: dto.reason,
            priorStatus: job.status,
            newStatus: JobStatus.PAUSED,
          },
        },
      });
    });

    this.logger.warn(`Admin ${actorId} paused job ${jobId}: ${dto.reason}`);
    return { success: true, message: `Job ${jobId} successfully paused` };
  }

  /**
   * Administratively resumes a paused job posting.
   */
  async resumeJob(
    actorId: string,
    jobId: string,
  ): Promise<{ success: boolean; message: string }> {
    const job = await this.prisma.jobPost.findUnique({ where: { id: jobId } });

    if (!job) {
      throw new NotFoundException({
        code: ADMIN_ERROR_CODES.JOB_NOT_FOUND,
        message: `Job post with ID ${jobId} not found`,
      });
    }

    if (job.status !== JobStatus.PAUSED) {
      throw new BadRequestException({
        code: ADMIN_ERROR_CODES.INVALID_OPERATION,
        message: `Only PAUSED jobs can be resumed. Current status is ${job.status}`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.jobPost.update({
        where: { id: jobId },
        data: { status: JobStatus.PUBLISHED },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ADMIN_RESUME_JOB',
          entityType: 'JobPost',
          entityId: jobId,
          metadata: {
            priorStatus: job.status,
            newStatus: JobStatus.PUBLISHED,
          },
        },
      });
    });

    this.logger.log(`Admin ${actorId} resumed job ${jobId}`);
    return { success: true, message: `Job ${jobId} successfully resumed` };
  }
}
