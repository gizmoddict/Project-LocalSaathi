import * as dotenv from 'dotenv';
import * as path from 'path';

// Load root environment
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

import * as net from 'net';
import { PrismaClient, UserRole } from '@prisma/client';
import { WorkerService } from '../worker.service';
import { WorkerCompletionService } from '../services/worker-completion.service';
import { ProfileImageStorageService } from '../services/profile-image-storage.service';
import { WageType, SkillProficiency } from '@localsaathi/types';

describe('LocalSaathi Real Worker Database Integration Tests (Phase 4)', () => {
  let prisma: PrismaClient;
  let workerService: WorkerService;
  let isDatabaseAvailable = false;

  const testUserPhone = '9998887711';
  let testUserId: string;
  let testWorkerProfileId: string;
  let plumbingSkillId: string;

  beforeAll(async () => {
    // Probe localhost:5432
    const port = Number(process.env.DB_PORT) || 5432;
    const host = process.env.DB_HOST || 'localhost';

    const checkPort = new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1500);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, host);
    });

    isDatabaseAvailable = await checkPort;
    if (!isDatabaseAvailable) {
      // eslint-disable-next-line no-console
      console.warn('Real PostgreSQL is unavailable. Marking live tests as SKIPPED.');
      return;
    }

    prisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            'postgresql://localsaathi_admin:localsaathi_dev_password@localhost:5432/localsaathi_db?schema=public',
        },
      },
    });

    const completionService = new WorkerCompletionService();
    const imageStorageService = new ProfileImageStorageService();
    workerService = new WorkerService(prisma as any, completionService, imageStorageService);

    // Clean up any lingering test fixture
    await prisma.user.deleteMany({
      where: { phone: testUserPhone },
    });

    // Ensure Plumbing skill exists in catalog
    const skill = await prisma.skill.upsert({
      where: { normalizedName: 'plumbing' },
      update: {},
      create: {
        name: 'Plumbing',
        normalizedName: 'plumbing',
        category: 'Plumbing',
        isActive: true,
      },
    });
    plumbingSkillId = skill.id;

    // Create test worker user
    const user = await prisma.user.create({
      data: {
        phone: testUserPhone,
        role: UserRole.WORKER,
        accountStatus: 'ACTIVE',
        verificationStatus: 'UNVERIFIED',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    if (isDatabaseAvailable && prisma) {
      await prisma.user.deleteMany({
        where: { phone: testUserPhone },
      });
      await prisma.$disconnect();
    }
  });

  // 1. Worker Profile Persistence
  it('1. persists worker profile and verifies auto-provisioning', async () => {
    if (!isDatabaseAvailable) return;

    const profile = await workerService.getProfile(testUserId);
    expect(profile).toBeDefined();
    expect(profile.userId).toBe(testUserId);
    expect(profile.onboardingStatus).toBe('NOT_STARTED');

    testWorkerProfileId = profile.id;

    // Update profile
    const updated = await workerService.updateProfile(testUserId, {
      displayName: 'Dev Worker',
      bio: 'Certified plumber and pipe fitter',
      experienceYears: 4,
      expectedWage: 850,
      wageType: WageType.DAILY,
      preferredRadiusKm: 20,
      languages: ['hi', 'en'],
    });

    expect(updated.displayName).toBe('Dev Worker');
    expect(updated.experienceYears).toBe(4);
    expect(updated.expectedWage).toBe(850);
    expect(updated.onboardingStatus).toBe('IN_PROGRESS');
  });

  // 2. Worker Skills Relation & Unique Constraint
  it('2. persists worker skills and enforces unique skill relation per worker', async () => {
    if (!isDatabaseAvailable) return;

    const added = await workerService.addSkill(testUserId, {
      skillId: plumbingSkillId,
      proficiency: SkillProficiency.EXPERT,
      experienceYears: 4,
    });

    expect(added.skillId).toBe(plumbingSkillId);
    expect(added.proficiency).toBe('EXPERT');

    // Attempt duplicate skill addition - must reject with ConflictException
    await expect(
      workerService.addSkill(testUserId, {
        skillId: plumbingSkillId,
      })
    ).rejects.toThrow();

    // Verify skills query
    const skills = await workerService.getSkills(testUserId);
    expect(skills.length).toBe(1);
    expect(skills[0]?.name).toBe('Plumbing');
  });

  // 3. Availability Persistence & Conflict Prevention
  it('3. persists availability schedule slots and rejects duplicate dates', async () => {
    if (!isDatabaseAvailable) return;

    const slot = await workerService.createAvailability(testUserId, {
      date: '2026-10-20',
      startTime: '08:00',
      endTime: '17:00',
    });

    expect(slot.date).toBe('2026-10-20');
    expect(slot.startTime).toBe('08:00');

    // Duplicate date slot must reject with ConflictException
    await expect(
      workerService.createAvailability(testUserId, {
        date: '2026-10-20',
        startTime: '09:00',
        endTime: '18:00',
      })
    ).rejects.toThrow();

    // Update availability
    const updatedSlot = await workerService.updateAvailability(testUserId, slot.id, {
      startTime: '09:00',
      endTime: '18:00',
    });
    expect(updatedSlot.startTime).toBe('09:00');
  });

  // 4. Location Persistence & PostGIS Spatial Point Verification
  it('4. persists location in worker_locations and verifies PostGIS ST_DWithin query', async () => {
    if (!isDatabaseAvailable) return;

    // Worker coordinates: Lucknow Hazratganj (~26.8500° N, 80.9480° E)
    const loc = await workerService.updateLocation(testUserId, {
      latitude: 26.85,
      longitude: 80.948,
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
    });

    expect(loc.city).toBe('Lucknow');
    expect(loc.latitude).toBe(26.85);
    expect(loc.longitude).toBe(80.948);

    // Verify PostGIS ST_DWithin can query this worker from ~500m away (26.8467, 80.9462)
    const centerLng = 80.9462;
    const centerLat = 26.8467;
    const radiusMeters = 2000; // 2km radius

    const spatialMatches: Array<{ worker_profile_id: string; distance_meters: number }> =
      await prisma.$queryRawUnsafe(
        `SELECT worker_profile_id,
                ST_Distance(
                  location,
                  ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
                ) AS distance_meters
         FROM worker_locations
         WHERE worker_profile_id = $3::uuid
           AND ST_DWithin(
             location,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
             $4
           )`,
        centerLng,
        centerLat,
        testWorkerProfileId,
        radiusMeters
      );

    expect(spatialMatches.length).toBe(1);
    expect(spatialMatches[0]?.worker_profile_id).toBe(testWorkerProfileId);
    expect(Number(spatialMatches[0]?.distance_meters)).toBeLessThan(1000); // Should be ~400-600m
  });

  // 5. Onboarding Completion & Idempotency
  it('5. evaluates profile completion and finalizes onboarding idempotently', async () => {
    if (!isDatabaseAvailable) return;

    const completion = await workerService.getCompletion(testUserId);
    expect(completion.isComplete).toBe(true);
    expect(completion.completionPercentage).toBe(100);

    const finalized = await workerService.completeOnboarding(testUserId);
    expect(finalized.success).toBe(true);
    expect(finalized.onboardingStatus).toBe('COMPLETED');

    // Idempotent second call
    const repeated = await workerService.completeOnboarding(testUserId);
    expect(repeated.success).toBe(true);
    expect(repeated.onboardingStatus).toBe('COMPLETED');
  });
});
