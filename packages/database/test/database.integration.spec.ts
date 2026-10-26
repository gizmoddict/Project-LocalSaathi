import * as dotenv from 'dotenv';
import * as path from 'path';

// Ensure root .env is loaded
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import {
  PrismaClient,
  UserRole,
  WageType,
  JobStatus,
  JobUrgency,
  AvailabilityStatus,
  ApplicationStatus,
  PaymentStatus,
} from '@prisma/client';
import * as net from 'net';
import {
  findWorkersWithinRadius,
  findJobsWithinRadius,
  findWorkersWithSkillsNearJob,
  findAvailableWorkers,
  findRecentlyPostedJobs,
} from '../src/spatial.queries';

const shouldRunIntegrationTests =
  process.env.RUN_DB_INTEGRATION_TESTS === 'true' ||
  process.env.DATABASE_INTEGRATION_TESTS === 'true';

const integrationSuite = shouldRunIntegrationTests ? describe : describe.skip;

integrationSuite('LocalSaathi Real Database Integration Tests (Phase 2)', () => {
  let prisma: PrismaClient;
  let isDbAvailable = false;

  beforeAll(async () => {
    // Check if PostgreSQL port 5432 is physically listening
    const host = process.env.DB_HOST || 'localhost';
    const port = Number(process.env.DB_PORT) || 5432;

    isDbAvailable = await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      try {
        socket.connect(port, host);
      } catch {
        resolve(false);
      }
    });

    if (!isDbAvailable) {
      console.warn(
        `[WARN] PostgreSQL is not available on ${host}:${port}. Skipping live database integration tests unless RUN_DB_INTEGRATION_TESTS=true.`
      );
      return;
    }

    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('1. User Creation - persists with role, status, and UUID', async () => {
    const testPhone = `999${Math.floor(1000000 + Math.random() * 9000000)}`;
    const user = await prisma.user.create({
      data: {
        phone: testPhone,
        role: UserRole.WORKER,
      },
    });
    expect(user.id).toBeDefined();
    expect(user.phone).toBe(testPhone);
    expect(user.role).toBe(UserRole.WORKER);
    expect(user.accountStatus).toBe('ACTIVE');
  });

  it('2. Worker Profile - associates with user and verifies wage decimal', async () => {
    const user = await prisma.user.create({
      data: {
        phone: `998${Math.floor(1000000 + Math.random() * 9000000)}`,
        role: UserRole.WORKER,
        workerProfile: {
          create: {
            displayName: 'Amit Test Plumber',
            experienceYears: 4,
            expectedWage: 750.50,
            wageType: WageType.DAILY,
          },
        },
      },
      include: { workerProfile: true },
    });
    expect(user.workerProfile).toBeDefined();
    expect(Number(user.workerProfile?.expectedWage)).toBe(750.50);
    expect(user.workerProfile?.displayName).toBe('Amit Test Plumber');
  });

  it('3. Employer Profile - associates with user and verifies company fields', async () => {
    const user = await prisma.user.create({
      data: {
        phone: `997${Math.floor(1000000 + Math.random() * 9000000)}`,
        role: UserRole.EMPLOYER,
        employerProfile: {
          create: {
            businessName: 'Apex City Constructors',
            businessType: 'Contractor',
          },
        },
      },
      include: { employerProfile: true },
    });
    expect(user.employerProfile?.businessName).toBe('Apex City Constructors');
    expect(user.employerProfile?.businessType).toBe('Contractor');
  });

  it('4. Skills - creates skill with normalized lowercase slug', async () => {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const skill = await prisma.skill.create({
      data: {
        name: `Precision Tiling ${rand}`,
        normalizedName: `precision_tiling_${rand}`,
        category: 'Construction',
      },
    });
    expect(skill.id).toBeDefined();
    expect(skill.normalizedName).toBe(`precision_tiling_${rand}`);
  });

  it('5. Worker Skills - associates worker with unique skill and proficiency', async () => {
    const skill = await prisma.skill.create({
      data: {
        name: `Skill Test ${Date.now()}`,
        normalizedName: `skill_test_${Date.now()}`,
        category: 'Testing',
      },
    });
    const user = await prisma.user.create({
      data: {
        phone: `996${Math.floor(1000000 + Math.random() * 9000000)}`,
        role: UserRole.WORKER,
        workerProfile: {
          create: {
            displayName: 'Skilled Artisan',
            workerSkills: {
              create: {
                skillId: skill.id,
                proficiency: 'EXPERT',
                experienceYears: 6,
              },
            },
          },
        },
      },
      include: { workerProfile: { include: { workerSkills: true } } },
    });
    expect(user.workerProfile?.workerSkills[0]?.skillId).toBe(skill.id);
    expect(user.workerProfile?.workerSkills[0]?.proficiency).toBe('EXPERT');

    // Duplicate skill on same worker profile must fail
    await expect(
      prisma.workerSkill.create({
        data: {
          workerProfileId: user.workerProfile!.id,
          skillId: skill.id,
          proficiency: 'BEGINNER',
        },
      })
    ).rejects.toThrow();
  });

  it('6. Job Creation - creates job post with FSM status and urgency', async () => {
    const empUser = await prisma.user.create({
      data: {
        phone: `995${Math.floor(1000000 + Math.random() * 9000000)}`,
        role: UserRole.EMPLOYER,
        employerProfile: {
          create: { businessName: 'Quick Repairs Ltd' },
        },
      },
      include: { employerProfile: true },
    });

    const job = await prisma.jobPost.create({
      data: {
        employerProfileId: empUser.employerProfile!.id,
        title: 'Emergency Generator Fix',
        description: 'Need electrical technician immediately.',
        status: JobStatus.PUBLISHED,
        category: 'Electrical',
        wageType: WageType.DAILY,
        wageAmount: 1200.00,
        workerCount: 2,
        startDate: new Date(),
        urgency: JobUrgency.IMMEDIATE,
      },
    });

    expect(job.status).toBe(JobStatus.PUBLISHED);
    expect(Number(job.wageAmount)).toBe(1200.00);
    expect(job.urgency).toBe(JobUrgency.IMMEDIATE);
  });

  it('7. Required Job Skills - verifies relation and minimum experience', async () => {
    const skill = await prisma.skill.create({
      data: {
        name: `Skill Req ${Date.now()}`,
        normalizedName: `skill_req_${Date.now()}`,
        category: 'General',
      },
    });
    const empUser = await prisma.user.create({
      data: {
        phone: `994${Math.floor(1000000 + Math.random() * 9000000)}`,
        role: UserRole.EMPLOYER,
        employerProfile: { create: { businessName: 'Test Corp' } },
      },
      include: { employerProfile: true },
    });

    const job = await prisma.jobPost.create({
      data: {
        employerProfileId: empUser.employerProfile!.id,
        title: 'Test Job With Skill Requirements',
        description: 'Test description',
        category: 'General',
        wageType: WageType.DAILY,
        wageAmount: 600,
        startDate: new Date(),
        jobRequiredSkills: {
          create: {
            skillId: skill.id,
            isRequired: true,
            minExperienceYears: 2,
          },
        },
      },
      include: { jobRequiredSkills: true },
    });

    expect(job.jobRequiredSkills.length).toBe(1);
    expect(job.jobRequiredSkills[0]?.minExperienceYears).toBe(2);
    expect(job.jobRequiredSkills[0]?.isRequired).toBe(true);
  });

  it('8. Duplicate Application Prevention - enforces unique constraint', async () => {
    const emp = await prisma.user.create({
      data: {
        phone: `993${Math.floor(1000000 + Math.random() * 9000000)}`,
        employerProfile: { create: { businessName: 'App Employer' } },
      },
      include: { employerProfile: true },
    });
    const wkr = await prisma.user.create({
      data: {
        phone: `992${Math.floor(1000000 + Math.random() * 9000000)}`,
        workerProfile: { create: { displayName: 'Applicant Worker' } },
      },
      include: { workerProfile: true },
    });
    const job = await prisma.jobPost.create({
      data: {
        employerProfileId: emp.employerProfile!.id,
        title: 'Application Test Job',
        description: 'Test',
        category: 'Test',
        wageType: WageType.DAILY,
        wageAmount: 500,
        startDate: new Date(),
      },
    });

    // First application succeeds
    await prisma.jobApplication.create({
      data: {
        jobPostId: job.id,
        workerProfileId: wkr.workerProfile!.id,
        status: ApplicationStatus.APPLIED,
      },
    });

    // Duplicate application must reject with unique constraint violation
    await expect(
      prisma.jobApplication.create({
        data: {
          jobPostId: job.id,
          workerProfileId: wkr.workerProfile!.id,
          status: ApplicationStatus.APPLIED,
        },
      })
    ).rejects.toThrow();
  });

  it('9. Availability - stores date-specific availability schedule', async () => {
    const wkr = await prisma.user.create({
      data: {
        phone: `991${Math.floor(1000000 + Math.random() * 9000000)}`,
        workerProfile: { create: { displayName: 'Available Worker' } },
      },
      include: { workerProfile: true },
    });

    const availability = await prisma.availability.create({
      data: {
        workerProfileId: wkr.workerProfile!.id,
        date: new Date(),
        startTime: '08:00',
        endTime: '17:00',
        status: AvailabilityStatus.AVAILABLE,
      },
    });

    expect(availability.status).toBe(AvailabilityStatus.AVAILABLE);
    expect(availability.startTime).toBe('08:00');
    expect(availability.endTime).toBe('17:00');
  });

  it('10. Ratings Constraints - prevents duplicate rating and enforces 1-5 rating range', async () => {
    const emp = await prisma.user.create({
      data: {
        phone: `990${Math.floor(1000000 + Math.random() * 9000000)}`,
        employerProfile: { create: { businessName: 'Rater Employer' } },
      },
      include: { employerProfile: true },
    });
    const wkr = await prisma.user.create({
      data: {
        phone: `989${Math.floor(1000000 + Math.random() * 9000000)}`,
        workerProfile: { create: { displayName: 'Rated Worker' } },
      },
      include: { workerProfile: true },
    });
    const job = await prisma.jobPost.create({
      data: {
        employerProfileId: emp.employerProfile!.id,
        title: 'Rating Test Job',
        description: 'Test',
        category: 'Test',
        wageType: WageType.DAILY,
        wageAmount: 500,
        startDate: new Date(),
      },
    });
    const app = await prisma.jobApplication.create({
      data: { jobPostId: job.id, workerProfileId: wkr.workerProfile!.id },
    });
    const booking = await prisma.booking.create({
      data: {
        jobPostId: job.id,
        applicationId: app.id,
        employerProfileId: emp.employerProfile!.id,
        workerProfileId: wkr.workerProfile!.id,
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 3600000),
        totalAmount: 500.00,
      },
    });

    // Valid rating succeeds
    await prisma.rating.create({
      data: {
        reviewerId: emp.id,
        reviewedUserId: wkr.id,
        bookingId: booking.id,
        rating: 5,
        review: 'Excellent plumbing work!',
      },
    });

    // Duplicate review on same booking by same reviewer must fail
    await expect(
      prisma.rating.create({
        data: {
          reviewerId: emp.id,
          reviewedUserId: wkr.id,
          bookingId: booking.id,
          rating: 4,
        },
      })
    ).rejects.toThrow();

    // Invalid rating > 5 must fail DB check constraint
    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO ratings (id, reviewer_id, reviewed_user_id, rating, created_at, updated_at)
        VALUES (gen_random_uuid(), '${emp.id}', '${wkr.id}', 10, NOW(), NOW());
      `)
    ).rejects.toThrow();
  });

  it('11. Payment Idempotency - rejects duplicate idempotency keys', async () => {
    const user = await prisma.user.create({
      data: { phone: `988${Math.floor(1000000 + Math.random() * 9000000)}` },
    });
    const key = `idem_${Date.now()}_${Math.random()}`;

    await prisma.payment.create({
      data: {
        payerId: user.id,
        amount: 850.00,
        currency: 'INR',
        idempotencyKey: key,
        status: PaymentStatus.INITIATED,
      },
    });

    await expect(
      prisma.payment.create({
        data: {
          payerId: user.id,
          amount: 850.00,
          currency: 'INR',
          idempotencyKey: key,
          status: PaymentStatus.INITIATED,
        },
      })
    ).rejects.toThrow();
  });

  it('12. Payment Event Uniqueness - enforces single processing of webhook event ID', async () => {
    const eventId = `evt_rzp_${Date.now()}_${Math.random()}`;

    await prisma.paymentEvent.create({
      data: {
        provider: 'RAZORPAY',
        eventId,
        eventType: 'payment.captured',
        payload: { id: eventId, entity: 'event' },
      },
    });

    // Replay attack / duplicate webhook must be rejected
    await expect(
      prisma.paymentEvent.create({
        data: {
          provider: 'RAZORPAY',
          eventId,
          eventType: 'payment.captured',
          payload: { id: eventId },
        },
      })
    ).rejects.toThrow();
  });

  it('13. Audit Log - records sensitive business mutation immutably', async () => {
    const log = await prisma.auditLog.create({
      data: {
        action: 'WORKER_PROFILE_CREATED',
        entityType: 'WorkerProfile',
        entityId: 'test-uuid-id',
        metadata: { source: 'integration_test' },
        ipAddress: '127.0.0.1',
      },
    });
    expect(log.id).toBeDefined();
    expect(log.action).toBe('WORKER_PROFILE_CREATED');
  });

  it('14. Worker Radius Search - retrieves seeded workers within PostGIS range', async () => {
    // Hazratganj center coordinates: (26.8500, 80.9480)
    // Within 3km, Ramesh Kumar (~500m) and Suresh Patel (~2.2km) should be returned
    const results = await findWorkersWithinRadius(prisma, 26.8500, 80.9480, 3000);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);

    const first = results[0];
    expect(first).toBeDefined();
    expect(first?.distanceMeters).toBeLessThanOrEqual(3000);
    expect(first?.displayName).toBeDefined();
  });

  it('15. Job Radius Search - retrieves seeded jobs within PostGIS range', async () => {
    // Hazratganj center coordinates: (26.8500, 80.9480)
    // The seeded job is at (26.8520, 80.9500), ~300m away
    const results = await findJobsWithinRadius(prisma, 26.8500, 80.9480, 2000);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const targetJob = results.find((r) => r.title === 'Emergency Residential Pipe Replacement');
    expect(targetJob).toBeDefined();
    expect(targetJob?.title).toBe('Emergency Residential Pipe Replacement');
    expect(targetJob?.distanceMeters).toBeLessThan(1000);
  });

  it('16. Workers with Skills Near a Job - finds skilled workers near job location', async () => {
    const job = await prisma.jobPost.findFirst({
      where: { title: 'Emergency Residential Pipe Replacement' },
    });
    expect(job).not.toBeNull();

    const skilledWorkers = await findWorkersWithSkillsNearJob(prisma, job!.id, 15000);
    expect(Array.isArray(skilledWorkers)).toBe(true);
    expect(skilledWorkers.length).toBeGreaterThanOrEqual(1);
    expect(skilledWorkers[0]?.displayName).toBe('Ramesh Kumar');
    expect(skilledWorkers[0]?.matchingSkillCount).toBeGreaterThanOrEqual(1);
  });

  it('17. Available Workers & Recently Posted Jobs - validates operational queries', async () => {
    const availableWorkers = await findAvailableWorkers(prisma, new Date(), 10);
    expect(Array.isArray(availableWorkers)).toBe(true);
    expect(availableWorkers.length).toBeGreaterThanOrEqual(1);

    const recentJobs = await findRecentlyPostedJobs(prisma, 10);
    expect(Array.isArray(recentJobs)).toBe(true);
    expect(recentJobs.length).toBeGreaterThanOrEqual(1);
    expect(recentJobs[0]?.status).toBe('PUBLISHED');
  });
});
