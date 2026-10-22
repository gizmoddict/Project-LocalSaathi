import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { VerificationService } from '../services/verification.service';
import { ReportingService } from '../services/reporting.service';
import { DisputeService } from '../services/dispute.service';
import { ModerationService } from '../services/moderation.service';
import { DocumentValidator } from '../helpers/document-validator';
import { PrismaService } from '../../database/database.module';
import {
  VerificationStatus,
  VerificationType,
  DocumentType,
  ReportTargetType,
  DisputeStatus,
  ModerationCaseStatus,
  RestrictionType,
  AccountStatus,
  UserRole,
} from '@localsaathi/types';

describe('Trust & Safety Platform - Unit Tests', () => {
  let verificationService: VerificationService;
  let reportingService: ReportingService;
  let disputeService: DisputeService;
  let moderationService: ModerationService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(mockPrisma)),
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      employerProfile: {
        updateMany: jest.fn(),
      },
      workerProfile: {
        findUnique: jest.fn(),
      },
      jobPost: {
        findUnique: jest.fn(),
      },
      message: {
        findUnique: jest.fn(),
      },
      booking: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      identityVerification: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      document: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      report: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      reportedMessage: {
        create: jest.fn(),
      },
      dispute: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      moderationCase: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      moderationCaseAction: {
        create: jest.fn(),
      },
      userRestriction: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      session: {
        updateMany: jest.fn(),
      },
      domainEvent: {
        create: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationService,
        ReportingService,
        DisputeService,
        ModerationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    verificationService = module.get<VerificationService>(VerificationService);
    reportingService = module.get<ReportingService>(ReportingService);
    disputeService = module.get<DisputeService>(DisputeService);
    moderationService = module.get<ModerationService>(ModerationService);
  });

  describe('DocumentValidator', () => {
    it('should validate valid document metadata', () => {
      expect(() =>
        DocumentValidator.validateMetadata('image/jpeg', 102400, 'verifications/u1/doc.jpg')
      ).not.toThrow();
    });

    it('should reject unsupported MIME type', () => {
      expect(() =>
        DocumentValidator.validateMetadata('application/x-sh', 1024, 'verifications/u1/script.sh')
      ).toThrow(BadRequestException);
    });

    it('should reject file size exceeding 5MB', () => {
      expect(() =>
        DocumentValidator.validateMetadata('application/pdf', 6 * 1024 * 1024, 'verifications/u1/doc.pdf')
      ).toThrow(BadRequestException);
    });

    it('should validate magic bytes for JPEG and PNG', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
      expect(DocumentValidator.validateMagicBytes(jpegBuffer, 'image/jpeg')).toBe(true);

      const fakeBuffer = Buffer.from([0x00, 0x00, 0x00]);
      expect(DocumentValidator.validateMagicBytes(fakeBuffer, 'image/jpeg')).toBe(false);
    });
  });

  describe('VerificationService', () => {
    it('should successfully submit verification with valid document metadata', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        phone: '+919876543210',
        role: UserRole.WORKER,
      });
      mockPrisma.identityVerification.findFirst.mockResolvedValue(null);
      mockPrisma.identityVerification.create.mockResolvedValue({
        id: 'vrf-1',
        userId: 'user-1',
        verificationType: VerificationType.AADHAAR,
        status: VerificationStatus.PENDING,
        submittedAt: new Date(),
      });
      mockPrisma.document.create.mockResolvedValue({
        id: 'doc-1',
        type: DocumentType.GOVERNMENT_ID,
        objectStorageKey: 'verifications/user-1/aadhaar.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 204800,
        verificationStatus: VerificationStatus.PENDING,
      });
      mockPrisma.moderationCase.create.mockResolvedValue({
        id: 'case-1',
        caseNumber: 'CASE-VRF-001',
      });

      const res = await verificationService.submitVerification('user-1', {
        verificationType: 'AADHAAR' as any,
        documents: [
          {
            type: 'GOVERNMENT_ID' as any,
            objectStorageKey: 'verifications/user-1/aadhaar.jpg',
            mimeType: 'image/jpeg',
            fileSizeBytes: 204800,
          },
        ],
      });

      expect(res.id).toBe('vrf-1');
      expect(res.status).toBe(VerificationStatus.PENDING);
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should reject verification if request is already pending', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', phone: '+919876543210' });
      mockPrisma.identityVerification.findFirst.mockResolvedValue({
        id: 'vrf-pending',
        status: VerificationStatus.PENDING,
      });

      await expect(
        verificationService.submitVerification('user-1', {
          verificationType: 'AADHAAR' as any,
          documents: [
            {
              type: 'GOVERNMENT_ID' as any,
              objectStorageKey: 'verifications/user-1/aadhaar.jpg',
              mimeType: 'image/jpeg',
              fileSizeBytes: 204800,
            },
          ],
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should approve verification and update User status to VERIFIED', async () => {
      mockPrisma.identityVerification.findUnique.mockResolvedValue({
        id: 'vrf-1',
        userId: 'user-1',
        status: VerificationStatus.PENDING,
        moderationCase: { id: 'case-1' },
      });
      mockPrisma.identityVerification.update.mockResolvedValue({
        id: 'vrf-1',
        userId: 'user-1',
        status: VerificationStatus.VERIFIED,
        reviewerId: 'mod-1',
        reviewedAt: new Date(),
        verifiedAt: new Date(),
      });

      const res = await verificationService.reviewVerification('vrf-1', 'mod-1', 'APPROVE', {
        notes: 'Verified against govt database',
      });

      expect(res.status).toBe(VerificationStatus.VERIFIED);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { verificationStatus: VerificationStatus.VERIFIED },
      });
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
    });
  });

  describe('ReportingService', () => {
    it('should reject reporting oneself', async () => {
      await expect(
        reportingService.reportUser('user-1', 'user-1', { reason: 'HARASSMENT' })
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully file report and create moderation case', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'target-1', phone: '+919999999999' });
      mockPrisma.report.findFirst.mockResolvedValue(null);
      mockPrisma.moderationCase.findFirst.mockResolvedValue(null);
      mockPrisma.moderationCase.create.mockResolvedValue({
        id: 'case-1',
        caseNumber: 'CASE-REP-001',
      });
      mockPrisma.report.create.mockResolvedValue({
        id: 'rep-1',
        reporterId: 'reporter-1',
        targetType: ReportTargetType.USER,
        targetId: 'target-1',
        reason: 'HARASSMENT',
        details: 'Offensive language',
        status: 'PENDING',
        createdAt: new Date(),
      });

      const res = await reportingService.reportUser('reporter-1', 'target-1', {
        reason: 'HARASSMENT',
        details: 'Offensive language',
      });

      expect(res.id).toBe('rep-1');
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('DisputeService', () => {
    it('should raise booking dispute if user is participant', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'book-1',
        workerProfile: { userId: 'worker-user', displayName: 'Ramesh' },
        employerProfile: { userId: 'employer-user', businessName: 'BuildCorp' },
        jobPost: { title: 'Construction Labor' },
        status: 'CONFIRMED',
      });
      mockPrisma.dispute.findFirst.mockResolvedValue(null);
      mockPrisma.moderationCase.create.mockResolvedValue({
        id: 'case-dsp-1',
        caseNumber: 'CASE-DSP-001',
      });
      mockPrisma.dispute.create.mockResolvedValue({
        id: 'dsp-1',
        bookingId: 'book-1',
        raisedById: 'worker-user',
        againstId: 'employer-user',
        reason: 'Unsafe site conditions',
        status: DisputeStatus.OPEN,
        createdAt: new Date(),
      });

      const res = await disputeService.createDispute('book-1', 'worker-user', {
        reason: 'Unsafe site conditions',
      });

      expect(res.id).toBe('dsp-1');
      expect(mockPrisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'book-1' },
        data: { status: 'DISPUTED' },
      });
    });

    it('should reject dispute if raised by non-participant', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'book-1',
        workerProfile: { userId: 'worker-user' },
        employerProfile: { userId: 'employer-user' },
        jobPost: { title: 'Mason' },
      });

      await expect(
        disputeService.createDispute('book-1', 'stranger-user', { reason: 'Fraud' })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ModerationService', () => {
    it('should suspend user account and revoke active sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'bad-user' });
      mockPrisma.userRestriction.create.mockResolvedValue({ id: 'rst-1' });

      const res = await moderationService.suspendUser('bad-user', 'mod-1', {
        reason: 'Severe harassment of platform members',
      });

      expect(res.accountStatus).toBe(AccountStatus.SUSPENDED);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'bad-user' },
        data: { accountStatus: AccountStatus.SUSPENDED },
      });
      expect(mockPrisma.session.updateMany).toHaveBeenCalled();
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalled();
    });

    it('should assert capability restriction throws ForbiddenException', async () => {
      mockPrisma.userRestriction.findFirst.mockResolvedValue({
        id: 'rst-1',
        restrictionType: RestrictionType.CANNOT_MESSAGE,
        reason: 'Spamming other workers',
        isActive: true,
      });

      await expect(
        moderationService.assertUserNotRestricted('user-1', RestrictionType.CANNOT_MESSAGE)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should claim moderation case', async () => {
      mockPrisma.moderationCase.findUnique.mockResolvedValue({ id: 'case-1' });
      mockPrisma.moderationCase.update.mockResolvedValue({
        id: 'case-1',
        caseNumber: 'CASE-001',
        status: ModerationCaseStatus.UNDER_REVIEW,
        assignedToId: 'mod-1',
      });

      const res = await moderationService.claimCase('case-1', 'mod-1');
      expect(res.status).toBe(ModerationCaseStatus.UNDER_REVIEW);
      expect(res.assignedToId).toBe('mod-1');
    });
  });
});
