// ==============================================================================
// LocalSaathi — Admin Users Service (Phase 15)
// User Search, Safe Projections, Worker/Employer Details, & Suspension Controls
// ==============================================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import {
  AdminUserItem,
  AdminUserDetail,
  AdminUserQuery,
  AdminWorkerItem,
  AdminWorkerQuery,
  AdminEmployerItem,
  AdminEmployerQuery,
  SuspendUserDto,
  ReinstateUserDto,
  AccountStatus,
  UserRole,
} from '@localsaathi/types';
import { Prisma } from '@prisma/client';
import { ADMIN_ERROR_CODES, ADMIN_PAGINATION_LIMITS } from '../admin.constants';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search and filter platform users with bounded pagination and safe projection.
   */
  async listUsers(
    query: AdminUserQuery,
  ): Promise<{ data: AdminUserItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(query.page || ADMIN_PAGINATION_LIMITS.DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(query.limit || ADMIN_PAGINATION_LIMITS.DEFAULT_LIMIT, 1),
      ADMIN_PAGINATION_LIMITS.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (query.role) where.role = query.role;
    if (query.accountStatus) where.accountStatus = query.accountStatus;
    if (query.verificationStatus) where.verificationStatus = query.verificationStatus;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    if (query.search) {
      where.phone = { contains: query.search };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          role: true,
          accountStatus: true,
          verificationStatus: true,
          createdAt: true,
          sessions: {
            take: 1,
            orderBy: { lastUsedAt: 'desc' },
            select: { lastUsedAt: true },
          },
          workerProfile: {
            select: {
              displayName: true,
              completedJobsCount: true,
              avgRating: true,
            },
          },
          employerProfile: {
            select: {
              businessName: true,
              totalJobsPosted: true,
              totalHires: true,
            },
          },
          userRestrictions: {
            where: { isActive: true },
            select: { id: true },
          },
          reportsFiled: {
            select: { id: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data: AdminUserItem[] = users.map((u) => ({
      id: u.id,
      phone: u.phone,
      role: u.role as UserRole,
      accountStatus: u.accountStatus as AccountStatus,
      verificationStatus: u.verificationStatus as any,
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: u.sessions[0]?.lastUsedAt?.toISOString() || null,
      workerProfile: u.workerProfile
        ? {
            displayName: u.workerProfile.displayName,
            completedJobsCount: u.workerProfile.completedJobsCount,
            avgRating: Number(u.workerProfile.avgRating),
          }
        : null,
      employerProfile: u.employerProfile
        ? {
            businessName: u.employerProfile.businessName,
            totalJobsPosted: u.employerProfile.totalJobsPosted,
            totalHires: u.employerProfile.totalHires,
          }
        : null,
      activeRestrictionsCount: u.userRestrictions.length,
      reportsFiledCount: u.reportsFiled.length,
    }));

    return { data, total, page, limit };
  }

  /**
   * Retrieves operational user details, active restrictions, and recent audit trail.
   */
  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        role: true,
        accountStatus: true,
        verificationStatus: true,
        createdAt: true,
        sessions: {
          take: 1,
          orderBy: { lastUsedAt: 'desc' },
          select: { lastUsedAt: true },
        },
        workerProfile: {
          select: {
            displayName: true,
            completedJobsCount: true,
            avgRating: true,
          },
        },
        employerProfile: {
          select: {
            businessName: true,
            totalJobsPosted: true,
            totalHires: true,
          },
        },
        userRestrictions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            restrictionType: true,
            reason: true,
            isActive: true,
            createdAt: true,
            expiresAt: true,
          },
        },
        reportsFiled: {
          select: { id: true },
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            action: true,
            createdAt: true,
            metadata: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ADMIN_ERROR_CODES.USER_NOT_FOUND,
        message: `User with ID ${userId} not found`,
      });
    }

    return {
      id: user.id,
      phone: user.phone,
      role: user.role as UserRole,
      accountStatus: user.accountStatus as AccountStatus,
      verificationStatus: user.verificationStatus as any,
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: user.sessions[0]?.lastUsedAt?.toISOString() || null,
      workerProfile: user.workerProfile
        ? {
            displayName: user.workerProfile.displayName,
            completedJobsCount: user.workerProfile.completedJobsCount,
            avgRating: Number(user.workerProfile.avgRating),
          }
        : null,
      employerProfile: user.employerProfile
        ? {
            businessName: user.employerProfile.businessName,
            totalJobsPosted: user.employerProfile.totalJobsPosted,
            totalHires: user.employerProfile.totalHires,
          }
        : null,
      activeRestrictionsCount: user.userRestrictions.filter((r) => r.isActive).length,
      reportsFiledCount: user.reportsFiled.length,
      restrictions: user.userRestrictions.map((r) => ({
        id: r.id,
        restrictionType: String(r.restrictionType),
        reason: r.reason,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      })),
      recentAuditLogs: user.auditLogs.map((a) => ({
        id: a.id,
        action: a.action,
        createdAt: a.createdAt.toISOString(),
        metadata: (a.metadata as Record<string, unknown>) || null,
      })),
    };
  }

  /**
   * Suspends a user account, revokes all active sessions, and logs an immutable audit event.
   */
  async suspendUser(
    actorId: string,
    targetUserId: string,
    dto: SuspendUserDto,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });

    if (!user) {
      throw new NotFoundException({
        code: ADMIN_ERROR_CODES.USER_NOT_FOUND,
        message: `User with ID ${targetUserId} not found`,
      });
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException({
        code: ADMIN_ERROR_CODES.CANNOT_SUSPEND_ADMIN,
        message: 'Administrators cannot be suspended through this interface',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Update user account status
      await tx.user.update({
        where: { id: targetUserId },
        data: { accountStatus: AccountStatus.SUSPENDED },
      });

      // 2. Immediately revoke all active sessions
      await tx.session.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 3. Record UserRestriction
      await tx.userRestriction.create({
        data: {
          userId: targetUserId,
          restrictionType: 'TEMPORARY_SUSPENSION',
          reason: dto.reason,
          issuedById: actorId,
          isActive: true,
        },
      });

      // 4. Record Audit Log
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ADMIN_SUSPEND_USER',
          entityType: 'User',
          entityId: targetUserId,
          metadata: {
            reason: dto.reason,
            internalNotes: dto.internalNotes || null,
            targetPhone: user.phone,
          },
        },
      });
    });

    this.logger.warn(`Admin ${actorId} suspended user ${targetUserId}: ${dto.reason}`);
    return { success: true, message: `User ${targetUserId} successfully suspended` };
  }

  /**
   * Reinstates a suspended user account, clears active restrictions, and records audit log.
   */
  async reinstateUser(
    actorId: string,
    targetUserId: string,
    dto: ReinstateUserDto,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });

    if (!user) {
      throw new NotFoundException({
        code: ADMIN_ERROR_CODES.USER_NOT_FOUND,
        message: `User with ID ${targetUserId} not found`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Update user status to ACTIVE
      await tx.user.update({
        where: { id: targetUserId },
        data: { accountStatus: AccountStatus.ACTIVE },
      });

      // 2. Deactivate active restrictions
      await tx.userRestriction.updateMany({
        where: { userId: targetUserId, isActive: true },
        data: {
          isActive: false,
          revokedAt: new Date(),
          revokedById: actorId,
        },
      });

      // 3. Record Audit Log
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ADMIN_REINSTATE_USER',
          entityType: 'User',
          entityId: targetUserId,
          metadata: {
            reason: dto.reason,
            internalNotes: dto.internalNotes || null,
            targetPhone: user.phone,
          },
        },
      });
    });

    this.logger.log(`Admin ${actorId} reinstated user ${targetUserId}: ${dto.reason}`);
    return { success: true, message: `User ${targetUserId} successfully reinstated` };
  }

  /**
   * Lists workers with operational attributes, availability, ratings, and skill tags.
   */
  async listWorkers(
    query: AdminWorkerQuery,
  ): Promise<{ data: AdminWorkerItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(query.page || ADMIN_PAGINATION_LIMITS.DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(query.limit || ADMIN_PAGINATION_LIMITS.DEFAULT_LIMIT, 1),
      ADMIN_PAGINATION_LIMITS.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.WorkerProfileWhereInput = {};

    if (query.isAvailable !== undefined) where.isAvailable = query.isAvailable;
    if (query.verificationStatus) {
      where.user = { verificationStatus: query.verificationStatus };
    }
    if (query.city) {
      where.workerLocation = { city: { contains: query.city, mode: 'insensitive' } };
    }
    if (query.search) {
      where.OR = [
        { displayName: { contains: query.search, mode: 'insensitive' } },
        { user: { phone: { contains: query.search } } },
      ];
    }
    if (query.skill) {
      where.workerSkills = {
        some: { skill: { name: { contains: query.skill, mode: 'insensitive' } } },
      };
    }

    const [workers, total] = await Promise.all([
      this.prisma.workerProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              phone: true,
              verificationStatus: true,
            },
          },
          workerSkills: {
            take: 5,
            include: { skill: { select: { name: true } } },
          },
          workerLocation: {
            select: {
              locality: true,
              city: true,
            },
          },
          bookings: {
            where: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } },
            select: { id: true },
          },
        },
      }),
      this.prisma.workerProfile.count({ where }),
    ]);

    const data: AdminWorkerItem[] = workers.map((w) => ({
      id: w.id,
      userId: w.userId,
      displayName: w.displayName,
      experienceYears: w.experienceYears,
      expectedWage: w.expectedWage ? Number(w.expectedWage) : null,
      wageType: w.wageType,
      isAvailable: w.isAvailable,
      onboardingStatus: w.onboardingStatus,
      verificationStatus: w.user.verificationStatus as any,
      avgRating: Number(w.avgRating),
      ratingCount: w.ratingCount,
      completedJobsCount: w.completedJobsCount,
      activeBookingsCount: w.bookings.length,
      skills: w.workerSkills.map((ws) => ws.skill.name),
      locality: w.workerLocation?.locality || null,
      city: w.workerLocation?.city || null,
      createdAt: w.createdAt.toISOString(),
    }));

    return { data, total, page, limit };
  }

  /**
   * Lists employers with operational attributes, job counts, hires, and city.
   */
  async listEmployers(
    query: AdminEmployerQuery,
  ): Promise<{ data: AdminEmployerItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(query.page || ADMIN_PAGINATION_LIMITS.DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(query.limit || ADMIN_PAGINATION_LIMITS.DEFAULT_LIMIT, 1),
      ADMIN_PAGINATION_LIMITS.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.EmployerProfileWhereInput = {};

    if (query.accountStatus || query.verificationStatus) {
      where.user = {};
      if (query.accountStatus) where.user.accountStatus = query.accountStatus;
      if (query.verificationStatus) where.user.verificationStatus = query.verificationStatus;
    }
    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }
    if (query.search) {
      where.OR = [
        { businessName: { contains: query.search, mode: 'insensitive' } },
        { user: { phone: { contains: query.search } } },
      ];
    }

    const [employers, total] = await Promise.all([
      this.prisma.employerProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              accountStatus: true,
              verificationStatus: true,
              payerPayments: {
                where: { status: 'CAPTURED' },
                select: { amount: true },
              },
            },
          },
          jobPosts: {
            where: { status: 'PUBLISHED' },
            select: { id: true },
          },
          bookings: {
            where: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } },
            select: { id: true },
          },
        },
      }),
      this.prisma.employerProfile.count({ where }),
    ]);

    const data: AdminEmployerItem[] = employers.map((e) => {
      const totalPaymentsVolumeInr = e.user.payerPayments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );

      return {
        id: e.id,
        userId: e.userId,
        businessName: e.businessName,
        businessType: e.businessType || 'INDIVIDUAL',
        accountStatus: e.user.accountStatus as AccountStatus,
        verificationStatus: e.user.verificationStatus as any,
        totalJobsPosted: e.totalJobsPosted,
        totalHires: e.totalHires,
        activeJobsCount: e.jobPosts.length,
        activeBookingsCount: e.bookings.length,
        totalPaymentsVolumeInr,
        city: e.city || null,
        state: e.state || null,
        createdAt: e.createdAt.toISOString(),
      };
    });

    return { data, total, page, limit };
  }
}
