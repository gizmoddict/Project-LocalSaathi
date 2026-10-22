// ==============================================================================
// LocalSaathi — Production Circuit Breaker Implementation (Phase 22)
// State Machine: CLOSED -> OPEN -> HALF_OPEN -> CLOSED (or OPEN)
// Protects Downstream External Providers from Cascading Failures & Retry Storms
// ==============================================================================

import { Logger } from '@nestjs/common';
import {
  CircuitBreakerConfig,
  CircuitBreakerState,
  CircuitBreakerStats,
  ReliabilityErrorCode,
} from '@localsaathi/types';
import { ReliabilityException } from './reliability.errors';
import { MetricsService } from '../observability/metrics.service';

export class CircuitBreaker {
  private readonly logger: Logger;
  private state: CircuitBreakerState = 'CLOSED';
  private failureTimestamps: number[] = [];
  private consecutiveSuccesses = 0;
  private halfOpenProbeCount = 0;
  private totalSuccesses = 0;
  private totalFailures = 0;
  private totalRejected = 0;
  private lastFailureTime?: number;
  private lastStateChange = Date.now();

  constructor(
    readonly config: CircuitBreakerConfig,
    private readonly metricsService?: MetricsService,
  ) {
    this.logger = new Logger(`CircuitBreaker:${this.config.name}`);
  }

  getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    this.checkStateTransition();
    return {
      name: this.config.name,
      state: this.state,
      failures: this.totalFailures,
      successes: this.totalSuccesses,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      rejectedRequests: this.totalRejected,
      halfOpenProbeCount: this.halfOpenProbeCount,
    };
  }

  /**
   * Evaluates time-based transitions (OPEN -> HALF_OPEN).
   */
  private checkStateTransition(): void {
    const now = Date.now();
    if (this.state === 'OPEN') {
      if (now - this.lastStateChange >= this.config.openDurationMs) {
        this.transitionTo('HALF_OPEN');
      }
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === 'OPEN') {
      this.consecutiveSuccesses = 0;
      this.halfOpenProbeCount = 0;
      if (this.metricsService) {
        try {
          this.metricsService.incrementCounter('circuit_breaker_open_total', {
            breaker_name: this.config.name,
          });
        } catch {
          // Bounded metric protection
        }
      }
      this.logger.error(
        `Circuit Breaker [${this.config.name}] transitioned from ${oldState} to OPEN. Downstream calls blocked for ${this.config.openDurationMs}ms.`,
      );
    } else if (newState === 'HALF_OPEN') {
      this.halfOpenProbeCount = 0;
      this.consecutiveSuccesses = 0;
      if (this.metricsService) {
        try {
          this.metricsService.incrementCounter('circuit_breaker_half_open_total', {
            breaker_name: this.config.name,
          });
        } catch {
          // Bounded metric protection
        }
      }
      this.logger.warn(
        `Circuit Breaker [${this.config.name}] transitioned from ${oldState} to HALF_OPEN. Allowing up to ${this.config.halfOpenProbes} probes.`,
      );
    } else if (newState === 'CLOSED') {
      this.failureTimestamps = [];
      this.halfOpenProbeCount = 0;
      this.consecutiveSuccesses = 0;
      this.logger.log(
        `Circuit Breaker [${this.config.name}] recovered and transitioned to CLOSED. Normal traffic resumed.`,
      );
    }
  }

  /**
   * Execute an operation guarded by the circuit breaker.
   */
  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    this.checkStateTransition();

    // 1. If OPEN, fail fast
    if (this.state === 'OPEN') {
      this.totalRejected++;
      if (this.metricsService) {
        try {
          this.metricsService.incrementCounter('circuit_breaker_rejected_total', {
            breaker_name: this.config.name,
          });
        } catch {
          // Bounded metric protection
        }
      }

      if (fallback) {
        return fallback();
      }

      const retryAfterMs = Math.max(
        0,
        this.config.openDurationMs - (Date.now() - this.lastStateChange),
      );

      throw new ReliabilityException({
        errorCode: ReliabilityErrorCode.CIRCUIT_OPEN,
        operation: 'circuit_protected_call',
        dependency: this.config.name,
        retryAfterMs,
        message: `Circuit breaker '${this.config.name}' is OPEN. Downstream service unavailable. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
      });
    }

    // 2. If HALF_OPEN, enforce probe limit
    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenProbeCount >= this.config.halfOpenProbes) {
        this.totalRejected++;
        if (this.metricsService) {
          try {
            this.metricsService.incrementCounter('circuit_breaker_rejected_total', {
              breaker_name: this.config.name,
            });
          } catch {
            // Bounded metric protection
          }
        }

        if (fallback) {
          return fallback();
        }

        throw new ReliabilityException({
          errorCode: ReliabilityErrorCode.CIRCUIT_OPEN,
          operation: 'circuit_probe_limit',
          dependency: this.config.name,
          message: `Circuit breaker '${this.config.name}' is in HALF_OPEN state with max probes in-flight.`,
        });
      }

      this.halfOpenProbeCount++;
    }

    // 3. Execute Downstream Call
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    this.totalSuccesses++;

    if (this.state === 'HALF_OPEN') {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo('CLOSED');
      }
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.totalFailures++;
    this.lastFailureTime = now;

    if (this.state === 'HALF_OPEN') {
      // Immediate trip back to OPEN if probe fails
      this.transitionTo('OPEN');
      return;
    }

    if (this.state === 'CLOSED') {
      // Prune failures outside the rolling window
      this.failureTimestamps = this.failureTimestamps.filter(
        (ts) => now - ts <= this.config.rollingWindowMs,
      );
      this.failureTimestamps.push(now);

      if (this.failureTimestamps.length >= this.config.failureThreshold) {
        this.transitionTo('OPEN');
      }
    }
  }

  /**
   * Resets the circuit breaker state to CLOSED (used in testing or administrative override).
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureTimestamps = [];
    this.consecutiveSuccesses = 0;
    this.halfOpenProbeCount = 0;
    this.totalSuccesses = 0;
    this.totalFailures = 0;
    this.totalRejected = 0;
    this.lastStateChange = Date.now();
  }

  /**
   * Force trips the circuit breaker to OPEN (used in failure-injection and testing).
   */
  trip(): void {
    this.transitionTo('OPEN');
  }
}
