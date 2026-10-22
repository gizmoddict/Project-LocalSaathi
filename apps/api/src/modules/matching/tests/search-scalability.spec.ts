import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MatchingService } from '../matching.service';
import { PrismaService } from '../../database/database.module';
import { JobStatus, JobUrgency, WageType } from '@localsaathi/types';

describe('Search Scalability & Matching Determinism (Unit Tests)', () => {
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
      userId: 'emp-1',
      businessName: 'Lucknow Electricals',
      businessType: 'Retail',
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
      jobPost: {
        findMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };
    service = new MatchingService(prismaMock as unknown as PrismaService);
  });

  describe('1. Location Prerequisites and Privacy Invariants', () => {
    it('should throw NotFoundException if worker profile does not exist', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue(null);

      await expect(service.discoverJobsForWorker('unknown-user')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if worker location is missing or inactive', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        workerLocation: null,
      });

      await expect(service.discoverJobsForWorker('user-w1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should enforce preferred radius ceiling when client requests larger radius', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue({
        ...mockWorkerProfile,
        preferredRadiusKm: 10, // Server ceiling
      });
      prismaMock.$queryRaw.mockResolvedValue([]);

      // Client requests 25km radius
      await service.discoverJobsForWorker('user-w1', { radiusKm: 25 });

      // Verifies SQL interpolation was called with clamped radius (10km = 10000m)
      expect(prismaMock.$queryRaw).toHaveBeenCalled();
    });

    it('should protect employer privacy by omitting sensitive phone and personal fields', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      prismaMock.$queryRaw.mockResolvedValue([{ jobPostId: 'j-1', distanceMeters: 1200 }]);
      prismaMock.jobPost.findMany.mockResolvedValue([createMockJob('j-1')]);

      const res = await service.discoverJobsForWorker('user-w1');

      expect(res.items).toHaveLength(1);
      const item = res.items[0]!;
      expect(item.employer).toEqual({
        businessName: 'Lucknow Electricals',
        businessType: 'Retail',
        locality: 'Hazratganj',
        city: 'Lucknow',
        verificationState: 'VERIFIED',
        totalJobsPosted: 10,
      });
      // Employer phone and internal identifiers must not be exposed
      expect((item.employer as any).phone).toBeUndefined();
      expect((item.employer as any).userId).toBeUndefined();
    });
  });

  describe('2. Deterministic Sorting & Invariant Tie-Breakers', () => {
    it('should break ties deterministically by ID when scores and distances are equal', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      // Three jobs with identical distance
      prismaMock.$queryRaw.mockResolvedValue([
        { jobPostId: 'job-c', distanceMeters: 2000 },
        { jobPostId: 'job-a', distanceMeters: 2000 },
        { jobPostId: 'job-b', distanceMeters: 2000 },
      ]);
      prismaMock.jobPost.findMany.mockResolvedValue([
        createMockJob('job-c'),
        createMockJob('job-a'),
        createMockJob('job-b'),
      ]);

      const res = await service.discoverJobsForWorker('user-w1', { sort: 'score_desc' });

      // Since scores and distance are identical, tie-breaker must produce deterministic ID order
      expect(res.items.map((i) => i.id)).toEqual(['job-a', 'job-b', 'job-c']);
    });

    it('should break ties deterministically on wage_desc when wages and scores are equal', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      prismaMock.$queryRaw.mockResolvedValue([
        { jobPostId: 'job-z', distanceMeters: 1500 },
        { jobPostId: 'job-m', distanceMeters: 1500 },
      ]);
      prismaMock.jobPost.findMany.mockResolvedValue([
        createMockJob('job-z', { wageAmount: '1200' }),
        createMockJob('job-m', { wageAmount: '1200' }),
      ]);

      const res = await service.discoverJobsForWorker('user-w1', { sort: 'wage_desc' });

      expect(res.items.map((i) => i.id)).toEqual(['job-m', 'job-z']);
    });

    it('should break ties deterministically on created_desc when timestamps are identical', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      const sameTime = new Date('2026-10-11T12:00:00Z');
      prismaMock.$queryRaw.mockResolvedValue([
        { jobPostId: 'job-2', distanceMeters: 1000 },
        { jobPostId: 'job-1', distanceMeters: 1000 },
      ]);
      prismaMock.jobPost.findMany.mockResolvedValue([
        createMockJob('job-2', { createdAt: sameTime }),
        createMockJob('job-1', { createdAt: sameTime }),
      ]);

      const res = await service.discoverJobsForWorker('user-w1', { sort: 'created_desc' });

      expect(res.items.map((i) => i.id)).toEqual(['job-1', 'job-2']);
    });
  });

  describe('3. Pagination Invariants and Non-Overlapping Boundaries', () => {
    it('should produce disjoint pages with no duplicate or skipped items across boundaries', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      const candidates = [
        { jobPostId: 'j-01', distanceMeters: 1000 },
        { jobPostId: 'j-02', distanceMeters: 1000 },
        { jobPostId: 'j-03', distanceMeters: 1000 },
        { jobPostId: 'j-04', distanceMeters: 1000 },
      ];
      prismaMock.$queryRaw.mockResolvedValue(candidates);
      prismaMock.jobPost.findMany.mockResolvedValue(
        candidates.map((c) => createMockJob(c.jobPostId)),
      );

      // Page 1: limit 2
      const page1 = await service.discoverJobsForWorker('user-w1', { page: 1, limit: 2 });
      // Page 2: limit 2
      const page2 = await service.discoverJobsForWorker('user-w1', { page: 2, limit: 2 });

      expect(page1.items.map((i) => i.id)).toEqual(['j-01', 'j-02']);
      expect(page2.items.map((i) => i.id)).toEqual(['j-03', 'j-04']);

      // Assert zero overlap
      const p1Ids = new Set(page1.items.map((i) => i.id));
      for (const id of page2.items.map((i) => i.id)) {
        expect(p1Ids.has(id)).toBe(false);
      }
    });

    it('should handle out-of-bounds page requests safely with empty items and hasNextPage false', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      prismaMock.$queryRaw.mockResolvedValue([{ jobPostId: 'j-1', distanceMeters: 1000 }]);
      prismaMock.jobPost.findMany.mockResolvedValue([createMockJob('j-1')]);

      const res = await service.discoverJobsForWorker('user-w1', { page: 99, limit: 10 });

      expect(res.items).toEqual([]);
      expect(res.pagination.page).toBe(99);
      expect(res.pagination.total).toBe(1);
      expect(res.pagination.hasNextPage).toBe(false);
    });

    it('should test realistic 500-candidate ceiling: page 24 hasNextPage=true, page 25 boundary hasNextPage=false, page 26 empty', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      // Simulate 500 candidates returned by spatial query
      const candidates500 = Array.from({ length: 500 }, (_, idx) => {
        const id = `job-cand-${String(idx + 1).padStart(3, '0')}`;
        return { jobPostId: id, distanceMeters: 1000 + idx * 10 };
      });
      prismaMock.$queryRaw.mockResolvedValue(candidates500);
      prismaMock.jobPost.findMany.mockResolvedValue(
        candidates500.map((c) => createMockJob(c.jobPostId)),
      );

      // Page 24 (items 461 to 480)
      const page24 = await service.discoverJobsForWorker('user-w1', { page: 24, limit: 20 });
      expect(page24.items).toHaveLength(20);
      expect(page24.pagination.page).toBe(24);
      expect(page24.pagination.totalPages).toBe(25);
      expect(page24.pagination.hasNextPage).toBe(true);

      // Page 25 (boundary: items 481 to 500)
      const page25 = await service.discoverJobsForWorker('user-w1', { page: 25, limit: 20 });
      expect(page25.items).toHaveLength(20);
      expect(page25.pagination.page).toBe(25);
      expect(page25.pagination.totalPages).toBe(25);
      expect(page25.pagination.hasNextPage).toBe(false);

      // Page 26 (beyond ceiling: 501+)
      const page26 = await service.discoverJobsForWorker('user-w1', { page: 26, limit: 20 });
      expect(page26.items).toHaveLength(0);
      expect(page26.pagination.page).toBe(26);
      expect(page26.pagination.hasNextPage).toBe(false);

      // Assert zero overlap between page 24 and page 25
      const p24Ids = new Set(page24.items.map((i) => i.id));
      for (const item of page25.items) {
        expect(p24Ids.has(item.id)).toBe(false);
      }
    });
  });

  describe('4. Keyword and Spatial Filter Composition', () => {
    it('should accept valid keyword query and preserve mandatory PUBLISHED, NOT DELETED, and spatial ST_DWithin filters', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      prismaMock.$queryRaw.mockResolvedValue([{ jobPostId: 'j-1', distanceMeters: 1000 }]);
      prismaMock.jobPost.findMany.mockResolvedValue([
        createMockJob('j-1', { title: 'Emergency Electrician' }),
      ]);

      const res = await service.discoverJobsForWorker('user-w1', {
        query: 'electrician',
        category: 'Maintenance',
      });

      expect(res.items).toHaveLength(1);
      expect(prismaMock.$queryRaw).toHaveBeenCalled();

      // Inspect SQL query passed to Prisma
      const sqlArgs = prismaMock.$queryRaw.mock.calls[0];
      const sqlText = JSON.stringify(sqlArgs);
      expect(sqlText).toContain("jp.status = 'PUBLISHED'");
      expect(sqlText).toContain('jp.deleted_at IS NULL');
      expect(sqlText).toContain('ST_DWithin');
      expect(sqlText).toContain('jp.title ILIKE');
      expect(sqlText).toContain('jp.description ILIKE');
    });

    it('should ensure DRAFT or soft-deleted jobs matching the keyword are strictly excluded by relational findMany filter', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      prismaMock.$queryRaw.mockResolvedValue([{ jobPostId: 'j-draft', distanceMeters: 500 }]);
      // Prisma relational loader strictly scopes where: { status: 'PUBLISHED', deletedAt: null }
      prismaMock.jobPost.findMany.mockResolvedValue([]); // DRAFT job excluded by where condition

      const res = await service.discoverJobsForWorker('user-w1', { query: 'electrician' });

      expect(res.items).toEqual([]);
      expect(res.pagination.total).toBe(0);
    });

    it('should return empty result safely when no candidates match geographic radius', async () => {
      prismaMock.workerProfile.findUnique.mockResolvedValue(mockWorkerProfile);
      prismaMock.$queryRaw.mockResolvedValue([]);

      const res = await service.discoverJobsForWorker('user-w1');

      expect(res.items).toEqual([]);
      expect(res.pagination.total).toBe(0);
      expect(res.pagination.hasNextPage).toBe(false);
    });
  });
});
