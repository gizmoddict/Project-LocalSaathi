import { WageType, JobStatus, JobUrgency, JobLocationResponse } from './job.types';
import { MatchScoreBreakdown } from './matching.types';
import { PaginationMetadata } from './api.types';

/**
 * Strict Application Lifecycle Finite State Machine (FSM) states.
 */
export enum ApplicationStatus {
  APPLIED = 'APPLIED',
  SHORTLISTED = 'SHORTLISTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

/**
 * Payload for submitting a new worker job application.
 */
export interface CreateApplicationInput {
  message?: string;
}

/**
 * Compact summary of a worker's application for feed listings.
 */
export interface WorkerApplicationSummary {
  id: string;
  jobId: string;
  jobTitle: string;
  jobCategory: string;
  employerBusinessName: string;
  employerLocality: string | null;
  employerCity: string | null;
  wageType: WageType;
  wageAmount: number;
  jobStatus: JobStatus;
  status: ApplicationStatus;
  appliedAt: string;
  shortlistedAt: string | null;
  rejectedAt: string | null;
  acceptedAt: string | null;
  withdrawnAt: string | null;
  matchScore: number | null;
}

/**
 * Comprehensive application detail view for the applicant worker.
 */
export interface WorkerApplicationDetail extends WorkerApplicationSummary {
  applicationMessage: string | null;
  jobStartDate: string;
  jobStartTime: string | null;
  jobDurationDays: number;
  jobUrgency: JobUrgency;
  jobLocation: JobLocationResponse | null;
  matchBreakdown: MatchScoreBreakdown | null;
  matchReasons: string[];
}

/**
 * Safe public applicant profile projection for employers.
 * Strips all authentication, tokens, phone, email, and internal security fields.
 */
export interface ApplicantWorkerInfo {
  workerId: string;
  displayName: string;
  bio: string | null;
  experienceYears: number;
  skills: Array<{
    skillId: string;
    name: string;
    proficiency: string;
    experienceYears: number;
  }>;
  languages: string[];
  expectedWage: number | null;
  wageType: WageType | null;
  locality: string | null;
  city: string | null;
  reliabilityScore: number;
  completedJobsCount: number;
}

/**
 * Single application record as viewed by the employer who owns the job post.
 */
export interface EmployerApplicationItem {
  id: string;
  jobId: string;
  worker: ApplicantWorkerInfo;
  applicationMessage: string | null;
  status: ApplicationStatus;
  appliedAt: string;
  shortlistedAt: string | null;
  rejectedAt: string | null;
  acceptedAt: string | null;
  withdrawnAt: string | null;
  distanceKm: number;
  match: {
    score: number;
    eligible: boolean;
    reasons: string[];
    breakdown: MatchScoreBreakdown;
  };
}

/**
 * Aggregate summary metrics of applications for a specific employer job.
 */
export interface EmployerApplicationMetrics {
  total: number;
  pending: number;
  shortlisted: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
}

/**
 * Paginated list response for employer application review.
 */
export interface EmployerApplicationListResponse {
  items: EmployerApplicationItem[];
  pagination: PaginationMetadata;
  metrics: EmployerApplicationMetrics;
}

/**
 * Paginated list response for worker's own applications.
 */
export interface WorkerApplicationListResponse {
  items: WorkerApplicationSummary[];
  pagination: PaginationMetadata;
}
