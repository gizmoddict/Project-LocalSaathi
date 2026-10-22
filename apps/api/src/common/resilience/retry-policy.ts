// ==============================================================================
// LocalSaathi — Centralized Bounded Retry Policy with Exponential Backoff & Jitter (Phase 22)
// Protects Downstream Systems from Retry Storms via Bounded Attempts & Bounded Backoff
// ==============================================================================

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RetryPolicyOptions, RetryClassification } from '@localsaathi/types';
import { RetryClassifier } from './retry-classifier';
import { MetricsService } from '../observability/metrics.service';

export const DEFAULT_RETRY_OPTIONS: RetryPolicyOptions = {
  maxAttempts: 3,
  initialDelayMs: 250,
  maxDelayMs: 5000,
  backoffFactor: 2.0,
  jitterPercent: 0.2,
  operationName: 'unnamed_operation',
  dependency: 'internal',
};

@Injectable()
export class RetryPolicy {
  private readonly logger = new Logger(RetryPolicy.name);

  constructor(@Optional() private readonly metricsService?: MetricsService) {}

  /**
   * Execute an asynchronous task with bounded exponential backoff, jitter, and error classification.
   */
  async execute<T>(
    fn: (attempt: number) => Promise<T>,
    customOptions?: Partial<RetryPolicyOptions>,
  ): Promise<T> {
    const options: RetryPolicyOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || '3', 10),
      initialDelayMs: parseInt(process.env.RETRY_INITIAL_DELAY_MS || '250', 10),
      maxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '5000', 10),
      jitterPercent: parseFloat(process.env.RETRY_JITTER_PERCENT || '0.20'),
      ...customOptions,
    };

    const operation = options.operationName || 'unnamed_operation';
    let lastError: unknown;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      // 1. Cooperative cancellation check
      if (options.signal?.aborted) {
        throw new Error(`Operation '${operation}' aborted prior to attempt ${attempt}`);
      }

      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error;

        // 2. Classify Failure
        let classification: RetryClassification;
        if (options.isRetryable) {
          const predicateResult = options.isRetryable(error, attempt);
          if (typeof predicateResult === 'boolean') {
            classification = predicateResult ? 'RETRYABLE' : 'NON_RETRYABLE';
          } else {
            classification = predicateResult;
          }
        } else {
          classification = RetryClassifier.classify(error);
        }

        // 3. Immediately abort non-retryable failures
        if (classification === 'NON_RETRYABLE') {
          this.logger.debug(
            `Operation '${operation}' failed with NON_RETRYABLE error on attempt ${attempt}. Aborting retries.`,
          );
          throw error;
        }

        // 4. If attempts exhausted, fail fast
        if (attempt >= options.maxAttempts) {
          if (this.metricsService) {
            this.metricsService.incrementCounter('retry_exhausted_total', {
              operation,
              classification,
            });
          }
          this.logger.warn(
            `Operation '${operation}' exhausted all ${options.maxAttempts} attempts. Classification: ${classification}`,
          );
          throw error;
        }

        // 5. Calculate Exponential Backoff with Jitter
        const delayMs = RetryPolicy.calculateBackoffDelay(
          attempt,
          options.initialDelayMs,
          options.maxDelayMs,
          options.backoffFactor,
          options.jitterPercent,
        );

        // 6. Record Observability Metrics
        if (this.metricsService) {
          this.metricsService.incrementCounter('retry_attempts_total', {
            operation,
            classification,
          });
          this.metricsService.recordHistogram('retry_delay_ms', delayMs, {
            operation,
          });
        }

        this.logger.warn(
          `Operation '${operation}' failed (attempt ${attempt}/${options.maxAttempts}). Retrying in ${delayMs}ms. Reason: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        if (options.onRetry) {
          try {
            options.onRetry(error, attempt, delayMs);
          } catch {
            // Non-blocking hook
          }
        }

        // 7. Sleep with cancellation support
        await RetryPolicy.sleep(delayMs, options.signal);
      }
    }

    throw lastError;
  }

  /**
   * Calculates exponential backoff bounded by maxDelayMs, perturbed by random jitter.
   */
  static calculateBackoffDelay(
    attempt: number,
    initialDelayMs: number,
    maxDelayMs: number,
    backoffFactor: number,
    jitterPercent: number,
  ): number {
    // base exponential delay
    const baseDelay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
    const clampedBase = Math.min(baseDelay, maxDelayMs);

    // full/equal jitter: jitter in range [-jitterPercent * base, +jitterPercent * base]
    const jitterRange = clampedBase * jitterPercent;
    const randomJitter = (Math.random() * 2 - 1) * jitterRange;

    const finalDelay = Math.round(Math.max(10, Math.min(clampedBase + randomJitter, maxDelayMs)));
    return finalDelay;
  }

  private static sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(new Error('Operation aborted during backoff delay'));
      }

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      const onAbort = () => {
        cleanup();
        reject(new Error('Operation aborted during backoff delay'));
      };

      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };

      signal?.addEventListener('abort', onAbort);
    });
  }
}
