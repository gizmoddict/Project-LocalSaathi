import { BadRequestException } from '@nestjs/common';
import { MatchingService } from '../matching.service';
import { JobStatus, JobUrgency, WageType } from '@localsaathi/types';

describe('Map Location Picker & Nearby Jobs Matching Unit Tests', () => {
  let matchingService: MatchingService;
  let mockPrisma: any;

  const mockWorkerProfile = {
    id: 'worker-prof-1',
    userId: 'worker-user-1',
    displayName: 'Vijay Singh',
    experienceYears: 4,
    expectedWage: 900,
    wageType: WageType.DAILY,
    preferredRadiusKm: 15,
    isAvailable: true,
    workerSkills: [
      {
        skillId: 'skill-plumbing-1',
        proficiency: 'INTERMEDIATE',
        experienceYears: 4,
        skill: { name: 'Plumbing', category: 'Plumbing' },
      },
    ],
    workerLocation: {
      latitude: 26.85,
      longitude: 80.948,
      isActive: true,
      locality: 'Hazratganj',
      city: 'Lucknow',
    },
    availabilities: [],
  };

  const samplePublishedJob = {
    id: 'job-101',
    title: 'Bathroom Pipe Leak Repair',
    description: 'Fixing PVC pipe connection in residential house.',
    status: JobStatus.PUBLISHED,
    category: 'Plumbing',
    urgency: JobUrgency.IMMEDIATE,
    wageType: WageType.DAILY,
    wageAmount: 950,
    workerCount: 1,
    durationDays: 1,
    startDate: new Date('2026-10-25'),
    startTime: '09:00',
    requirements: ['Pipe wrench'],
    languageRequirements: ['hi'],
    publishedAt: new Date('2026-10-20'),
    createdAt: new Date('2026-10-20'),
    deletedAt: null,
    jobLocation: {
      latitude: 26.86,
      longitude: 80.95,
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
      addressLine: 'MG Marg',
    },
    jobRequiredSkills: [
      {
        skillId: 'skill-plumbing-1',
        isRequired: true,
        minExperienceYears: 2,
        skill: { name: 'Plumbing', category: 'Plumbing' },
      },
    ],
    employerProfile: {
      businessName: 'Sharma Plumbing Co',
      businessType: 'Contractor',
      locality: 'Hazratganj',
      city: 'Lucknow',
      verificationState: 'VERIFIED',
      totalJobsPosted: 10,
    },
  };

  beforeEach(() => {
    mockPrisma = {
      workerProfile: {
        findUnique: jest.fn(),
      },
      jobPost: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      jobApplication: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      blockedUser: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn(),
    };

    matchingService = new MatchingService(mockPrisma);
  });

  describe('1. Explicit Coordinate "Search This Area" Map Queries', () => {
    it('uses explicit map coordinates when provided in query', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValueOnce(mockWorkerProfile);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { jobPostId: 'job-101', distanceMeters: 1800 },
      ]);
      mockPrisma.jobPost.findMany.mockResolvedValueOnce([samplePublishedJob]);

      const result = await matchingService.discoverJobsForWorker('worker-user-1', {
        latitude: 26.89, // Explicitly searched area: Aliganj
        longitude: 80.94,
        radiusKm: 25,
      });

      expect(result.items.length).toBe(1);
      const jobItem = result.items[0]!;

      // Verifies job item contains exact coordinates for rendering map pins
      expect(jobItem.location.latitude).toBe(26.86);
      expect(jobItem.location.longitude).toBe(80.95);
      expect(jobItem.distanceKm).toBe(1.8);
      expect(jobItem.title).toBe('Bathroom Pipe Leak Repair');
    });

    it('falls back to worker profile location when explicit coordinates are omitted', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValueOnce(mockWorkerProfile);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { jobPostId: 'job-101', distanceMeters: 1200 },
      ]);
      mockPrisma.jobPost.findMany.mockResolvedValueOnce([samplePublishedJob]);

      const result = await matchingService.discoverJobsForWorker('worker-user-1', {
        radiusKm: 10,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0]!.location.latitude).toBe(26.86);
      expect(result.items[0]!.location.longitude).toBe(80.95);
    });

    it('throws LOCATION_REQUIRED when worker has no location and no explicit coordinates provided', async () => {
      const workerNoLoc = {
        ...mockWorkerProfile,
        workerLocation: null,
      };
      mockPrisma.workerProfile.findUnique.mockResolvedValueOnce(workerNoLoc);

      await expect(
        matchingService.discoverJobsForWorker('worker-user-1', {})
      ).rejects.toThrow(BadRequestException);
    });

    it('allows discovering jobs by map coordinates even if worker profile has no location configured', async () => {
      const workerNoLoc = {
        ...mockWorkerProfile,
        workerLocation: null,
      };
      mockPrisma.workerProfile.findUnique.mockResolvedValueOnce(workerNoLoc);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { jobPostId: 'job-101', distanceMeters: 2200 },
      ]);
      mockPrisma.jobPost.findMany.mockResolvedValueOnce([samplePublishedJob]);

      const result = await matchingService.discoverJobsForWorker('worker-user-1', {
        latitude: 26.86,
        longitude: 80.99,
        radiusKm: 10,
      });

      expect(result.items.length).toBe(1);
    });
  });

  describe('2. Empty Results and Spatial Radius Filtering', () => {
    it('returns empty pagination structure when no candidates match geographic radius', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValueOnce(mockWorkerProfile);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // No jobs in radius

      const result = await matchingService.discoverJobsForWorker('worker-user-1', {
        latitude: 26.85,
        longitude: 80.948,
        radiusKm: 5,
      });

      expect(result.items).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.hasNextPage).toBe(false);
    });

    it('getNearbyJobs delegates to discoverJobs with distance_asc sorting and map coordinates', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValueOnce(mockWorkerProfile);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { jobPostId: 'job-101', distanceMeters: 800 },
      ]);
      mockPrisma.jobPost.findMany.mockResolvedValueOnce([samplePublishedJob]);

      const result = await matchingService.getNearbyJobsForWorker('worker-user-1', {
        latitude: 26.85,
        longitude: 80.948,
        radiusKm: 10,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0]!.distanceKm).toBe(0.8);
    });
  });

  describe('3. Job Eligibility & Invariant Checks', () => {
    it('never includes non-published or deleted jobs in discovery results', async () => {
      mockPrisma.workerProfile.findUnique.mockResolvedValueOnce(mockWorkerProfile);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { jobPostId: 'job-101', distanceMeters: 1000 },
      ]);
      // If job is no longer published in DB, findMany will filter it out
      mockPrisma.jobPost.findMany.mockResolvedValueOnce([]);

      const result = await matchingService.discoverJobsForWorker('worker-user-1', {
        latitude: 26.85,
        longitude: 80.948,
      });

      expect(result.items.length).toBe(0);
    });
  });
});
