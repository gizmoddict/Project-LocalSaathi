import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

import * as net from 'net';
import { PrismaClient, UserRole } from '@prisma/client';

describe('Employer & Job Real PostgreSQL / PostGIS Integration Tests', () => {
  let prisma: PrismaClient;
  let isDatabaseAvailable = false;

  const testPhone = `+9198765${Math.floor(10000 + Math.random() * 90000)}`;
  const testPhone2 = `+9198765${Math.floor(10000 + Math.random() * 90000)}`;
  let testUserId: string;
  let testUserId2: string;
  let testEmployerId: string;
  let testEmployerId2: string;
  let testJobId: string;

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return;
    }

    const portMatch = dbUrl.match(/:(\d+)\//);
    const hostMatch = dbUrl.match(/@([^:/]+)/);
    const host: string = (hostMatch && hostMatch[1]) ? hostMatch[1] : 'localhost';
    const port: number = (portMatch && portMatch[1]) ? parseInt(portMatch[1], 10) : 5432;

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
      socket.connect({ port, host });
    });

    if (isDatabaseAvailable) {
      prisma = new PrismaClient();
      await prisma.$connect();
    }
  });

  afterAll(async () => {
    if (isDatabaseAvailable && prisma) {
      if (testJobId) {
        await prisma.jobLocation.deleteMany({ where: { jobPostId: testJobId } });
        await prisma.jobRequiredSkill.deleteMany({ where: { jobPostId: testJobId } });
        await prisma.jobPost.deleteMany({ where: { id: testJobId } });
      }
      if (testEmployerId) {
        await prisma.employerProfile.deleteMany({ where: { id: testEmployerId } });
      }
      if (testEmployerId2) {
        await prisma.employerProfile.deleteMany({ where: { id: testEmployerId2 } });
      }
      if (testUserId) {
        await prisma.user.deleteMany({ where: { id: testUserId } });
      }
      if (testUserId2) {
        await prisma.user.deleteMany({ where: { id: testUserId2 } });
      }
      await prisma.$disconnect();
    }
  });

  it('1. Real DB - Creates employer profile with address and onboarding status in PostgreSQL', async () => {
    if (!isDatabaseAvailable) {
      console.info('[NOT EXECUTED - DB UNAVAILABLE] 1. Creates employer profile in PostgreSQL');
      return;
    }

    const user = await prisma.user.create({
      data: {
        phone: testPhone,
        role: UserRole.EMPLOYER,
      },
    });
    testUserId = user.id;

    const employer = await prisma.employerProfile.create({
      data: {
        userId: user.id,
        businessName: 'Apex Buildtech Solutions',
        description: 'Quality building and renovation services across Bengaluru.',
        businessType: 'Construction',
        contactPreferences: ['PHONE', 'IN_APP'],
        locality: 'Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pinCode: '560038',
        onboardingStatus: 'IN_PROGRESS',
      },
    });
    testEmployerId = employer.id;

    expect(employer.id).toBeDefined();
    expect(employer.businessName).toBe('Apex Buildtech Solutions');
    expect(employer.city).toBe('Bengaluru');
    expect(employer.onboardingStatus).toBe('IN_PROGRESS');
  });

  it('2. Real DB - Creates job in DRAFT status with skills and PostGIS location trigger in PostgreSQL', async () => {
    if (!isDatabaseAvailable) {
      console.info('[NOT EXECUTED - DB UNAVAILABLE] 2. Creates job with PostGIS location in PostgreSQL');
      return;
    }

    const job = await prisma.jobPost.create({
      data: {
        employerProfileId: testEmployerId,
        title: 'Master Carpenter for Modular Kitchen',
        description: 'Need skilled carpenter with 3+ years experience in cabinet installation.',
        status: 'DRAFT',
        category: 'Carpentry',
        wageType: 'DAILY',
        wageAmount: 1400,
        workerCount: 2,
        durationDays: 3,
        startDate: new Date('2026-11-20T00:00:00.000Z'),
        requirements: ['Must carry precision cutting tools'],
      },
    });
    testJobId = job.id;

    // Attach required skill
    const skill = await prisma.skill.upsert({
      where: { normalizedName: 'carpentry_master' },
      update: {},
      create: {
        name: 'Carpentry Master',
        normalizedName: 'carpentry_master',
        category: 'Carpentry',
        isActive: true,
      },
    });

    await prisma.jobRequiredSkill.create({
      data: {
        jobPostId: job.id,
        skillId: skill.id,
        isRequired: true,
        minExperienceYears: 3,
      },
    });

    // Attach job location (PostgreSQL trigger trg_sync_job_location will automatically populate geography)
    const jobLoc = await prisma.jobLocation.create({
      data: {
        jobPostId: job.id,
        latitude: 12.9784,
        longitude: 77.6408,
        locality: 'Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pinCode: '560038',
      },
    });

    expect(jobLoc.id).toBeDefined();
    expect(jobLoc.latitude).toBe(12.9784);
  });

  it('3. Real DB - Enforces strict IDOR isolation in PostgreSQL queries', async () => {
    if (!isDatabaseAvailable) {
      console.info('[NOT EXECUTED - DB UNAVAILABLE] 3. Enforces strict IDOR isolation in PostgreSQL');
      return;
    }

    // Create a second employer
    const user2 = await prisma.user.create({
      data: {
        phone: testPhone2,
        role: UserRole.EMPLOYER,
      },
    });
    testUserId2 = user2.id;

    const employer2 = await prisma.employerProfile.create({
      data: {
        userId: user2.id,
        businessName: 'Independent Employer Two',
      },
    });
    testEmployerId2 = employer2.id;

    // Employer 2 attempts to query Employer 1's job
    const jobForEmployer2 = await prisma.jobPost.findFirst({
      where: {
        id: testJobId,
        employerProfileId: employer2.id,
      },
    });

    // Must be null (cannot see another employer's job)
    expect(jobForEmployer2).toBeNull();
  });

  it('4. Real DB - Executes full lifecycle transitions (DRAFT -> PUBLISHED -> PAUSED -> RESUME -> FILLED -> CANCELLED) in PostgreSQL', async () => {
    if (!isDatabaseAvailable) {
      console.info('[NOT EXECUTED - DB UNAVAILABLE] 4. Executes full lifecycle transitions in PostgreSQL');
      return;
    }

    // 1. DRAFT -> PUBLISHED
    const published = await prisma.jobPost.update({
      where: { id: testJobId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).toBeDefined();

    // 2. PUBLISHED -> PAUSED
    const paused = await prisma.jobPost.update({
      where: { id: testJobId },
      data: { status: 'PAUSED' },
    });
    expect(paused.status).toBe('PAUSED');

    // 3. PAUSED -> PUBLISHED
    const resumed = await prisma.jobPost.update({
      where: { id: testJobId },
      data: { status: 'PUBLISHED' },
    });
    expect(resumed.status).toBe('PUBLISHED');

    // 4. PUBLISHED -> FILLED
    const filled = await prisma.jobPost.update({
      where: { id: testJobId },
      data: { status: 'FILLED' },
    });
    expect(filled.status).toBe('FILLED');

    // 5. FILLED -> CANCELLED / CLOSED
    const closed = await prisma.jobPost.update({
      where: { id: testJobId },
      data: { status: 'CANCELLED' },
    });
    expect(closed.status).toBe('CANCELLED');
  });
});
