import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/database.module';
import {
  workerJobDiscoveryQuerySchema,
  nearbyJobsQuerySchema,
  workerJobRecommendationQuerySchema,
  WorkerJobDiscoveryQueryOutput,
  NearbyJobsQueryOutput,
  WorkerJobRecommendationQueryOutput,
} from '@localsaathi/validation';
import {
  WorkerJobDiscoveryResponse,
  WorkerJobDetailResponse,
  WorkerJobRecommendationResponse,
  RecommendedJobItem,
  DiscoveredJobItem,
  PublicEmployerInfo,
  JobStatus,
  JobUrgency,
  WageType,
  PublicJobDetailCachedDto,
} from '@localsaathi/types';
import { DOMAIN_DEFAULTS } from './matching.constants';
import { evaluateWorkerJobMatch, MatchingWorkerData, MatchingJobData } from './matching.engine';
import {
  evaluateWorkerJobRecommendation,
  RecommendationWorkerData,
  RecommendationJobData,
} from './recommendation.engine';
import { RECOMMENDATION_DEFAULTS } from './recommendation.constants';
import { CacheService } from '../cache/cache.service';
import { CacheKeys } from '../cache/cache-keys';
import { CACHE_CONSTANTS } from '../cache/cache.constants';

function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  /**
   * Discovers published jobs for an authenticated worker using PostGIS spatial radius
   * filtering and deterministic match ranking.
   */
  async discoverJobsForWorker(
    userId: string,
    rawQuery?: Partial<WorkerJobDiscoveryQueryOutput> | Record<string, unknown>
  ): Promise<WorkerJobDiscoveryResponse> {
    const parseResult = workerJobDiscoveryQuerySchema.safeParse(rawQuery ?? {});
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new BadRequestException(`Validation failed: ${issues}`);
    }
    const query = parseResult.data;

    // 1. Fetch worker profile with location, skills, and availabilities
    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId },
      include: {
        workerLocation: true,
        workerSkills: {
          include: { skill: true },
        },
        availabilities: true,
      },
    });

    if (!worker) {
      throw new NotFoundException('Worker profile not found for authenticated user');
    }

    // 2. Validate worker location prerequisite or explicit search coordinates
    const hasExplicitCoords =
      query.latitude !== undefined &&
      query.longitude !== undefined &&
      typeof query.latitude === 'number' &&
      typeof query.longitude === 'number' &&
      !isNaN(query.latitude) &&
      !isNaN(query.longitude);

    let searchLat: number;
    let searchLon: number;

    if (hasExplicitCoords) {
      searchLat = query.latitude!;
      searchLon = query.longitude!;
    } else {
      if (!worker.workerLocation || !worker.workerLocation.isActive) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'LOCATION_REQUIRED',
          message: 'Location is required for hyperlocal job discovery. Please configure your location in your worker profile or search an area on the map.',
        });
      }
      searchLat = worker.workerLocation.latitude;
      searchLon = worker.workerLocation.longitude;
    }

    const workerMaxRadius = worker.preferredRadiusKm || DOMAIN_DEFAULTS.SERVICE_RADIUS_KM;

    // Enforce server-side ceiling: client radius cannot exceed worker's configured preferred radius
    // unless explicit search coordinates are provided on the map
    const effectiveRadiusKm = query.radiusKm
      ? hasExplicitCoords
        ? Math.min(query.radiusKm, 100)
        : Math.min(query.radiusKm, workerMaxRadius)
      : workerMaxRadius;
    const effectiveRadiusMeters = effectiveRadiusKm * 1000;

    // 3. Build PostGIS spatial candidate query with safe parameter interpolation
    const whereConditions: Prisma.Sql[] = [
      Prisma.sql`jp.status = 'PUBLISHED'`,
      Prisma.sql`jp.deleted_at IS NULL`,
      Prisma.sql`ST_DWithin(
        jl.location,
        ST_SetSRID(ST_MakePoint(${searchLon}, ${searchLat}), 4326)::geography,
        ${effectiveRadiusMeters}
      )`,
    ];

    if (query.category) {
      whereConditions.push(Prisma.sql`LOWER(jp.category) = LOWER(${query.category})`);
    }

    if (query.wageType) {
      whereConditions.push(Prisma.sql`jp.wage_type = ${query.wageType}::"WageType"`);
    }

    if (query.minWage !== undefined && query.minWage !== null) {
      whereConditions.push(Prisma.sql`jp.wage_amount >= ${query.minWage}`);
    }

    if (query.maxWage !== undefined && query.maxWage !== null) {
      whereConditions.push(Prisma.sql`jp.wage_amount <= ${query.maxWage}`);
    }

    if (query.date) {
      whereConditions.push(Prisma.sql`jp.start_date = ${query.date}::date`);
    }

    if (query.skillId) {
      whereConditions.push(
        Prisma.sql`EXISTS (
          SELECT 1 FROM job_required_skills jrs 
          WHERE jrs.job_post_id = jp.id AND jrs.skill_id = ${query.skillId}::uuid
        )`
      );
    }

    if (query.query && query.query.trim().length > 0) {
      const sanitized = query.query.trim();
      const pattern = `%${sanitized}%`;
      whereConditions.push(
        Prisma.sql`(jp.title ILIKE ${pattern} OR jp.description ILIKE ${pattern})`
      );
    }

    const whereClause = Prisma.join(whereConditions, ' AND ');

    // 4. Query spatially eligible candidates with exact distance
    // Bounded candidate window: scales with requested page while protecting against memory exhaustion
    const maxCandidateCeiling = 500;
    const requiredCandidates = Math.min(
      Math.max(200, query.page * query.limit + query.limit),
      maxCandidateCeiling
    );

    const candidateRows = await this.prisma.$queryRaw<
      Array<{ jobPostId: string; distanceMeters: number }>
    >`
      SELECT 
        jp.id AS "jobPostId",
        ST_Distance(
          jl.location,
          ST_SetSRID(ST_MakePoint(${searchLon}, ${searchLat}), 4326)::geography
        ) AS "distanceMeters"
      FROM job_locations jl
      JOIN job_posts jp ON jp.id = jl.job_post_id
      WHERE ${whereClause}
      ORDER BY "distanceMeters" ASC
      LIMIT ${requiredCandidates};
    `;

    if (candidateRows.length === 0) {
      return {
        items: [],
        pagination: {
          page: query.page,
          limit: query.limit,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
        },
      };
    }

    const candidateIds = candidateRows.map((r: { jobPostId: string }) => r.jobPostId);
    const distanceMap = new Map<string, number>(
      candidateRows.map((r: { jobPostId: string; distanceMeters: number }) => [
        r.jobPostId,
        r.distanceMeters / 1000,
      ])
    );

    // 5. Batch load relational details for candidates
    const fullJobs = await this.prisma.jobPost.findMany({
      where: {
        id: { in: candidateIds },
        status: 'PUBLISHED',
        deletedAt: null,
      },
      include: {
        jobLocation: true,
        jobRequiredSkills: {
          include: { skill: true },
        },
        employerProfile: true,
      },
    });

    // 6. Prepare worker data structure for deterministic matching
    const matchingWorkerData: MatchingWorkerData = {
      experienceYears: worker.experienceYears,
      expectedWage: worker.expectedWage ? Number(worker.expectedWage) : null,
      wageType: worker.wageType,
      preferredRadiusKm: effectiveRadiusKm,
      isAvailable: worker.isAvailable,
      skills: worker.workerSkills.map((ws: { skillId: string; proficiency: string; experienceYears: number }) => ({
        skillId: ws.skillId,
        proficiency: ws.proficiency,
        experienceYears: ws.experienceYears,
      })),
      availabilities: worker.availabilities.map((a: { date: Date; startTime: string | null; endTime: string | null; status: string }) => ({
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
      })),
    };

    // 7. Evaluate each candidate job
    const evaluatedItems: DiscoveredJobItem[] = [];

    for (const job of fullJobs) {
      if (!job.jobLocation) continue;

      const distanceKm = distanceMap.get(job.id) ?? 0;

      const matchingJobData: MatchingJobData = {
        id: job.id,
        startDate: job.startDate,
        startTime: job.startTime,
        durationDays: job.durationDays,
        wageAmount: Number(job.wageAmount),
        wageType: job.wageType,
        requiredSkills: job.jobRequiredSkills.map((jrs: { skillId: string; isRequired: boolean; minExperienceYears: number; skill: { name: string; category: string } }) => ({
          skillId: jrs.skillId,
          name: jrs.skill.name,
          category: jrs.skill.category,
          isRequired: jrs.isRequired,
          minExperienceYears: jrs.minExperienceYears,
        })),
      };

      const { match } = evaluateWorkerJobMatch(
        matchingWorkerData,
        matchingJobData,
        distanceKm,
        effectiveRadiusKm
      );

      // Public-safe employer projection (Strict Privacy — No PII, No Phone)
      const employer: PublicEmployerInfo = {
        businessName: job.employerProfile.businessName,
        businessType: job.employerProfile.businessType,
        locality: job.employerProfile.locality,
        city: job.employerProfile.city,
        verificationState: job.employerProfile.verificationState,
        totalJobsPosted: job.employerProfile.totalJobsPosted,
      };

      evaluatedItems.push({
        id: job.id,
        title: job.title,
        description: job.description,
        category: job.category,
        status: job.status as JobStatus,
        urgency: job.urgency as JobUrgency,
        wageType: job.wageType as WageType,
        wageAmount: Number(job.wageAmount),
        workerCount: job.workerCount,
        durationDays: job.durationDays,
        startDate: job.startDate.toISOString().slice(0, 10),
        startTime: job.startTime,
        requirements: job.requirements,
        languageRequirements: job.languageRequirements,
        publishedAt: job.publishedAt ? job.publishedAt.toISOString() : null,
        createdAt: job.createdAt.toISOString(),
        location: {
          locality: job.jobLocation.locality,
          city: job.jobLocation.city,
          state: job.jobLocation.state,
          pinCode: job.jobLocation.pinCode,
          addressLine: job.jobLocation.addressLine,
          latitude: job.jobLocation.latitude,
          longitude: job.jobLocation.longitude,
        },
        employer,
        requiredSkills: job.jobRequiredSkills.map((jrs: { skillId: string; isRequired: boolean; minExperienceYears: number; skill: { name: string; category: string } }) => ({
          skillId: jrs.skillId,
          name: jrs.skill.name,
          category: jrs.skill.category,
          isRequired: jrs.isRequired,
          minExperienceYears: jrs.minExperienceYears,
        })),
        distanceKm: Number(distanceKm.toFixed(2)),
        match,
      });
    }

    // 8. Deterministic sorting with guaranteed invariant id tie-breaker
    evaluatedItems.sort((a, b) => {
      switch (query.sort) {
        case 'distance_asc':
          return (
            a.distanceKm - b.distanceKm ||
            b.match.score - a.match.score ||
            a.id.localeCompare(b.id)
          );
        case 'wage_desc':
          return (
            b.wageAmount - a.wageAmount ||
            b.match.score - a.match.score ||
            a.id.localeCompare(b.id)
          );
        case 'created_desc':
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
            a.id.localeCompare(b.id)
          );
        case 'score_desc':
        default:
          return (
            b.match.score - a.match.score ||
            a.distanceKm - b.distanceKm ||
            a.id.localeCompare(b.id)
          );
      }
    });

    // 9. Pagination
    const total = evaluatedItems.length;
    const page = query.page;
    const limit = query.limit;
    const startIndex = (page - 1) * limit;
    const paginatedItems = startIndex < total ? evaluatedItems.slice(startIndex, startIndex + limit) : [];
    const totalPages = Math.ceil(total / limit) || 1;
    const hasNextPage = page < totalPages;

    return {
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
      },
    };
  }

  /**
   * Convenience endpoint for nearby jobs sorted strictly by geographic distance.
   */
  async getNearbyJobsForWorker(
    userId: string,
    rawQuery?: Partial<NearbyJobsQueryOutput> | Record<string, unknown>
  ): Promise<WorkerJobDiscoveryResponse> {
    const parseResult = nearbyJobsQuerySchema.safeParse(rawQuery ?? {});
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new BadRequestException(`Validation failed: ${issues}`);
    }
    const query = parseResult.data;
    return this.discoverJobsForWorker(userId, {
      ...query,
      sort: 'distance_asc',
    });
  }

  /**
   * Cached public job detail DTO projection.
   */
  async getPublicJobDetail(jobId: string): Promise<PublicJobDetailCachedDto | null> {
    const fetchFn = async () => {
      const job = await this.prisma.jobPost.findUnique({
        where: { id: jobId },
        include: {
          jobLocation: true,
          jobRequiredSkills: {
            include: { skill: true },
          },
          employerProfile: true,
        },
      });

      if (!job || job.status !== 'PUBLISHED' || job.deletedAt !== null || !job.jobLocation) {
        return null;
      }

      return {
        id: job.id,
        title: job.title,
        description: job.description,
        category: job.category,
        status: job.status,
        urgency: job.urgency,
        wageType: job.wageType,
        wageAmount: Number(job.wageAmount),
        workerCount: job.workerCount,
        durationDays: job.durationDays,
        startDate: job.startDate.toISOString().slice(0, 10),
        startTime: job.startTime,
        requirements: job.requirements,
        languageRequirements: job.languageRequirements,
        publishedAt: job.publishedAt ? job.publishedAt.toISOString() : null,
        createdAt: job.createdAt.toISOString(),
        location: {
          locality: job.jobLocation.locality,
          city: job.jobLocation.city,
          state: job.jobLocation.state,
          pinCode: job.jobLocation.pinCode,
          addressLine: job.jobLocation.addressLine,
          latitude: job.jobLocation.latitude,
          longitude: job.jobLocation.longitude,
        },
        employer: {
          businessName: job.employerProfile.businessName,
          businessType: job.employerProfile.businessType || 'Independent',
          locality: job.employerProfile.locality || '',
          city: job.employerProfile.city || '',
          verificationState: job.employerProfile.verificationState,
          totalJobsPosted: job.employerProfile.totalJobsPosted,
        },
        requiredSkills: job.jobRequiredSkills.map((jrs: { skillId: string; isRequired: boolean; minExperienceYears: number; skill: { name: string; category: string } }) => ({
          skillId: jrs.skillId,
          name: jrs.skill.name,
          category: jrs.skill.category,
          isRequired: jrs.isRequired,
          minExperienceYears: jrs.minExperienceYears,
        })),
      };
    };

    if (!this.cacheService) {
      return fetchFn();
    }

    const cacheKey = CacheKeys.jobDetail(jobId);
    return this.cacheService.wrap(
      cacheKey,
      fetchFn,
      {
        ttl: CACHE_CONSTANTS.TTL.JOB_DETAIL,
        stampedeProtect: true,
        negativeCache: true,
      },
    );
  }

  /**
   * Retrieves single job details for an authenticated worker with full match breakdown.
   * Visibility guard: only PUBLISHED jobs are accessible to workers.
   */
  async getJobDetailForWorker(
    userId: string,
    jobId: string
  ): Promise<WorkerJobDetailResponse> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId },
      include: {
        workerLocation: true,
        workerSkills: {
          include: { skill: true },
        },
        availabilities: true,
      },
    });

    if (!worker) {
      throw new NotFoundException('Worker profile not found');
    }

    const job = await this.getPublicJobDetail(jobId);

    // Strict visibility invariant: workers can NEVER view DRAFT, PAUSED, FILLED, or CANCELLED jobs
    if (!job || job.status !== 'PUBLISHED') {
      throw new NotFoundException('Job post not found or no longer active');
    }

    const effectiveRadiusKm = worker.preferredRadiusKm || DOMAIN_DEFAULTS.SERVICE_RADIUS_KM;
    let distanceKm = 0;

    if (worker.workerLocation) {
      distanceKm = calculateHaversineDistanceKm(
        worker.workerLocation.latitude,
        worker.workerLocation.longitude,
        job.location.latitude,
        job.location.longitude,
      );
    }

    const matchingWorkerData: MatchingWorkerData = {
      experienceYears: worker.experienceYears,
      expectedWage: worker.expectedWage ? Number(worker.expectedWage) : null,
      wageType: worker.wageType,
      preferredRadiusKm: effectiveRadiusKm,
      isAvailable: worker.isAvailable,
      skills: worker.workerSkills.map((ws: { skillId: string; proficiency: string; experienceYears: number }) => ({
        skillId: ws.skillId,
        proficiency: ws.proficiency,
        experienceYears: ws.experienceYears,
      })),
      availabilities: worker.availabilities.map((a: { date: Date; startTime: string | null; endTime: string | null; status: string }) => ({
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
      })),
    };

    const matchingJobData: MatchingJobData = {
      id: job.id,
      startDate: new Date(job.startDate),
      startTime: job.startTime,
      durationDays: job.durationDays,
      wageAmount: Number(job.wageAmount),
      wageType: job.wageType as WageType,
      requiredSkills: job.requiredSkills.map((jrs) => ({
        skillId: jrs.skillId,
        name: jrs.name,
        category: jrs.category,
        isRequired: jrs.isRequired,
        minExperienceYears: jrs.minExperienceYears,
      })),
    };

    const { match, skillDetails } = evaluateWorkerJobMatch(
      matchingWorkerData,
      matchingJobData,
      distanceKm,
      effectiveRadiusKm
    );

    const employer: PublicEmployerInfo = {
      businessName: job.employer.businessName,
      businessType: job.employer.businessType,
      locality: job.employer.locality,
      city: job.employer.city,
      verificationState: job.employer.verificationState,
      totalJobsPosted: job.employer.totalJobsPosted,
    };

    return {
      id: job.id,
      title: job.title,
      description: job.description,
      category: job.category,
      status: job.status as JobStatus,
      urgency: job.urgency as JobUrgency,
      wageType: job.wageType as WageType,
      wageAmount: Number(job.wageAmount),
      workerCount: job.workerCount,
      durationDays: job.durationDays,
      startDate: job.startDate,
      startTime: job.startTime,
      requirements: job.requirements,
      languageRequirements: job.languageRequirements,
      publishedAt: job.publishedAt,
      createdAt: job.createdAt,
      location: {
        locality: job.location.locality,
        city: job.location.city,
        state: job.location.state,
        pinCode: job.location.pinCode,
        addressLine: job.location.addressLine,
        latitude: job.location.latitude,
        longitude: job.location.longitude,
      },
      employer,
      requiredSkills: job.requiredSkills.map((jrs) => ({
        skillId: jrs.skillId,
        name: jrs.name,
        category: jrs.category,
        isRequired: jrs.isRequired,
        minExperienceYears: jrs.minExperienceYears,
      })),
      distanceKm: Number(distanceKm.toFixed(2)),
      match,
      skillDetails,
    };
  }

  /**
   * Recommends published jobs for an authenticated worker using multidimensional
   * ranking, deduplication of applied/blocked jobs, and intelligent fallback.
   */
  async recommendJobsForWorker(
    userId: string,
    rawQuery?: Partial<WorkerJobRecommendationQueryOutput> | Record<string, unknown>
  ): Promise<WorkerJobRecommendationResponse> {
    const startNs = process.hrtime.bigint();
    const parseResult = workerJobRecommendationQuerySchema.safeParse(rawQuery ?? {});
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new BadRequestException(`Validation failed: ${issues}`);
    }
    const query = parseResult.data;

    // 1. Fetch worker profile with location, skills, and availabilities
    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId },
      include: {
        workerLocation: true,
        workerSkills: {
          include: { skill: true },
        },
        availabilities: true,
      },
    });

    if (!worker) {
      throw new NotFoundException('Worker profile not found for authenticated user');
    }

    // 2. Validate worker location prerequisite
    if (!worker.workerLocation || !worker.workerLocation.isActive) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'LOCATION_REQUIRED',
        message: 'Location is required for hyperlocal recommendations. Please configure your location in your worker profile.',
      });
    }

    const workerLat = worker.workerLocation.latitude;
    const workerLon = worker.workerLocation.longitude;
    const workerMaxRadius = worker.preferredRadiusKm || DOMAIN_DEFAULTS.SERVICE_RADIUS_KM;

    const effectiveRadiusKm = query.maxRadiusKm
      ? Math.min(query.maxRadiusKm, workerMaxRadius)
      : workerMaxRadius;
    const effectiveRadiusMeters = effectiveRadiusKm * 1000;

    // 3. Exclude already-applied jobs and blocked employers to prevent duplicate recommendations
    const [appliedJobs, blockedUsers] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where: { workerProfileId: worker.id },
        select: { jobPostId: true },
      }),
      this.prisma.blockedUser.findMany({
        where: {
          OR: [{ blockerId: userId }, { blockedId: userId }],
        },
        select: { blockerId: true, blockedId: true },
      }),
    ]);

    const appliedJobIds = new Set(appliedJobs.map((a: { jobPostId: string }) => a.jobPostId));
    const blockedUserIds = new Set(
      blockedUsers.map((b: { blockerId: string; blockedId: string }) =>
        b.blockerId === userId ? b.blockedId : b.blockerId
      )
    );

    // 4. Build spatial candidate query with safe parameter interpolation
    const whereConditions: Prisma.Sql[] = [
      Prisma.sql`jp.status = 'PUBLISHED'`,
      Prisma.sql`jp.deleted_at IS NULL`,
      Prisma.sql`ST_DWithin(
        jl.location,
        ST_SetSRID(ST_MakePoint(${workerLon}, ${workerLat}), 4326)::geography,
        ${effectiveRadiusMeters}
      )`,
    ];

    if (query.category) {
      whereConditions.push(Prisma.sql`LOWER(jp.category) = LOWER(${query.category})`);
    }

    const whereClause = Prisma.join(whereConditions, ' AND ');

    // Candidate window scaling up to bounded ceiling
    const maxCandidateCeiling = RECOMMENDATION_DEFAULTS.MAX_CANDIDATE_CEILING;
    const requiredCandidates = Math.min(
      Math.max(RECOMMENDATION_DEFAULTS.MIN_CANDIDATE_RETRIEVAL, query.page * query.limit + query.limit),
      maxCandidateCeiling
    );

    const candidateRows = await this.prisma.$queryRaw<
      Array<{ jobPostId: string; distanceMeters: number }>
    >`
      SELECT 
        jp.id AS "jobPostId",
        ST_Distance(
          jl.location,
          ST_SetSRID(ST_MakePoint(${workerLon}, ${workerLat}), 4326)::geography
        ) AS "distanceMeters"
      FROM job_locations jl
      JOIN job_posts jp ON jp.id = jl.job_post_id
      WHERE ${whereClause}
      ORDER BY "distanceMeters" ASC
      LIMIT ${requiredCandidates};
    `;

    // Filter out already applied jobs from candidates
    const filteredCandidateRows = candidateRows.filter(
      (r: { jobPostId: string }) => !appliedJobIds.has(r.jobPostId)
    );

    const candidateIds = filteredCandidateRows.map((r: { jobPostId: string }) => r.jobPostId);
    const distanceMap = new Map<string, number>(
      filteredCandidateRows.map((r: { jobPostId: string; distanceMeters: number }) => [
        r.jobPostId,
        r.distanceMeters / 1000,
      ])
    );

    // Batch load full details for candidates
    const fullJobs = candidateIds.length > 0
      ? await this.prisma.jobPost.findMany({
          where: {
            id: { in: candidateIds },
            status: 'PUBLISHED',
            deletedAt: null,
          },
          include: {
            jobLocation: true,
            jobRequiredSkills: {
              include: { skill: true },
            },
            employerProfile: true,
          },
        })
      : [];

    // Filter out jobs from blocked employers
    const unblockedJobs = fullJobs.filter(
      (j: any) => !blockedUserIds.has(j.employerProfile.userId)
    );

    const matchingWorkerData: RecommendationWorkerData = {
      experienceYears: worker.experienceYears,
      expectedWage: worker.expectedWage ? Number(worker.expectedWage) : null,
      wageType: worker.wageType,
      preferredRadiusKm: effectiveRadiusKm,
      isAvailable: worker.isAvailable,
      reliabilityScore: worker.reliabilityScore ? Number(worker.reliabilityScore) : 100,
      completedJobsCount: worker.completedJobsCount,
      skills: worker.workerSkills.map((ws: any) => ({
        skillId: ws.skillId,
        proficiency: ws.proficiency,
        experienceYears: ws.experienceYears,
      })),
      availabilities: worker.availabilities.map((a: any) => ({
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
      })),
    };

    const evaluatedRecommendations: RecommendedJobItem[] = [];
    const nowMs = Date.now();

    for (const job of unblockedJobs) {
      if (!job.jobLocation) continue;

      const distanceKm = distanceMap.get(job.id) ?? 0;

      const recommendationJobData: RecommendationJobData = {
        id: job.id,
        startDate: job.startDate,
        startTime: job.startTime,
        durationDays: job.durationDays,
        wageAmount: Number(job.wageAmount),
        wageType: job.wageType,
        publishedAt: job.publishedAt,
        createdAt: job.createdAt,
        requiredSkills: job.jobRequiredSkills.map((jrs: any) => ({
          skillId: jrs.skillId,
          name: jrs.skill.name,
          category: jrs.skill.category,
          isRequired: jrs.isRequired,
          minExperienceYears: jrs.minExperienceYears,
        })),
      };

      const { recommendation } = evaluateWorkerJobRecommendation(
        matchingWorkerData,
        recommendationJobData,
        distanceKm,
        effectiveRadiusKm,
        nowMs
      );

      // Separate hard eligibility constraints: only recommend jobs where hard constraints passed
      if (!recommendation.hardConstraintsPassed) {
        continue;
      }

      const matchingJobData: MatchingJobData = {
        id: job.id,
        startDate: job.startDate,
        startTime: job.startTime,
        durationDays: job.durationDays,
        wageAmount: Number(job.wageAmount),
        wageType: job.wageType,
        requiredSkills: recommendationJobData.requiredSkills,
      };

      const { match } = evaluateWorkerJobMatch(
        matchingWorkerData,
        matchingJobData,
        distanceKm,
        effectiveRadiusKm
      );

      const employer: PublicEmployerInfo = {
        businessName: job.employerProfile.businessName,
        businessType: job.employerProfile.businessType,
        locality: job.employerProfile.locality,
        city: job.employerProfile.city,
        verificationState: job.employerProfile.verificationState,
        totalJobsPosted: job.employerProfile.totalJobsPosted,
      };

      evaluatedRecommendations.push({
        id: job.id,
        title: job.title,
        description: job.description,
        category: job.category,
        status: job.status as JobStatus,
        urgency: job.urgency as JobUrgency,
        wageType: job.wageType as WageType,
        wageAmount: Number(job.wageAmount),
        workerCount: job.workerCount,
        durationDays: job.durationDays,
        startDate: job.startDate.toISOString().slice(0, 10),
        startTime: job.startTime,
        requirements: job.requirements,
        languageRequirements: job.languageRequirements,
        publishedAt: job.publishedAt ? job.publishedAt.toISOString() : null,
        createdAt: job.createdAt.toISOString(),
        location: {
          locality: job.jobLocation.locality,
          city: job.jobLocation.city,
          state: job.jobLocation.state,
          pinCode: job.jobLocation.pinCode,
          addressLine: job.jobLocation.addressLine,
          latitude: job.jobLocation.latitude,
          longitude: job.jobLocation.longitude,
        },
        employer,
        requiredSkills: recommendationJobData.requiredSkills,
        distanceKm: Number(distanceKm.toFixed(2)),
        match,
        recommendation,
        isFallback: false,
      });
    }

    // 5. Fallback logic: If no eligible recommendations found, provide general nearby jobs
    let isFallback = false;
    let finalItemList = evaluatedRecommendations;

    if (evaluatedRecommendations.length === 0 && unblockedJobs.length > 0) {
      isFallback = true;
      for (const job of unblockedJobs.slice(0, RECOMMENDATION_DEFAULTS.FALLBACK_TOP_N)) {
        if (!job.jobLocation) continue;
        const distanceKm = distanceMap.get(job.id) ?? 0;

        const recommendationJobData: RecommendationJobData = {
          id: job.id,
          startDate: job.startDate,
          startTime: job.startTime,
          durationDays: job.durationDays,
          wageAmount: Number(job.wageAmount),
          wageType: job.wageType,
          publishedAt: job.publishedAt,
          createdAt: job.createdAt,
          requiredSkills: job.jobRequiredSkills.map((jrs: any) => ({
            skillId: jrs.skillId,
            name: jrs.skill.name,
            category: jrs.skill.category,
            isRequired: jrs.isRequired,
            minExperienceYears: jrs.minExperienceYears,
          })),
        };

        const { recommendation } = evaluateWorkerJobRecommendation(
          matchingWorkerData,
          recommendationJobData,
          distanceKm,
          effectiveRadiusKm,
          nowMs
        );

        const { match } = evaluateWorkerJobMatch(
          matchingWorkerData,
          recommendationJobData,
          distanceKm,
          effectiveRadiusKm
        );

        const employer: PublicEmployerInfo = {
          businessName: job.employerProfile.businessName,
          businessType: job.employerProfile.businessType,
          locality: job.employerProfile.locality,
          city: job.employerProfile.city,
          verificationState: job.employerProfile.verificationState,
          totalJobsPosted: job.employerProfile.totalJobsPosted,
        };

        recommendation.reasons.unshift('Recommended as nearby popular listing (fallback)');

        finalItemList.push({
          id: job.id,
          title: job.title,
          description: job.description,
          category: job.category,
          status: job.status as JobStatus,
          urgency: job.urgency as JobUrgency,
          wageType: job.wageType as WageType,
          wageAmount: Number(job.wageAmount),
          workerCount: job.workerCount,
          durationDays: job.durationDays,
          startDate: job.startDate.toISOString().slice(0, 10),
          startTime: job.startTime,
          requirements: job.requirements,
          languageRequirements: job.languageRequirements,
          publishedAt: job.publishedAt ? job.publishedAt.toISOString() : null,
          createdAt: job.createdAt.toISOString(),
          location: {
            locality: job.jobLocation.locality,
            city: job.jobLocation.city,
            state: job.jobLocation.state,
            pinCode: job.jobLocation.pinCode,
            addressLine: job.jobLocation.addressLine,
          },
          employer,
          requiredSkills: recommendationJobData.requiredSkills,
          distanceKm: Number(distanceKm.toFixed(2)),
          match,
          recommendation,
          isFallback: true,
        });
      }
    }

    // 6. Deterministic sorting:
    // Recommendation score desc -> Distance asc -> Invariant UUID tie-breaker
    finalItemList.sort((a, b) => {
      return (
        b.recommendation.score - a.recommendation.score ||
        a.distanceKm - b.distanceKm ||
        a.id.localeCompare(b.id)
      );
    });

    // 7. Pagination
    const total = finalItemList.length;
    const page = query.page;
    const limit = query.limit;
    const startIndex = (page - 1) * limit;
    const paginatedItems = startIndex < total ? finalItemList.slice(startIndex, startIndex + limit) : [];
    const totalPages = Math.ceil(total / limit) || 1;
    const hasNextPage = page < totalPages;

    const elapsedNs = process.hrtime.bigint() - startNs;
    const latencyMs = Number(elapsedNs / 1000000n);
    const candidateTruncated =
      candidateRows.length >= maxCandidateCeiling && requiredCandidates >= maxCandidateCeiling;
    let missingAttributesCount = 0;
    if (worker.expectedWage === null) missingAttributesCount++;
    if (worker.reliabilityScore === null || worker.reliabilityScore === undefined) missingAttributesCount++;
    if (worker.workerSkills.length === 0) missingAttributesCount++;
    if (worker.availabilities.length === 0) missingAttributesCount++;

    return {
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
      },
      metadata: {
        isFallback,
        workerRadiusKm: effectiveRadiusKm,
        appliedCount: appliedJobIds.size,
        blockedEmployerCount: blockedUserIds.size,
        evaluatedCandidateCount: unblockedJobs.length,
        telemetry: {
          latencyMs,
          candidateTruncated,
          eligibleCount: evaluatedRecommendations.length,
          missingAttributesCount,
        },
      },
    };
  }
}

