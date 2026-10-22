import {
  EmployerProfileResponse,
  OnboardingStatus,
  VerificationStatus,
} from '@localsaathi/types';

export interface EmployerProfileEntity {
  id: string;
  userId: string;
  businessName: string;
  description: string | null;
  businessType: string | null;
  contactPreferences: string[];
  verificationState: string;
  totalJobsPosted: number;
  totalHires: number;
  addressLine: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  onboardingStatus: string;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class EmployerMapper {
  /**
   * Map database EmployerProfile entity to clean API response DTO.
   */
  static toProfileResponse(employer: EmployerProfileEntity): EmployerProfileResponse {
    return {
      id: employer.id,
      userId: employer.userId,
      businessName: employer.businessName,
      description: employer.description,
      businessType: employer.businessType,
      contactPreferences: employer.contactPreferences,
      verificationState: (employer.verificationState as unknown as VerificationStatus) || VerificationStatus.UNVERIFIED,
      totalJobsPosted: employer.totalJobsPosted,
      totalHires: employer.totalHires,
      addressLine: employer.addressLine,
      locality: employer.locality,
      city: employer.city,
      state: employer.state,
      pinCode: employer.pinCode,
      onboardingStatus: (employer.onboardingStatus as unknown as OnboardingStatus) || OnboardingStatus.NOT_STARTED,
      onboardingCompletedAt: employer.onboardingCompletedAt?.toISOString() ?? null,
      createdAt: employer.createdAt.toISOString(),
      updatedAt: employer.updatedAt.toISOString(),
    };
  }
}
