import {
  RecommendationExplanation,
  RecommendationScoreBreakdown,
  SkillMatchDetail,
} from '@localsaathi/types';
import { MatchingWorkerData, MatchingJobData } from './matching.engine';
import { RECOMMENDATION_WEIGHTS } from './recommendation.constants';

export interface RecommendationWorkerData extends MatchingWorkerData {
  reliabilityScore?: number; // 0 - 100, default 100
  completedJobsCount?: number;
}

export interface RecommendationJobData extends MatchingJobData {
  publishedAt: Date | string | null;
  createdAt: Date | string;
}

/**
 * Pure, deterministic recommendation scoring and ranking engine.
 *
 * Invariant:
 * 1. SAME INPUT + SAME TIME CONTEXT = EXACT SAME SCORE.
 * 2. Hard eligibility constraints are isolated from preference weighting.
 * 3. Explainability: Transparent score breakdown and plain-language justification.
 */
export function evaluateWorkerJobRecommendation(
  worker: RecommendationWorkerData,
  job: RecommendationJobData,
  distanceKm: number,
  effectiveRadiusKm: number,
  referenceNowMs: number = Date.now()
): { recommendation: RecommendationExplanation; skillDetails: SkillMatchDetail[] } {
  // ==========================================
  // 1. HARD ELIGIBILITY CONSTRAINTS (Pass/Fail)
  // ==========================================
  const withinServiceRadius = distanceKm <= effectiveRadiusKm;

  // Evaluate skills
  const skillDetails: SkillMatchDetail[] = job.requiredSkills.map((reqSkill) => {
    const workerSkill = worker.skills.find((ws) => ws.skillId === reqSkill.skillId);
    const workerHasSkill = !!workerSkill;
    const workerExp = workerSkill ? workerSkill.experienceYears : 0;
    const experienceMet = !reqSkill.minExperienceYears || workerExp >= reqSkill.minExperienceYears;

    return {
      skillId: reqSkill.skillId,
      name: reqSkill.name,
      category: reqSkill.category,
      isRequired: reqSkill.isRequired,
      minExperienceYears: reqSkill.minExperienceYears,
      workerHasSkill,
      workerProficiency: workerSkill?.proficiency,
      workerExperienceYears: workerExp,
      experienceMet,
    };
  });

  const requiredSkills = skillDetails.filter((s) => s.isRequired);
  const targetSkills = requiredSkills.length > 0 ? requiredSkills : skillDetails;
  const totalRequiredCount = targetSkills.length;
  const matchedRequiredCount = targetSkills.filter((s) => s.workerHasSkill).length;

  // Basic skill eligibility: if requirements exist, worker must have at least one or all required
  const hasBasicSkillMatch = totalRequiredCount === 0 || matchedRequiredCount > 0;

  // Availability hard check: must not be explicitly marked UNAVAILABLE/BOOKED
  const jobDateStr = typeof job.startDate === 'string'
    ? job.startDate.slice(0, 10)
    : job.startDate.toISOString().slice(0, 10);

  const matchedAvailability = worker.availabilities.find((a) => {
    const aDateStr = typeof a.date === 'string' ? a.date.slice(0, 10) : a.date.toISOString().slice(0, 10);
    return aDateStr === jobDateStr;
  });

  let availabilityCompatible = true;
  let availabilityScore = 80;
  let availabilityReason = 'General availability active';

  if (matchedAvailability) {
    if (matchedAvailability.status === 'UNAVAILABLE' || matchedAvailability.status === 'BOOKED') {
      availabilityCompatible = false;
      availabilityScore = 0;
      availabilityReason = `Marked as ${matchedAvailability.status.toLowerCase()} on this date`;
    } else if (matchedAvailability.status === 'AVAILABLE') {
      availabilityCompatible = true;
      availabilityScore = 100;
      availabilityReason = 'Explicitly confirmed available on the job date';
    }
  } else if (!worker.isAvailable) {
    availabilityCompatible = false;
    availabilityScore = 20;
    availabilityReason = 'Profile set to unavailable';
  }

  const hardConstraintsPassed = withinServiceRadius && hasBasicSkillMatch && availabilityCompatible;

  // ==========================================
  // 2. SOFT RANKING PREFERENCES (0 - 100 each)
  // ==========================================

  // (a) Proximity Score (25%)
  const clampedDistanceKm = Math.max(0, distanceKm);
  const distanceRatio = Math.min(1, clampedDistanceKm / effectiveRadiusKm);
  const proximityScore = Math.max(0, Math.min(100, Math.round(100 * (1 - distanceRatio))));

  // (b) Skill Score (30%)
  const skillCoverage = totalRequiredCount === 0 ? 1 : matchedRequiredCount / totalRequiredCount;
  const skillScore = Math.round(100 * skillCoverage);

  // (c) Experience Score (15%)
  let experienceScore = 100;
  let experienceMet = true;
  if (targetSkills.length > 0) {
    const skillsRequiringExp = targetSkills.filter((s) => s.minExperienceYears > 0);
    if (skillsRequiringExp.length > 0) {
      const skillsExpMet = skillsRequiringExp.filter((s) => s.experienceMet).length;
      experienceScore = Math.round(100 * (skillsExpMet / skillsRequiringExp.length));
      experienceMet = skillsExpMet === skillsRequiringExp.length;
    }
  }

  // (d) Wage Compatibility (10%)
  let wageScore = 80;
  let wageReason = 'Wage expectation not specified';
  if (worker.expectedWage !== null && worker.expectedWage > 0) {
    if (worker.wageType === job.wageType) {
      if (job.wageAmount >= worker.expectedWage) {
        wageScore = 100;
        wageReason = `Offered ₹${job.wageAmount.toLocaleString('en-IN')} meets or exceeds expected ₹${worker.expectedWage.toLocaleString('en-IN')}`;
      } else {
        const ratio = job.wageAmount / worker.expectedWage;
        wageScore = Math.max(0, Math.min(100, Math.round(100 * ratio)));
        wageReason = `Offered ₹${job.wageAmount.toLocaleString('en-IN')} is below expected ₹${worker.expectedWage.toLocaleString('en-IN')}`;
      }
    } else {
      wageScore = 75;
      wageReason = `Different wage types (${job.wageType} offered vs ${worker.wageType} expected)`;
    }
  }

  // (e) Reliability Score (5%)
  const rawReliability = worker.reliabilityScore !== undefined ? worker.reliabilityScore : 100;
  const reliabilityScore = Math.max(0, Math.min(100, Math.round(rawReliability)));

  // (f) Freshness Score (5%)
  const publishedDate = job.publishedAt
    ? (typeof job.publishedAt === 'string' ? new Date(job.publishedAt) : job.publishedAt)
    : (typeof job.createdAt === 'string' ? new Date(job.createdAt) : job.createdAt);

  const ageMs = Math.max(0, referenceNowMs - publishedDate.getTime());
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  // Exponential recency decay: freshness = 100 * 2^(-ageDays / 3)
  const freshnessScore = Math.max(0, Math.min(100, Math.round(100 * Math.pow(0.5, ageDays / 3))));

  // ==========================================
  // 3. WEIGHTED AGGREGATE SCORE
  // ==========================================
  const rawAggregate =
    RECOMMENDATION_WEIGHTS.SKILLS * skillScore +
    RECOMMENDATION_WEIGHTS.PROXIMITY * proximityScore +
    RECOMMENDATION_WEIGHTS.EXPERIENCE * experienceScore +
    RECOMMENDATION_WEIGHTS.AVAILABILITY * availabilityScore +
    RECOMMENDATION_WEIGHTS.WAGE * wageScore +
    RECOMMENDATION_WEIGHTS.RELIABILITY * reliabilityScore +
    RECOMMENDATION_WEIGHTS.FRESHNESS * freshnessScore;

  const score = Math.max(0, Math.min(100, Math.round(rawAggregate)));

  // ==========================================
  // 4. EXPLAINABLE REASONS
  // ==========================================
  const reasons: string[] = [];

  // Proximity reason
  if (withinServiceRadius) {
    reasons.push(`Within ${effectiveRadiusKm} km service area (${distanceKm.toFixed(1)} km away)`);
  } else {
    reasons.push(`Outside ${effectiveRadiusKm} km service area (${distanceKm.toFixed(1)} km away)`);
  }

  // Skill reason
  if (totalRequiredCount === 0) {
    reasons.push('No specific prerequisite skills required');
  } else if (matchedRequiredCount === totalRequiredCount) {
    reasons.push(`All ${totalRequiredCount} required skill(s) matched`);
  } else if (matchedRequiredCount > 0) {
    reasons.push(`${matchedRequiredCount} of ${totalRequiredCount} skill(s) matched`);
  } else {
    reasons.push(`0 of ${totalRequiredCount} required skill(s) matched`);
  }

  // Experience reason
  if (experienceMet) {
    reasons.push('Experience meets requirements');
  } else {
    reasons.push('Experience requirements partially met');
  }

  // Availability reason
  reasons.push(availabilityReason);

  // Wage reason
  reasons.push(wageReason);

  // Freshness badge
  if (ageDays <= 2) {
    reasons.push('Recently posted (high priority)');
  }

  const breakdown: RecommendationScoreBreakdown = {
    proximityScore,
    skillScore,
    experienceScore,
    availabilityScore,
    wageScore,
    reliabilityScore,
    freshnessScore,
  };

  return {
    recommendation: {
      eligible: hardConstraintsPassed,
      hardConstraintsPassed,
      score,
      reasons,
      breakdown,
    },
    skillDetails,
  };
}
