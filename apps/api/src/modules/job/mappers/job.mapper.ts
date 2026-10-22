import {
  JobResponse,
  JobSkillResponse,
  JobLocationResponse,
  JobStatus,
  WageType,
  JobUrgency,
  JobListResponse,
} from '@localsaathi/types';

export interface JobEntityWithRelations {
  id: string;
  employerProfileId: string;
  title: string;
  description: string;
  status: string;
  category: string;
  wageType: string;
  wageAmount: unknown;
  workerCount: number;
  durationDays: number;
  startDate: Date;
  startTime: string | null;
  urgency: string;
  requirements: string[];
  languageRequirements: string[];
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  jobRequiredSkills?: Array<{
    id: string;
    skillId: string;
    isRequired: boolean;
    minExperienceYears: number;
    skill: {
      name: string;
      category: string;
    };
  }>;
  jobLocation?: {
    id: string;
    jobPostId: string;
    latitude: number;
    longitude: number;
    addressLine: string | null;
    locality: string;
    city: string;
    state: string;
    pinCode: string;
  } | null;
}

export class JobMapper {
  /**
   * Map database JobRequiredSkill relation to clean API response DTO.
   */
  static toSkillResponse(rs: {
    id: string;
    skillId: string;
    isRequired: boolean;
    minExperienceYears: number;
    skill: {
      name: string;
      category: string;
    };
  }): JobSkillResponse {
    return {
      id: rs.id,
      skillId: rs.skillId,
      name: rs.skill.name,
      category: rs.skill.category,
      isRequired: rs.isRequired,
      minExperienceYears: rs.minExperienceYears,
    };
  }

  /**
   * Map database JobLocation relation to clean API response DTO.
   */
  static toLocationResponse(loc: {
    id: string;
    jobPostId: string;
    latitude: number;
    longitude: number;
    addressLine: string | null;
    locality: string;
    city: string;
    state: string;
    pinCode: string;
  } | null): JobLocationResponse | null {
    if (!loc) {
      return null;
    }
    return {
      id: loc.id,
      jobPostId: loc.jobPostId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      addressLine: loc.addressLine,
      locality: loc.locality,
      city: loc.city,
      state: loc.state,
      pinCode: loc.pinCode,
    };
  }

  /**
   * Map database JobPost entity with relations to clean JobResponse DTO.
   */
  static toJobResponse(job: JobEntityWithRelations): JobResponse {
    return {
      id: job.id,
      employerProfileId: job.employerProfileId,
      title: job.title,
      description: job.description,
      status: job.status as JobStatus,
      category: job.category,
      wageType: job.wageType as WageType,
      wageAmount: Number(job.wageAmount),
      workerCount: job.workerCount,
      durationDays: job.durationDays,
      startDate: job.startDate instanceof Date ? job.startDate.toISOString().split('T')[0]! : String(job.startDate),
      startTime: job.startTime,
      urgency: job.urgency as JobUrgency,
      requirements: job.requirements || [],
      languageRequirements: job.languageRequirements || [],
      publishedAt: job.publishedAt ? job.publishedAt.toISOString() : null,
      expiresAt: job.expiresAt ? job.expiresAt.toISOString() : null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      requiredSkills: (job.jobRequiredSkills || []).map(JobMapper.toSkillResponse),
      location: job.jobLocation ? JobMapper.toLocationResponse(job.jobLocation) : null,
    };
  }

  /**
   * Map paginated list of jobs.
   */
  static toListResponse(
    jobs: JobEntityWithRelations[],
    total: number,
    page: number,
    limit: number
  ): JobListResponse {
    return {
      jobs: jobs.map(JobMapper.toJobResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
