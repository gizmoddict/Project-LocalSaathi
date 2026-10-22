import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import {
  ModerationCaseStatus,
  ModerationCaseType,
  ModerationPriority,
  ModerationActionType,
  RestrictionType,
  AccountStatus,
  DomainEventType,
} from '@localsaathi/types';
import {
  ResolveCaseInput,
  EscalateCaseInput,
  SuspendUserInput,
  ReinstateUserInput,
  ApplyUserRestrictionInput,
} from '@localsaathi/validation';
import { TRUST_SAFETY_ERROR_CODES } from '../trust-safety.constants';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists moderation cases with optional filters and pagination.
   */
  async getCases(params: {
    status?: ModerationCaseStatus;
    caseType?: ModerationCaseType;
    priority?: ModerationPriority;
    assignedToId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.caseType) where.caseType = params.caseType;
    if (params.priority) where.priority = params.priority;
    if (params.assignedToId) where.assignedToId = params.assignedToId;

    const [items, total] = await Promise.all([
      this.prisma.moderationCase.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          assignedTo: { select: { id: true, phone: true, role: true } },
          reports: { select: { id: true, reason: true } },
          _count: { select: { reports: true, disputes: true, actions: true } },
        },
      }),
      this.prisma.moderationCase.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber,
        caseType: c.caseType,
        priority: c.priority,
        status: c.status,
        targetEntityType: c.targetEntityType,
        targetEntityId: c.targetEntityId,
        title: c.title,
        description: c.description,
        resolution: c.resolution,
        assignedTo: c.assignedTo
          ? { id: c.assignedTo.id, phone: c.assignedTo.phone, role: c.assignedTo.role }
          : null,
        reportCount: c._count.reports,
        disputeCount: c._count.disputes,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        resolvedAt: c.resolvedAt?.toISOString() ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves full moderation case details.
   */
  async getCaseById(id: string) {
    const moderationCase = await this.prisma.moderationCase.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, phone: true, role: true } },
        reports: {
          include: {
            reporter: {
              select: {
                id: true,
                phone: true,
                role: true,
                workerProfile: { select: { displayName: true } },
                employerProfile: { select: { businessName: true } },
              },
            },
          },
        },
        disputes: {
          include: {
            raisedBy: { select: { id: true, phone: true } },
            against: { select: { id: true, phone: true } },
          },
        },
        verification: {
          include: {
            documents: true,
            user: { select: { id: true, phone: true, role: true } },
          },
        },
        actions: {
          orderBy: { createdAt: 'asc' },
          include: {
            moderator: { select: { id: true, phone: true, role: true } },
          },
        },
      },
    });

    if (!moderationCase) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Moderation case not found.',
      });
    }

    return {
      id: moderationCase.id,
      caseNumber: moderationCase.caseNumber,
      caseType: moderationCase.caseType,
      priority: moderationCase.priority,
      status: moderationCase.status,
      assignedTo: moderationCase.assignedTo,
      targetEntityType: moderationCase.targetEntityType,
      targetEntityId: moderationCase.targetEntityId,
      title: moderationCase.title,
      description: moderationCase.description,
      resolution: moderationCase.resolution,
      resolutionNotes: moderationCase.resolutionNotes,
      createdAt: moderationCase.createdAt.toISOString(),
      updatedAt: moderationCase.updatedAt.toISOString(),
      resolvedAt: moderationCase.resolvedAt?.toISOString() ?? null,
      reports: moderationCase.reports.map((r) => ({
        id: r.id,
        reporterId: r.reporterId,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        details: r.details,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        reporter: {
          id: r.reporter.id,
          phone: r.reporter.phone,
          role: r.reporter.role,
          name:
            r.reporter.workerProfile?.displayName ??
            r.reporter.employerProfile?.businessName ??
            r.reporter.phone,
        },
      })),
      disputes: moderationCase.disputes.map((d) => ({
        id: d.id,
        bookingId: d.bookingId,
        raisedById: d.raisedById,
        againstId: d.againstId,
        reason: d.reason,
        description: d.description,
        status: d.status,
        resolution: d.resolution,
        createdAt: d.createdAt.toISOString(),
      })),
      verification: moderationCase.verification
        ? {
            id: moderationCase.verification.id,
            userId: moderationCase.verification.userId,
            verificationType: moderationCase.verification.verificationType,
            status: moderationCase.verification.status,
            documents: moderationCase.verification.documents,
          }
        : null,
      actions: moderationCase.actions.map((a) => ({
        id: a.id,
        moderatorId: a.moderatorId,
        moderatorPhone: a.moderator.phone,
        actionType: a.actionType,
        notes: a.notes,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Assigns / claims a moderation case.
   */
  async claimCase(caseId: string, moderatorId: string) {
    const existing = await this.prisma.moderationCase.findUnique({
      where: { id: caseId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Moderation case not found.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.moderationCase.update({
        where: { id: caseId },
        data: {
          assignedToId: moderatorId,
          status: ModerationCaseStatus.UNDER_REVIEW,
        },
      });

      await tx.moderationCaseAction.create({
        data: {
          caseId,
          moderatorId,
          actionType: ModerationActionType.NONE,
          notes: 'Case claimed by moderator for active review.',
        },
      });

      return c;
    });

    this.logger.log(`Case ${caseId} claimed by moderator ${moderatorId}`);
    return {
      id: updated.id,
      caseNumber: updated.caseNumber,
      status: updated.status,
      assignedToId: updated.assignedToId,
    };
  }

  /**
   * Resolves a moderation case with a specific action.
   */
  async resolveCase(caseId: string, moderatorId: string, input: ResolveCaseInput) {
    const existing = await this.prisma.moderationCase.findUnique({
      where: { id: caseId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Moderation case not found.',
      });
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // 1. Update Case
      const updated = await tx.moderationCase.update({
        where: { id: caseId },
        data: {
          status: ModerationCaseStatus.RESOLVED,
          resolution: input.resolution as ModerationActionType,
          resolutionNotes: input.notes,
          resolvedAt: now,
        },
      });

      // 2. Update linked reports
      await tx.report.updateMany({
        where: { moderationCaseId: caseId },
        data: {
          status: 'RESOLVED',
          resolvedById: moderatorId,
          actionTaken: input.resolution,
          resolutionNotes: input.notes,
          resolvedAt: now,
        },
      });

      // 3. Record action
      await tx.moderationCaseAction.create({
        data: {
          caseId,
          moderatorId,
          actionType: input.resolution as ModerationActionType,
          notes: input.notes,
        },
      });

      // 4. Security Audit Log
      await tx.auditLog.create({
        data: {
          actorId: moderatorId,
          action: 'MODERATION_CASE_RESOLVED',
          entityType: 'ModerationCase',
          entityId: caseId,
          metadata: {
            caseNumber: existing.caseNumber,
            resolution: input.resolution,
            notes: input.notes,
          },
        },
      });

      this.logger.log(`Case ${caseId} resolved by ${moderatorId} with action ${input.resolution}`);

      return {
        id: updated.id,
        caseNumber: updated.caseNumber,
        status: updated.status,
        resolution: updated.resolution,
        resolutionNotes: updated.resolutionNotes,
        resolvedAt: updated.resolvedAt?.toISOString(),
      };
    });
  }

  /**
   * Dismisses a moderation case.
   */
  async dismissCase(caseId: string, moderatorId: string, notes?: string) {
    const existing = await this.prisma.moderationCase.findUnique({
      where: { id: caseId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Moderation case not found.',
      });
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.moderationCase.update({
        where: { id: caseId },
        data: {
          status: ModerationCaseStatus.DISMISSED,
          resolution: ModerationActionType.DISMISS,
          resolutionNotes: notes ?? 'Dismissed after review.',
          resolvedAt: now,
        },
      });

      await tx.report.updateMany({
        where: { moderationCaseId: caseId },
        data: {
          status: 'DISMISSED',
          resolvedById: moderatorId,
          actionTaken: 'DISMISS',
          resolutionNotes: notes,
          resolvedAt: now,
        },
      });

      await tx.moderationCaseAction.create({
        data: {
          caseId,
          moderatorId,
          actionType: ModerationActionType.DISMISS,
          notes: notes ?? 'Case dismissed.',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: moderatorId,
          action: 'MODERATION_CASE_DISMISSED',
          entityType: 'ModerationCase',
          entityId: caseId,
          metadata: { notes },
        },
      });

      return {
        id: updated.id,
        caseNumber: updated.caseNumber,
        status: updated.status,
        resolution: updated.resolution,
        resolvedAt: updated.resolvedAt?.toISOString(),
      };
    });
  }

  /**
   * Escalates a moderation case.
   */
  async escalateCase(caseId: string, moderatorId: string, input: EscalateCaseInput) {
    const existing = await this.prisma.moderationCase.findUnique({
      where: { id: caseId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.CASE_NOT_FOUND,
        message: 'Moderation case not found.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.moderationCase.update({
        where: { id: caseId },
        data: {
          status: ModerationCaseStatus.ESCALATED,
          priority: ModerationPriority.CRITICAL,
        },
      });

      await tx.report.updateMany({
        where: { moderationCaseId: caseId },
        data: { status: 'ESCALATED' },
      });

      await tx.moderationCaseAction.create({
        data: {
          caseId,
          moderatorId,
          actionType: ModerationActionType.NONE,
          notes: `Case escalated: ${input.notes ?? 'Requires senior attention.'}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: moderatorId,
          action: 'MODERATION_CASE_ESCALATED',
          entityType: 'ModerationCase',
          entityId: caseId,
          metadata: { notes: input.notes },
        },
      });

      return c;
    });

    return {
      id: updated.id,
      caseNumber: updated.caseNumber,
      status: updated.status,
      priority: updated.priority,
    };
  }

  /**
   * Suspends a user account, revoking all active sessions and restricting capabilities.
   */
  async suspendUser(userId: string, moderatorId: string, input: SuspendUserInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.TARGET_NOT_FOUND,
        message: 'User to suspend not found.',
      });
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // 1. Update user account status
      await tx.user.update({
        where: { id: userId },
        data: { accountStatus: AccountStatus.SUSPENDED },
      });

      // 2. Revoke all active sessions immediately
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });

      // 3. Add suspension restriction record
      const restriction = await tx.userRestriction.create({
        data: {
          userId,
          restrictionType: RestrictionType.TEMPORARY_SUSPENSION,
          isActive: true,
          reason: input.reason,
          issuedById: moderatorId,
        },
      });

      // 4. Domain & Outbox events
      const payload = {
        userId,
        moderatorId,
        reason: input.reason,
      };

      await tx.domainEvent.create({
        data: {
          type: DomainEventType.USER_SUSPENDED,
          actorId: moderatorId,
          entityType: 'User',
          entityId: userId,
          payload,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: DomainEventType.USER_SUSPENDED,
          aggregateType: 'User',
          aggregateId: userId,
          actorId: moderatorId,
          payload,
        },
      });

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          actorId: moderatorId,
          action: 'USER_SUSPENDED',
          entityType: 'User',
          entityId: userId,
          metadata: { reason: input.reason },
        },
      });

      this.logger.warn(`User ${userId} suspended by moderator ${moderatorId}: ${input.reason}`);

      return {
        userId,
        accountStatus: AccountStatus.SUSPENDED,
        restrictionId: restriction.id,
        reason: input.reason,
        suspendedAt: now.toISOString(),
      };
    });
  }

  /**
   * Reinstates a suspended user account.
   */
  async reinstateUser(userId: string, moderatorId: string, input: ReinstateUserInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.TARGET_NOT_FOUND,
        message: 'User to reinstate not found.',
      });
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // 1. Update user account status
      await tx.user.update({
        where: { id: userId },
        data: { accountStatus: AccountStatus.ACTIVE },
      });

      // 2. Revoke active temporary suspension restrictions
      await tx.userRestriction.updateMany({
        where: {
          userId,
          restrictionType: RestrictionType.TEMPORARY_SUSPENSION,
          isActive: true,
        },
        data: {
          isActive: false,
          revokedAt: now,
          revokedById: moderatorId,
        },
      });

      // 3. Domain & Outbox events
      const payload = {
        userId,
        moderatorId,
        reason: input.reason,
      };

      await tx.domainEvent.create({
        data: {
          type: DomainEventType.USER_REINSTATED,
          actorId: moderatorId,
          entityType: 'User',
          entityId: userId,
          payload,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: DomainEventType.USER_REINSTATED,
          aggregateType: 'User',
          aggregateId: userId,
          actorId: moderatorId,
          payload,
        },
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          actorId: moderatorId,
          action: 'USER_REINSTATED',
          entityType: 'User',
          entityId: userId,
          metadata: { reason: input.reason },
        },
      });

      this.logger.log(`User ${userId} reinstated by moderator ${moderatorId}`);

      return {
        userId,
        accountStatus: AccountStatus.ACTIVE,
        reinstatedAt: now.toISOString(),
      };
    });
  }

  /**
   * Applies a specific capability restriction to a user.
   */
  async applyRestriction(
    userId: string,
    moderatorId: string,
    input: ApplyUserRestrictionInput,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.TARGET_NOT_FOUND,
        message: 'User not found.',
      });
    }

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    return this.prisma.$transaction(async (tx) => {
      const restriction = await tx.userRestriction.create({
        data: {
          userId,
          restrictionType: input.restrictionType as RestrictionType,
          isActive: true,
          reason: input.reason,
          issuedById: moderatorId,
          expiresAt,
        },
      });

      // Domain & Outbox event
      const payload = {
        restrictionId: restriction.id,
        userId,
        restrictionType: input.restrictionType,
        reason: input.reason,
        expiresAt: expiresAt?.toISOString() ?? null,
      };

      await tx.domainEvent.create({
        data: {
          type: DomainEventType.USER_RESTRICTED,
          actorId: moderatorId,
          entityType: 'UserRestriction',
          entityId: restriction.id,
          payload,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: DomainEventType.USER_RESTRICTED,
          aggregateType: 'UserRestriction',
          aggregateId: restriction.id,
          actorId: moderatorId,
          payload,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: moderatorId,
          action: 'USER_RESTRICTION_APPLIED',
          entityType: 'UserRestriction',
          entityId: restriction.id,
          metadata: payload,
        },
      });

      return {
        id: restriction.id,
        userId: restriction.userId,
        restrictionType: restriction.restrictionType,
        isActive: restriction.isActive,
        reason: restriction.reason,
        expiresAt: restriction.expiresAt?.toISOString() ?? null,
        createdAt: restriction.createdAt.toISOString(),
      };
    });
  }

  /**
   * Revokes an existing user capability restriction.
   */
  async revokeRestriction(restrictionId: string, moderatorId: string) {
    const existing = await this.prisma.userRestriction.findUnique({
      where: { id: restrictionId },
    });

    if (!existing) {
      throw new NotFoundException('Restriction not found');
    }

    const now = new Date();

    const updated = await this.prisma.userRestriction.update({
      where: { id: restrictionId },
      data: {
        isActive: false,
        revokedAt: now,
        revokedById: moderatorId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: moderatorId,
        action: 'USER_RESTRICTION_REVOKED',
        entityType: 'UserRestriction',
        entityId: restrictionId,
        metadata: { userId: existing.userId, restrictionType: existing.restrictionType },
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      isActive: updated.isActive,
      revokedAt: updated.revokedAt?.toISOString(),
    };
  }

  /**
   * Retrieves active capability restrictions for a user.
   */
  async getUserRestrictions(userId: string) {
    const now = new Date();
    const restrictions = await this.prisma.userRestriction.findMany({
      where: {
        userId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return restrictions.map((r) => ({
      id: r.id,
      restrictionType: r.restrictionType,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
    }));
  }

  /**
   * Asserts that a user does not have an active capability restriction.
   */
  async assertUserNotRestricted(userId: string, restrictionType: RestrictionType): Promise<void> {
    const now = new Date();
    const activeRestriction = await this.prisma.userRestriction.findFirst({
      where: {
        userId,
        restrictionType,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    if (activeRestriction) {
      throw new ForbiddenException({
        code: TRUST_SAFETY_ERROR_CODES.USER_RESTRICTED,
        message: `Action forbidden due to active capability restriction (${restrictionType}): ${activeRestriction.reason}`,
      });
    }
  }

  /**
   * Retrieves trust & safety audit logs.
   */
  async getAuditLogs(params: {
    entityType?: string;
    actorId?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const offset = Math.max(0, params.offset || 0);

    const where: any = {};
    if (params.entityType) where.entityType = params.entityType;
    if (params.actorId) where.actorId = params.actorId;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, phone: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: logs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        metadata: l.metadata,
        actor: l.actor ? { id: l.actor.id, phone: l.actor.phone, role: l.actor.role } : null,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    };
  }
}
