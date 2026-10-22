/**
 * LocalSaathi Hyperlocal Recommendation System Constants
 * Deterministic weighting factors, thresholds, and candidate boundaries.
 */

export const RECOMMENDATION_WEIGHTS = {
  SKILLS: 0.30,         // 30% weight: Core trade skill alignment
  PROXIMITY: 0.25,      // 25% weight: Proximity within worker's travel radius
  EXPERIENCE: 0.15,     // 15% weight: Practical track record & tenure
  AVAILABILITY: 0.10,   // 10% weight: Scheduling alignment on job date/time
  WAGE: 0.10,           // 10% weight: Financial compensation compatibility
  RELIABILITY: 0.05,    // 5% weight: Worker reliability score & track record
  FRESHNESS: 0.05,      // 5% weight: Recency bonus for newly published jobs (recency decay)
} as const;

export const RECOMMENDATION_DEFAULTS = {
  MAX_CANDIDATE_CEILING: 500,
  MIN_CANDIDATE_RETRIEVAL: 200,
  FRESHNESS_HALF_LIFE_DAYS: 3, // Newly published jobs (within 3 days) receive full/high freshness
  FALLBACK_TOP_N: 10,          // Return top 10 general nearby jobs if recommendations are empty
} as const;
