import { Injectable } from '@nestjs/common';
import { EmployerCompletionResponse } from '@localsaathi/types';
import { EmployerProfileEntity } from '../mappers/employer.mapper';

@Injectable()
export class EmployerCompletionService {
  /**
   * Computes employer profile completion status server-side.
   */
  calculateCompletion(employer: EmployerProfileEntity): EmployerCompletionResponse {
    const hasBusinessName = Boolean(
      employer.businessName && employer.businessName.trim().length >= 2
    );

    const hasDescription = Boolean(
      employer.description && employer.description.trim().length >= 10
    );

    const hasBusinessType = Boolean(
      employer.businessType && employer.businessType.trim().length >= 2
    );

    const hasContactPreferences = Boolean(
      employer.contactPreferences && employer.contactPreferences.length > 0
    );

    const hasLocation = Boolean(
      employer.city &&
        employer.city.trim().length >= 2 &&
        employer.pinCode &&
        employer.pinCode.trim().length === 6
    );

    const details = {
      businessName: hasBusinessName,
      description: hasDescription,
      businessType: hasBusinessType,
      contactPreferences: hasContactPreferences,
      location: hasLocation,
    };

    const steps = [
      { name: 'businessName', completed: hasBusinessName },
      { name: 'description', completed: hasDescription },
      { name: 'businessType', completed: hasBusinessType },
      { name: 'contactPreferences', completed: hasContactPreferences },
      { name: 'location', completed: hasLocation },
    ];

    const completedSteps = steps.filter((s) => s.completed).map((s) => s.name);
    const remainingSteps = steps.filter((s) => !s.completed).map((s) => s.name);

    // Each of the 5 criteria accounts for 20%
    const completionPercentage = completedSteps.length * 20;
    const isComplete = completedSteps.length === steps.length;

    return {
      completionPercentage,
      completedSteps,
      remainingSteps,
      isComplete,
      details,
    };
  }
}
