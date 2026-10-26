import { DiscoveredJobItem } from './matching.types';

export interface RecommendationScoreBreakdown {
  proximityScore: number;       // 0 - 100 (weight 0.25)
  skillScore: number;           // 0 - 100 (weight 0.30)
  experienceScore: number;      // 0 - 100 (weight 0.15)
  availabilityScore: number;    // 0 - 100 (weight 0.10)
  wageScore: number;            // 0 - 100 (weight 0.10)
  reliabilityScore: number;     // 0 - 100 (weight 0.05)
  freshnessScore: number;       // 0 - 100 (weight 0.05)
}

export interface RecommendationExplanation {
  eligible: boolean;
  score: number;                // 0 - 100 final aggregate score
  hardConstraintsPassed: boolean;
  reasons: string[];
  breakdown: RecommendationScoreBreakdown;
}

export interface RecommendedJobItem extends DiscoveredJobItem {
  recommendation: RecommendationExplanation;
  isFallback?: boolean;
}

export interface WorkerJobRecommendationResponse {
  items: RecommendedJobItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
  };
  metadata: {
    isFallback: boolean;
    workerRadiusKm: number;
    appliedCount: number;
    blockedEmployerCount: number;
    evaluatedCandidateCount: number;
    telemetry?: {
      latencyMs: number;
      candidateTruncated: boolean;
      eligibleCount: number;
      missingAttributesCount: number;
    };
  };
}

export interface WorkerJobRecommendationQuery {
  page?: number;
  limit?: number;
  category?: string;
  maxRadiusKm?: number;
}
