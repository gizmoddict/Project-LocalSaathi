// ==============================================================================
// LocalSaathi — Distributed Redis Caching Type Definitions (Phase 19)
// ==============================================================================

export enum CacheNamespace {
  SKILLS = 'skills',
  EMPLOYER = 'employer',
  JOBS = 'jobs',
  GEO = 'geo',
  ADMIN = 'admin',
}

export type CacheConsistency = 'STRONGLY_CONSISTENT' | 'EVENTUALLY_CONSISTENT';

export type CacheClassification = 'CACHEABLE' | 'CONDITIONALLY_CACHEABLE' | 'DO_NOT_CACHE';

export interface CacheWrapOptions {
  /** Time to live in seconds */
  ttl: number;
  /** Whether to enable single-flight / mutex stampede lock on cold key misses */
  stampedeProtect?: boolean;
  /** Lock lease time in milliseconds (defaults to 3000ms) */
  lockTtlMs?: number;
  /** Max time in milliseconds to wait for concurrent worker to populate cache */
  lockWaitTimeoutMs?: number;
  /** Whether to cache null/not-found responses */
  negativeCache?: boolean;
  /** TTL in seconds for negative cache entries (defaults to 30s) */
  negativeTtl?: number;
  /** Maximum allowed serialized size in KB before skipping cache (defaults to 64KB) */
  maxSizeKb?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRatio: number;
  setFailures: number;
  getFailures: number;
  invalidations: number;
  stampedeLocks: number;
  stampedeWaits: number;
}

export interface PublicEmployerCachedDto {
  businessName: string;
  businessType: string;
  locality: string;
  city: string;
  verificationState: string;
  totalJobsPosted: number;
}

export interface PublicJobDetailCachedDto {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  urgency: string;
  wageType: string;
  wageAmount: number;
  workerCount: number;
  durationDays: number;
  startDate: string;
  startTime: string | null;
  requirements: string[];
  languageRequirements: string[];
  publishedAt: string | null;
  createdAt: string;
  location: {
    locality: string;
    city: string;
    state: string;
    pinCode: string;
    addressLine: string | null;
    latitude: number;
    longitude: number;
  };
  employer: PublicEmployerCachedDto;
  requiredSkills: Array<{
    skillId: string;
    name: string;
    category: string;
    isRequired: boolean;
    minExperienceYears: number;
  }>;
}

export interface GeoJobCandidatesCachedDto {
  geohash: string;
  radiusKm: number;
  filterHash: string;
  candidateIds: string[];
  cachedAt: string;
}
