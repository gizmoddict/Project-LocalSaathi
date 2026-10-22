import {
  MatchExplanation,
  MatchScoreBreakdown,
  SkillMatchDetail,
} from '@localsaathi/types';
import { MATCH_WEIGHTS } from './matching.constants';

export interface MatchingWorkerData {
  experienceYears: number;
  expectedWage: number | null;
  wageType: string;
  preferredRadiusKm: number;
  isAvailable: boolean;
  skills: Array<{
    skillId: string;
    proficiency: string;
    experienceYears: number;
  }>;
  availabilities: Array<{
    date: Date | string;
    startTime?: string | null;
    endTime?: string | null;
    status: string;
  }>;
}

export interface MatchingJobData {
  id: string;
  startDate: Date | string;
  startTime: string | null;
  durationDays: number;
  wageAmount: number;
  wageType: string;
  requiredSkills: Array<{
    skillId: string;
    name: string;
    category: string;
    isRequired: boolean;
    minExperienceYears: number;
  }>;
}

/**
 * Pure, deterministic matching engine.
 * Computes transparent match scores, breakdowns, and explainable reasons.
 *
 * Invariant: SAME INPUT + SAME DATABASE STATE = EXACT SAME SCORE.
 */
export function evaluateWorkerJobMatch(
  worker: MatchingWorkerData,
  job: MatchingJobData,
  distanceKm: number,
  effectiveRadiusKm: number
): { match: MatchExplanation; skillDetails: SkillMatchDetail[] } {
  // 1. Distance Calculation (30% weight)
  const clampedDistanceKm = Math.max(0, distanceKm);
  const distanceRatio = Math.min(1, clampedDistanceKm / effectiveRadiusKm);
  const distanceScore = Math.max(0, Math.min(100, Math.round(100 * (1 - distanceRatio))));

  // 2. Skill Compatibility Calculation (35% weight)
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

  const skillCoverage = totalRequiredCount === 0 ? 1 : matchedRequiredCount / totalRequiredCount;
  const skillScore = Math.round(100 * skillCoverage);

  // 3. Experience Compatibility Calculation (15% weight)
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

  // 4. Availability Compatibility Calculation (10% weight)
  const jobDateStr = typeof job.startDate === 'string'
    ? job.startDate.slice(0, 10)
    : job.startDate.toISOString().slice(0, 10);

  const matchedAvailability = worker.availabilities.find((a) => {
    const aDateStr = typeof a.date === 'string' ? a.date.slice(0, 10) : a.date.toISOString().slice(0, 10);
    return aDateStr === jobDateStr;
  });

  let availabilityCompatible = true;
  let availabilityScore = 80; // Baseline when general availability is true
  let availabilityReason = 'General availability active (no specific schedule conflict reported)';

  if (matchedAvailability) {
    if (matchedAvailability.status === 'UNAVAILABLE' || matchedAvailability.status === 'BOOKED') {
      availabilityCompatible = false;
      availabilityScore = 0;
      availabilityReason = `You are marked as ${matchedAvailability.status.toLowerCase()} on this date`;
    } else if (matchedAvailability.status === 'AVAILABLE') {
      availabilityCompatible = true;
      availabilityScore = 100;
      availabilityReason = 'Explicitly confirmed available on the job date';
    }
  } else if (!worker.isAvailable) {
    availabilityCompatible = false;
    availabilityScore = 20;
    availabilityReason = 'Your profile is currently set to unavailable';
  }

  // 5. Wage Compatibility Calculation (10% weight)
  let wageCompatible: boolean | null = null;
  let wageScore = 80;
  let wageComparisonText = 'Wage expectation not set by worker';

  if (worker.expectedWage !== null && worker.expectedWage > 0) {
    if (worker.wageType === job.wageType) {
      if (job.wageAmount >= worker.expectedWage) {
        wageCompatible = true;
        wageScore = 100;
        wageComparisonText = `Offered ₹${job.wageAmount.toLocaleString('en-IN')} meets or exceeds your expected ₹${worker.expectedWage.toLocaleString('en-IN')}`;
      } else {
        wageCompatible = false;
        const ratio = job.wageAmount / worker.expectedWage;
        wageScore = Math.max(0, Math.min(100, Math.round(100 * ratio)));
        wageComparisonText = `Offered ₹${job.wageAmount.toLocaleString('en-IN')} is below your expected ₹${worker.expectedWage.toLocaleString('en-IN')}`;
      }
    } else {
      wageCompatible = null;
      wageScore = 75;
      wageComparisonText = `Different wage types (${job.wageType} offered vs ${worker.wageType} expected)`;
    }
  }

  // 6. Aggregate Deterministic Score (0 - 100)
  const weightedScore =
    MATCH_WEIGHTS.DISTANCE * distanceScore +
    MATCH_WEIGHTS.SKILLS * skillScore +
    MATCH_WEIGHTS.EXPERIENCE * experienceScore +
    MATCH_WEIGHTS.AVAILABILITY * availabilityScore +
    MATCH_WEIGHTS.WAGE * wageScore;

  const totalScore = Math.max(0, Math.min(100, Math.round(weightedScore)));

  // 7. Overall Eligibility Criteria
  const withinServiceRadius = distanceKm <= effectiveRadiusKm;
  const hasBasicSkillMatch = totalRequiredCount === 0 || matchedRequiredCount > 0;
  const eligible = withinServiceRadius && hasBasicSkillMatch && availabilityCompatible;

  // 8. Human-Readable Explainable Reasons
  const reasons: string[] = [];

  // Distance reason
  if (withinServiceRadius) {
    reasons.push(`Within your ${effectiveRadiusKm} km service area (${distanceKm.toFixed(1)} km away)`);
  } else {
    reasons.push(`Outside your ${effectiveRadiusKm} km service area (${distanceKm.toFixed(1)} km away)`);
  }

  // Skill reason
  if (totalRequiredCount === 0) {
    reasons.push('No specific prerequisite skills required');
  } else if (matchedRequiredCount === totalRequiredCount) {
    const matchedNames = targetSkills.map((s) => s.name).join(', ');
    reasons.push(`All ${totalRequiredCount} required skill(s) matched: ${matchedNames}`);
  } else if (matchedRequiredCount > 0) {
    const matchedNames = targetSkills.filter((s) => s.workerHasSkill).map((s) => s.name).join(', ');
    const missingNames = targetSkills.filter((s) => !s.workerHasSkill).map((s) => s.name).join(', ');
    reasons.push(`${matchedRequiredCount} of ${totalRequiredCount} skill(s) matched (${matchedNames}); missing: ${missingNames}`);
  } else {
    const missingNames = targetSkills.map((s) => s.name).join(', ');
    reasons.push(`0 of ${totalRequiredCount} required skill(s) matched (Requires: ${missingNames})`);
  }

  // Experience reason
  if (experienceMet) {
    reasons.push('Your experience satisfies job prerequisites');
  } else {
    reasons.push('Some required skills need higher experience years');
  }

  // Availability reason
  reasons.push(availabilityReason);

  // Wage reason
  reasons.push(wageComparisonText);

  const breakdown: MatchScoreBreakdown = {
    distanceKm: Number(distanceKm.toFixed(2)),
    effectiveRadiusKm,
    distanceScore,
    matchedSkillsCount: matchedRequiredCount,
    totalRequiredSkillsCount: totalRequiredCount,
    skillCoveragePercentage: Number((skillCoverage * 100).toFixed(1)),
    skillScore,
    experienceMet,
    experienceScore,
    availabilityCompatible,
    availabilityReason,
    availabilityScore,
    wageCompatible,
    wageComparisonText,
    wageScore,
  };

  return {
    match: {
      eligible,
      score: totalScore,
      reasons,
      breakdown,
    },
    skillDetails,
  };
}
