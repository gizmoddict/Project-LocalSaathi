import { Injectable } from '@nestjs/common';
import { WorkerCompletionResponse } from '@localsaathi/types';
import { WorkerWithFullRelations } from '../types/worker-internal.types';

export enum WorkerOnboardingStepName {
  BASIC_PROFILE = 'basic_profile',
  SKILLS = 'skills',
  EXPERIENCE = 'experience',
  LANGUAGES = 'languages',
  WAGE = 'wage',
  AVAILABILITY = 'availability',
  LOCATION = 'location',
}

@Injectable()
export class WorkerCompletionService {
  /**
   * Centralized backend calculation for worker profile completion.
   * Single source of truth for both API responses and onboarding gates.
   */
  calculate(worker: WorkerWithFullRelations): WorkerCompletionResponse {
    const completedSteps: string[] = [];
    const remainingSteps: string[] = [];

    // 1. Basic Profile (Display name provided and >= 2 chars)
    if (worker.displayName && worker.displayName.trim().length >= 2) {
      completedSteps.push(WorkerOnboardingStepName.BASIC_PROFILE);
    } else {
      remainingSteps.push(WorkerOnboardingStepName.BASIC_PROFILE);
    }

    // 2. Skills (At least 1 verified or self-declared skill)
    if (worker.workerSkills && worker.workerSkills.length >= 1) {
      completedSteps.push(WorkerOnboardingStepName.SKILLS);
    } else {
      remainingSteps.push(WorkerOnboardingStepName.SKILLS);
    }

    // 3. Experience (Years of experience defined and non-negative)
    if (typeof worker.experienceYears === 'number' && worker.experienceYears >= 0) {
      completedSteps.push(WorkerOnboardingStepName.EXPERIENCE);
    } else {
      remainingSteps.push(WorkerOnboardingStepName.EXPERIENCE);
    }

    // 4. Languages (At least 1 language specified)
    if (worker.languages && worker.languages.length >= 1) {
      completedSteps.push(WorkerOnboardingStepName.LANGUAGES);
    } else {
      remainingSteps.push(WorkerOnboardingStepName.LANGUAGES);
    }

    // 5. Wage Preferences (Expected wage > 0 and wage type defined)
    if (
      worker.expectedWage !== null &&
      worker.expectedWage !== undefined &&
      Number(worker.expectedWage) > 0 &&
      Boolean(worker.wageType)
    ) {
      completedSteps.push(WorkerOnboardingStepName.WAGE);
    } else {
      remainingSteps.push(WorkerOnboardingStepName.WAGE);
    }

    // 6. Availability (At least 1 upcoming availability slot)
    if (worker.availabilities && worker.availabilities.length >= 1) {
      completedSteps.push(WorkerOnboardingStepName.AVAILABILITY);
    } else {
      remainingSteps.push(WorkerOnboardingStepName.AVAILABILITY);
    }

    // 7. Location (Location point coordinates and city/locality defined)
    if (
      worker.workerLocation &&
      typeof worker.workerLocation.latitude === 'number' &&
      typeof worker.workerLocation.longitude === 'number' &&
      (worker.workerLocation.city || worker.workerLocation.locality)
    ) {
      completedSteps.push(WorkerOnboardingStepName.LOCATION);
    } else {
      remainingSteps.push(WorkerOnboardingStepName.LOCATION);
    }

    const totalSteps = 7;
    const completionPercentage = Math.round((completedSteps.length / totalSteps) * 100);
    const isComplete = remainingSteps.length === 0;

    return {
      completionPercentage,
      completedSteps,
      remainingSteps,
      isComplete,
    };
  }
}
