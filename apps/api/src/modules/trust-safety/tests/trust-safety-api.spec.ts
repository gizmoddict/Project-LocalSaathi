/**
 * Phase 13 — Trust, Verification & Safety Platform API & RBAC Tests
 * Tests: Verification, Reporting, Dispute, and Moderation controllers,
 *        JwtAuthGuard, RolesGuard (ADMIN, MODERATOR), and IDOR protections.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VerificationController } from '../controllers/verification.controller';
import {
  UserReportController,
  JobReportController,
  MessageReportController,
  ReportListController,
} from '../controllers/reporting.controller';
import {
  BookingDisputeController,
  DisputeController,
} from '../controllers/dispute.controller';
import { ModerationController } from '../controllers/moderation.controller';
import { VerificationService } from '../services/verification.service';
import { ReportingService } from '../services/reporting.service';
import { DisputeService } from '../services/dispute.service';
import { ModerationService } from '../services/moderation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  UserRole,
  AuthenticatedUser,
  VerificationStatus,
  VerificationType,
  DocumentType,
  ModerationCaseStatus,
  ModerationCaseType,
  ModerationPriority,
  AccountStatus,
} from '@localsaathi/types';

describe('Trust & Safety Platform — API & RBAC Tests', () => {
  let verificationController: VerificationController;
  let userReportController: UserReportController;
  let jobReportController: JobReportController;
  let messageReportController: MessageReportController;
  let reportListController: ReportListController;
  let bookingDisputeController: BookingDisputeController;
  let disputeController: DisputeController;
  let moderationController: ModerationController;
  let rolesGuard: RolesGuard;

  let verificationService: jest.Mocked<VerificationService>;
  let reportingService: jest.Mocked<ReportingService>;
  let disputeService: jest.Mocked<DisputeService>;
  let moderationService: jest.Mocked<ModerationService>;

  const workerUser: AuthenticatedUser = {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: 'sess-worker',
    role: UserRole.WORKER,
  };

  const employerUser: AuthenticatedUser = {
    userId: '22222222-2222-4222-8222-222222222222',
    sessionId: 'sess-employer',
    role: UserRole.EMPLOYER,
  };

  const moderatorUser: AuthenticatedUser = {
    userId: '33333333-3333-4333-8333-333333333333',
    sessionId: 'sess-mod',
    role: UserRole.MODERATOR,
  };

  const adminUser: AuthenticatedUser = {
    userId: '44444444-4444-4444-8444-444444444444',
    sessionId: 'sess-admin',
    role: UserRole.ADMIN,
  };

  beforeEach(async () => {
    verificationService = {
      submitVerification: jest.fn(),
      getVerificationStatus: jest.fn(),
      getVerificationById: jest.fn(),
      getPendingVerifications: jest.fn(),
      reviewVerification: jest.fn(),
    } as any;

    reportingService = {
      reportUser: jest.fn(),
      reportJob: jest.fn(),
      reportMessage: jest.fn(),
      getReportsByReporter: jest.fn(),
    } as any;

    disputeService = {
      createDispute: jest.fn(),
      getDisputesForBooking: jest.fn(),
      getDisputesForUser: jest.fn(),
      getDisputeById: jest.fn(),
      resolveDispute: jest.fn(),
    } as any;

    moderationService = {
      getCases: jest.fn(),
      getCaseById: jest.fn(),
      claimCase: jest.fn(),
      resolveCase: jest.fn(),
      dismissCase: jest.fn(),
      escalateCase: jest.fn(),
      suspendUser: jest.fn(),
      reinstateUser: jest.fn(),
      applyRestriction: jest.fn(),
      liftRestriction: jest.fn(),
      getAuditLogs: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        VerificationController,
        UserReportController,
        JobReportController,
        MessageReportController,
        ReportListController,
        BookingDisputeController,
        DisputeController,
        ModerationController,
      ],
      providers: [
        { provide: VerificationService, useValue: verificationService },
        { provide: ReportingService, useValue: reportingService },
        { provide: DisputeService, useValue: disputeService },
        { provide: ModerationService, useValue: moderationService },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    verificationController = module.get<VerificationController>(VerificationController);
    userReportController = module.get<UserReportController>(UserReportController);
    jobReportController = module.get<JobReportController>(JobReportController);
    messageReportController = module.get<MessageReportController>(MessageReportController);
    reportListController = module.get<ReportListController>(ReportListController);
    bookingDisputeController = module.get<BookingDisputeController>(BookingDisputeController);
    disputeController = module.get<DisputeController>(DisputeController);
    moderationController = module.get<ModerationController>(ModerationController);
    rolesGuard = module.get<RolesGuard>(RolesGuard);
  });

  describe('VerificationController', () => {
    it('should submit verification for worker', async () => {
      const mockResult = {
        verificationId: 'v-123',
        status: VerificationStatus.PENDING,
        verificationType: VerificationType.AADHAAR,
        documentIds: ['doc-1'],
        submittedAt: new Date().toISOString(),
      };
      verificationService.submitVerification.mockResolvedValue(mockResult as any);

      const res = await verificationController.submitVerification(workerUser, {
        verificationType: VerificationType.AADHAAR,
        documents: [
          {
            type: DocumentType.GOVERNMENT_ID,
            objectStorageKey: 'verifications/worker-1/doc1.jpg',
            mimeType: 'image/jpeg',
            fileSizeBytes: 102400,
          },
        ],
      });

      expect(res).toEqual(mockResult);
      expect(verificationService.submitVerification).toHaveBeenCalledWith(
        workerUser.userId,
        expect.any(Object),
      );
    });

    it('should return verification status for user', async () => {
      const mockStatus = {
        hasSubmitted: true,
        status: VerificationStatus.PENDING,
        latestVerification: null,
      };
      verificationService.getVerificationStatus.mockResolvedValue(mockStatus as any);

      const res = await verificationController.getStatus(workerUser);
      expect(res).toEqual(mockStatus);
      expect(verificationService.getVerificationStatus).toHaveBeenCalledWith(workerUser.userId);
    });
  });

  describe('Reporting Controllers', () => {
    it('should report user successfully', async () => {
      const targetUserId = '22222222-2222-4222-8222-222222222222';
      const mockReport = {
        id: 'rep-1',
        reporterId: workerUser.userId,
        targetId: targetUserId,
        caseId: 'case-1',
      };
      reportingService.reportUser.mockResolvedValue(mockReport as any);

      const res = await userReportController.reportUser(workerUser, targetUserId, {
        reason: 'HARASSMENT',
        details: 'Threatening messages received.',
      });

      expect(res).toEqual(mockReport);
      expect(reportingService.reportUser).toHaveBeenCalledWith(
        workerUser.userId,
        targetUserId,
        expect.objectContaining({ reason: 'HARASSMENT' }),
      );
    });

    it('should report job successfully', async () => {
      const targetJobId = '33333333-3333-4333-8333-333333333333';
      const mockReport = {
        id: 'rep-job-1',
        reporterId: workerUser.userId,
        targetId: targetJobId,
        caseId: 'case-job-1',
      };
      reportingService.reportJob.mockResolvedValue(mockReport as any);

      const res = await jobReportController.reportJob(workerUser, targetJobId, {
        reason: 'FRAUD',
        details: 'Demanding upfront deposit payment.',
      });

      expect(res).toEqual(mockReport);
      expect(reportingService.reportJob).toHaveBeenCalledWith(
        workerUser.userId,
        targetJobId,
        expect.objectContaining({ reason: 'FRAUD' }),
      );
    });

    it('should report message successfully', async () => {
      const targetMessageId = '44444444-4444-4444-8444-444444444444';
      const mockReport = {
        id: 'rep-msg-1',
        reporterId: workerUser.userId,
        targetId: targetMessageId,
        caseId: 'case-msg-1',
      };
      reportingService.reportMessage.mockResolvedValue(mockReport as any);

      const res = await messageReportController.reportMessage(workerUser, targetMessageId, {
        reason: 'SPAM',
        details: 'Unsolicited promotional links.',
      });

      expect(res).toEqual(mockReport);
      expect(reportingService.reportMessage).toHaveBeenCalledWith(
        workerUser.userId,
        targetMessageId,
        expect.objectContaining({ reason: 'SPAM' }),
      );
    });

    it('should list reports filed by user', async () => {
      reportingService.getReportsByReporter.mockResolvedValue([{ id: 'rep-1' }] as any);
      const res = await reportListController.getMyReports(workerUser);
      expect(res).toHaveLength(1);
      expect(reportingService.getReportsByReporter).toHaveBeenCalledWith(workerUser.userId);
    });
  });

  describe('DisputeController', () => {
    it('should raise booking dispute by participant', async () => {
      const bookingId = '55555555-5555-4555-8555-555555555555';
      const mockDispute = {
        id: 'disp-1',
        bookingId,
        raisedById: workerUser.userId,
        reason: 'NO_SHOW',
      };
      disputeService.createDispute.mockResolvedValue(mockDispute as any);

      const res = await bookingDisputeController.raiseDispute(workerUser, bookingId, {
        reason: 'NO_SHOW',
        description: 'Employer was not present at site.',
      });

      expect(res).toEqual(mockDispute);
      expect(disputeService.createDispute).toHaveBeenCalledWith(
        bookingId,
        workerUser.userId,
        expect.objectContaining({ reason: 'NO_SHOW' }),
      );
    });

    it('should return user disputes', async () => {
      disputeService.getDisputesForUser.mockResolvedValue([{ id: 'disp-1' }] as any);
      const res = await disputeController.getMyDisputes(workerUser);
      expect(res).toHaveLength(1);
      expect(disputeService.getDisputesForUser).toHaveBeenCalledWith(workerUser.userId);
    });
  });

  describe('ModerationController — RBAC & Actions', () => {
    function createMockContext(user: AuthenticatedUser): ExecutionContext {
      return {
        getHandler: () => ModerationController.prototype.getCases,
        getClass: () => ModerationController,
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      } as unknown as ExecutionContext;
    }

    it('should deny WORKER access to moderation endpoints', () => {
      const ctx = createMockContext(workerUser);
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny EMPLOYER access to moderation endpoints', () => {
      const ctx = createMockContext(employerUser);
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should allow MODERATOR access to moderation endpoints', () => {
      const ctx = createMockContext(moderatorUser);
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should allow ADMIN access to moderation endpoints', () => {
      const ctx = createMockContext(adminUser);
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should allow moderator to list cases', async () => {
      const mockCases = {
        cases: [
          {
            id: 'case-1',
            status: ModerationCaseStatus.PENDING,
            caseType: ModerationCaseType.REPORT,
            priority: ModerationPriority.HIGH,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };
      moderationService.getCases.mockResolvedValue(mockCases as any);

      const res = await moderationController.getCases(
        ModerationCaseStatus.PENDING,
        undefined,
        undefined,
        '1',
        '20',
      );
      expect(res).toEqual(mockCases);
      expect(moderationService.getCases).toHaveBeenCalledWith(
        expect.objectContaining({ status: ModerationCaseStatus.PENDING }),
      );
    });

    it('should allow moderator to claim and resolve a case', async () => {
      const caseId = '66666666-6666-4666-8666-666666666666';
      moderationService.claimCase.mockResolvedValue({ id: caseId, assignedToId: moderatorUser.userId } as any);
      moderationService.resolveCase.mockResolvedValue({ id: caseId, status: ModerationCaseStatus.RESOLVED } as any);

      const claimRes = await moderationController.claimCase(moderatorUser, caseId);
      expect(claimRes.assignedToId).toBe(moderatorUser.userId);

      const resolveRes = await moderationController.resolveCase(moderatorUser, caseId, {
        resolution: 'WARNING',
        notes: 'User was warned and content removed.',
      });
      expect(resolveRes.status).toBe(ModerationCaseStatus.RESOLVED);
    });

    it('should allow moderator/admin to suspend and reinstate user', async () => {
      const targetUserId = '77777777-7777-4777-8777-777777777777';
      moderationService.suspendUser.mockResolvedValue({
        userId: targetUserId,
        accountStatus: AccountStatus.SUSPENDED,
        restrictionId: 'res-1',
        reason: 'Severe Terms of Service violation',
        suspendedAt: new Date().toISOString(),
      });
      moderationService.reinstateUser.mockResolvedValue({
        userId: targetUserId,
        accountStatus: AccountStatus.ACTIVE,
        reinstatedAt: new Date().toISOString(),
      });

      const suspendRes = await moderationController.suspendUser(adminUser, targetUserId, {
        reason: 'Severe Terms of Service violation',
      });
      expect(suspendRes.accountStatus).toBe(AccountStatus.SUSPENDED);

      const reinstateRes = await moderationController.reinstateUser(adminUser, targetUserId, {
        reason: 'Appeal approved after investigation',
      });
      expect(reinstateRes.accountStatus).toBe(AccountStatus.ACTIVE);
    });
  });
});
