/**
 * Strict Job Lifecycle Finite State Machine (FSM) states.
 */
export enum JobStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  PAUSED = 'PAUSED',
  FILLED = 'FILLED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

/**
 * Wage payment structure.
 */
export enum WageType {
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
  FIXED = 'FIXED',
  PIECE_RATE = 'PIECE_RATE',
}

/**
 * Urgency flag for matching and notification prioritization.
 */
export enum JobUrgency {
  IMMEDIATE = 'IMMEDIATE', // within 24 hours
  STANDARD = 'STANDARD',   // next 2-5 days
  FLEXIBLE = 'FLEXIBLE',   // whenever available
}

/**
 * Skill attached to a job post.
 */
export interface JobSkillResponse {
  id: string;
  skillId: string;
  name: string;
  category: string;
  isRequired: boolean;
  minExperienceYears: number;
}

/**
 * PostGIS spatial and structured address for a job post.
 */
export interface JobLocationResponse {
  id: string;
  jobPostId: string;
  latitude: number;
  longitude: number;
  addressLine: string | null;
  locality: string;
  city: string;
  state: string;
  pinCode: string;
}

/**
 * Complete Job Post entity API response.
 */
export interface JobResponse {
  id: string;
  employerProfileId: string;
  title: string;
  description: string;
  status: JobStatus;
  category: string;
  wageType: WageType;
  wageAmount: number;
  workerCount: number;
  durationDays: number;
  startDate: string;
  startTime: string | null;
  urgency: JobUrgency;
  requirements: string[];
  languageRequirements: string[];
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  requiredSkills: JobSkillResponse[];
  location: JobLocationResponse | null;
}

/**
 * Paginated list of jobs for an employer.
 */
export interface JobListResponse {
  jobs: JobResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
