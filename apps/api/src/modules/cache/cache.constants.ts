// ==============================================================================
// LocalSaathi — Cache System Constants & Thresholds (Phase 19)
// ==============================================================================

export const CACHE_CONSTANTS = {
  /** Global Key Prefix & API Versioning */
  PREFIX: 'local_saathi',
  VERSION: 'v1',

  /** Default TTL Values in Seconds */
  TTL: {
    /** Static skill catalog: 24 hours */
    SKILLS_CATALOG: 86400,
    /** Public employer info: 1 hour */
    EMPLOYER_PUBLIC: 3600,
    /** Public job detail DTO: 15 minutes */
    JOB_DETAIL: 900,
    /** Spatial nearby candidate IDs: 2 minutes */
    GEO_CANDIDATES: 120,
    /** Admin non-authoritative metrics overview: 30 seconds */
    ADMIN_METRICS: 30,
    /** Negative cache (entity not found sentinel): 30 seconds */
    NEGATIVE_CACHE: 30,
  },

  /** Stampede Lock Durations */
  LOCK: {
    /** Distributed lock lease time in ms */
    LEASE_MS: 4000,
    /** Polling interval when waiting for lock release in ms */
    POLL_INTERVAL_MS: 50,
    /** Maximum total time to wait for cache population in ms */
    WAIT_TIMEOUT_MS: 800,
  },

  /** Value Size & Length Boundaries */
  LIMITS: {
    /** Maximum allowed serialized string length in bytes (64 KB) */
    MAX_PAYLOAD_BYTES: 64 * 1024,
    /** Maximum allowed items in cached arrays */
    MAX_ARRAY_ITEMS: 200,
  },

  /** Sentinel value stored for negative caching */
  NEGATIVE_SENTINEL: '__LOCALSAATHI_NIL__',
} as const;
