import { WageType, JobStatus, JobUrgency } from './job.types';

export interface PublicEmployerInfo {
  businessName: string;
  businessType: string | null;
  locality: string | null;
  city: string | null;
  verificationState: string;
  totalJobsPosted: number;
}

export interface SkillMatchDetail {
  skillId: string;
  name: string;
  category: string;
  isRequired: boolean;
  minExperienceYears: number;
  workerHasSkill: boolean;
  workerProficiency?: string;
  workerExperienceYears?: number;
  experienceMet: boolean;
}

export interface MatchScoreBreakdown {
  distanceKm: number;
  effectiveRadiusKm: number;
  distanceScore: number;
  matchedSkillsCount: number;
  totalRequiredSkillsCount: number;
  skillCoveragePercentage: number;
  skillScore: number;
  experienceMet: boolean;
  experienceScore: number;
  availabilityCompatible: boolean;
  availabilityReason: string;
  availabilityScore: number;
  wageCompatible: boolean | null;
  wageComparisonText: string;
  wageScore: number;
}

export interface MatchExplanation {
  eligible: boolean;
  score: number; // 0 - 100
  reasons: string[];
  breakdown: MatchScoreBreakdown;
}

export interface DiscoveredJobItem {
  id: string;
  title: string;
  description: string;
  category: string;
  status: JobStatus;
  urgency: JobUrgency;
  wageType: WageType;
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
    addressLine?: string | null;
    latitude?: number;
    longitude?: number;
  };
  employer: PublicEmployerInfo;
  requiredSkills: Array<{
    skillId: string;
    name: string;
    category: string;
    isRequired: boolean;
    minExperienceYears: number;
  }>;
  distanceKm: number;
  match: MatchExplanation;
}

export interface WorkerJobDiscoveryResponse {
  items: DiscoveredJobItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
  };
}

export interface WorkerJobDetailResponse extends DiscoveredJobItem {
  skillDetails: SkillMatchDetail[];
}

export type WorkerJobQuerySort =
  | 'score_desc'
  | 'distance_asc'
  | 'wage_desc'
  | 'created_desc';

export interface WorkerJobDiscoveryQuery {
  query?: string;
  radiusKm?: number;
  latitude?: number;
  longitude?: number;
  skillId?: string;
  category?: string;
  wageType?: WageType;
  minWage?: number;
  maxWage?: number;
  date?: string;
  sort?: WorkerJobQuerySort;
  page?: number;
  limit?: number;
}
