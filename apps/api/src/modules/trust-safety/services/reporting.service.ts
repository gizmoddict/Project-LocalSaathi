import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import {
  ReportTargetType,
  ReportStatus,
  ModerationCaseType,
  ModerationCaseStatus,
  ModerationPriority,
  DomainEventType,
} from '@localsaathi/types';
import { CreateReportInput } from '@localsaathi/validation';
import { TRUST_SAFETY_ERROR_CODES } from '../trust-safety.constants';

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reports a user.
   */
  async reportUser(reporterId: string, targetUserId: string, input: CreateReportInput) {
    if (reporterId === targetUserId) {
      throw new BadRequestException({
        code: TRUST_SAFETY_ERROR_CODES.CANNOT_REPORT_SELF,
        message: 'You cannot report your own account.',
      });
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        workerProfile: { select: { displayName: true } },
        employerProfile: { select: { businessName: true } },
      },
    });

    if (!targetUser) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.TARGET_NOT_FOUND,
        message: 'User to report not found.',
      });
    }

    // Check duplicate pending report
    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetType: ReportTargetType.USER,
        targetId: targetUserId,
        status: { in: [ReportStatus.PENDING, ReportStatus.UNDER_REVIEW] },
      },
    });

    if (existing) {
      throw new BadRequestException({
        code: TRUST_SAFETY_ERROR_CODES.DUPLICATE_REPORT_PENDING,
        message: 'You already have an active report under review for this user.',
      });
    }

    const displayName =
      targetUser.workerProfile?.displayName ??
      targetUser.employerProfile?.businessName ??
      targetUser.phone;

    return this.createReportWithCase({
      reporterId,
      targetType: ReportTargetType.USER,
      targetId: targetUserId,
      reason: input.reason,
      details: input.details,
      caseTitle: `User Report: ${displayName} (${input.reason})`,
      targetEntityType: 'User',
      caseDescription: `Report filed against user by ${reporterId}. Reason: ${input.reason}. Details: ${input.details ?? 'None'}`,
    });
  }

  /**
   * Reports a job post.
   */
  async reportJob(reporterId: string, jobId: string, input: CreateReportInput) {
    const job = await this.prisma.jobPost.findUnique({
      where: { id: jobId },
      include: { employerProfile: { select: { userId: true, businessName: true } } },
    });

    if (!job) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.TARGET_NOT_FOUND,
        message: 'Job post to report not found.',
      });
    }

    if (job.employerProfile.userId === reporterId) {
      throw new BadRequestException({
        code: TRUST_SAFETY_ERROR_CODES.CANNOT_REPORT_OWN_JOB,
        message: 'You cannot report your own job post.',
      });
    }

    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetType: ReportTargetType.JOB,
        targetId: jobId,
        status: { in: [ReportStatus.PENDING, ReportStatus.UNDER_REVIEW] },
      },
    });

    if (existing) {
      throw new BadRequestException({
        code: TRUST_SAFETY_ERROR_CODES.DUPLICATE_REPORT_PENDING,
        message: 'You already have an active report under review for this job.',
      });
    }

    return this.createReportWithCase({
      reporterId,
      targetType: ReportTargetType.JOB,
      targetId: jobId,
      reason: input.reason,
      details: input.details,
      caseTitle: `Job Report: "${job.title}" (${input.reason})`,
      targetEntityType: 'JobPost',
      caseDescription: `Report filed against job by ${reporterId}. Employer: ${job.employerProfile.businessName}. Reason: ${input.reason}`,
    });
  }

  /**
   * Reports a message.
   */
  async reportMessage(reporterId: string, messageId: string, input: CreateReportInput) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            members: { select: { userId: true } },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.TARGET_NOT_FOUND,
        message: 'Message to report not found.',
      });
    }

    const isMember = message.conversation?.members.some((m) => m.userId === reporterId);
    if (!isMember) {
      throw new ForbiddenException({
        code: TRUST_SAFETY_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        message: 'You can only report messages in conversations you belong to.',
      });
    }

    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetType: ReportTargetType.MESSAGE,
        targetId: messageId,
        status: { in: [ReportStatus.PENDING, ReportStatus.UNDER_REVIEW] },
      },
    });

    if (existing) {
      throw new BadRequestException({
        code: TRUST_SAFETY_ERROR_CODES.DUPLICATE_REPORT_PENDING,
        message: 'You already have an active report under review for this message.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Sync with Phase 11 reported_messages table
      await tx.reportedMessage.create({
        data: {
          reporterId,
          messageId,
          conversationId: message.conversationId,
          reason: input.reason,
          details: input.details,
          status: 'PENDING',
        },
      });

      return this.createReportWithCase(
        {
          reporterId,
          targetType: ReportTargetType.MESSAGE,
          targetId: messageId,
          reason: input.reason,
          details: input.details,
          caseTitle: `Message Report: ID ${messageId.substring(0, 8)} (${input.reason})`,
          targetEntityType: 'Message',
          caseDescription: `Message reported in conversation ${message.conversationId}. Sender: ${message.senderId}. Reason: ${input.reason}`,
        },
        tx,
      );
    });
  }

  /**
   * Internal helper to create Report and link/create a ModerationCase atomically.
   */
  private async createReportWithCase(
    params: {
      reporterId: string;
      targetType: ReportTargetType;
      targetId: string;
      reason: string;
      details?: string;
      caseTitle: string;
      targetEntityType: string;
      caseDescription: string;
    },
    transactionClient?: any,
  ) {
    const db = transactionClient ?? this.prisma;

    // Check if an existing active case already covers this entity
    let moderationCase = await db.moderationCase.findFirst({
      where: {
        targetEntityType: params.targetEntityType,
        targetEntityId: params.targetId,
        status: { in: [ModerationCaseStatus.PENDING, ModerationCaseStatus.UNDER_REVIEW] },
      },
    });

    if (!moderationCase) {
      const caseNumber = `CASE-REP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      moderationCase = await db.moderationCase.create({
        data: {
          caseNumber,
          caseType: ModerationCaseType.REPORT,
          priority: ModerationPriority.MEDIUM,
          status: ModerationCaseStatus.PENDING,
          targetEntityType: params.targetEntityType,
          targetEntityId: params.targetId,
          title: params.caseTitle,
          description: params.caseDescription,
        },
      });
    }

    const report = await db.report.create({
      data: {
        reporterId: params.reporterId,
        targetType: params.targetType,
        targetId: params.targetId,
        reason: params.reason,
        details: params.details,
        status: ReportStatus.PENDING,
        moderationCaseId: moderationCase.id,
      },
    });

    // Domain and Outbox events
    const payload = {
      reportId: report.id,
      reporterId: params.reporterId,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      caseId: moderationCase.id,
    };

    await db.domainEvent.create({
      data: {
        type: DomainEventType.USER_REPORTED,
        actorId: params.reporterId,
        entityType: 'Report',
        entityId: report.id,
        payload,
      },
    });

    await db.outboxEvent.create({
      data: {
        eventType: DomainEventType.USER_REPORTED,
        aggregateType: 'Report',
        aggregateId: report.id,
        actorId: params.reporterId,
        payload,
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        actorId: params.reporterId,
        action: 'REPORT_SUBMITTED',
        entityType: 'Report',
        entityId: report.id,
        metadata: {
          targetType: params.targetType,
          targetId: params.targetId,
          reason: params.reason,
        },
      },
    });

    this.logger.log(`Report created: ID=${report.id}, Target=${params.targetType}:${params.targetId}`);

    return {
      id: report.id,
      reporterId: report.reporterId,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      details: report.details,
      status: report.status,
      caseNumber: moderationCase.caseNumber,
      createdAt: report.createdAt.toISOString(),
    };
  }

  /**
   * Retrieves reports filed by the current user.
   */
  async getReportsByReporter(reporterId: string) {
    const reports = await this.prisma.report.findMany({
      where: { reporterId },
      orderBy: { createdAt: 'desc' },
      include: {
        moderationCase: { select: { caseNumber: true, status: true } },
      },
    });

    return reports.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      caseNumber: r.moderationCase?.caseNumber ?? null,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }));
  }
}
