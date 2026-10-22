// ==============================================================================
// LocalSaathi — Standardized Reliability Exception & Error Mapping (Phase 22)
// Captures ErrorCode, Dependency, Operation, Correlation Context & HTTP Status
// ==============================================================================

import { HttpException, HttpStatus } from '@nestjs/common';
import { ReliabilityErrorCode } from '@localsaathi/types';
import { CorrelationContextManager } from '../observability/correlation-context';

export interface ReliabilityExceptionOptions {
  errorCode: ReliabilityErrorCode;
  operation: string;
  dependency: string;
  message?: string;
  cause?: unknown;
  retryAfterMs?: number;
  details?: Record<string, unknown>;
}

export class ReliabilityException extends HttpException {
  readonly errorCode: ReliabilityErrorCode;
  readonly operation: string;
  readonly dependency: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly retryAfterMs?: number;
  readonly details?: Record<string, unknown>;

  constructor(options: ReliabilityExceptionOptions) {
    const ambientCtx = CorrelationContextManager.get();
    const httpStatus = ReliabilityException.mapToHttpStatus(options.errorCode);
    const message =
      options.message ||
      `Reliability failure [${options.errorCode}] during operation '${options.operation}' on dependency '${options.dependency}'`;

    super(
      {
        success: false,
        error: {
          code: options.errorCode,
          message,
          dependency: options.dependency,
          operation: options.operation,
          ...(options.retryAfterMs ? { retryAfterMs: options.retryAfterMs } : {}),
          ...(options.details ? { details: options.details } : {}),
        },
        requestId: ambientCtx?.requestId,
        correlationId: ambientCtx?.correlationId,
        timestamp: new Date().toISOString(),
      },
      httpStatus,
      { cause: options.cause instanceof Error ? options.cause : undefined },
    );

    this.errorCode = options.errorCode;
    this.operation = options.operation;
    this.dependency = options.dependency;
    this.requestId = ambientCtx?.requestId;
    this.correlationId = ambientCtx?.correlationId;
    this.traceId = ambientCtx?.traceContext.traceId;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
  }

  private static mapToHttpStatus(code: ReliabilityErrorCode): HttpStatus {
    switch (code) {
      case ReliabilityErrorCode.TIMEOUT:
        return HttpStatus.GATEWAY_TIMEOUT; // 504
      case ReliabilityErrorCode.CIRCUIT_OPEN:
      case ReliabilityErrorCode.DEPENDENCY_UNAVAILABLE:
      case ReliabilityErrorCode.DEPENDENCY_OVERLOADED:
        return HttpStatus.SERVICE_UNAVAILABLE; // 503
      case ReliabilityErrorCode.RATE_LIMITED:
        return HttpStatus.TOO_MANY_REQUESTS; // 429
      case ReliabilityErrorCode.SERIALIZATION_FAILURE:
      case ReliabilityErrorCode.DEADLOCK:
      case ReliabilityErrorCode.TRANSIENT_DATABASE_ERROR:
        return HttpStatus.SERVICE_UNAVAILABLE; // 503
      case ReliabilityErrorCode.UNKNOWN_EXTERNAL_STATE:
        return HttpStatus.BAD_GATEWAY; // 502
      case ReliabilityErrorCode.NON_RETRYABLE_ERROR:
      case ReliabilityErrorCode.CONNECTION_FAILURE:
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR; // 500
    }
  }
}
