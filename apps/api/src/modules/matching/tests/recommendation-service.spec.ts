import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MatchingService } from '../matching.service';
import { PrismaService } from '../../database/database.module';
import { JobStatus, JobUrgency, WageType } from '@localsaathi/types';

describe('Recommendation Service & Invariants (Unit Tests)', () => {
  let service: MatchingService;
  let prismaMock: any;

  const mockWorkerProfile = {
    id: 'worker-prof-1',
    userId: 'user-w1',
    experienceYears: 4,
    expectedWage: '800',
    wageType: 'DAILY',
    preferredRadiusKm: 15,
    isAvailable: true,
    reliabilityScore: '96.50',
    completedJobsCount: 15,
    workerLocation: {
      latitude: 26.8467,
      longitude: 80.9462,
      isActive: true,
    },
    workerSkills: [
      {
        skillId: 'sk-1',
        proficiency: 'EXPERT',
        experienceYears: 4,
        skill: { name: 'Electrical', category: 'Maintenance' },
      },
    ],
    availabilities: [],
  };

  const createMockJob = (id: string, overrides: Partial<any> = {}) => ({
    id,
    title: `Job ${id}`,
    description: `Description for ${id}`,
    category: 'Maintenance',
    status: JobStatus.PUBLISHED,
    urgency: JobUrgency.STANDARD,
    wageType: WageType.DAILY,
    wageAmount: '1000',
    workerCount: 1,
    durationDays: 1,
    startDate: new Date('2026-10-20'),
    startTime: '09:00',
    requirements: [],
    languageRequirements: ['en'],
    publishedAt: new Date('2026-10-10T10:00:00Z'),
    createdAt: new Date('2026-10-10T10:00:00Z'),
    deletedAt: null,
    jobLocation: {
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
      addressLine: 'MG Road',
      latitude: 26.85,
      longitude: 80.95,
    },
    jobRequiredSkills: [
      {
        skillId: 'sk-1',
        isRequired: true,
        minExperienceYears: 2,
        skill: { name: 'Electrical', category: 'Maintenance' },
      },
    ],
    employerProfile: {
      userId: 'emp-user-1',
      businessName: 'Reliable Works',
      businessType: 'Contractor',
      locality: 'Hazratganj',
      city: 'Lucknow',
      verificationState: 'VERIFIED',
      totalJobsPosted: 10,
    },
    ...overrides,
  });

  beforeEach(() => {
    prismaMock = {
      workerProfile: {
        findUnique: jest.fn(),
      },
      jobApplication: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      blockedUser: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      jobPost: {
        findMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    service = new MatchingService(prismaMock as unknown as PrismaService);
  });

  it('1. Location Prerequisite - throws BadRequestException when worker location is missing', async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue({
      ...mockWorkerProfile,
      workerLocation: null,
    });

    await expect(service.recommendJobsForWorker('user-w1')).rejects.toThrow(
      BadRequestException
    );
  });

  it('2. Tenant & User Isolation - throws NotFoundException if worker profile does not exist', async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue(null);

    await expect(service.recommendJobsForWorker('non-existent')).rejects.toThrow(
      NotFoundException
    );
  });

  it('3. Deduplication of Applied Jobs - never recommends jobs already applied to by worker', async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
    // Worker already applied to job-1
    prismaMock.jobApplication.findMany.mockResolvedValue([{ jobPostId: 'job-1' }]);
    prismaMock.blockedUser.findMany.mockResolvedValue([]);

    prismaMock.$queryRaw.mockResolvedValue([
      { jobPostId: 'job-1', distanceMeters: 1000 },
      { jobPostId: 'job-2', distanceMeters: 2000 },
    ]);

    prismaMock.jobPost.findMany.mockResolvedValue([createMockJob('job-2')]);

    const result = await service.recommendJobsForWorker('user-w1');

    expect(result.items.some((i) => i.id === 'job-1')).toBe(false);
    expect(result.items.some((i) => i.id === 'job-2')).toBe(true);
    expect(result.metadata.appliedCount).toBe(1);
  });

  it('4. Trust & Safety Blocking - never recommends jobs from employers blocked by worker or vice-versa', async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
    prismaMock.jobApplication.findMany.mockResolvedValue([]);
    // Worker blocked emp-user-blocked
    prismaMock.blockedUser.findMany.mockResolvedValue([
      { blockerId: 'user-w1', blockedId: 'emp-user-blocked' },
    ]);

    prismaMock.$queryRaw.mockResolvedValue([
      { jobPostId: 'job-blocked', distanceMeters: 1000 },
      { jobPostId: 'job-ok', distanceMeters: 1500 },
    ]);

    prismaMock.jobPost.findMany.mockResolvedValue([
      createMockJob('job-blocked', {
        employerProfile: { userId: 'emp-user-blocked', businessName: 'Blocked Org' },
      }),
      createMockJob('job-ok', {
        employerProfile: { userId: 'emp-user-valid', businessName: 'Valid Org' },
      }),
    ]);

    const result = await service.recommendJobsForWorker('user-w1');

    expect(result.items.some((i) => i.id === 'job-blocked')).toBe(false);
    expect(result.items.some((i) => i.id === 'job-ok')).toBe(true);
    expect(result.metadata.blockedEmployerCount).toBe(1);
  });

  it('5. Hard Constraint Filtering - excludes jobs where hard constraints fail (e.g. incompatible skill)', async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
    prismaMock.jobApplication.findMany.mockResolvedValue([]);
    prismaMock.blockedUser.findMany.mockResolvedValue([]);

    prismaMock.$queryRaw.mockResolvedValue([
      { jobPostId: 'job-skills-met', distanceMeters: 1000 },
      { jobPostId: 'job-skills-unmet', distanceMeters: 1200 },
    ]);

    prismaMock.jobPost.findMany.mockResolvedValue([
      createMockJob('job-skills-met'),
      createMockJob('job-skills-unmet', {
        jobRequiredSkills: [
          {
            skillId: 'sk-unrelated',
            isRequired: true,
            minExperienceYears: 5,
            skill: { name: 'Masonry', category: 'Construction' },
          },
        ],
      }),
    ]);

    const result = await service.recommendJobsForWorker('user-w1');

    expect(result.items.some((i) => i.id === 'job-skills-met')).toBe(true);
    expect(result.items.some((i) => i.id === 'job-skills-unmet')).toBe(false);
  });

  it('6. Fallback Behavior - returns nearby jobs with fallback metadata when 0 eligible matches are found', async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
    prismaMock.jobApplication.findMany.mockResolvedValue([]);
    prismaMock.blockedUser.findMany.mockResolvedValue([]);

    prismaMock.$queryRaw.mockResolvedValue([
      { jobPostId: 'job-unrelated', distanceMeters: 2500 },
    ]);

    // Candidate has no overlapping skills, so recommendation engine fails hard constraints
    prismaMock.jobPost.findMany.mockResolvedValue([
      createMockJob('job-unrelated', {
        jobRequiredSkills: [
          {
            skillId: 'sk-carpenter',
            isRequired: true,
            minExperienceYears: 10,
            skill: { name: 'Carpentry', category: 'Carpentry' },
          },
        ],
      }),
    ]);

    const result = await service.recommendJobsForWorker('user-w1');

    expect(result.metadata.isFallback).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.isFallback).toBe(true);
    expect(result.items[0]?.recommendation.reasons[0]).toContain('fallback');
  });

  it('7. Deterministic Ranking & Invariant Tie-Breaker - breaks equal scores by distance then UUID', async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
    prismaMock.jobApplication.findMany.mockResolvedValue([]);
    prismaMock.blockedUser.findMany.mockResolvedValue([]);

    // Two jobs with identical attributes and identical distance
    prismaMock.$queryRaw.mockResolvedValue([
      { jobPostId: 'job-b', distanceMeters: 1000 },
      { jobPostId: 'job-a', distanceMeters: 1000 },
    ]);

    prismaMock.jobPost.findMany.mockResolvedValue([
      createMockJob('job-b'),
      createMockJob('job-a'),
    ]);

    const result = await service.recommendJobsForWorker('user-w1');

    expect(result.items.length).toBe(2);
    // 'job-a' comes before 'job-b' by id.localeCompare
    expect(result.items[0]?.id).toBe('job-a');
    expect(result.items[1]?.id).toBe('job-b');
  });

  it('8. Pagination Correctness - respects page and limit boundaries with proper hasNextPage', async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
    prismaMock.jobApplication.findMany.mockResolvedValue([]);
    prismaMock.blockedUser.findMany.mockResolvedValue([]);

    const jobs = [
      createMockJob('job-1'),
      createMockJob('job-2'),
      createMockJob('job-3'),
    ];

    prismaMock.$queryRaw.mockResolvedValue([
      { jobPostId: 'job-1', distanceMeters: 1000 },
      { jobPostId: 'job-2', distanceMeters: 1100 },
      { jobPostId: 'job-3', distanceMeters: 1200 },
    ]);

    prismaMock.jobPost.findMany.mockResolvedValue(jobs);

    const page1 = await service.recommendJobsForWorker('user-w1', { page: 1, limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.pagination.hasNextPage).toBe(true);

    const page2 = await service.recommendJobsForWorker('user-w1', { page: 2, limit: 2 });
    expect(page2.items.length).toBe(1);
    expect(page2.pagination.hasNextPage).toBe(false);
  });

  it('9. Bounded Candidate Retrieval & 500 Ceiling - deep page queries respect max ceiling and safe bounds slicing', async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
    prismaMock.jobApplication.findMany.mockResolvedValue([]);
    prismaMock.blockedUser.findMany.mockResolvedValue([]);

    // Generate 500 candidate rows
    const candidatesList = Array.from({ length: 500 }, (_, i) => ({
      jobPostId: `job-bulk-${String(i).padStart(3, '0')}`,
      distanceMeters: (i + 1) * 10,
    }));
    prismaMock.$queryRaw.mockResolvedValue(candidatesList);

    // Mock 500 full jobs
    const jobsList = candidatesList.map((c: { jobPostId: string }) => createMockJob(c.jobPostId));
    prismaMock.jobPost.findMany.mockResolvedValue(jobsList);

    // Page 25: boundary page at limit 20 (items 480-499)
    const page25 = await service.recommendJobsForWorker('user-w1', { page: 25, limit: 20 });
    expect(page25.items.length).toBe(20);
    expect(page25.pagination.hasNextPage).toBe(false);
    expect(page25.metadata.telemetry?.candidateTruncated).toBe(true);

    // Page 26: beyond the 500 ceiling
    const page26 = await service.recommendJobsForWorker('user-w1', { page: 26, limit: 20 });
    expect(page26.items.length).toBe(0);
    expect(page26.pagination.hasNextPage).toBe(false);
    expect(page26.metadata.telemetry?.candidateTruncated).toBe(true);
  });

  it('10. Telemetry Correctness - reports monotonic latency, un-truncated candidates, and accurate missing attributes', async () => {
    // Worker with missing expected wage and zero skills
    const sparseWorker = {
      ...mockWorkerProfile,
      expectedWage: null,
      reliabilityScore: null,
      workerSkills: [],
      availabilities: [],
    };
    prismaMock.workerProfile.findUnique.mockResolvedValue(sparseWorker);
    prismaMock.jobApplication.findMany.mockResolvedValue([]);
    prismaMock.blockedUser.findMany.mockResolvedValue([]);

    const jobs = [createMockJob('job-1'), createMockJob('job-2')];
    prismaMock.$queryRaw.mockResolvedValue([
      { jobPostId: 'job-1', distanceMeters: 1000 },
      { jobPostId: 'job-2', distanceMeters: 1100 },
    ]);
    prismaMock.jobPost.findMany.mockResolvedValue(jobs);

    const result = await service.recommendJobsForWorker('user-w1', { page: 1, limit: 10 });

    expect(result.metadata.telemetry).toBeDefined();
    expect(result.metadata.telemetry?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.metadata.telemetry?.latencyMs).toBe('number');
    expect(result.metadata.telemetry?.candidateTruncated).toBe(false);
    // All 4 dimensions missing: expectedWage, reliabilityScore, workerSkills (0), availabilities (0)
    expect(result.metadata.telemetry?.missingAttributesCount).toBe(4);
  });

  it('11. Complete Safety Invariants - excludes unpublished, paused, or soft-deleted jobs even in fallback path', async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
    prismaMock.jobApplication.findMany.mockResolvedValue([]);
    prismaMock.blockedUser.findMany.mockResolvedValue([]);

    // Spatial candidate query returns candidate IDs
    prismaMock.$queryRaw.mockResolvedValue([
      { jobPostId: 'job-deleted', distanceMeters: 500 },
      { jobPostId: 'job-draft', distanceMeters: 600 },
      { jobPostId: 'job-published', distanceMeters: 800 },
    ]);

    // Relational findMany strictly filters by status = 'PUBLISHED' and deletedAt = null
    // Hence, jobPost.findMany will only return 'job-published'
    prismaMock.jobPost.findMany.mockResolvedValue([
      createMockJob('job-published', {
        status: JobStatus.PUBLISHED,
        deletedAt: null,
      }),
    ]);

    const result = await service.recommendJobsForWorker('user-w1');

    expect(result.items.some((j) => j.id === 'job-deleted')).toBe(false);
    expect(result.items.some((j) => j.id === 'job-draft')).toBe(false);
    expect(result.items.some((j) => j.id === 'job-published')).toBe(true);

    // Verify Prisma query conditions
    const findManyCalls = prismaMock.jobPost.findMany.mock.calls;
    expect(findManyCalls.length).toBeGreaterThan(0);
    const queryArg = findManyCalls[0][0];
    expect(queryArg.where.status).toBe('PUBLISHED');
    expect(queryArg.where.deletedAt).toBeNull();
  });
});
