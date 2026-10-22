import { PrismaClient } from '@prisma/client';

export interface NearbyWorkerResult {
  workerProfileId: string;
  displayName: string;
  distanceMeters: number;
  latitude: number;
  longitude: number;
  avgRating: number;
  reliabilityScore: number;
}

export interface NearbyJobResult {
  jobPostId: string;
  title: string;
  category: string;
  wageAmount: number;
  wageType: string;
  distanceMeters: number;
  latitude: number;
  longitude: number;
  locality: string;
  city: string;
}

/**
 * 1. Find workers within radius (in meters) of a coordinate.
 * Uses PostGIS ST_DWithin with spatial GiST indexing.
 */
export async function findWorkersWithinRadius(
  prisma: PrismaClient,
  latitude: number,
  longitude: number,
  radiusMeters: number,
  limit = 50
): Promise<NearbyWorkerResult[]> {
  const results = await prisma.$queryRaw<NearbyWorkerResult[]>`
    SELECT 
      wp.id AS "workerProfileId",
      wp.display_name AS "displayName",
      ST_Distance(
        wl.location,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ) AS "distanceMeters",
      wl.latitude AS "latitude",
      wl.longitude AS "longitude",
      wp.avg_rating::float AS "avgRating",
      wp.reliability_score::float AS "reliabilityScore"
    FROM worker_locations wl
    JOIN worker_profiles wp ON wp.id = wl.worker_profile_id
    WHERE wl.is_active = true
      AND wp.is_available = true
      AND ST_DWithin(
        wl.location,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY "distanceMeters" ASC
    LIMIT ${limit};
  `;

  return results;
}

/**
 * 2. Find jobs within radius (in meters) of a coordinate.
 * Uses PostGIS ST_DWithin with spatial GiST indexing.
 */
export async function findJobsWithinRadius(
  prisma: PrismaClient,
  latitude: number,
  longitude: number,
  radiusMeters: number,
  limit = 50
): Promise<NearbyJobResult[]> {
  const results = await prisma.$queryRaw<NearbyJobResult[]>`
    SELECT 
      jp.id AS "jobPostId",
      jp.title AS "title",
      jp.category AS "category",
      jp.wage_amount::float AS "wageAmount",
      jp.wage_type AS "wageType",
      ST_Distance(
        jl.location,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ) AS "distanceMeters",
      jl.latitude AS "latitude",
      jl.longitude AS "longitude",
      jl.locality AS "locality",
      jl.city AS "city"
    FROM job_locations jl
    JOIN job_posts jp ON jp.id = jl.job_post_id
    WHERE jp.status = 'PUBLISHED'
      AND ST_DWithin(
        jl.location,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY "distanceMeters" ASC
    LIMIT ${limit};
  `;

  return results;
}

/**
 * 3. Find workers near a specific job.
 * Computes distance between each active worker and the job location.
 */
export async function findWorkersNearJob(
  prisma: PrismaClient,
  jobPostId: string,
  radiusMeters = 15000,
  limit = 50
): Promise<NearbyWorkerResult[]> {
  const results = await prisma.$queryRaw<NearbyWorkerResult[]>`
    SELECT 
      wp.id AS "workerProfileId",
      wp.display_name AS "displayName",
      ST_Distance(wl.location, jl.location) AS "distanceMeters",
      wl.latitude AS "latitude",
      wl.longitude AS "longitude",
      wp.avg_rating::float AS "avgRating",
      wp.reliability_score::float AS "reliabilityScore"
    FROM job_locations jl
    CROSS JOIN worker_locations wl
    JOIN worker_profiles wp ON wp.id = wl.worker_profile_id
    WHERE jl.job_post_id = ${jobPostId}::uuid
      AND wl.is_active = true
      AND wp.is_available = true
      AND ST_DWithin(wl.location, jl.location, ${radiusMeters})
    ORDER BY "distanceMeters" ASC
    LIMIT ${limit};
  `;

  return results;
}

/**
 * 4. Find jobs near a specific worker.
 * Computes distance between published jobs and the worker's latest known location.
 */
export async function findJobsNearWorker(
  prisma: PrismaClient,
  workerProfileId: string,
  radiusMeters = 15000,
  limit = 50
): Promise<NearbyJobResult[]> {
  const results = await prisma.$queryRaw<NearbyJobResult[]>`
    SELECT 
      jp.id AS "jobPostId",
      jp.title AS "title",
      jp.category AS "category",
      jp.wage_amount::float AS "wageAmount",
      jp.wage_type AS "wageType",
      ST_Distance(jl.location, wl.location) AS "distanceMeters",
      jl.latitude AS "latitude",
      jl.longitude AS "longitude",
      jl.locality AS "locality",
      jl.city AS "city"
    FROM worker_locations wl
    CROSS JOIN job_locations jl
    JOIN job_posts jp ON jp.id = jl.job_post_id
    WHERE wl.worker_profile_id = ${workerProfileId}::uuid
      AND jp.status = 'PUBLISHED'
      AND ST_DWithin(jl.location, wl.location, ${radiusMeters})
    ORDER BY "distanceMeters" ASC
    LIMIT ${limit};
  `;

  return results;
}

export interface NearbySkilledWorkerResult extends NearbyWorkerResult {
  matchingSkillCount: number;
}

/**
 * 5. Find workers with matching skills near a job.
 * Joins required job skills with worker skills and applies spatial ST_DWithin.
 */
export async function findWorkersWithSkillsNearJob(
  prisma: PrismaClient,
  jobPostId: string,
  radiusMeters = 15000,
  limit = 50
): Promise<NearbySkilledWorkerResult[]> {
  const results = await prisma.$queryRaw<NearbySkilledWorkerResult[]>`
    SELECT 
      wp.id AS "workerProfileId",
      wp.display_name AS "displayName",
      ST_Distance(wl.location, jl.location) AS "distanceMeters",
      wl.latitude AS "latitude",
      wl.longitude AS "longitude",
      wp.avg_rating::float AS "avgRating",
      wp.reliability_score::float AS "reliabilityScore",
      COUNT(ws.skill_id)::int AS "matchingSkillCount"
    FROM job_locations jl
    CROSS JOIN worker_locations wl
    JOIN worker_profiles wp ON wp.id = wl.worker_profile_id
    JOIN worker_skills ws ON ws.worker_profile_id = wp.id
    JOIN job_required_skills jrs ON jrs.job_post_id = jl.job_post_id AND jrs.skill_id = ws.skill_id
    WHERE jl.job_post_id = ${jobPostId}::uuid
      AND wl.is_active = true
      AND wp.is_available = true
      AND ST_DWithin(wl.location, jl.location, ${radiusMeters})
    GROUP BY wp.id, wp.display_name, wl.location, jl.location, wl.latitude, wl.longitude, wp.avg_rating, wp.reliability_score
    ORDER BY "matchingSkillCount" DESC, "distanceMeters" ASC
    LIMIT ${limit};
  `;

  return results;
}

/**
 * 6. Find available workers for a given day.
 */
export async function findAvailableWorkers(
  prisma: PrismaClient,
  date: Date = new Date(),
  limit = 50
) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return prisma.workerProfile.findMany({
    where: {
      isAvailable: true,
      availabilities: {
        some: {
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
          status: 'AVAILABLE',
        },
      },
    },
    include: {
      availabilities: true,
      workerSkills: {
        include: { skill: true },
      },
    },
    take: limit,
  });
}

/**
 * 7. Find recently posted published jobs.
 */
export async function findRecentlyPostedJobs(
  prisma: PrismaClient,
  limit = 20
) {
  return prisma.jobPost.findMany({
    where: {
      status: 'PUBLISHED',
    },
    orderBy: {
      publishedAt: 'desc',
    },
    include: {
      jobLocation: true,
      jobRequiredSkills: {
        include: { skill: true },
      },
      employerProfile: true,
    },
    take: limit,
  });
}

