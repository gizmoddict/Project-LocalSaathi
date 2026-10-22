// ==============================================================================
// LocalSaathi — Phase 22 Reliability & Resilience Engineering Test Suite
// Verifies Bounded Retries, Circuit Breaker State Transitions, Timeouts,
// Error Classification, PostgreSQL Concurrency Retries & Redis Degradation Fallback
// ==============================================================================

import { CircuitBreakerConfig } from '@localsaathi/types';
import { RetryClassifier } from '../retry-classifier';
import { RetryPolicy } from '../retry-policy';
import { withTimeout } from '../timeout.util';
import { CircuitBreaker } from '../circuit-breaker';
import { CircuitBreakerRegistry } from '../circuit-breaker-registry';
import { ReliabilityException } from '../reliability.errors';
import { PostgresResilienceService } from '../postgres-resilience.service';
import { ResilienceRateLimiter } from '../rate-limit-fallback.service';
import { MetricsService } from '../../observability/metrics.service';

describe('Phase 22 — Reliability & Resilience Engineering', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  // ============================================================================
  // 1. Error Classification (Section 3)
  // ============================================================================
  describe('1. Failure Classification & Retry Taxonomy', () => {
    it('classifies transient network codes (ECONNRESET, ETIMEDOUT, ECONNREFUSED) as RETRYABLE', () => {
      expect(RetryClassifier.classify({ code: 'ECONNRESET' })).toBe('RETRYABLE');
      expect(RetryClassifier.classify({ code: 'ETIMEDOUT' })).toBe('RETRYABLE');
      expect(RetryClassifier.classify({ code: 'ECONNREFUSED' })).toBe('RETRYABLE');
    });

    it('classifies transient PostgreSQL codes (40001, 40P01, P2034) as RETRYABLE', () => {
      expect(RetryClassifier.classify({ code: '40001' })).toBe('RETRYABLE');
      expect(RetryClassifier.classify({ code: '40P01' })).toBe('RETRYABLE');
      expect(RetryClassifier.classify({ code: 'P2034' })).toBe('RETRYABLE');
    });

    it('classifies permanent PostgreSQL constraints (23505, P2002, 23503) as NON_RETRYABLE', () => {
      expect(RetryClassifier.classify({ code: '23505' })).toBe('NON_RETRYABLE');
      expect(RetryClassifier.classify({ code: 'P2002' })).toBe('NON_RETRYABLE');
      expect(RetryClassifier.classify({ code: '23503' })).toBe('NON_RETRYABLE');
    });

    it('classifies HTTP transient statuses (408, 429, 502, 503, 504) as RETRYABLE', () => {
      expect(RetryClassifier.classify({ status: 503 })).toBe('RETRYABLE');
      expect(RetryClassifier.classify({ status: 504 })).toBe('RETRYABLE');
      expect(RetryClassifier.classify({ status: 429 })).toBe('RETRYABLE');
      expect(RetryClassifier.classify({ status: 408 })).toBe('RETRYABLE');
    });

    it('classifies HTTP permanent client errors (400, 401, 403, 404, 409) as NON_RETRYABLE', () => {
      expect(RetryClassifier.classify({ status: 400 })).toBe('NON_RETRYABLE');
      expect(RetryClassifier.classify({ status: 401 })).toBe('NON_RETRYABLE');
      expect(RetryClassifier.classify({ status: 403 })).toBe('NON_RETRYABLE');
      expect(RetryClassifier.classify({ status: 404 })).toBe('NON_RETRYABLE');
      expect(RetryClassifier.classify({ status: 409 })).toBe('NON_RETRYABLE');
    });
  });

  // ============================================================================
  // 2. Centralized Bounded Retry Policy (Section 4)
  // ============================================================================
  describe('2. Bounded Retry Policy with Exponential Backoff & Jitter', () => {
    it('successfully returns value on first attempt without retrying', async () => {
      const retryPolicy = new RetryPolicy(metricsService);
      const fn = jest.fn().mockResolvedValue('ok');

      const result = await retryPolicy.execute(fn, {
        operationName: 'test_fast_success',
        maxAttempts: 3,
      });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries transient failures and succeeds on subsequent attempt', async () => {
      const retryPolicy = new RetryPolicy(metricsService);
      let attempts = 0;
      const fn = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          throw { code: 'ECONNRESET', message: 'socket drop' };
        }
        return 'recovered';
      });

      const result = await retryPolicy.execute(fn, {
        operationName: 'test_recover_retry',
        maxAttempts: 3,
        initialDelayMs: 20,
        maxDelayMs: 100,
      });

      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(metricsService.getCounter('retry_attempts_total')).toBe(1);
    });

    it('immediately aborts retrying on NON_RETRYABLE errors without waiting', async () => {
      const retryPolicy = new RetryPolicy(metricsService);
      const fn = jest.fn().mockRejectedValue({ status: 401, message: 'Invalid credentials' });

      await expect(
        retryPolicy.execute(fn, {
          operationName: 'test_auth_reject',
          maxAttempts: 4,
          initialDelayMs: 50,
        }),
      ).rejects.toMatchObject({ status: 401 });

      expect(fn).toHaveBeenCalledTimes(1); // Only attempted once!
    });

    it('exhausts bounded retries and throws the terminal error', async () => {
      const retryPolicy = new RetryPolicy(metricsService);
      const fn = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT', message: 'connection timeout' });

      await expect(
        retryPolicy.execute(fn, {
          operationName: 'test_exhausted',
          maxAttempts: 3,
          initialDelayMs: 15,
          maxDelayMs: 50,
        }),
      ).rejects.toMatchObject({ code: 'ETIMEDOUT' });

      expect(fn).toHaveBeenCalledTimes(3);
      expect(metricsService.getCounter('retry_exhausted_total')).toBe(1);
    });

    it('aborts cooperative retries when AbortSignal is cancelled', async () => {
      const retryPolicy = new RetryPolicy(metricsService);
      const controller = new AbortController();
      controller.abort();

      const fn = jest.fn().mockResolvedValue('should_not_run');

      await expect(
        retryPolicy.execute(fn, {
          operationName: 'test_aborted',
          signal: controller.signal,
        }),
      ).rejects.toThrow('aborted prior to attempt');

      expect(fn).not.toHaveBeenCalled();
    });

    it('calculates exponential backoff bounded by maxDelayMs and perturbs with jitter', () => {
      const delay1 = RetryPolicy.calculateBackoffDelay(1, 250, 5000, 2.0, 0.2);
      const delay2 = RetryPolicy.calculateBackoffDelay(2, 250, 5000, 2.0, 0.2);
      const delay3 = RetryPolicy.calculateBackoffDelay(3, 250, 5000, 2.0, 0.2);
      const delayCap = RetryPolicy.calculateBackoffDelay(10, 250, 5000, 2.0, 0.2);

      expect(delay1).toBeGreaterThanOrEqual(200);
      expect(delay1).toBeLessThanOrEqual(300);

      expect(delay2).toBeGreaterThanOrEqual(400);
      expect(delay2).toBeLessThanOrEqual(600);

      expect(delay3).toBeGreaterThanOrEqual(800);
      expect(delay3).toBeLessThanOrEqual(1200);

      // Must never exceed maxDelayMs
      expect(delayCap).toBeLessThanOrEqual(5000);
    });
  });

  // ============================================================================
  // 3. Bounded Timeout Utility (Section 6)
  // ============================================================================
  describe('3. Bounded Timeout Utility', () => {
    it('resolves fast operations cleanly before timeout expires', async () => {
      const fastPromise = Promise.resolve('fast_result');
      const result = await withTimeout(
        fastPromise,
        {
          timeoutMs: 500,
          operationName: 'fast_op',
          dependency: 'CACHE',
        },
        metricsService,
      );

      expect(result).toBe('fast_result');
      expect(metricsService.getCounter('timeout_total')).toBe(0);
    });

    it('rejects hanging operations with ReliabilityException TIMEOUT after threshold', async () => {
      const hangingPromise = new Promise((resolve) => setTimeout(() => resolve('late'), 1000));

      await expect(
        withTimeout(
          hangingPromise,
          {
            timeoutMs: 50,
            operationName: 'hanging_call',
            dependency: 'EXTERNAL_HTTP',
          },
          metricsService,
        ),
      ).rejects.toBeInstanceOf(ReliabilityException);

      expect(metricsService.getCounter('timeout_total')).toBe(1);
    });
  });

  // ============================================================================
  // 4. Circuit Breaker State Machine & Lifecycle (Sections 7, 27)
  // ============================================================================
  describe('4. Circuit Breaker State Machine (CLOSED -> OPEN -> HALF_OPEN -> CLOSED/OPEN)', () => {
    let breaker: CircuitBreaker;
    const config: CircuitBreakerConfig = {
      name: 'TEST_BREAKER',
      failureThreshold: 3,
      rollingWindowMs: 2000,
      openDurationMs: 100,
      halfOpenProbes: 2,
      successThreshold: 2,
    };

    beforeEach(() => {
      breaker = new CircuitBreaker(config, metricsService);
    });

    it('initializes in CLOSED state and allows normal traffic', async () => {
      expect(breaker.getState()).toBe('CLOSED');
      const result = await breaker.execute(async () => 'ok');
      expect(result).toBe('ok');
    });

    it('trips to OPEN state after exceeding failureThreshold', async () => {
      const failingCall = async () => {
        throw new Error('downstream crash');
      };

      // 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingCall)).rejects.toThrow('downstream crash');
      }

      expect(breaker.getState()).toBe('OPEN');
      expect(metricsService.getCounter('circuit_breaker_open_total')).toBe(1);
    });

    it('fails fast immediately when in OPEN state without calling downstream fn', async () => {
      breaker.trip(); // Force OPEN
      expect(breaker.getState()).toBe('OPEN');

      const downstreamFn = jest.fn().mockResolvedValue('should_not_run');

      await expect(breaker.execute(downstreamFn)).rejects.toBeInstanceOf(ReliabilityException);
      expect(downstreamFn).not.toHaveBeenCalled();
      expect(metricsService.getCounter('circuit_breaker_rejected_total')).toBe(1);
    });

    it('transitions to HALF_OPEN after openDurationMs and closes upon consecutive successes', async () => {
      breaker.trip(); // Force OPEN
      expect(breaker.getState()).toBe('OPEN');

      // Wait for open duration to elapse
      await new Promise((resolve) => setTimeout(resolve, 120));

      expect(breaker.getState()).toBe('HALF_OPEN');
      expect(metricsService.getCounter('circuit_breaker_half_open_total')).toBe(1);

      // Probe 1 succeeds
      await breaker.execute(async () => 'probe_1_ok');
      expect(breaker.getState()).toBe('HALF_OPEN');

      // Probe 2 succeeds (successThreshold = 2) -> recovers to CLOSED
      await breaker.execute(async () => 'probe_2_ok');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('immediately trips back to OPEN if a probe fails during HALF_OPEN', async () => {
      breaker.trip();
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(breaker.getState()).toBe('HALF_OPEN');

      // Probe fails
      await expect(
        breaker.execute(async () => {
          throw new Error('probe failed');
        }),
      ).rejects.toThrow('probe failed');

      expect(breaker.getState()).toBe('OPEN');
    });

    it('registers pre-configured external circuit breakers in CircuitBreakerRegistry', () => {
      const registry = new CircuitBreakerRegistry(metricsService);
      const stats = registry.getAllStats();

      expect(stats.PAYMENT_PROVIDER).toBeDefined();
      expect(stats.SMS_PROVIDER).toBeDefined();
      expect(stats.EMAIL_PROVIDER).toBeDefined();
      expect(stats.NOTIFICATION_PROVIDER).toBeDefined();
      expect(stats.TRANSLATION_PROVIDER).toBeDefined();
      expect(stats.PAYMENT_PROVIDER?.state).toBe('CLOSED');
    });
  });

  // ============================================================================
  // 5. PostgreSQL Transient Concurrency Resilience (Section 13)
  // ============================================================================
  describe('5. PostgreSQL Concurrency & Transient Error Resilience', () => {
    it('identifies deadlocks and serialization failures as transient PostgreSQL errors', () => {
      expect(PostgresResilienceService.isTransientPostgresError({ code: '40P01' })).toBe(true);
      expect(PostgresResilienceService.isTransientPostgresError({ code: '40001' })).toBe(true);
      expect(PostgresResilienceService.isTransientPostgresError({ code: 'P2034' })).toBe(true);
      expect(PostgresResilienceService.isTransientPostgresError({ message: 'deadlock detected' })).toBe(true);
    });

    it('identifies unique constraint and foreign key errors as non-transient', () => {
      expect(PostgresResilienceService.isTransientPostgresError({ code: 'P2002' })).toBe(false);
      expect(PostgresResilienceService.isTransientPostgresError({ code: '23505' })).toBe(false);
      expect(PostgresResilienceService.isTransientPostgresError({ code: 'P2003' })).toBe(false);
    });
  });

  // ============================================================================
  // 6. Redis Degradation & In-Memory Rate Limiter Fallback (Section 22)
  // ============================================================================
  describe('6. Redis Degradation & In-Memory Rate Limiter Fallback', () => {
    it('enforces in-memory sliding window rate limits when Redis is disconnected', async () => {
      const limiter = new ResilienceRateLimiter(metricsService);
      const nullRedis = null;

      // Allow 2 requests in 5-second window
      await limiter.checkRateLimit(nullRedis, 'client-ip-1', 2, 5, 'auth_otp');
      await limiter.checkRateLimit(nullRedis, 'client-ip-1', 2, 5, 'auth_otp');

      // 3rd request must be blocked with HTTP 429
      await expect(
        limiter.checkRateLimit(nullRedis, 'client-ip-1', 2, 5, 'auth_otp'),
      ).rejects.toMatchObject({
        status: 429,
      });

      // Different key should still be allowed
      await expect(
        limiter.checkRateLimit(nullRedis, 'client-ip-2', 2, 5, 'auth_otp'),
      ).resolves.toBeUndefined();
    });
  });
});
