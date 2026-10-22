// ==============================================================================
// LocalSaathi — PostgreSQL Transient Concurrency & Transaction Resilience (Phase 22)
// Automatically Retries Deadlocks and Serialization Failures with Bounded Backoff
// Never Retries Unique Constraint, Validation, or Business Rule Failures (Section 13)
// ==============================================================================

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@localsaathi/database';
import { MetricsService } from '../observability/metrics.service';
import { RetryPolicy } from './retry-policy';
import { ReliabilityErrorCode } from '@localsaathi/types';
import { ReliabilityException } from './reliability.errors';

export interface TransactionRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
  operationName?: string;
}

@Injectable()
export class PostgresResilienceService {
  private readonly logger = new Logger(PostgresResilienceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  /**
   * Identifies whether a database error is transient (deadlock, serialization failure).
   */
  static isTransientPostgresError(error: unknown): boolean {
    if (!error) return false;
    const err = error as Record<string, unknown>;

    // Prisma error code P2034: Transaction failed due to a write conflict or a deadlock
    if (err.code === 'P2034') return true;

    // Prisma error code P2024: Connection pool acquisition timeout
    if (err.code === 'P2024') return true;

    const code = typeof err.code === 'string' ? err.code : '';
    // PostgreSQL SQLSTATE 40001 = serialization_failure, 40P01 = deadlock_detected
    if (code === '40001' || code === '40P01') return true;

    const message = (typeof err.message === 'string' ? err.message : '').toLowerCase();
    if (
      message.includes('deadlock detected') ||
      message.includes('could not serialize access') ||
      message.includes('write conflict')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Executes a database transaction with bounded retry exclusively for transient
   * concurrency conflicts (deadlock or serialization failure).
   */
  async executeTransactionWithRetry<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: TransactionRetryOptions,
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 3;
    const initialDelayMs = options?.initialDelayMs ?? 100;
    const maxDelayMs = options?.maxDelayMs ?? 1000;
    const timeoutMs = options?.timeoutMs ?? parseInt(process.env.DB_OPERATION_TIMEOUT_MS || '5000', 10);
    const operationName = options?.operationName ?? 'db_transaction';

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            return await fn(tx);
          },
          {
            timeout: timeoutMs,
            isolationLevel: options?.isolationLevel,
          },
        );
      } catch (error) {
        lastError = error;

        // Check if error is transient
        const isTransient = PostgresResilienceService.isTransientPostgresError(error);
        const err = error as Record<string, unknown>;
        const code = typeof err.code === 'string' ? err.code : '';
        const msg = (typeof err.message === 'string' ? err.message : '').toLowerCase();

        // Attribute Prometheus Metrics
        if (this.metricsService) {
          try {
            if (code === '40P01' || msg.includes('deadlock')) {
              this.metricsService.incrementCounter('deadlocks_total', {
                operation: operationName,
              });
            } else if (code === '40001' || err.code === 'P2034' || msg.includes('serialize')) {
              this.metricsService.incrementCounter('serialization_failures_total', {
                operation: operationName,
              });
            } else if (err.code === 'P2024' || msg.includes('pool')) {
              this.metricsService.incrementCounter('pool_exhaustion_total', {
                operation: operationName,
              });
            }
          } catch {
            // Non-blocking metric protection
          }
        }

        // Never retry permanent business or schema constraint failures!
        if (!isTransient) {
          this.logger.debug(
            `Transaction '${operationName}' failed with non-transient error on attempt ${attempt}. Aborting. Reason: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          throw error;
        }

        // If attempts exhausted, fail fast
        if (attempt >= maxRetries) {
          this.logger.error(
            `Transaction '${operationName}' exhausted all ${maxRetries} attempts for transient error. Failing.`,
          );
          if (this.metricsService) {
            try {
              this.metricsService.incrementCounter('transaction_retries_total', {
                operation: operationName,
                status: 'exhausted',
              });
            } catch {
              // Non-blocking metric protection
            }
          }

          throw new ReliabilityException({
            errorCode:
              code === '40P01'
                ? ReliabilityErrorCode.DEADLOCK
                : ReliabilityErrorCode.SERIALIZATION_FAILURE,
            operation: operationName,
            dependency: 'POSTGRESQL',
            cause: error,
            message: `Database transaction '${operationName}' failed after ${maxRetries} transient conflict retries: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }

        // Calculate backoff with jitter
        const delayMs = RetryPolicy.calculateBackoffDelay(
          attempt,
          initialDelayMs,
          maxDelayMs,
          2.0,
          0.25,
        );

        if (this.metricsService) {
          try {
            this.metricsService.incrementCounter('transaction_retries_total', {
              operation: operationName,
              status: 'retry',
            });
          } catch {
            // Non-blocking metric protection
          }
        }

        this.logger.warn(
          `Transient conflict in transaction '${operationName}' (attempt ${attempt}/${maxRetries}). Retrying in ${delayMs}ms.`,
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }
}
