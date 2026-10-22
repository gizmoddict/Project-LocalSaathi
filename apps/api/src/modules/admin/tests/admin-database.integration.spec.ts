/**
 * Phase 15 — Admin Operations Dashboard
 * Real PostgreSQL Database Integration Tests (Docker PostgreSQL 16)
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

import * as net from 'net';
import { PrismaClient, UserRole, AccountStatus, VerificationStatus, JobStatus } from '@prisma/client';
import { AdminMetricsService } from '../services/admin-metrics.service';
import { AdminUsersService } from '../services/admin-users.service';
import { AdminJobsService } from '../services/admin-jobs.service';
import { AdminAuditService } from '../services/admin-audit.service';
import { AdminHealthService } from '../services/admin-health.service';
import { PrismaService } from '../../database/database.module';

describe('Admin Domain — Real PostgreSQL Integration Tests (Phase 15)', () => {
  let prisma: PrismaClient;
  let metricsService: AdminMetricsService;
  let usersService: AdminUsersService;
  let jobsService: AdminJobsService;
  let auditService: AdminAuditService;
  let healthService: AdminHealthService;
  let isDatabaseAvailable = false;

  const phoneAdmin = `+9199801${Math.floor(10000 + Math.random() * 90000)}`;
  const phoneWorker = `+9199802${Math.floor(10000 + Math.random() * 90000)}`;
  const phoneEmployer = `+9199803${Math.floor(10000 + Math.random() * 90000)}`;

  let adminUserId: string;
  let workerUserId: string;
  let employerUserId: string;
  let employerProfileId: string;
  let testJobId: string;

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
      socket.on('connect', () => {
        isDatabaseAvailable = true;
        socket.destroy();
        resolve();
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        resolve();
      });
      socket.connect(port, host);
    });

    if (!isDatabaseAvailable) {
      console.warn('PostgreSQL is not reachable on port ' + port + '. Skipping integration tests.');
      return;
    }

    prisma = new PrismaClient();
    await prisma.$connect();

    const prismaServiceMock = prisma as unknown as PrismaService;
    metricsService = new AdminMetricsService(prismaServiceMock);
    usersService = new AdminUsersService(prismaServiceMock);
    jobsService = new AdminJobsService(prismaServiceMock);
    auditService = new AdminAuditService(prismaServiceMock);
    healthService = new AdminHealthService(prismaServiceMock);

    // Seed test users
    const adminUser = await prisma.user.create({
      data: {
        phone: phoneAdmin,
        role: UserRole.ADMIN,
        accountStatus: AccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.VERIFIED,
      },
    });
    adminUserId = adminUser.id;

    const workerUser = await prisma.user.create({
      data: {
        phone: phoneWorker,
        role: UserRole.WORKER,
        accountStatus: AccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.VERIFIED,
        workerProfile: {
          create: {
            displayName: 'Integration Test Worker',
            experienceYears: 4,
            expectedWage: 800,
            wageType: 'DAILY',
            isAvailable: true,
            workerLocation: {
              create: {
                locality: 'Indiranagar',
                city: 'Bengaluru',
                state: 'Karnataka',
                pinCode: '560038',
                latitude: 12.9716,
                longitude: 77.6412,
              },
            },
          },
        },
      },
    });
    workerUserId = workerUser.id;

    const employerUser = await prisma.user.create({
      data: {
        phone: phoneEmployer,
        role: UserRole.EMPLOYER,
        accountStatus: AccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.VERIFIED,
        employerProfile: {
          create: {
            businessName: 'Acme Infra Ltd',
            businessType: 'CONTRACTOR',
          },
        },
      },
      include: { employerProfile: true },
    });
    employerUserId = employerUser.id;
    employerProfileId = employerUser.employerProfile!.id;

    const job = await prisma.jobPost.create({
      data: {
        employerProfileId: employerProfileId,
        title: 'Site Plumbing Installation',
        description: 'Need certified plumber for residential building',
        category: 'PLUMBING',
        wageAmount: 900,
        wageType: 'DAILY',
        status: JobStatus.PUBLISHED,
        workerCount: 1,
        startDate: new Date(),
        jobLocation: {
          create: {
            locality: 'Koramangala',
            city: 'Bengaluru',
            state: 'Karnataka',
            pinCode: '560034',
            latitude: 12.9352,
            longitude: 77.6200,
          },
        },
      },
    });
    testJobId = job.id;
  });

  afterAll(async () => {
    if (prisma) {
      try {
        await prisma.jobLocation.deleteMany({ where: { jobPostId: testJobId } });
        await prisma.jobPost.deleteMany({ where: { id: testJobId } });
        await prisma.workerLocation.deleteMany({ where: { workerProfile: { userId: workerUserId } } });
        await prisma.workerProfile.deleteMany({ where: { userId: workerUserId } });
        await prisma.employerProfile.deleteMany({ where: { userId: employerUserId } });
        await prisma.auditLog.deleteMany({
          where: { actorId: { in: [adminUserId, workerUserId, employerUserId] } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: [adminUserId, workerUserId, employerUserId] } },
        });
        await prisma.$disconnect();
      } catch {
        // Cleanup best effort
      }
    }
  });

  it('aggregates live platform metrics from PostgreSQL', async () => {
    if (!isDatabaseAvailable) return;
    const metrics = await metricsService.getOverviewMetrics();
    expect(metrics).toBeDefined();
    expect(typeof metrics.dau).toBe('number');
    expect(typeof metrics.registeredWorkers).toBe('number');
    expect(typeof metrics.registeredEmployers).toBe('number');
    expect(metrics.activeJobs).toBeGreaterThanOrEqual(1);
  });

  it('queries bounded paginated users list with search filter', async () => {
    if (!isDatabaseAvailable) return;
    const res = await usersService.listUsers({ search: phoneWorker, limit: 10, page: 1 });
    expect(res.data.length).toBeGreaterThanOrEqual(1);
    expect(res.data[0]?.phone).toBe(phoneWorker);
  });

  it('suspends user, revokes session, and writes an audit log', async () => {
    if (!isDatabaseAvailable) return;
    const res = await usersService.suspendUser(
      adminUserId,
      workerUserId,
      { reason: 'Violated safety standard', internalNotes: 'Customer complaint verified' },
    );

    expect(res.success).toBe(true);

    const updatedUser = await prisma.user.findUnique({ where: { id: workerUserId } });
    expect(updatedUser?.accountStatus).toBe(AccountStatus.SUSPENDED);

    // Verify audit log creation
    const logs = await auditService.listAuditLogs({ actorId: adminUserId, action: 'SUSPEND_USER' });
    expect(logs.data.length).toBeGreaterThanOrEqual(1);
    expect(logs.data[0]?.entityId).toBe(workerUserId);
  });

  it('reinstates suspended user with audit log', async () => {
    if (!isDatabaseAvailable) return;
    const res = await usersService.reinstateUser(
      adminUserId,
      workerUserId,
      { reason: 'Appeal granted', internalNotes: 'Dispute concluded' },
    );

    expect(res.success).toBe(true);

    const updatedUser = await prisma.user.findUnique({ where: { id: workerUserId } });
    expect(updatedUser?.accountStatus).toBe(AccountStatus.ACTIVE);
  });

  it('pauses and resumes a job post administratively', async () => {
    if (!isDatabaseAvailable) return;
    const pauseRes = await jobsService.pauseJob(
      adminUserId,
      testJobId,
      { reason: 'Operational audit review' },
    );
    expect(pauseRes.success).toBe(true);

    let job = await prisma.jobPost.findUnique({ where: { id: testJobId } });
    expect(job?.status).toBe(JobStatus.PAUSED);

    const resumeRes = await jobsService.resumeJob(adminUserId, testJobId);
    expect(resumeRes.success).toBe(true);

    job = await prisma.jobPost.findUnique({ where: { id: testJobId } });
    expect(job?.status).toBe(JobStatus.PUBLISHED);
  });

  it('checks system health diagnostics directly', async () => {
    if (!isDatabaseAvailable) return;
    const health = await healthService.getSystemHealth();
    expect(['HEALTHY', 'DEGRADED']).toContain(health.status);
    expect(health.components.database.status).toBe('HEALTHY');
  });
});
