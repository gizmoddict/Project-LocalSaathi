/**
 * Standard API Success Response Envelope.
 */
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

/**
 * Standard API Error Detail.
 */
export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

/**
 * Standard API Error Envelope.
 */
export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
  requestId: string;
  timestamp: string;
}

/**
 * Standard Error Codes.
 */
export enum ApiErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  BAD_REQUEST = 'BAD_REQUEST',
}

/**
 * Health check summary response.
 */
export interface HealthSummaryResponse {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  environment: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * Process liveness check response.
 */
export interface LivenessResponse {
  status: 'alive';
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * Dependency health status shape.
 */
export interface DependencyHealth {
  status: 'ok' | 'down' | 'not_configured';
  latencyMs?: number;
  message?: string;
}

/**
 * Infrastructure readiness check response.
 */
export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  dependencies: {
    database: DependencyHealth;
    redis: DependencyHealth;
    opensearch: DependencyHealth;
  };
  timestamp: string;
}

/**
 * Traceable release metadata response (Phase 24 Section 28).
 */
export interface ReleaseMetadataResponse {
  version: string;
  environment: string;
  commitSha: string;
  buildTimestamp: string;
  nodeVersion: string;
  uptimeSeconds: number;
}

