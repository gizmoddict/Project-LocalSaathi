import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

import * as net from 'net';
import { PrismaClient } from '@prisma/client';
import { BookingService } from '../booking.service';
import { ApplicationService } from '../../application/application.service';
import { DomainEventService } from '../../notification/domain-event.service';
import { PrismaService } from '../../database/database.module';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  ApplicationStatus,
  UserRole,
} from '@localsaathi/types';

describe('Booking Domain Real PostgreSQL / PostGIS Integration Tests', () => {
  let prisma: PrismaClient;
  let bookingService: BookingService;
  let applicationService: ApplicationService;
  let isDatabaseAvailable = false;

  const employerPhone = `+9198411${Math.floor(10000 + Math.random() * 90000)}`;
  const otherEmployerPhone = `+9198422${Math.floor(10000 + Math.random() * 90000)}`;
  const worker1Phone = `+9198433${Math.floor(10000 + Math.random() * 90000)}`;
  const worker2Phone = `+9198444${Math.floor(10000 + Math.random() * 90000)}`;

  let employerUserId: string;
  let employerProfileId: string;
  let otherEmployerUserId: string;
  let otherEmployerProfileId: string;
  let worker1UserId: string;
  let worker1ProfileId: string;
  let worker2UserId: string;
  let worker2ProfileId: string;

  let publishedJobId: string;
  let secondJobId: string;
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
    bookingService = new BookingService(prisma as unknown as PrismaService, domainEventService);
    applicationService = new ApplicationService(prisma as unknown as PrismaService, domainEventService);

    // Setup Test Skill
    const skill = await prisma.skill.upsert({
      where: { normalizedName: 'industrial-wiring-p8' },
      update: {},
      create: {
        name: 'Industrial Wiring P8',
        normalizedName: 'industrial-wiring-p8',
        category: 'Electrical',
        isActive: true,
      },
    });
    skillId = skill.id;

    // 1. Create Employer A
    const empUser: any = await prisma.user.create({
      data: {
        phone: employerPhone,
        role: UserRole.EMPLOYER,
        accountStatus: 'ACTIVE',
        employerProfile: {
          create: {
            businessName: 'Phase 8 Industrial Works',
            businessType: 'CONTRACTOR',
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

    // 2. Create Employer B (for IDOR attack tests)
    const otherEmpUser: any = await prisma.user.create({
      data: {
        phone: otherEmployerPhone,
        role: UserRole.EMPLOYER,
        accountStatus: 'ACTIVE',
        employerProfile: {
          create: {
            businessName: 'Rival Industrial Works',
            businessType: 'CONTRACTOR',
            locality: 'Gomti Nagar',
            city: 'Lucknow',
            state: 'Uttar Pradesh',
            pinCode: '226010',
            onboardingStatus: 'COMPLETED',
          },
        },
      },
      include: { employerProfile: true },
    });
    otherEmployerUserId = otherEmpUser.id;
    otherEmployerProfileId = otherEmpUser.employerProfile!.id;

    // 3. Create Worker 1
    const w1User: any = await prisma.user.create({
      data: {
        phone: worker1Phone,
        role: UserRole.WORKER,
        accountStatus: 'ACTIVE',
        workerProfile: {
          create: {
            displayName: 'Amit Sharma P8',
            experienceYears: 5,
            expectedWage: 800,
            wageType: 'DAILY',
            preferredRadiusKm: 15,
            languages: ['en', 'hi'],
            onboardingStatus: 'COMPLETED',
            workerSkills: {
              create: {
                skillId,
                proficiency: 'EXPERT',
                experienceYears: 5,
              },
            },
            workerLocation: {
              create: {
                latitude: 26.85,
                longitude: 80.95,
                locality: 'Hazratganj',
                city: 'Lucknow',
                state: 'Uttar Pradesh',
                pinCode: '226001',
              },
            },
          },
        },
      },
      include: { workerProfile: true },
    });
    worker1UserId = w1User.id;
    worker1ProfileId = w1User.workerProfile!.id;

    // 4. Create Worker 2
    const w2User: any = await prisma.user.create({
      data: {
        phone: worker2Phone,
        role: UserRole.WORKER,
        accountStatus: 'ACTIVE',
        workerProfile: {
          create: {
            displayName: 'Sunil Verma P8',
            experienceYears: 3,
            expectedWage: 750,
            wageType: 'DAILY',
            preferredRadiusKm: 15,
            onboardingStatus: 'COMPLETED',
          },
        },
      },
      include: { workerProfile: true },
    });
    worker2UserId = w2User.id;
    worker2ProfileId = w2User.workerProfile!.id;

    // 5. Create Published Job for Employer A
    const jobA = await prisma.jobPost.create({
      data: {
        employerProfileId,
        title: 'Industrial Substation Wiring',
        description: 'Complete wiring setup for 3-phase industrial power panel.',
        status: 'PUBLISHED',
        category: 'Electrical',
        wageType: 'DAILY',
        wageAmount: 900,
        workerCount: 1,
        durationDays: 2,
        startDate: new Date('2026-10-25T00:00:00.000Z'),
        startTime: '09:00',
        urgency: 'STANDARD',
        jobLocation: {
          create: {
            latitude: 26.852,
            longitude: 80.951,
            locality: 'Hazratganj',
            city: 'Lucknow',
            state: 'Uttar Pradesh',
            pinCode: '226001',
            addressLine: 'Plot 44, Tech Zone',
          },
        },
      },
    });
    publishedJobId = jobA.id;

    // 6. Create Second Job for Employer A (for cancellation scenario)
    const jobB = await prisma.jobPost.create({
      data: {
        employerProfileId,
        title: 'Control Panel Maintenance',
        description: 'Routine maintenance of secondary switchgear.',
        status: 'PUBLISHED',
        category: 'Electrical',
        wageType: 'DAILY',
        wageAmount: 850,
        durationDays: 1,
        startDate: new Date('2026-11-05T00:00:00.000Z'),
        startTime: '10:00',
        jobLocation: {
          create: {
            latitude: 26.852,
            longitude: 80.951,
            locality: 'Hazratganj',
            city: 'Lucknow',
            state: 'Uttar Pradesh',
            pinCode: '226001',
          },
        },
      },
    });
    secondJobId = jobB.id;
  });

  afterAll(async () => {
    if (!isDatabaseAvailable) return;
    try {
      await prisma.booking.deleteMany({
        where: { employerProfileId: { in: [employerProfileId, otherEmployerProfileId] } },
      });
      await prisma.jobApplication.deleteMany({
        where: { jobPostId: { in: [publishedJobId, secondJobId] } },
      });
      await prisma.jobLocation.deleteMany({
        where: { jobPostId: { in: [publishedJobId, secondJobId] } },
      });
      await prisma.jobPost.deleteMany({
        where: { id: { in: [publishedJobId, secondJobId] } },
      });
      await prisma.workerSkill.deleteMany({
        where: { workerProfileId: { in: [worker1ProfileId, worker2ProfileId] } },
      });
      await prisma.workerLocation.deleteMany({
        where: { workerProfileId: { in: [worker1ProfileId, worker2ProfileId] } },
      });
      await prisma.workerProfile.deleteMany({
        where: { id: { in: [worker1ProfileId, worker2ProfileId] } },
      });
      await prisma.employerProfile.deleteMany({
        where: { id: { in: [employerProfileId, otherEmployerProfileId] } },
      });
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [
              employerUserId,
              otherEmployerUserId,
              worker1UserId,
              worker2UserId,
            ],
          },
        },
      });
      await prisma.$disconnect();
    } catch {
      // Ignore cleanup errors
    }
  });

  it('1. Rejects booking initiation for application that is not in ACCEPTED status', async () => {
    if (!isDatabaseAvailable) return;

    // Worker 1 applies to Job A -> status: APPLIED
    const app = await applicationService.applyToJob(worker1UserId, publishedJobId, {
      message: 'Certified industrial electrician ready for job.',
    });
    expect(app.status).toBe(ApplicationStatus.APPLIED);

    // Employer A tries to create booking -> 400 APPLICATION_NOT_ACCEPTED
    await expect(
      bookingService.createBooking(employerUserId, app.id)
    ).rejects.toThrow(BadRequestException);

    // Employer A shortlists the application -> SHORTLISTED
    const shortlisted = await applicationService.shortlistApplication(
      employerUserId,
      app.id
    );
    expect(shortlisted.status).toBe(ApplicationStatus.SHORTLISTED);

    // Still not ACCEPTED -> 400
    await expect(
      bookingService.createBooking(employerUserId, app.id)
    ).rejects.toThrow(BadRequestException);
  });

  it('2. Enforces IDOR: Employer B cannot initiate booking on Employer A application', async () => {
    if (!isDatabaseAvailable) return;

    const apps = await prisma.jobApplication.findMany({
      where: { jobPostId: publishedJobId },
    });
    const appId = apps[0]!.id;

    // Employer A accepts the application
    await applicationService.acceptApplication(employerUserId, appId);

    // Employer B attempts to create booking
    await expect(
      bookingService.createBooking(otherEmployerUserId, appId)
    ).rejects.toThrow(NotFoundException);
  });

  it('3. Creates Booking with complete contract snapshot and PENDING_CONFIRMATION status', async () => {
    if (!isDatabaseAvailable) return;

    const apps = await prisma.jobApplication.findMany({
      where: { jobPostId: publishedJobId },
    });
    const appId = apps[0]!.id;

    const booking = await bookingService.createBooking(employerUserId, appId, {
      agreedWage: 950,
      durationDays: 2,
    });

    expect(booking.id).toBeDefined();
    expect(booking.status).toBe(BookingStatus.PENDING_CONFIRMATION);
    expect(booking.agreedWage).toBe(950);
    expect(booking.durationDays).toBe(2);
    expect(booking.totalAmount).toBe(1900); // 950 * 2 days
    expect(booking.jobTitle).toBe('Industrial Substation Wiring');
    expect(booking.workerName).toBe('Amit Sharma P8');
    expect(booking.employerName).toBe('Phase 8 Industrial Works');
    expect(booking.workLocationLocality).toBe('Hazratganj');
    expect(booking.workLocationCity).toBe('Lucknow');
    expect(booking.workLocationAddress).toBe('Plot 44, Tech Zone');
  });

  it('4. Enforces database idempotency: Cannot create duplicate booking for same application', async () => {
    if (!isDatabaseAvailable) return;

    const apps = await prisma.jobApplication.findMany({
      where: { jobPostId: publishedJobId },
    });
    const appId = apps[0]!.id;

    // Second booking attempt on same application -> 409 Conflict
    await expect(
      bookingService.createBooking(employerUserId, appId)
    ).rejects.toThrow(ConflictException);
  });

  it('5. Worker confirms booking: PENDING_CONFIRMATION -> CONFIRMED', async () => {
    if (!isDatabaseAvailable) return;

    const apps = await prisma.jobApplication.findMany({
      where: { jobPostId: publishedJobId },
    });
    const appId = apps[0]!.id;

    const booking = await prisma.booking.findUnique({
      where: { applicationId: appId },
    });
    expect(booking).toBeDefined();

    // Confirm booking as Worker 1
    const confirmed = await bookingService.confirmBooking(
      worker1UserId,
      booking!.id
    );
    expect(confirmed.status).toBe(BookingStatus.CONFIRMED);
    expect(confirmed.confirmedAt).not.toBeNull();
  });

  it('6. Detects worker schedule conflict for another booking on the same date', async () => {
    if (!isDatabaseAvailable) return;

    // Create a 3rd job on the SAME date (2026-10-25) by Employer B
    const conflictJob = await prisma.jobPost.create({
      data: {
        employerProfileId: otherEmployerProfileId,
        title: 'Emergency Wiring Fix',
        description: 'Wiring job',
        status: 'PUBLISHED',
        category: 'Electrical',
        wageType: 'DAILY',
        wageAmount: 1000,
        startDate: new Date('2026-10-25T00:00:00.000Z'),
      },
    });

    // Worker 1 applies to conflict job
    const conflictApp = await applicationService.applyToJob(
      worker1UserId,
      conflictJob.id
    );

    // Employer B accepts Worker 1's application
    await applicationService.shortlistApplication(
      otherEmployerUserId,
      conflictApp.id
    );
    await applicationService.acceptApplication(
      otherEmployerUserId,
      conflictApp.id
    );

    // Employer B tries to initiate booking on the same date -> ConflictException (WORKER_SCHEDULE_CONFLICT)
    await expect(
      bookingService.createBooking(otherEmployerUserId, conflictApp.id)
    ).rejects.toThrow(ConflictException);

    // Cleanup conflict job
    await prisma.jobApplication.deleteMany({ where: { jobPostId: conflictJob.id } });
    await prisma.jobPost.delete({ where: { id: conflictJob.id } });
  });

  it('7. Enforces strict FSM transitions: CONFIRMED -> IN_PROGRESS -> COMPLETED', async () => {
    if (!isDatabaseAvailable) return;

    const apps = await prisma.jobApplication.findMany({
      where: { jobPostId: publishedJobId },
    });
    const appId = apps[0]!.id;

    const booking = await prisma.booking.findUnique({
      where: { applicationId: appId },
    });

    // Invalid transition: Employer tries to COMPLETE directly from CONFIRMED
    await expect(
      bookingService.completeBooking(employerUserId, booking!.id)
    ).rejects.toThrow(BadRequestException);

    // Step 1: Employer starts booking (CONFIRMED -> IN_PROGRESS)
    const inProgress = await bookingService.startBooking(
      employerUserId,
      booking!.id
    );
    expect(inProgress.status).toBe(BookingStatus.IN_PROGRESS);
    expect(inProgress.startedAt).not.toBeNull();

    // Step 2: Employer completes booking (IN_PROGRESS -> COMPLETED)
    const completed = await bookingService.completeBooking(
      employerUserId,
      booking!.id
    );
    expect(completed.status).toBe(BookingStatus.COMPLETED);
    expect(completed.completedAt).not.toBeNull();

    // Verify Worker 1 completedJobsCount incremented to 1
    const workerProfile = await prisma.workerProfile.findUnique({
      where: { id: worker1ProfileId },
    });
    expect(workerProfile!.completedJobsCount).toBe(1);

    // Cannot cancel after COMPLETED -> TERMINAL_STATE
    await expect(
      bookingService.cancelBooking(
        employerUserId,
        UserRole.EMPLOYER,
        booking!.id,
        { reason: 'Too late' }
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('8. Cancellation flow: Worker 2 cancels active booking with reason and attribution', async () => {
    if (!isDatabaseAvailable) return;

    // Worker 2 applies to Job B
    const appB = await applicationService.applyToJob(worker2UserId, secondJobId);
    await applicationService.shortlistApplication(employerUserId, appB.id);
    await applicationService.acceptApplication(employerUserId, appB.id);

    // Create booking
    const bookingB = await bookingService.createBooking(employerUserId, appB.id);
    expect(bookingB.status).toBe(BookingStatus.PENDING_CONFIRMATION);

    // Worker 2 cancels booking with reason
    const cancelled = await bookingService.cancelBooking(
      worker2UserId,
      UserRole.WORKER,
      bookingB.id,
      { reason: 'Severe medical emergency in family.' }
    );

    expect(cancelled.status).toBe(BookingStatus.CANCELLED);
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(cancelled.cancellationReason).toBe(
      'Severe medical emergency in family.'
    );
    expect(cancelled.cancelledByRole).toBe(UserRole.WORKER);
  });

  it('9. Lists bookings for employer and worker with status filtering', async () => {
    if (!isDatabaseAvailable) return;

    const empBookings = await bookingService.getEmployerBookings(employerUserId);
    expect(empBookings.items.length).toBeGreaterThanOrEqual(2);
    expect(empBookings.pagination.total).toBeGreaterThanOrEqual(2);

    const wkrBookings = await bookingService.getWorkerBookings(worker1UserId);
    expect(wkrBookings.items.length).toBeGreaterThanOrEqual(1);
    expect(wkrBookings.items[0]!.status).toBe(BookingStatus.COMPLETED);
  });
});
