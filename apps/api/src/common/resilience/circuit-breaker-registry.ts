// ==============================================================================
// LocalSaathi — Circuit Breaker Registry (Phase 22)
// Centralized Management, Discovery & Telemetry for All External Circuit Breakers
// ==============================================================================

import { Injectable, Optional } from '@nestjs/common';
import { CircuitBreakerConfig, CircuitBreakerStats } from '@localsaathi/types';
import { CircuitBreaker } from './circuit-breaker';
import { MetricsService } from '../observability/metrics.service';

export const CIRCUIT_BREAKER_NAMES = {
  PAYMENT_PROVIDER: 'PAYMENT_PROVIDER',
  NOTIFICATION_PROVIDER: 'NOTIFICATION_PROVIDER',
  SMS_PROVIDER: 'SMS_PROVIDER',
  EMAIL_PROVIDER: 'EMAIL_PROVIDER',
  TRANSLATION_PROVIDER: 'TRANSLATION_PROVIDER',
  VOICE_PROVIDER: 'VOICE_PROVIDER',
  EMBEDDING_PROVIDER: 'EMBEDDING_PROVIDER',
  SEARCH_INDEX: 'SEARCH_INDEX',
} as const;

@Injectable()
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(@Optional() private readonly metricsService?: MetricsService) {
    this.initDefaultBreakers();
  }

  private initDefaultBreakers(): void {
    const failureThreshold = parseInt(process.env.CB_FAILURE_THRESHOLD || '5', 10);
    const rollingWindowMs = parseInt(process.env.CB_ROLLING_WINDOW_MS || '10000', 10);
    const openDurationMs = parseInt(process.env.CB_OPEN_DURATION_MS || '15000', 10);
    const halfOpenProbes = parseInt(process.env.CB_HALF_OPEN_PROBES || '3', 10);

    const defaultConfig: Omit<CircuitBreakerConfig, 'name'> = {
      failureThreshold,
      rollingWindowMs,
      openDurationMs,
      halfOpenProbes,
      successThreshold: 2,
    };

    for (const name of Object.values(CIRCUIT_BREAKER_NAMES)) {
      this.getOrCreate(name, defaultConfig);
    }
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getOrCreate(name: string, customConfig?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      const config: CircuitBreakerConfig = {
        name,
        failureThreshold: customConfig?.failureThreshold ?? parseInt(process.env.CB_FAILURE_THRESHOLD || '5', 10),
        rollingWindowMs: customConfig?.rollingWindowMs ?? parseInt(process.env.CB_ROLLING_WINDOW_MS || '10000', 10),
        openDurationMs: customConfig?.openDurationMs ?? parseInt(process.env.CB_OPEN_DURATION_MS || '15000', 10),
        halfOpenProbes: customConfig?.halfOpenProbes ?? parseInt(process.env.CB_HALF_OPEN_PROBES || '3', 10),
        successThreshold: customConfig?.successThreshold ?? 2,
        ...customConfig,
      };

      breaker = new CircuitBreaker(config, this.metricsService);
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const result: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      result[name] = breaker.getStats();
    }
    return result;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}
