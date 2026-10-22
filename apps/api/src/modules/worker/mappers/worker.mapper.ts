import {
  WorkerProfileResponse,
  WorkerSkillResponse,
  WorkerLocationResponse,
  WorkerAvailabilityResponse,
  OnboardingStatus,
  WageType,
  VerificationStatus,
  AvailabilityStatus,
} from '@localsaathi/types';
import { WorkerWithFullRelations } from '../types/worker-internal.types';

export class WorkerMapper {
  /**
   * Map database WorkerProfile entity to clean API response DTO.
   */
  static toProfileResponse(
    worker: WorkerWithFullRelations,
    profilePhotoUrl?: string | null
  ): WorkerProfileResponse {
    return {
      id: worker.id,
      userId: worker.userId,
      displayName: worker.displayName,
      profilePhotoKey: worker.profilePhotoKey,
      profilePhotoUrl: profilePhotoUrl ?? (worker.profilePhotoKey ? `/api/v1/workers/photo/${worker.profilePhotoKey}` : null),
      bio: worker.bio,
      experienceYears: worker.experienceYears,
      expectedWage: worker.expectedWage ? Number(worker.expectedWage) : null,
      wageType: worker.wageType as unknown as WageType,
      preferredRadiusKm: worker.preferredRadiusKm,
      languages: worker.languages,
      isAvailable: worker.isAvailable,
      onboardingStatus: (worker.onboardingStatus as unknown as OnboardingStatus) || OnboardingStatus.NOT_STARTED,
      onboardingCompletedAt: worker.onboardingCompletedAt?.toISOString() ?? null,
      verificationStatus: (worker.user?.verificationStatus as unknown as VerificationStatus) || VerificationStatus.UNVERIFIED,
      completedJobsCount: worker.completedJobsCount,
      avgRating: Number(worker.avgRating),
      ratingCount: worker.ratingCount,
      reliabilityScore: Number(worker.reliabilityScore),
      createdAt: worker.createdAt.toISOString(),
      updatedAt: worker.updatedAt.toISOString(),
    };
  }

  /**
   * Map WorkerSkill relation to clean API response DTO.
   */
  static toSkillResponse(ws: {
    id: string;
    skillId: string;
    proficiency: string;
    experienceYears: number;
    isVerified: boolean;
    skill: {
      name: string;
      category: string;
    };
  }): WorkerSkillResponse {
    return {
      id: ws.id,
      skillId: ws.skillId,
      name: ws.skill.name,
      category: ws.skill.category,
      proficiency: ws.proficiency,
      experienceYears: ws.experienceYears,
      isVerified: ws.isVerified,
    };
  }

  /**
   * Map WorkerLocation to clean API response DTO.
   * Exact latitude and longitude are only included when explicitly requested for authorized self-inspection.
   */
  static toLocationResponse(
    loc: {
      locality: string | null;
      city: string | null;
      state: string | null;
      pinCode: string | null;
      addressLine?: string | null;
      latitude: number;
      longitude: number;
      updatedAt: Date;
    } | null,
    preferredRadiusKm: number,
    includeExactCoordinates = false
  ): WorkerLocationResponse | null {
    if (!loc) {
      return null;
    }

    const response: WorkerLocationResponse = {
      locality: loc.locality,
      city: loc.city,
      state: loc.state,
      pinCode: loc.pinCode,
      addressLine: loc.addressLine ?? null,
      preferredRadiusKm,
      updatedAt: loc.updatedAt.toISOString(),
    };

    if (includeExactCoordinates) {
      response.latitude = loc.latitude;
      response.longitude = loc.longitude;
    }

    return response;
  }

  /**
   * Map Availability to clean API response DTO.
   */
  static toAvailabilityResponse(avail: {
    id: string;
    date: Date;
    startTime: string | null;
    endTime: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): WorkerAvailabilityResponse {
    return {
      id: avail.id,
      date: avail.date.toISOString().split('T')[0]!,
      startTime: avail.startTime,
      endTime: avail.endTime,
      status: avail.status as AvailabilityStatus,
      createdAt: avail.createdAt.toISOString(),
      updatedAt: avail.updatedAt.toISOString(),
    };
  }
}
