import {
  evaluateWorkerJobRecommendation,
  RecommendationWorkerData,
  RecommendationJobData,
} from '../recommendation.engine';
import { RECOMMENDATION_WEIGHTS } from '../recommendation.constants';

describe('LocalSaathi Recommendation Engine (Unit Tests)', () => {
  const baseWorker: RecommendationWorkerData = {
    experienceYears: 5,
    expectedWage: 800,
    wageType: 'DAILY',
    preferredRadiusKm: 20,
    isAvailable: true,
    reliabilityScore: 95,
    completedJobsCount: 12,
    skills: [
      { skillId: 'skill-plumb', proficiency: 'EXPERT', experienceYears: 5 },
      { skillId: 'skill-elec', proficiency: 'INTERMEDIATE', experienceYears: 3 },
    ],
    availabilities: [
      { date: '2026-10-15', status: 'AVAILABLE' },
      { date: '2026-10-16', status: 'UNAVAILABLE' },
    ],
  };

  const baseJob: RecommendationJobData = {
    id: 'job-rec-1',
    startDate: '2026-10-15',
    startTime: '09:00',
    durationDays: 1,
    wageAmount: 1000,
    wageType: 'DAILY',
    publishedAt: new Date(Date.now() - 3600 * 1000 * 24), // 1 day ago
    createdAt: new Date(Date.now() - 3600 * 1000 * 24),
    requiredSkills: [
      {
        skillId: 'skill-plumb',
        name: 'Plumbing',
        category: 'Plumbing',
        isRequired: true,
        minExperienceYears: 3,
      },
    ],
  };

  const refNow = new Date('2026-10-14T12:00:00Z').getTime();

  it('1. Determinism - same inputs always yield identical recommendation scores and breakdowns', () => {
    const fixedJob = {
      ...baseJob,
      publishedAt: new Date('2026-10-13T12:00:00Z'),
      createdAt: new Date('2026-10-13T12:00:00Z'),
    };

    const res1 = evaluateWorkerJobRecommendation(baseWorker, fixedJob, 5, 20, refNow);
    const res2 = evaluateWorkerJobRecommendation(baseWorker, fixedJob, 5, 20, refNow);

    expect(res1.recommendation.score).toBe(res2.recommendation.score);
    expect(res1.recommendation.hardConstraintsPassed).toBe(res2.recommendation.hardConstraintsPassed);
    expect(res1.recommendation.reasons).toEqual(res2.recommendation.reasons);
    expect(res1.recommendation.breakdown).toEqual(res2.recommendation.breakdown);
  });

  it('2. Hard Constraints vs Soft Preferences - distance outside radius fails hard constraint', () => {
    const insideRes = evaluateWorkerJobRecommendation(baseWorker, baseJob, 10, 20, refNow);
    const outsideRes = evaluateWorkerJobRecommendation(baseWorker, baseJob, 25, 20, refNow);

    expect(insideRes.recommendation.hardConstraintsPassed).toBe(true);
    expect(outsideRes.recommendation.hardConstraintsPassed).toBe(false);
    expect(outsideRes.recommendation.eligible).toBe(false);
    expect(outsideRes.recommendation.reasons.some((r) => r.includes('Outside'))).toBe(true);
  });

  it('3. Skill Compatibility & Missing Skills - 0 required skills matched fails hard constraint', () => {
    const mismatchedJob: RecommendationJobData = {
      ...baseJob,
      requiredSkills: [
        {
          skillId: 'skill-carpentry',
          name: 'Carpentry',
          category: 'Carpentry',
          isRequired: true,
          minExperienceYears: 2,
        },
      ],
    };

    const res = evaluateWorkerJobRecommendation(baseWorker, mismatchedJob, 5, 20, refNow);
    expect(res.recommendation.hardConstraintsPassed).toBe(false);
    expect(res.recommendation.breakdown.skillScore).toBe(0);
  });

  it('4. Availability Conflict - date marked UNAVAILABLE fails hard constraints', () => {
    const conflictJob: RecommendationJobData = {
      ...baseJob,
      startDate: '2026-10-16', // Worker is explicitly UNAVAILABLE on this date
    };

    const res = evaluateWorkerJobRecommendation(baseWorker, conflictJob, 5, 20, refNow);
    expect(res.recommendation.hardConstraintsPassed).toBe(false);
    expect(res.recommendation.breakdown.availabilityScore).toBe(0);
    expect(res.recommendation.reasons.some((r) => r.includes('unavailable'))).toBe(true);
  });

  it('5. Wage Scoring - higher offered wage yields 100 score, lower wage scales proportionally', () => {
    const higherWageJob = { ...baseJob, wageAmount: 1200 }; // expected 800
    const lowerWageJob = { ...baseJob, wageAmount: 400 };  // expected 800 -> 50%

    const higherRes = evaluateWorkerJobRecommendation(baseWorker, higherWageJob, 5, 20, refNow);
    const lowerRes = evaluateWorkerJobRecommendation(baseWorker, lowerWageJob, 5, 20, refNow);

    expect(higherRes.recommendation.breakdown.wageScore).toBe(100);
    expect(lowerRes.recommendation.breakdown.wageScore).toBe(50);
  });

  it('6. Freshness Decay - newly posted job scores higher freshness than older job', () => {
    const freshJob: RecommendationJobData = {
      ...baseJob,
      publishedAt: new Date(refNow - 1000 * 3600 * 2), // 2 hours ago
      createdAt: new Date(refNow - 1000 * 3600 * 2),
    };

    const staleJob: RecommendationJobData = {
      ...baseJob,
      publishedAt: new Date(refNow - 1000 * 3600 * 24 * 10), // 10 days ago
      createdAt: new Date(refNow - 1000 * 3600 * 24 * 10),
    };

    const freshRes = evaluateWorkerJobRecommendation(baseWorker, freshJob, 5, 20, refNow);
    const staleRes = evaluateWorkerJobRecommendation(baseWorker, staleJob, 5, 20, refNow);

    expect(freshRes.recommendation.breakdown.freshnessScore).toBeGreaterThan(
      staleRes.recommendation.breakdown.freshnessScore
    );
  });

  it('7. Missing Attributes Fallback - gracefully defaults undefined reliability, null expectedWage, and empty availabilities', () => {
    const sparseWorker: RecommendationWorkerData = {
      experienceYears: 2,
      expectedWage: null,
      wageType: 'DAILY',
      preferredRadiusKm: 10,
      isAvailable: true,
      skills: [],
      availabilities: [],
    };

    const noSkillJob: RecommendationJobData = {
      ...baseJob,
      requiredSkills: [],
      publishedAt: null,
      createdAt: new Date(refNow - 1000 * 3600),
    };

    const res = evaluateWorkerJobRecommendation(sparseWorker, noSkillJob, 2, 10, refNow);
    expect(res.recommendation.hardConstraintsPassed).toBe(true);
    expect(res.recommendation.score).toBeGreaterThan(0);
    expect(res.recommendation.breakdown.reliabilityScore).toBe(100);
    expect(res.recommendation.breakdown.wageScore).toBe(80); // baseline when expected wage is null
    expect(res.recommendation.breakdown.skillScore).toBe(100); // 100% when no skills required
  });

  it('8. Weight Configuration Invariant - sum of recommendation weights equals exactly 1.0', () => {
    const sum =
      RECOMMENDATION_WEIGHTS.SKILLS +
      RECOMMENDATION_WEIGHTS.PROXIMITY +
      RECOMMENDATION_WEIGHTS.EXPERIENCE +
      RECOMMENDATION_WEIGHTS.AVAILABILITY +
      RECOMMENDATION_WEIGHTS.WAGE +
      RECOMMENDATION_WEIGHTS.RELIABILITY +
      RECOMMENDATION_WEIGHTS.FRESHNESS;

    expect(Math.round(sum * 100) / 100).toBe(1.0);
  });

  it('9. Boundary Conditions - 0 reliability, 0 distance, exactly at radius boundary', () => {
    const zeroReliabilityWorker: RecommendationWorkerData = {
      ...baseWorker,
      reliabilityScore: 0,
    };

    // Exactly at distance 0
    const zeroDistRes = evaluateWorkerJobRecommendation(
      zeroReliabilityWorker,
      baseJob,
      0,
      20,
      refNow
    );
    expect(zeroDistRes.recommendation.breakdown.proximityScore).toBe(100);
    expect(zeroDistRes.recommendation.breakdown.reliabilityScore).toBe(0);

    // Exactly at boundary distance 20km
    const boundaryDistRes = evaluateWorkerJobRecommendation(
      zeroReliabilityWorker,
      baseJob,
      20,
      20,
      refNow
    );
    expect(boundaryDistRes.recommendation.hardConstraintsPassed).toBe(true);
    expect(boundaryDistRes.recommendation.breakdown.proximityScore).toBe(0);
  });

  it('10. Explanation Text Invariant - explanations accurately reflect score decisions and eligibility', () => {
    const res = evaluateWorkerJobRecommendation(baseWorker, baseJob, 5, 20, refNow);
    expect(res.recommendation.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Within 20 km service area'),
        expect.stringContaining('All 1 required skill(s) matched'),
        expect.stringContaining('Experience meets requirements'),
        expect.stringContaining('Explicitly confirmed available'),
        expect.stringContaining('Offered ₹1,000 meets or exceeds expected ₹800'),
      ])
    );
  });
});
