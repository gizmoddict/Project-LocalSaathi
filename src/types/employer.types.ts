import { OnboardingStatus } from './worker.types';
import { VerificationStatus } from './user.types';

/**
 * Clean typed Employer Profile API response.
 */
export interface EmployerProfileResponse {
  id: string;
  userId: string;
  businessName: string;
  description: string | null;
  businessType: string | null;
  contactPreferences: string[];
  verificationState: VerificationStatus;
  totalJobsPosted: number;
  totalHires: number;
  addressLine: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  onboardingStatus: OnboardingStatus;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Server-side computed Employer profile completion assessment.
 */
export interface EmployerCompletionResponse {
  completionPercentage: number;
  completedSteps: string[];
  remainingSteps: string[];
  isComplete: boolean;
  details: {
    businessName: boolean;
    description: boolean;
    businessType: boolean;
    contactPreferences: boolean;
    location: boolean;
  };
}

/**
 * Employer Dashboard response.
 */
export interface EmployerDashboardResponse {
  profile: EmployerProfileResponse;
  completion: EmployerCompletionResponse;
  activeJobsCount: number;
  totalJobsCount: number;
  totalApplicationsCount?: number;
  pendingApplicationsCount?: number;
  shortlistedApplicationsCount?: number;
  acceptedApplicationsCount?: number;
}
