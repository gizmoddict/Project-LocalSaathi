import { VerificationStatus } from './user.types';
import { WageType } from './job.types';

/**
 * Worker onboarding lifecycle status.
 */
export enum OnboardingStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

/**
 * Skill proficiency levels.
 */
export enum SkillProficiency {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  EXPERT = 'EXPERT',
}

/**
 * Availability status options.
 */
export enum AvailabilityStatus {
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
  BOOKED = 'BOOKED',
}

/**
 * Clean Worker Profile response payload.
 * Excludes internal database relations and sensitive audit columns.
 */
export interface WorkerProfileResponse {
  id: string;
  userId: string;
  displayName: string;
  profilePhotoKey: string | null;
  profilePhotoUrl?: string | null;
  bio: string | null;
  experienceYears: number;
  expectedWage: number | null;
  wageType: WageType;
  preferredRadiusKm: number;
  languages: string[];
  isAvailable: boolean;
  onboardingStatus: OnboardingStatus;
  onboardingCompletedAt: string | null;
  verificationStatus: VerificationStatus;
  completedJobsCount: number;
  avgRating: number;
  ratingCount: number;
  reliabilityScore: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Worker Skill response with joined catalog metadata.
 */
export interface WorkerSkillResponse {
  id: string;
  skillId: string;
  name: string;
  category: string;
  proficiency: string;
  experienceYears: number;
  isVerified: boolean;
}

/**
 * Platform Skill catalog item.
 */
export interface SkillCatalogItem {
  id: string;
  name: string;
  normalizedName: string;
  category: string;
  isActive: boolean;
}

/**
 * Worker Location response.
 * Exact latitude and longitude are only included on authenticated worker's self-requests.
 */
export interface WorkerLocationResponse {
  locality: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  addressLine?: string | null;
  preferredRadiusKm: number;
  latitude?: number;
  longitude?: number;
  updatedAt: string;
}

/**
 * Worker Availability schedule response item.
 */
export interface WorkerAvailabilityResponse {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  startTime: string | null; // HH:mm
  endTime: string | null;   // HH:mm
  status: AvailabilityStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Worker profile completion response.
 */
export interface WorkerCompletionResponse {
  completionPercentage: number;
  completedSteps: string[];
  remainingSteps: string[];
  isComplete: boolean;
}

/**
 * Aggregated Worker Dashboard payload.
 */
export interface WorkerDashboardResponse {
  profile: WorkerProfileResponse;
  completion: WorkerCompletionResponse;
  skillsCount: number;
  hasLocation: boolean;
  hasAvailability: boolean;
}
