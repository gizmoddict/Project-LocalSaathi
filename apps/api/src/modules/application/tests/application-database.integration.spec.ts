import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

import * as net from 'net';
import { PrismaClient, UserRole } from '@prisma/client';
import { ApplicationService } from '../application.service';
import { DomainEventService } from '../../notification/domain-event.service';
import { PrismaService } from '../../database/database.module';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus } from '@localsaathi/types';

describe('Application Domain Real PostgreSQL / PostGIS Integration Tests', () => {
  let prisma: PrismaClient;
  let applicationService: ApplicationService;
  let isDatabaseAvailable = false;

  const employerPhone = `+9198311${Math.floor(10000 + Math.random() * 90000)}`;
  const otherEmployerPhone = `+9198322${Math.floor(10000 + Math.random() * 90000)}`;
  const workerAPhone = `+9198333${Math.floor(10000 + Math.random() * 90000)}`;
  const workerBPhone = `+9198344${Math.floor(10000 + Math.random() * 90000)}`;

  let employerUserId: string;
  let employerProfileId: string;
  let otherEmployerUserId: string;
  let otherEmployerProfileId: string;
  let workerAUserId: string;
  let workerAProfileId: string;
  let workerBUserId: string;
  let workerBProfileId: string;

  let publishedJobId: string;
  let draftJobId: string;
  let skillId: string;

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
      socket.once('timeout', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        resolve();
      });
      socket.connect(port, host);
    });

    if (!isDatabaseAvailable) return;

    prisma = new PrismaClient();
    const domainEventService = new DomainEventService(prisma as unknown as PrismaService);
    applicationService = new ApplicationService(prisma as unknown as PrismaService, domainEventService);

    // Setup Test Skill
    const skill = await prisma.skill.upsert({
      where: { normalizedName: 'pipe-insulation-p7' },
      update: {},
      create: {
        name: 'Pipe Insulation P7',
        normalizedName: 'pipe-insulation-p7',
        category: 'Plumbing',
        isActive: true,
      },
    });
    skillId = skill.id;

    // Setup Test Employer A
    const empUser = await prisma.user.create({
      data: {
        phone: employerPhone,
        role: UserRole.EMPLOYER,
        employerProfile: {
          create: {
            businessName: 'Hazratganj Thermal Services',
            businessType: 'Contractor',
            locality: 'Hazratganj',
            city: 'Lucknow',
            state: 'Uttar Pradesh',
            pinCode: '226001',
            onboardingStatus: 'COMPLETED',
          },
        },
      },
      include: { employerProfile: true },
    });
    employerUserId = empUser.id;
    employerProfileId = empUser.employerProfile!.id;

    // Setup Test Employer B (for IDOR testing)
    const otherEmpUser = await prisma.user.create({
      data: {
        phone: otherEmployerPhone,
        role: UserRole.EMPLOYER,
        employerProfile: {
          create: {
            businessName: 'Aliganj Infra Solutions',
            businessType: 'Contractor',
            locality: 'Aliganj',
            city: 'Lucknow',
            state: 'Uttar Pradesh',
            pinCode: '226024',
            onboardingStatus: 'COMPLETED',
          },
        },
      },
      include: { employerProfile: true },
    });
    otherEmployerUserId = otherEmpUser.id;
    otherEmployerProfileId = otherEmpUser.employerProfile!.id;

    // Create Published Job under Employer A
    const pubJob = await prisma.jobPost.create({
      data: {
        employerProfileId,
        title: 'Thermal Insulation Overhaul',
        description: 'Commercial boiler piping insulation and heat loss sealing.',
        status: 'PUBLISHED',
        category: 'Plumbing',
        wageType: 'DAILY',
        wageAmount: 1400,
        workerCount: 2,
        durationDays: 4,
        startDate: new Date('2026-11-20'),
        publishedAt: new Date(),
        jobRequiredSkills: {
          create: {
            skillId,
            isRequired: true,
            minExperienceYears: 2,
          },
        },
      },
    });
    publishedJobId = pubJob.id;

    await prisma.jobLocation.create({
      data: {
        jobPostId: publishedJobId,
        latitude: 26.852,
        longitude: 80.95,
        locality: 'Hazratganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226001',
      },
    });

    // Create Draft Job under Employer A (Workers must not apply)
    const dJob = await prisma.jobPost.create({
      data: {
        employerProfileId,
        title: 'Future Draft Project',
        description: 'Unpublished draft job.',
        status: 'DRAFT',
        category: 'Plumbing',
        wageType: 'DAILY',
        wageAmount: 1000,
        startDate: new Date('2026-12-01'),
      },
    });
    draftJobId = dJob.id;

    // Setup Test Worker A
    const wrkUserA = await prisma.user.create({
      data: {
        phone: workerAPhone,
        role: UserRole.WORKER,
        workerProfile: {
          create: {
            displayName: 'Ravi Kumar Saathi',
            experienceYears: 5,
            expectedWage: 1200,
            wageType: 'DAILY',
            preferredRadiusKm: 20,
            isAvailable: true,
            onboardingStatus: 'COMPLETED',
            workerSkills: {
              create: {
                skillId,
                proficiency: 'EXPERT',
                experienceYears: 5,
              },
            },
          },
        },
      },
      include: { workerProfile: true },
    });
    workerAUserId = wrkUserA.id;
    workerAProfileId = wrkUserA.workerProfile!.id;

    await prisma.workerLocation.create({
      data: {
        workerProfileId: workerAProfileId,
        latitude: 26.85,
        longitude: 80.948,
        accuracyMeters: 5,
        locality: 'Hazratganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226001',
      },
    });

    // Setup Test Worker B (for IDOR testing)
    const wrkUserB = await prisma.user.create({
      data: {
        phone: workerBPhone,
        role: UserRole.WORKER,
        workerProfile: {
          create: {
            displayName: 'Amit Verma Saathi',
            experienceYears: 3,
            expectedWage: 1100,
            wageType: 'DAILY',
            preferredRadiusKm: 15,
            isAvailable: true,
            onboardingStatus: 'COMPLETED',
          },
        },
      },
      include: { workerProfile: true },
    });
    workerBUserId = wrkUserB.id;
    workerBProfileId = wrkUserB.workerProfile!.id;
  });

  afterAll(async () => {
    if (isDatabaseAvailable && prisma) {
      await prisma.jobApplication.deleteMany({
        where: { jobPostId: { in: [publishedJobId, draftJobId] } },
      });
      await prisma.jobLocation.deleteMany({
        where: { jobPostId: { in: [publishedJobId, draftJobId] } },
      });
      await prisma.jobRequiredSkill.deleteMany({
        where: { jobPostId: { in: [publishedJobId, draftJobId] } },
      });
      await prisma.jobPost.deleteMany({
        where: { id: { in: [publishedJobId, draftJobId] } },
      });
      await prisma.workerLocation.deleteMany({
        where: { workerProfileId: { in: [workerAProfileId, workerBProfileId] } },
      });
      await prisma.workerSkill.deleteMany({
        where: { workerProfileId: { in: [workerAProfileId, workerBProfileId] } },
      });
      await prisma.workerProfile.deleteMany({
        where: { id: { in: [workerAProfileId, workerBProfileId] } },
      });
      await prisma.employerProfile.deleteMany({
        where: { id: { in: [employerProfileId, otherEmployerProfileId] } },
      });
      await prisma.user.deleteMany({
        where: {
          id: { in: [workerAUserId, workerBUserId, employerUserId, otherEmployerUserId] },
        },
      });
      await prisma.$disconnect();
    }
  });

  it('1. Worker can successfully apply to a PUBLISHED job', async () => {
    if (!isDatabaseAvailable) return;

    const res = await applicationService.applyToJob(workerAUserId, publishedJobId, {
      message: 'Experienced pipe insulation tech available immediately.',
    });

    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
    expect(res.jobId).toBe(publishedJobId);
    expect(res.status).toBe(ApplicationStatus.APPLIED);
    expect(res.appliedAt).toBeDefined();

    // Verify in real database
    const dbApp = await prisma.jobApplication.findUnique({
      where: { id: res.id },
    });
    expect(dbApp).not.toBeNull();
    expect(dbApp!.applicationMessage).toBe(
      'Experienced pipe insulation tech available immediately.'
    );
  });

  it('2. Duplicate Application Protection - Rejects second application with 409 Conflict', async () => {
    if (!isDatabaseAvailable) return;

    await expect(
      applicationService.applyToJob(workerAUserId, publishedJobId, {
        message: 'Second attempt should fail.',
      })
    ).rejects.toThrow(ConflictException);
  });

  it('3. Job Status Protection - Rejects application to DRAFT job with 400 Bad Request', async () => {
    if (!isDatabaseAvailable) return;

    await expect(
      applicationService.applyToJob(workerBUserId, draftJobId, {
        message: 'Applying to draft job should fail.',
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('4. Worker Lists Applications - Retrieves submitted applications with match score', async () => {
    if (!isDatabaseAvailable) return;

    const list = await applicationService.getWorkerApplications(workerAUserId, {
      page: 1,
      limit: 10,
    });

    expect(list.items.length).toBeGreaterThanOrEqual(1);
    const target = list.items.find((item) => item.jobId === publishedJobId);
    expect(target).toBeDefined();
    expect(target!.status).toBe(ApplicationStatus.APPLIED);
    expect(target!.employerBusinessName).toBe('Hazratganj Thermal Services');
    expect(target!.matchScore).toBeGreaterThanOrEqual(80);
  });

  it('5. Worker Application Detail - Enforces IDOR protection', async () => {
    if (!isDatabaseAvailable) return;

    const app = await prisma.jobApplication.findFirst({
      where: { jobPostId: publishedJobId, workerProfileId: workerAProfileId },
    });
    expect(app).not.toBeNull();

    // Worker A can view own detail
    const detail = await applicationService.getWorkerApplicationDetail(workerAUserId, app!.id);
    expect(detail.id).toBe(app!.id);
    expect(detail.applicationMessage).toBe(
      'Experienced pipe insulation tech available immediately.'
    );
    expect(detail.matchReasons.length).toBeGreaterThan(0);

    // Worker B CANNOT view Worker A's application -> 404
    await expect(
      applicationService.getWorkerApplicationDetail(workerBUserId, app!.id)
    ).rejects.toThrow(NotFoundException);
  });

  it('6. Employer Lists Job Applications - With metrics and applicant matching info', async () => {
    if (!isDatabaseAvailable) return;

    const res = await applicationService.getEmployerJobApplications(
      employerUserId,
      publishedJobId,
      { sort: 'match_score_desc', page: 1, limit: 10 }
    );

    expect(res.items.length).toBeGreaterThanOrEqual(1);
    expect(res.metrics.total).toBeGreaterThanOrEqual(1);
    expect(res.metrics.pending).toBeGreaterThanOrEqual(1);

    const applicantItem = res.items.find(
      (item) => item.worker.workerId === workerAProfileId
    );
    expect(applicantItem).toBeDefined();
    expect(applicantItem!.worker.displayName).toBe('Ravi Kumar Saathi');
    expect(applicantItem!.worker.experienceYears).toBe(5);
    expect(applicantItem!.match.score).toBeGreaterThanOrEqual(80);
    expect(applicantItem!.distanceKm).toBeLessThan(1.0);
  });

  it('7. Employer IDOR Protection - Other employer cannot view applications for Employer A job', async () => {
    if (!isDatabaseAvailable) return;

    await expect(
      applicationService.getEmployerJobApplications(otherEmployerUserId, publishedJobId)
    ).rejects.toThrow(NotFoundException);
  });

  it('8. Employer FSM: Shortlist -> Accept (Valid Transition Chain)', async () => {
    if (!isDatabaseAvailable) return;

    const app = await prisma.jobApplication.findFirst({
      where: { jobPostId: publishedJobId, workerProfileId: workerAProfileId },
    });
    expect(app).not.toBeNull();

    // 8.1 Cannot ACCEPT directly from APPLIED
    await expect(
      applicationService.acceptApplication(employerUserId, app!.id)
    ).rejects.toThrow(BadRequestException);

    // 8.2 Shortlist APPLIED -> SHORTLISTED
    const shortlisted = await applicationService.shortlistApplication(employerUserId, app!.id);
    expect(shortlisted.status).toBe(ApplicationStatus.SHORTLISTED);
    expect(shortlisted.shortlistedAt).not.toBeNull();

    // 8.3 Accept SHORTLISTED -> ACCEPTED
    const accepted = await applicationService.acceptApplication(employerUserId, app!.id);
    expect(accepted.status).toBe(ApplicationStatus.ACCEPTED);
    expect(accepted.acceptedAt).not.toBeNull();

    // 8.4 Terminal state: cannot reject once ACCEPTED
    await expect(
      applicationService.rejectApplication(employerUserId, app!.id)
    ).rejects.toThrow(BadRequestException);
  });

  it('9. Worker Withdrawal from APPLIED / SHORTLISTED', async () => {
    if (!isDatabaseAvailable) return;

    // Worker B applies to published job
    const appB = await applicationService.applyToJob(workerBUserId, publishedJobId, {
      message: 'Worker B application to test withdrawal.',
    });
    expect(appB.status).toBe(ApplicationStatus.APPLIED);

    // Worker B withdraws application
    const withdrawn = await applicationService.withdrawApplication(workerBUserId, appB.id);
    expect(withdrawn.status).toBe(ApplicationStatus.WITHDRAWN);
    expect(withdrawn.withdrawnAt).not.toBeNull();

    // Cannot withdraw again (terminal state)
    await expect(
      applicationService.withdrawApplication(workerBUserId, appB.id)
    ).rejects.toThrow(BadRequestException);
  });
});
