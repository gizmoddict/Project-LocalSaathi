// ==============================================================================
// LocalSaathi — Failure & Retry Classifier (Phase 22)
// Distinguishes RETRYABLE, NON_RETRYABLE, and UNKNOWN Failures Across Layers
// ==============================================================================

import { RetryClassification, ReliabilityErrorCode } from '@localsaathi/types';
import { ReliabilityException } from './reliability.errors';

export class RetryClassifier {
  /**
   * Transient network error codes that represent safe-to-retry socket/connection drops.
   */
  private static readonly TRANSIENT_NETWORK_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPIPE',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
    'UND_ERR_HEADERS_TIMEOUT',
  ]);

  /**
   * PostgreSQL SQLSTATE error codes that represent transient, retryable concurrency conflicts.
   */
  private static readonly TRANSIENT_POSTGRES_CODES = new Set([
    '40001', // serialization_failure
    '40P01', // deadlock_detected
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
    '08001', // sqlclient_unable_to_establish_sqlconnection
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
  ]);

  /**
   * PostgreSQL SQLSTATE error codes that represent permanent, non-retryable constraints.
   */
  private static readonly PERMANENT_POSTGRES_CODES = new Set([
    '23505', // unique_violation
    '23503', // foreign_key_violation
    '23502', // not_null_violation
    '23514', // check_violation
    '22001', // string_data_right_truncation
    '42P01', // undefined_table
    '42703', // undefined_column
  ]);

  /**
   * HTTP status codes generally safe to retry with backoff.
   */
  private static readonly RETRYABLE_HTTP_STATUSES = new Set([
    408, // Request Timeout
    429, // Too Many Requests (Rate Limited - retry with backoff)
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
  ]);

  /**
   * HTTP status codes that represent permanent client or business logic failures.
   */
  private static readonly NON_RETRYABLE_HTTP_STATUSES = new Set([
    400, // Bad Request
    401, // Unauthorized
    403, // Forbidden
    404, // Not Found
    405, // Method Not Allowed
    409, // Conflict / Idempotency Conflict
    422, // Unprocessable Entity
  ]);

  /**
   * Classify any caught error into RETRYABLE, NON_RETRYABLE, or UNKNOWN.
   */
  static classify(error: unknown): RetryClassification {
    if (!error) return 'NON_RETRYABLE';

    // 1. Check ReliabilityException
    if (error instanceof ReliabilityException) {
      switch (error.errorCode) {
        case ReliabilityErrorCode.TIMEOUT:
        case ReliabilityErrorCode.CONNECTION_FAILURE:
        case ReliabilityErrorCode.DEPENDENCY_UNAVAILABLE:
        case ReliabilityErrorCode.DEPENDENCY_OVERLOADED:
        case ReliabilityErrorCode.TRANSIENT_DATABASE_ERROR:
        case ReliabilityErrorCode.SERIALIZATION_FAILURE:
        case ReliabilityErrorCode.DEADLOCK:
        case ReliabilityErrorCode.RATE_LIMITED:
          return 'RETRYABLE';
        case ReliabilityErrorCode.CIRCUIT_OPEN:
        case ReliabilityErrorCode.NON_RETRYABLE_ERROR:
          return 'NON_RETRYABLE';
        case ReliabilityErrorCode.UNKNOWN_EXTERNAL_STATE:
          return 'UNKNOWN';
      }
    }

    const err = error as Record<string, unknown>;

    // 2. Check Node.js Network Error Codes
    const code = typeof err.code === 'string' ? err.code.toUpperCase() : '';
    if (code && this.TRANSIENT_NETWORK_CODES.has(code)) {
      return 'RETRYABLE';
    }

    // 3. Check PostgreSQL SQLSTATE (Prisma or pg driver error code)
    if (code && this.TRANSIENT_POSTGRES_CODES.has(code)) {
      return 'RETRYABLE';
    }
    if (code && this.PERMANENT_POSTGRES_CODES.has(code)) {
      return 'NON_RETRYABLE';
    }

    // Prisma specific error codes
    // P2034: Transaction failed due to a write conflict or a deadlock
    // P2024: Timed out fetching a new connection from the pool
    if (err.code === 'P2034' || err.code === 'P2024') {
      return 'RETRYABLE';
    }
    // P2002: Unique constraint failed
    // P2003: Foreign key constraint failed
    // P2025: Record not found
    if (err.code === 'P2002' || err.code === 'P2003' || err.code === 'P2025') {
      return 'NON_RETRYABLE';
    }

    // 4. Check HTTP Status Codes (from Axios, fetch Response, or NestJS HttpException)
    const status =
      typeof err.status === 'number'
        ? err.status
        : typeof (err.response as any)?.status === 'number'
          ? (err.response as any).status
          : typeof err.statusCode === 'number'
            ? err.statusCode
            : typeof (err as any).getStatus === 'function'
              ? (err as any).getStatus()
              : undefined;

    if (typeof status === 'number') {
      if (this.RETRYABLE_HTTP_STATUSES.has(status)) {
        return 'RETRYABLE';
      }
      if (this.NON_RETRYABLE_HTTP_STATUSES.has(status)) {
        return 'NON_RETRYABLE';
      }
    }

    // 5. Check Validation / Schema Errors
    if (err.name === 'ZodError' || err.name === 'ValidationError') {
      return 'NON_RETRYABLE';
    }

    // 6. Check common error message patterns
    const msg = (typeof err.message === 'string' ? err.message : '').toLowerCase();
    if (
      msg.includes('rate limit') ||
      msg.includes('etimedout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('timeout') ||
      msg.includes('deadlock') ||
      msg.includes('serialization failure') ||
      msg.includes('temporarily unavailable')
    ) {
      return 'RETRYABLE';
    }

    if (
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('validation failed') ||
      msg.includes('invalid signature') ||
      msg.includes('not found') ||
      msg.includes('conflict') ||
      msg.includes('duplicate key')
    ) {
      return 'NON_RETRYABLE';
    }

    return 'UNKNOWN';
  }
}
