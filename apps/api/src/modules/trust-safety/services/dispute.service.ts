import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import {
  DisputeStatus,
  ModerationCaseType,
  ModerationCaseStatus,
  ModerationPriority,
  ModerationActionType,
  DomainEventType,
  UserRole,
} from '@localsaathi/types';
import { CreateDisputeInput, ResolveDisputeInput } from '@localsaathi/validation';
import { TRUST_SAFETY_ERROR_CODES } from '../trust-safety.constants';

@Injectable()
export class DisputeService {
  private readonly logger = new Logger(DisputeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Raises a dispute for a booking (strictly non-financial operational dispute).
   */
  async createDispute(bookingId: string, raisedById: string, input: CreateDisputeInput) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        workerProfile: { select: { userId: true, displayName: true } },
        employerProfile: { select: { userId: true, businessName: true } },
        jobPost: { select: { title: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.BOOKING_NOT_FOUND,
        message: 'Booking not found.',
      });
    }

    const workerUserId = booking.workerProfile.userId;
    const employerUserId = booking.employerProfile.userId;

    const isWorker = raisedById === workerUserId;
    const isEmployer = raisedById === employerUserId;

    if (!isWorker && !isEmployer) {
      throw new ForbiddenException({
        code: TRUST_SAFETY_ERROR_CODES.NOT_BOOKING_PARTICIPANT,
        message: 'Only direct participants (worker or employer) can raise a dispute for this booking.',
      });
    }

    const againstId = isWorker ? employerUserId : workerUserId;

    // Check if open dispute already exists on this booking
    const existingOpen = await this.prisma.dispute.findFirst({
      where: {
        bookingId,
        status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_INVESTIGATION, DisputeStatus.UNDER_REVIEW] },
      },
    });

    if (existingOpen) {
      throw new BadRequestException({
        code: TRUST_SAFETY_ERROR_CODES.DISPUTE_ALREADY_EXISTS,
        message: 'An active dispute is already open for this booking.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create or link ModerationCase
      const caseNumber = `CASE-DSP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const moderationCase = await tx.moderationCase.create({
        data: {
          caseNumber,
          caseType: ModerationCaseType.DISPUTE,
          priority: ModerationPriority.HIGH,
          status: ModerationCaseStatus.PENDING,
          targetEntityType: 'Booking',
          targetEntityId: bookingId,
          title: `Booking Dispute: "${booking.jobPost.title}"`,
          description: `Dispute raised by ${isWorker ? 'Worker' : 'Employer'}: ${input.reason}. Details: ${input.description ?? 'None'}`,
        },
      });

      // 2. Create Dispute
      const dispute = await tx.dispute.create({
        data: {
          bookingId,
          raisedById,
          againstId,
          reason: input.reason,
          description: input.description,
          status: DisputeStatus.OPEN,
          moderationCaseId: moderationCase.id,
        },
      });

      // 3. Mark booking as DISPUTED if not completed/cancelled
      if (booking.status !== 'COMPLETED' && booking.status !== 'CANCELLED') {
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'DISPUTED' as any },
        });
      }

      // 4. Domain & Outbox events (Notifies respondent)
      const payload = {
        disputeId: dispute.id,
        bookingId,
        raisedById,
        againstId,
        recipientId: againstId,
        reason: input.reason,
        caseId: moderationCase.id,
      };

      await tx.domainEvent.create({
        data: {
          type: DomainEventType.DISPUTE_RAISED,
          actorId: raisedById,
          entityType: 'Dispute',
          entityId: dispute.id,
          payload,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: DomainEventType.DISPUTE_RAISED,
          aggregateType: 'Dispute',
          aggregateId: dispute.id,
          actorId: raisedById,
          payload,
        },
      });

      // 5. Immutable Security Audit Log
      await tx.auditLog.create({
        data: {
          actorId: raisedById,
          action: 'DISPUTE_RAISED',
          entityType: 'Dispute',
          entityId: dispute.id,
          metadata: {
            bookingId,
            againstId,
            reason: input.reason,
          },
        },
      });

      this.logger.log(`Dispute raised on booking ${bookingId} by ${raisedById}: ID=${dispute.id}`);

      return {
        id: dispute.id,
        bookingId: dispute.bookingId,
        raisedById: dispute.raisedById,
        againstId: dispute.againstId,
        reason: dispute.reason,
        description: dispute.description,
        status: dispute.status,
        caseNumber: moderationCase.caseNumber,
        createdAt: dispute.createdAt.toISOString(),
      };
    });
  }

  /**
   * Retrieves disputes for a booking with strict IDOR verification.
   */
  async getDisputesForBooking(bookingId: string, userId: string, role: UserRole) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        workerProfile: { select: { userId: true } },
        employerProfile: { select: { userId: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.BOOKING_NOT_FOUND,
        message: 'Booking not found.',
      });
    }

    const isPrivileged = role === UserRole.ADMIN || role === UserRole.MODERATOR;
    const isParticipant =
      booking.workerProfile.userId === userId ||
      booking.employerProfile.userId === userId;

    if (!isParticipant && !isPrivileged) {
      throw new ForbiddenException({
        code: TRUST_SAFETY_ERROR_CODES.NOT_BOOKING_PARTICIPANT,
        message: 'You are not authorized to view disputes for this booking.',
      });
    }

    const disputes = await this.prisma.dispute.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
      include: {
        moderationCase: { select: { caseNumber: true, status: true } },
      },
    });

    return disputes.map((d) => ({
      id: d.id,
      bookingId: d.bookingId,
      raisedById: d.raisedById,
      againstId: d.againstId,
      reason: d.reason,
      description: d.description,
      status: d.status,
      resolution: d.resolution,
      resolutionNotes: d.resolutionNotes,
      caseNumber: d.moderationCase?.caseNumber ?? null,
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Retrieves all disputes involving the user.
   */
  async getDisputesForUser(userId: string) {
    const disputes = await this.prisma.dispute.findMany({
      where: {
        OR: [{ raisedById: userId }, { againstId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            jobPost: { select: { title: true } },
          },
        },
        moderationCase: { select: { caseNumber: true, status: true } },
      },
    });

    return disputes.map((d) => ({
      id: d.id,
      bookingId: d.bookingId,
      jobTitle: d.booking.jobPost.title,
      bookingStatus: d.booking.status,
      raisedById: d.raisedById,
      againstId: d.againstId,
      isRaisedByMe: d.raisedById === userId,
      reason: d.reason,
      description: d.description,
      status: d.status,
      resolution: d.resolution,
      caseNumber: d.moderationCase?.caseNumber ?? null,
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
    }));
  }

  /**
   * Retrieves single dispute by ID with IDOR protection.
   */
  async getDisputeById(disputeId: string, userId: string, role: UserRole) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: {
          include: {
            jobPost: { select: { title: true } },
          },
        },
        moderationCase: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.DISPUTE_NOT_FOUND,
        message: 'Dispute not found.',
      });
    }

    const isPrivileged = role === UserRole.ADMIN || role === UserRole.MODERATOR;
    const isParticipant = dispute.raisedById === userId || dispute.againstId === userId;

    if (!isParticipant && !isPrivileged) {
      throw new ForbiddenException({
        code: TRUST_SAFETY_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        message: 'You are not authorized to view this dispute.',
      });
    }

    return {
      id: dispute.id,
      bookingId: dispute.bookingId,
      jobTitle: dispute.booking.jobPost.title,
      raisedById: dispute.raisedById,
      againstId: dispute.againstId,
      reason: dispute.reason,
      description: dispute.description,
      status: dispute.status,
      resolution: dispute.resolution,
      resolutionNotes: dispute.resolutionNotes,
      caseNumber: dispute.moderationCase?.caseNumber ?? null,
      createdAt: dispute.createdAt.toISOString(),
      resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
    };
  }

  /**
   * Moderator: resolves dispute (without financial arbitration).
   */
  async resolveDispute(
    disputeId: string,
    moderatorId: string,
    input: ResolveDisputeInput,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { moderationCase: true },
    });

    if (!dispute) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.DISPUTE_NOT_FOUND,
        message: 'Dispute not found.',
      });
    }

    if (dispute.status === DisputeStatus.RESOLVED || dispute.status === DisputeStatus.CLOSED) {
      throw new BadRequestException({
        code: TRUST_SAFETY_ERROR_CODES.DISPUTE_ALREADY_RESOLVED,
        message: 'Dispute has already been resolved.',
      });
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // 1. Update Dispute
      const updated = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: DisputeStatus.RESOLVED,
          resolution: input.resolution,
          resolutionNotes: input.notes,
          resolvedById: moderatorId,
          resolvedAt: now,
        },
      });

      // 2. Resolve linked ModerationCase
      if (dispute.moderationCase) {
        await tx.moderationCase.update({
          where: { id: dispute.moderationCase.id },
          data: {
            status: ModerationCaseStatus.RESOLVED,
            resolution: ModerationActionType.SETTLE_DISPUTE,
            resolutionNotes: `${input.resolution}. ${input.notes ?? ''}`.trim(),
            resolvedAt: now,
          },
        });

        await tx.moderationCaseAction.create({
          data: {
            caseId: dispute.moderationCase.id,
            moderatorId,
            actionType: ModerationActionType.SETTLE_DISPUTE,
            notes: input.resolution,
          },
        });
      }

      // 3. Domain & Outbox event
      const payload = {
        disputeId,
        bookingId: dispute.bookingId,
        moderatorId,
        resolution: input.resolution,
        recipientId: dispute.raisedById,
      };

      await tx.domainEvent.create({
        data: {
          type: DomainEventType.DISPUTE_RESOLVED,
          actorId: moderatorId,
          entityType: 'Dispute',
          entityId: disputeId,
          payload,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: DomainEventType.DISPUTE_RESOLVED,
          aggregateType: 'Dispute',
          aggregateId: disputeId,
          actorId: moderatorId,
          payload,
        },
      });

      // Also notify respondent
      await tx.outboxEvent.create({
        data: {
          eventType: DomainEventType.DISPUTE_RESOLVED,
          aggregateType: 'Dispute',
          aggregateId: disputeId,
          actorId: moderatorId,
          payload: { ...payload, recipientId: dispute.againstId },
        },
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          actorId: moderatorId,
          action: 'DISPUTE_RESOLVED',
          entityType: 'Dispute',
          entityId: disputeId,
          metadata: {
            resolution: input.resolution,
            notes: input.notes,
          },
        },
      });

      this.logger.log(`Dispute ${disputeId} resolved by ${moderatorId}`);

      return {
        id: updated.id,
        bookingId: updated.bookingId,
        status: updated.status,
        resolution: updated.resolution,
        resolvedAt: updated.resolvedAt?.toISOString(),
      };
    });
  }
}
