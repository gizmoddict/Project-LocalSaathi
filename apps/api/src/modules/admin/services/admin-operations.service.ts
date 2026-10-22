// ==============================================================================
// LocalSaathi — Admin Operations Service (Phase 15)
// Reports, Non-Financial Disputes, Secure Verification Queue, & Moderation Actions
// ==============================================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import {
  AdminReportItem,
  AdminReportQuery,
  AdminDisputeItem,
  AdminDisputeQuery,
  AdminVerificationItem,
  AdminVerificationQuery,
  AdminModerationItem,
  AdminModerationQuery,
  ModerationCaseStatus,
  ModerationActionType,
  VerificationStatus,
} from '@localsaathi/types';
import { Prisma } from '@prisma/client';
import { ADMIN_ERROR_CODES, ADMIN_PAGINATION_LIMITS } from '../admin.constants';

@Injectable()
export class AdminOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists abuse/safety reports with target type and resolution status.
   */
  async listReports(
    query: AdminReportQuery,
  ): Promise<{ data: AdminReportItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(query.page || ADMIN_PAGINATION_LIMITS.DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(query.limit || ADMIN_PAGINATION_LIMITS.DEFAULT_LIMIT, 1),
      ADMIN_PAGINATION_LIMITS.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.ReportWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.targetType) where.targetType = query.targetType;

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.report.count({ where }),
    ]);

    const data: AdminReportItem[] = reports.map((r) => ({
      id: r.id,
      targetType: r.targetType as any,
      targetId: r.targetId,
      reporterId: r.reporterId,
      reason: r.reason,
      status: r.status as any,
      moderationCaseId: r.moderationCaseId || null,
      actionTaken: r.actionTaken || null,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() || null,
    }));

    return { data, total, page, limit };
  }

  /**
   * Lists non-financial operational booking disputes.
   */
  async listDisputes(
    query: AdminDisputeQuery,
  ): Promise<{ data: AdminDisputeItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(query.page || ADMIN_PAGINATION_LIMITS.DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(query.limit || ADMIN_PAGINATION_LIMITS.DEFAULT_LIMIT, 1),
      ADMIN_PAGINATION_LIMITS.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.DisputeWhereInput = {};
    if (query.status) where.status = query.status;

    const [disputes, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dispute.count({ where }),
    ]);

    const data: AdminDisputeItem[] = disputes.map((d) => ({
      id: d.id,
      bookingId: d.bookingId,
      raisedById: d.raisedById,
      againstId: d.againstId,
      reason: d.reason,
      status: d.status as any,
      moderationCaseId: d.moderationCaseId || null,
      resolvedById: d.resolvedById || null,
      resolution: d.resolution || null,
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() || null,
    }));

    return { data, total, page, limit };
  }

  /**
   * Lists identity verification requests with safe document metadata (no permanent public URLs).
   */
  async listVerifications(
    query: AdminVerificationQuery,
  ): Promise<{ data: AdminVerificationItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(query.page || ADMIN_PAGINATION_LIMITS.DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(query.limit || ADMIN_PAGINATION_LIMITS.DEFAULT_LIMIT, 1),
      ADMIN_PAGINATION_LIMITS.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.IdentityVerificationWhereInput = {};
    if (query.status) where.status = query.status;

    const [verifications, total] = await Promise.all([
      this.prisma.identityVerification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        include: {
          user: {
            select: {
              phone: true,
              role: true,
            },
          },
          documents: {
            where: { deletedAt: null },
            select: {
              id: true,
              type: true,
              mimeType: true,
              fileSizeBytes: true,
              verificationStatus: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.identityVerification.count({ where }),
    ]);

    const data: AdminVerificationItem[] = verifications.map((v) => ({
      id: v.id,
      userId: v.userId,
      userPhone: v.user.phone,
      userRole: v.user.role as any,
      verificationType: String(v.verificationType),
      status: v.status as VerificationStatus,
      submittedAt: v.submittedAt.toISOString(),
      reviewedAt: v.reviewedAt?.toISOString() || null,
      rejectionReason: v.rejectionReason || null,
      documents: v.documents.map((d) => ({
        id: d.id,
        type: d.type as any,
        mimeType: d.mimeType,
        fileSizeBytes: d.fileSizeBytes,
        verificationStatus: d.verificationStatus as VerificationStatus,
        createdAt: d.createdAt.toISOString(),
      })),
    }));

    return { data, total, page, limit };
  }

  /**
   * Lists unified moderation cases across reports, disputes, and verifications.
   */
  async listModerationCases(
    query: AdminModerationQuery,
  ): Promise<{ data: AdminModerationItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(query.page || ADMIN_PAGINATION_LIMITS.DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(query.limit || ADMIN_PAGINATION_LIMITS.DEFAULT_LIMIT, 1),
      ADMIN_PAGINATION_LIMITS.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.ModerationCaseWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.caseType) where.caseType = query.caseType;

    const [cases, total] = await Promise.all([
      this.prisma.moderationCase.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.moderationCase.count({ where }),
    ]);

    const data: AdminModerationItem[] = cases.map((c) => ({
      id: c.id,
      caseNumber: c.caseNumber,
      caseType: c.caseType as any,
      priority: c.priority as any,
      status: c.status as any,
      title: c.title,
      targetEntityType: c.targetEntityType,
      targetEntityId: c.targetEntityId,
      assignedToId: c.assignedToId || null,
      resolution: c.resolution ? String(c.resolution) : undefined,
      createdAt: c.createdAt.toISOString(),
      resolvedAt: c.resolvedAt?.toISOString() || null,
    }));

    return { data, total, page, limit };
  }

  /**
   * Allows an authorized moderator/admin to claim an unassigned moderation case.
   */
  async claimModerationCase(
    actorId: string,
    caseId: string,
  ): Promise<{ success: boolean; message: string }> {
    const caseRecord = await this.prisma.moderationCase.findUnique({ where: { id: caseId } });

    if (!caseRecord) {
      throw new NotFoundException({
        code: ADMIN_ERROR_CODES.CASE_NOT_FOUND,
        message: `Moderation case with ID ${caseId} not found`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.moderationCase.update({
        where: { id: caseId },
        data: {
          assignedToId: actorId,
          status: ModerationCaseStatus.UNDER_REVIEW,
        },
      });

      await tx.moderationCaseAction.create({
        data: {
          caseId,
          moderatorId: actorId,
          actionType: ModerationActionType.NONE,
          notes: 'Case claimed for administrative review',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'MODERATION_CASE_CLAIMED',
          entityType: 'ModerationCase',
          entityId: caseId,
          metadata: { caseNumber: caseRecord.caseNumber },
        },
      });
    });

    return { success: true, message: `Case ${caseRecord.caseNumber} claimed` };
  }

  /**
   * Resolves a moderation case with a valid action and recorded notes.
   */
  async resolveModerationCase(
    actorId: string,
    caseId: string,
    action: ModerationActionType,
    notes?: string,
  ): Promise<{ success: boolean; message: string }> {
    const caseRecord = await this.prisma.moderationCase.findUnique({ where: { id: caseId } });

    if (!caseRecord) {
      throw new NotFoundException({
        code: ADMIN_ERROR_CODES.CASE_NOT_FOUND,
        message: `Moderation case with ID ${caseId} not found`,
      });
    }

    if (caseRecord.status === ModerationCaseStatus.RESOLVED) {
      throw new BadRequestException({
        code: ADMIN_ERROR_CODES.INVALID_OPERATION,
        message: 'This moderation case has already been resolved',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.moderationCase.update({
        where: { id: caseId },
        data: {
          status: ModerationCaseStatus.RESOLVED,
          resolution: action,
          resolutionNotes: notes || null,
          resolvedAt: new Date(),
        },
      });

      await tx.moderationCaseAction.create({
        data: {
          caseId,
          moderatorId: actorId,
          actionType: action,
          notes: notes || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'MODERATION_CASE_RESOLVED',
          entityType: 'ModerationCase',
          entityId: caseId,
          metadata: {
            caseNumber: caseRecord.caseNumber,
            resolution: action,
            notes,
          },
        },
      });
    });

    return { success: true, message: `Case ${caseRecord.caseNumber} resolved` };
  }
}
