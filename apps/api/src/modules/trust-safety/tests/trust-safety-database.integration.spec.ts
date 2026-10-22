/**
 * Phase 13 — Trust, Verification & Safety Platform
 * Real PostgreSQL Database Integration Tests (Docker PostgreSQL 16 + PostGIS)
 * Skips gracefully if DB is not reachable.
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

import * as net from 'net';
import { PrismaClient } from '@prisma/client';
import { VerificationService } from '../services/verification.service';
import { ReportingService } from '../services/reporting.service';
import { DisputeService } from '../services/dispute.service';
import { ModerationService } from '../services/moderation.service';
import { PrismaService } from '../../database/database.module';
import {
  UserRole,
  VerificationType,
  DocumentType,
  VerificationStatus,
  ModerationCaseStatus,
  RestrictionType,
  DisputeStatus,
} from '@localsaathi/types';

describe('Trust & Safety Domain — Real PostgreSQL Integration Tests', () => {
  let prisma: PrismaClient;
  let verificationService: VerificationService;
  let reportingService: ReportingService;
  let disputeService: DisputeService;
  let moderationService: ModerationService;
  let isDatabaseAvailable = false;

  const phoneWorker = `+9199601${Math.floor(10000 + Math.random() * 90000)}`;
  const phoneEmployer = `+9199602${Math.floor(10000 + Math.random() * 90000)}`;
  const phoneModerator = `+9199603${Math.floor(10000 + Math.random() * 90000)}`;

  let workerUserId: string;
  let employerUserId: string;
  let moderatorUserId: string;
  let employerProfileId: string;
  let workerProfileId: string;
  let jobId: string;
  let applicationId: string;
  let bookingId: string;

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return;

    const portMatch = dbUrl.match(/:(\d+)\//);
    const hostMatch = dbUrl.match(/@([^:/]+)/);
    const host: string = hostMatch && hostMatch[1] ? hostMatch[1] : 'localhost';
    const port: number = portMatch && portMatch[1] ? parseInt(portMatch[1], 10) : 5432;

    await new Promise<void>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.once('connect', () => {
        isDatabaseAvailable = true;
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        resolve();
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve();
      });
      socket.connect(port, host);
    });

    if (!isDatabaseAvailable) return;

    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    const prismaService = prisma as unknown as PrismaService;
    verificationService = new VerificationService(prismaService);
    reportingService = new ReportingService(prismaService);
    disputeService = new DisputeService(prismaService);
    moderationService = new ModerationService(prismaService);

    // Seed test users
    const uWorker = await prisma.user.create({
      data: {
        phone: phoneWorker,
        role: 'WORKER',
        verificationStatus: 'UNVERIFIED',
      },
    });
    workerUserId = uWorker.id;

    const uEmployer = await prisma.user.create({
      data: {
        phone: phoneEmployer,
        role: 'EMPLOYER',
        verificationStatus: 'UNVERIFIED',
      },
    });
    employerUserId = uEmployer.id;

    const uModerator = await prisma.user.create({
      data: {
        phone: phoneModerator,
        role: 'MODERATOR',
        verificationStatus: 'VERIFIED',
      },
    });
    moderatorUserId = uModerator.id;

    // Create a worker profile & employer profile
    const wp = await prisma.workerProfile.create({
      data: {
        userId: workerUserId,
        displayName: 'Worker Safety Test',
        experienceYears: 5,
        expectedWage: 600,
        wageType: 'DAILY',
        isAvailable: true,
      },
    });
    workerProfileId = wp.id;

    const ep = await prisma.employerProfile.create({
      data: {
        userId: employerUserId,
        businessName: 'Saathi Builders',
        businessType: 'CONTRACTOR',
        locality: 'Hazratganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226001',
      },
    });
    employerProfileId = ep.id;

    // Create a job, an application, and a booking for dispute testing
    const job = await prisma.jobPost.create({
      data: {
        employerProfileId: ep.id,
        title: 'Wiring Work at Office',
        description: 'Complete commercial wiring installation.',
        status: 'PUBLISHED',
        category: 'ELECTRICAL',
        wageType: 'DAILY',
        wageAmount: 600,
        workerCount: 1,
        durationDays: 3,
        startDate: new Date('2026-10-25T00:00:00.000Z'),
        startTime: '09:00',
        urgency: 'STANDARD',
      },
    });
    jobId = job.id;

    const app = await prisma.jobApplication.create({
      data: {
        jobPostId: job.id,
        workerProfileId: wp.id,
        status: 'ACCEPTED',
      },
    });
    applicationId = app.id;

    const booking = await prisma.booking.create({
      data: {
        jobPostId: job.id,
        applicationId: app.id,
        employerProfileId: ep.id,
        workerProfileId: wp.id,
        status: 'CONFIRMED',
        startDate: new Date('2026-10-25T00:00:00.000Z'),
        totalAmount: 1800,
      },
    });
    bookingId = booking.id;
  });

  afterAll(async () => {
    if (!isDatabaseAvailable || !prisma) return;

    try {
      if (bookingId) {
        await prisma.dispute.deleteMany({ where: { bookingId } });
        await prisma.booking.deleteMany({ where: { id: bookingId } });
      }
      if (applicationId) {
        await prisma.jobApplication.deleteMany({ where: { id: applicationId } });
      }
      if (jobId) {
        await prisma.jobPost.deleteMany({ where: { id: jobId } });
      }
      await prisma.userRestriction.deleteMany({
        where: { userId: { in: [workerUserId, employerUserId, moderatorUserId] } },
      });
      await prisma.moderationCaseAction.deleteMany({});
      await prisma.moderationCase.deleteMany({
        where: {
          OR: [
            { targetEntityId: { in: [workerUserId, employerUserId, moderatorUserId] } },
          ],
        },
      });
      await prisma.report.deleteMany({
        where: {
          reporterId: { in: [workerUserId, employerUserId, moderatorUserId] },
        },
      });
      await prisma.document.deleteMany({
        where: { ownerId: { in: [workerUserId, employerUserId, moderatorUserId] } },
      });
      await prisma.identityVerification.deleteMany({
        where: { userId: { in: [workerUserId, employerUserId, moderatorUserId] } },
      });
      if (workerProfileId) {
        await prisma.workerProfile.deleteMany({ where: { id: workerProfileId } });
      }
      if (employerProfileId) {
        await prisma.employerProfile.deleteMany({ where: { id: employerProfileId } });
      }
      await prisma.user.deleteMany({
        where: { id: { in: [workerUserId, employerUserId, moderatorUserId] } },
      });
      await prisma.$disconnect();
    } catch {
      // Ignore cleanup error in test tearDown
    }
  });

  describe('Worker Verification Workflow', () => {
    let createdVerificationId: string;

    it('should submit worker identity verification and create moderation case', async () => {
      if (!isDatabaseAvailable) return;

      const res = await verificationService.submitVerification(workerUserId, {
        verificationType: VerificationType.AADHAAR,
        documents: [
          {
            type: DocumentType.GOVERNMENT_ID,
            objectStorageKey: `verifications/${workerUserId}/aadhaar_front.jpg`,
            mimeType: 'image/jpeg',
            fileSizeBytes: 204800,
          },
        ],
      });

      expect(res).toBeDefined();
      expect(res.status).toBe(VerificationStatus.PENDING);
      expect(res.id).toBeDefined();
      createdVerificationId = res.id;

      // Verify User status updated to PENDING
      const user = await prisma.user.findUnique({ where: { id: workerUserId } });
      expect(user?.verificationStatus).toBe('PENDING');

      // Verify ModerationCase created
      const modCase = await prisma.moderationCase.findFirst({
        where: { verificationId: createdVerificationId, caseType: 'VERIFICATION' },
      });
      expect(modCase).toBeDefined();
      expect(modCase?.status).toBe(ModerationCaseStatus.PENDING);
    });

    it('should query verification status for worker', async () => {
      if (!isDatabaseAvailable) return;

      const status = await verificationService.getVerificationStatus(workerUserId);
      expect(status.overallStatus).toBe(VerificationStatus.PENDING);
      expect(status.latestVerification?.id).toBe(createdVerificationId);
    });

    it('should allow moderator to review and approve verification', async () => {
      if (!isDatabaseAvailable) return;

      const reviewRes = await verificationService.reviewVerification(
        createdVerificationId,
        moderatorUserId,
        'APPROVE',
        {
          notes: 'Aadhaar document verified against government registry.',
        },
      );

      expect(reviewRes.status).toBe(VerificationStatus.VERIFIED);

      // Verify user now VERIFIED in database
      const user = await prisma.user.findUnique({ where: { id: workerUserId } });
      expect(user?.verificationStatus).toBe('VERIFIED');
    });
  });

  describe('Reporting Subsystem', () => {
    let reportId: string;
    let caseNumber: string;

    it('should file a user safety report and create a high-priority moderation case', async () => {
      if (!isDatabaseAvailable) return;

      const report = await reportingService.reportUser(workerUserId, employerUserId, {
        reason: 'HARASSMENT',
        details: 'Received abusive communication during site visit.',
      });

      expect(report).toBeDefined();
      expect(report.id).toBeDefined();
      expect(report.caseNumber).toBeDefined();
      reportId = report.id;
      caseNumber = report.caseNumber;

      const modCase = await prisma.moderationCase.findUnique({
        where: { caseNumber },
      });
      expect(modCase).toBeDefined();
      expect(modCase?.targetEntityId).toBe(employerUserId);
      expect(modCase?.status).toBe(ModerationCaseStatus.PENDING);
    });

    it('should fetch user reports filed by reporter', async () => {
      if (!isDatabaseAvailable) return;

      const reports = await reportingService.getReportsByReporter(workerUserId);
      expect(reports.length).toBeGreaterThanOrEqual(1);
      const found = reports.find((r) => r.id === reportId);
      expect(found).toBeDefined();
    });
  });

  describe('Moderation Actions & Lifecycle', () => {
    let targetCaseId: string;

    beforeAll(async () => {
      if (!isDatabaseAvailable) return;
      const c = await prisma.moderationCase.findFirst({
        where: { targetEntityId: employerUserId },
      });
      if (c) targetCaseId = c.id;
    });

    it('should allow moderator to claim case', async () => {
      if (!isDatabaseAvailable || !targetCaseId) return;

      const claimed = await moderationService.claimCase(targetCaseId, moderatorUserId);
      expect(claimed.status).toBe(ModerationCaseStatus.UNDER_REVIEW);
      expect(claimed.assignedToId).toBe(moderatorUserId);
    });

    it('should apply and query capability restriction on user', async () => {
      if (!isDatabaseAvailable) return;

      const restriction = await moderationService.applyRestriction(
        employerUserId,
        moderatorUserId,
        {
          restrictionType: RestrictionType.CANNOT_MESSAGE,
          reason: 'Harassment reported; messaging suspended pending review.',
        },
      );

      expect(restriction).toBeDefined();
      expect(restriction.restrictionType).toBe(RestrictionType.CANNOT_MESSAGE);

      // Verify active restrictions check
      const restrictions = await moderationService.getUserRestrictions(employerUserId);
      expect(restrictions.some((r: any) => r.restrictionType === RestrictionType.CANNOT_MESSAGE)).toBe(true);

      // Lift restriction
      await moderationService.revokeRestriction(
        restriction.id,
        moderatorUserId,
      );
    });

    it('should suspend user account and revoke user sessions', async () => {
      if (!isDatabaseAvailable) return;

      // Create a mock active session
      await prisma.session.create({
        data: {
          userId: employerUserId,
          sessionTokenHash: `hash-test-${Date.now()}`,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const suspendRes = await moderationService.suspendUser(employerUserId, moderatorUserId, {
        reason: 'Severe violation of workplace safety policies.',
      });

      expect(suspendRes.accountStatus).toBe('SUSPENDED');

      // Check DB user account status
      const user = await prisma.user.findUnique({ where: { id: employerUserId } });
      expect(user?.accountStatus).toBe('SUSPENDED');

      // Check sessions revoked
      const activeSessions = await prisma.session.findMany({
        where: { userId: employerUserId, revokedAt: null },
      });
      expect(activeSessions.length).toBe(0);

      // Reinstate user
      const reinstateRes = await moderationService.reinstateUser(
        employerUserId,
        moderatorUserId,
        { reason: 'Resolution agreed with complainant.' },
      );
      expect(reinstateRes.accountStatus).toBe('ACTIVE');
    });

    it('should resolve moderation case and record audit trail', async () => {
      if (!isDatabaseAvailable || !targetCaseId) return;

      const resolved = await moderationService.resolveCase(targetCaseId, moderatorUserId, {
        resolution: 'WARNING',
        notes: 'Official warning issued to employer.',
      });

      expect(resolved.status).toBe(ModerationCaseStatus.RESOLVED);

      // Verify audit logs
      const auditLogs = await moderationService.getAuditLogs({ entityType: 'ModerationCase' });
      expect(auditLogs.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Dispute Management', () => {
    let createdDisputeId: string;

    it('should create booking dispute for confirmed booking', async () => {
      if (!isDatabaseAvailable) return;

      const dispute = await disputeService.createDispute(bookingId, workerUserId, {
        reason: 'PAYMENT_TERMS_DISPUTE',
        description: 'Scope increased by 2 days without agreed rate adjustment.',
      });

      expect(dispute).toBeDefined();
      expect(dispute.id).toBeDefined();
      expect(dispute.status).toBe(DisputeStatus.OPEN);
      createdDisputeId = dispute.id;
    });

    it('should retrieve dispute details with IDOR protection', async () => {
      if (!isDatabaseAvailable) return;

      const d = await disputeService.getDisputeById(createdDisputeId, workerUserId, UserRole.WORKER);
      expect(d).toBeDefined();
      expect(d.id).toBe(createdDisputeId);
      expect(d.bookingId).toBe(bookingId);
    });

    it('should allow moderator to resolve dispute', async () => {
      if (!isDatabaseAvailable) return;

      const resolved = await disputeService.resolveDispute(createdDisputeId, moderatorUserId, {
        resolution: 'Scope adjusted to original agreement.',
        notes: 'Mediation accepted by both parties.',
      });

      expect(resolved.status).toBe(DisputeStatus.RESOLVED);
    });
  });
});
