import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import {
  VerificationStatus,
  VerificationType,
  DocumentType,
  ModerationCaseType,
  ModerationCaseStatus,
  ModerationPriority,
  ModerationActionType,
  DomainEventType,
  UserRole,
} from '@localsaathi/types';
import { SubmitVerificationInput, ReviewVerificationInput } from '@localsaathi/validation';
import { DocumentValidator } from '../helpers/document-validator';
import { TRUST_SAFETY_ERROR_CODES } from '../trust-safety.constants';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Submits a user identity verification request with document metadata.
   */
  async submitVerification(userId: string, input: SubmitVerificationInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        workerProfile: { select: { displayName: true } },
        employerProfile: { select: { businessName: true } },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.TARGET_NOT_FOUND,
        message: 'User not found.',
      });
    }

    // Check for existing pending or under-review verification
    const existingPending = await this.prisma.identityVerification.findFirst({
      where: {
        userId,
        status: { in: [VerificationStatus.PENDING, VerificationStatus.UNDER_REVIEW] },
      },
    });

    if (existingPending) {
      throw new BadRequestException({
        code: TRUST_SAFETY_ERROR_CODES.VERIFICATION_ALREADY_PENDING,
        message: 'A verification request is already pending or under review for this account.',
      });
    }

    // Validate all document items
    for (const doc of input.documents) {
      DocumentValidator.validateMetadata(doc.mimeType, doc.fileSizeBytes, doc.objectStorageKey);
    }

    const displayName =
      user.workerProfile?.displayName ??
      user.employerProfile?.businessName ??
      user.phone;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create IdentityVerification record
      const verification = await tx.identityVerification.create({
        data: {
          userId,
          verificationType: input.verificationType as VerificationType,
          status: VerificationStatus.PENDING,
          providerReference: input.providerReference,
        },
      });

      // 2. Create Document records
      const createdDocs = [];
      for (const doc of input.documents) {
        const createdDoc = await tx.document.create({
          data: {
            ownerId: userId,
            verificationId: verification.id,
            type: doc.type as DocumentType,
            objectStorageKey: doc.objectStorageKey,
            mimeType: doc.mimeType,
            fileSizeBytes: doc.fileSizeBytes,
            verificationStatus: VerificationStatus.PENDING,
          },
        });
        createdDocs.push(createdDoc);
      }

      // 3. Update User status to PENDING
      await tx.user.update({
        where: { id: userId },
        data: { verificationStatus: VerificationStatus.PENDING },
      });

      // 4. Create ModerationCase
      const caseNumber = `CASE-VRF-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const moderationCase = await tx.moderationCase.create({
        data: {
          caseNumber,
          caseType: ModerationCaseType.VERIFICATION,
          priority: ModerationPriority.MEDIUM,
          status: ModerationCaseStatus.PENDING,
          targetEntityType: 'IdentityVerification',
          targetEntityId: verification.id,
          verificationId: verification.id,
          title: `Verification Request: ${input.verificationType} (${displayName})`,
          description: `User submitted ${input.documents.length} document(s) for verification.`,
        },
      });

      // 5. Create DomainEvent & OutboxEvent
      const payload = {
        verificationId: verification.id,
        userId,
        verificationType: input.verificationType,
        documentCount: input.documents.length,
        caseId: moderationCase.id,
      };

      await tx.domainEvent.create({
        data: {
          type: DomainEventType.VERIFICATION_SUBMITTED,
          actorId: userId,
          entityType: 'IdentityVerification',
          entityId: verification.id,
          payload,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: DomainEventType.VERIFICATION_SUBMITTED,
          aggregateType: 'IdentityVerification',
          aggregateId: verification.id,
          actorId: userId,
          payload,
        },
      });

      // 6. Security Audit Log
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'VERIFICATION_SUBMITTED',
          entityType: 'IdentityVerification',
          entityId: verification.id,
          metadata: {
            verificationType: input.verificationType,
            documents: input.documents.map((d) => ({
              type: d.type,
              mimeType: d.mimeType,
              size: d.fileSizeBytes,
            })),
          },
        },
      });

      this.logger.log(`Verification submitted for user ${userId}: ID=${verification.id}`);

      return {
        id: verification.id,
        userId: verification.userId,
        verificationType: verification.verificationType,
        status: verification.status,
        providerReference: verification.providerReference,
        caseNumber: moderationCase.caseNumber,
        submittedAt: verification.submittedAt.toISOString(),
        documents: createdDocs.map((d) => ({
          id: d.id,
          type: d.type,
          objectStorageKey: d.objectStorageKey,
          mimeType: d.mimeType,
          fileSizeBytes: d.fileSizeBytes,
          status: d.verificationStatus,
        })),
      };
    });
  }

  /**
   * Retrieves the verification status and history for the authenticated user.
   */
  async getVerificationStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        verificationStatus: true,
        accountStatus: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const latestVerification = await this.prisma.identityVerification.findFirst({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
      include: {
        documents: true,
        moderationCase: {
          select: { id: true, caseNumber: true, status: true },
        },
      },
    });

    return {
      userId: user.id,
      overallStatus: user.verificationStatus,
      accountStatus: user.accountStatus,
      latestVerification: latestVerification
        ? {
            id: latestVerification.id,
            verificationType: latestVerification.verificationType,
            status: latestVerification.status,
            rejectionReason: latestVerification.rejectionReason,
            notes: latestVerification.notes,
            submittedAt: latestVerification.submittedAt.toISOString(),
            reviewedAt: latestVerification.reviewedAt?.toISOString() ?? null,
            verifiedAt: latestVerification.verifiedAt?.toISOString() ?? null,
            caseNumber: latestVerification.moderationCase?.caseNumber ?? null,
            documents: latestVerification.documents.map((d) => ({
              id: d.id,
              type: d.type,
              objectStorageKey: d.objectStorageKey,
              mimeType: d.mimeType,
              fileSizeBytes: d.fileSizeBytes,
              status: d.verificationStatus,
            })),
          }
        : null,
    };
  }

  /**
   * Retrieves a verification request by ID with strict IDOR protection.
   */
  async getVerificationById(id: string, requestingUserId: string, requestingRole: UserRole) {
    const verification = await this.prisma.identityVerification.findUnique({
      where: { id },
      include: {
        documents: true,
        user: {
          select: {
            id: true,
            phone: true,
            role: true,
            accountStatus: true,
            workerProfile: { select: { displayName: true } },
            employerProfile: { select: { businessName: true } },
          },
        },
        moderationCase: true,
      },
    });

    if (!verification) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.VERIFICATION_NOT_FOUND,
        message: 'Verification request not found.',
      });
    }

    const isPrivileged = requestingRole === UserRole.ADMIN || requestingRole === UserRole.MODERATOR;
    if (verification.userId !== requestingUserId && !isPrivileged) {
      throw new ForbiddenException({
        code: TRUST_SAFETY_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        message: 'You are not authorized to view this verification record.',
      });
    }

    return {
      id: verification.id,
      userId: verification.userId,
      verificationType: verification.verificationType,
      status: verification.status,
      providerReference: verification.providerReference,
      notes: verification.notes,
      rejectionReason: verification.rejectionReason,
      submittedAt: verification.submittedAt.toISOString(),
      reviewedAt: verification.reviewedAt?.toISOString() ?? null,
      verifiedAt: verification.verifiedAt?.toISOString() ?? null,
      documents: verification.documents.map((d) => ({
        id: d.id,
        type: d.type,
        objectStorageKey: d.objectStorageKey,
        mimeType: d.mimeType,
        fileSizeBytes: d.fileSizeBytes,
        status: d.verificationStatus,
      })),
      user: {
        id: verification.user.id,
        phone: verification.user.phone,
        role: verification.user.role,
        accountStatus: verification.user.accountStatus,
        displayName:
          verification.user.workerProfile?.displayName ??
          verification.user.employerProfile?.businessName ??
          verification.user.phone,
      },
    };
  }

  /**
   * Moderator review: approve or reject verification.
   */
  async reviewVerification(
    verificationId: string,
    reviewerId: string,
    action: 'APPROVE' | 'REJECT',
    input: ReviewVerificationInput,
  ) {
    const verification = await this.prisma.identityVerification.findUnique({
      where: { id: verificationId },
      include: { moderationCase: true },
    });

    if (!verification) {
      throw new NotFoundException({
        code: TRUST_SAFETY_ERROR_CODES.VERIFICATION_NOT_FOUND,
        message: 'Verification record not found.',
      });
    }

    if (
      verification.status === VerificationStatus.VERIFIED ||
      verification.status === VerificationStatus.REJECTED
    ) {
      throw new BadRequestException({
        code: TRUST_SAFETY_ERROR_CODES.VERIFICATION_ALREADY_REVIEWED,
        message: `Verification has already been reviewed (status=${verification.status}).`,
      });
    }

    const now = new Date();
    const isApprove = action === 'APPROVE';
    const newStatus = isApprove ? VerificationStatus.VERIFIED : VerificationStatus.REJECTED;

    return this.prisma.$transaction(async (tx) => {
      // 1. Update IdentityVerification
      const updated = await tx.identityVerification.update({
        where: { id: verificationId },
        data: {
          status: newStatus,
          reviewerId,
          notes: input.notes,
          rejectionReason: isApprove ? null : input.rejectionReason ?? 'Requirements not met',
          reviewedAt: now,
          verifiedAt: isApprove ? now : null,
        },
      });

      // 2. Update User verification status
      await tx.user.update({
        where: { id: verification.userId },
        data: { verificationStatus: newStatus },
      });

      // 3. Update EmployerProfile verificationState if applicable
      await tx.employerProfile.updateMany({
        where: { userId: verification.userId },
        data: { verificationState: newStatus },
      });

      // 4. Update Document statuses
      await tx.document.updateMany({
        where: { verificationId },
        data: {
          verificationStatus: newStatus,
          rejectionReason: isApprove ? null : input.rejectionReason,
        },
      });

      // 5. Update linked ModerationCase if present
      if (verification.moderationCase) {
        await tx.moderationCase.update({
          where: { id: verification.moderationCase.id },
          data: {
            status: ModerationCaseStatus.RESOLVED,
            resolution: isApprove
              ? ModerationActionType.APPROVE_VERIFICATION
              : ModerationActionType.REJECT_VERIFICATION,
            resolutionNotes: input.notes ?? input.rejectionReason,
            resolvedAt: now,
          },
        });

        await tx.moderationCaseAction.create({
          data: {
            caseId: verification.moderationCase.id,
            moderatorId: reviewerId,
            actionType: isApprove
              ? ModerationActionType.APPROVE_VERIFICATION
              : ModerationActionType.REJECT_VERIFICATION,
            notes: input.notes ?? input.rejectionReason,
          },
        });
      }

      // 6. Events & Notifications
      const eventType = isApprove
        ? DomainEventType.VERIFICATION_APPROVED
        : DomainEventType.VERIFICATION_REJECTED;

      const payload = {
        verificationId,
        userId: verification.userId,
        reviewerId,
        reason: input.rejectionReason,
      };

      await tx.domainEvent.create({
        data: {
          type: eventType,
          actorId: reviewerId,
          entityType: 'User',
          entityId: verification.userId,
          payload,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType,
          aggregateType: 'User',
          aggregateId: verification.userId,
          actorId: reviewerId,
          payload,
        },
      });

      // 7. Security Audit Log
      await tx.auditLog.create({
        data: {
          actorId: reviewerId,
          action: isApprove ? 'VERIFICATION_APPROVED' : 'VERIFICATION_REJECTED',
          entityType: 'IdentityVerification',
          entityId: verificationId,
          metadata: {
            targetUserId: verification.userId,
            action,
            notes: input.notes,
            rejectionReason: input.rejectionReason,
          },
        },
      });

      this.logger.log(`Verification ${verificationId} reviewed by ${reviewerId}: action=${action}`);

      return {
        id: updated.id,
        userId: updated.userId,
        status: updated.status,
        reviewerId: updated.reviewerId,
        reviewedAt: updated.reviewedAt?.toISOString(),
        verifiedAt: updated.verifiedAt?.toISOString() ?? null,
        rejectionReason: updated.rejectionReason,
      };
    });
  }
}
