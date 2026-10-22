/**
 * LocalSaathi Hyperlocal Matching Engine Constants
 * Deterministic weighting factors and thresholds for worker-job matching.
 */

export const MATCH_WEIGHTS = {
  DISTANCE: 0.30,      // 30% weight: Proximity is paramount in hyperlocal jobs
  SKILLS: 0.35,        // 35% weight: Core required skill competency
  EXPERIENCE: 0.15,    // 15% weight: Practical track record & tenure
  AVAILABILITY: 0.10,  // 10% weight: Scheduling alignment on job date/time
  WAGE: 0.10,          // 10% weight: Financial expectation compatibility
} as const;

export const DOMAIN_DEFAULTS = {
  SERVICE_RADIUS_KM: 10,
  MAX_ALLOWED_RADIUS_KM: 50,
  MIN_ELIGIBILITY_SCORE: 20,
} as const;
