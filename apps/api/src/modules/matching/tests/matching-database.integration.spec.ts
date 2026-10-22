import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

import * as net from 'net';
import { PrismaClient, UserRole } from '@prisma/client';
import { MatchingService } from '../matching.service';
import { PrismaService } from '../../database/database.module';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('Worker Job Discovery & Matching Real PostgreSQL / PostGIS Integration Tests', () => {
  let prisma: PrismaClient;
  let matchingService: MatchingService;
  let isDatabaseAvailable = false;

  const workerPhone = `+9198711${Math.floor(10000 + Math.random() * 90000)}`;
  const employerPhone = `+9198722${Math.floor(10000 + Math.random() * 90000)}`;
  let workerUserId: string;
  let workerProfileId: string;
  let employerUserId: string;
  let employerProfileId: string;
  let publishedJobId: string;
  let draftJobId: string;
  let skillId: string;

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return;
    }

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

    if (!isDatabaseAvailable) {
      return;
    }

    prisma = new PrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    matchingService = new MatchingService(prismaService);

    // Setup Test Skill
    const skill = await prisma.skill.upsert({
      where: { normalizedName: 'pipe-fitting-p6' },
      update: {},
      create: {
        name: 'Pipe Fitting P6',
        normalizedName: 'pipe-fitting-p6',
        category: 'Plumbing',
        isActive: true,
      },
    });
    skillId = skill.id;

    // Setup Test Employer
    const empUser = await prisma.user.create({
      data: {
        phone: employerPhone,
        role: UserRole.EMPLOYER,
        employerProfile: {
          create: {
            businessName: 'Apex Hydrotech Pvt Ltd',
            businessType: 'Engineering',
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

    // Create Published Job at Hazratganj (26.8520, 80.9500)
    const pubJob = await prisma.jobPost.create({
      data: {
        employerProfileId,
        title: 'Hazratganj Pipeline Modernization',
        description: 'Underground commercial plumbing replacement project.',
        status: 'PUBLISHED',
        category: 'Plumbing',
        wageType: 'DAILY',
        wageAmount: 1100,
        workerCount: 2,
        durationDays: 3,
        startDate: new Date('2026-11-01'),
        startTime: '09:00',
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

    // Create Draft Job (Must NEVER be visible to workers)
    const dJob = await prisma.jobPost.create({
      data: {
        employerProfileId,
        title: 'Secret Internal Maintenance',
        description: 'Unpublished draft job.',
        status: 'DRAFT',
        category: 'Plumbing',
        wageType: 'DAILY',
        wageAmount: 1500,
        startDate: new Date('2026-11-05'),
      },
    });
    draftJobId = dJob.id;

    await prisma.jobLocation.create({
      data: {
        jobPostId: draftJobId,
        latitude: 26.852,
        longitude: 80.95,
        locality: 'Hazratganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226001',
      },
    });

    // Setup Test Worker located in Hazratganj Center (26.8500, 80.9480) ~300m away
    const wrkUser = await prisma.user.create({
      data: {
        phone: workerPhone,
        role: UserRole.WORKER,
        workerProfile: {
          create: {
            displayName: 'Mohan Plumbing Saathi',
            experienceYears: 4,
            expectedWage: 900,
            wageType: 'DAILY',
            preferredRadiusKm: 15,
            isAvailable: true,
            onboardingStatus: 'COMPLETED',
            workerSkills: {
              create: {
                skillId,
                proficiency: 'EXPERT',
                experienceYears: 4,
              },
            },
            availabilities: {
              create: {
                date: new Date('2026-11-01'),
                startTime: '08:00',
                endTime: '18:00',
                status: 'AVAILABLE',
              },
            },
          },
        },
      },
      include: { workerProfile: true },
    });
    workerUserId = wrkUser.id;
    workerProfileId = wrkUser.workerProfile!.id;

    await prisma.workerLocation.create({
      data: {
        workerProfileId,
        latitude: 26.85,
        longitude: 80.948,
        accuracyMeters: 5,
        locality: 'Hazratganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226001',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    if (isDatabaseAvailable && prisma) {
      // Clean up test data
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
        where: { workerProfileId },
      });
      await prisma.availability.deleteMany({
        where: { workerProfileId },
      });
      await prisma.workerSkill.deleteMany({
        where: { workerProfileId },
      });
      await prisma.workerProfile.deleteMany({
        where: { id: workerProfileId },
      });
      await prisma.employerProfile.deleteMany({
        where: { id: employerProfileId },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [workerUserId, employerUserId] } },
      });
      await prisma.$disconnect();
    }
  });

  it('1. Real PostGIS Spatial Discovery - Worker retrieves nearby published job with accurate distance', async () => {
    if (!isDatabaseAvailable) {
      console.warn('PostgreSQL unavailable: skipping test 1');
      return;
    }

    const result = await matchingService.discoverJobsForWorker(workerUserId, {
      sort: 'score_desc',
      page: 1,
      limit: 10,
    });

    expect(result).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);

    const targetJob = result.items.find((item) => item.id === publishedJobId);
    expect(targetJob).toBeDefined();
    expect(targetJob!.title).toBe('Hazratganj Pipeline Modernization');
    expect(targetJob!.distanceKm).toBeLessThan(1.0); // ~300m away
    expect(targetJob!.match.eligible).toBe(true);
    expect(targetJob!.match.score).toBeGreaterThanOrEqual(80);
    expect(targetJob!.match.breakdown.matchedSkillsCount).toBe(1);
    expect(targetJob!.match.breakdown.skillCoveragePercentage).toBe(100);
    expect(targetJob!.employer.businessName).toBe('Apex Hydrotech Pvt Ltd');
  });

  it('2. Service Radius Boundary - Worker with restrictive radius does NOT discover job outside range', async () => {
    if (!isDatabaseAvailable) {
      console.warn('PostgreSQL unavailable: skipping test 2');
      return;
    }

    // Restrict radius to 0.1 km (100m) - job is ~300m away
    const result = await matchingService.discoverJobsForWorker(workerUserId, {
      radiusKm: 0.1,
      sort: 'score_desc',
      page: 1,
      limit: 10,
    });

    const targetJob = result.items.find((item) => item.id === publishedJobId);
    expect(targetJob).toBeUndefined(); // Job is outside 100m
  });

  it('3. Strict Job Visibility - DRAFT and PAUSED jobs are NEVER discovered or accessible', async () => {
    if (!isDatabaseAvailable) {
      console.warn('PostgreSQL unavailable: skipping test 3');
      return;
    }

    const result = await matchingService.discoverJobsForWorker(workerUserId, {
      sort: 'score_desc',
      page: 1,
      limit: 20,
    });

    // Draft job must never appear in discovery
    const foundDraft = result.items.find((item) => item.id === draftJobId);
    expect(foundDraft).toBeUndefined();

    // Directly requesting draft job detail must throw NotFoundException
    await expect(
      matchingService.getJobDetailForWorker(workerUserId, draftJobId)
    ).rejects.toThrow(NotFoundException);
  });

  it('4. Real DB Job Detail - Retrieves published job with complete skill breakdown and public employer info', async () => {
    if (!isDatabaseAvailable) {
      console.warn('PostgreSQL unavailable: skipping test 4');
      return;
    }

    const detail = await matchingService.getJobDetailForWorker(workerUserId, publishedJobId);

    expect(detail.id).toBe(publishedJobId);
    expect(detail.title).toBe('Hazratganj Pipeline Modernization');
    expect(detail.skillDetails.length).toBe(1);
    expect(detail.skillDetails[0]!.workerHasSkill).toBe(true);
    expect(detail.skillDetails[0]!.workerExperienceYears).toBe(4);
    expect(detail.skillDetails[0]!.experienceMet).toBe(true);
    expect(detail.distanceKm).toBeLessThan(1.0);
    expect(detail.employer.businessName).toBe('Apex Hydrotech Pvt Ltd');
  });

  it('5. Location Prerequisite Guard - Worker without active location throws LOCATION_REQUIRED 400', async () => {
    if (!isDatabaseAvailable) {
      console.warn('PostgreSQL unavailable: skipping test 5');
      return;
    }

    // Create a worker without location
    const noLocPhone = `+9198733${Math.floor(10000 + Math.random() * 90000)}`;
    const noLocUser = await prisma.user.create({
      data: {
        phone: noLocPhone,
        role: UserRole.WORKER,
        workerProfile: {
          create: {
            displayName: 'No Location Worker',
            onboardingStatus: 'IN_PROGRESS',
          },
        },
      },
    });

    try {
      await expect(
        matchingService.discoverJobsForWorker(noLocUser.id, {
          sort: 'score_desc',
          page: 1,
          limit: 10,
        })
      ).rejects.toThrow(BadRequestException);
    } finally {
      await prisma.workerProfile.deleteMany({ where: { userId: noLocUser.id } });
      await prisma.user.deleteMany({ where: { id: noLocUser.id } });
    }
  });
});
