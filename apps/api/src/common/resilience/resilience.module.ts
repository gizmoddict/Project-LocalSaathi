// ==============================================================================
// LocalSaathi — Resilience & Reliability Module (Phase 22)
// Exports Centralized Policies, Circuit Breakers, Timeouts, and Database Concurrency Resiliency
// ==============================================================================

import { Global, Module } from '@nestjs/common';
import { RetryPolicy } from './retry-policy';
import { CircuitBreakerRegistry } from './circuit-breaker-registry';
import { PostgresResilienceService } from './postgres-resilience.service';
import { ResilienceRateLimiter } from './rate-limit-fallback.service';

@Global()
@Module({
  providers: [
    RetryPolicy,
    CircuitBreakerRegistry,
    PostgresResilienceService,
    ResilienceRateLimiter,
  ],
  exports: [
    RetryPolicy,
    CircuitBreakerRegistry,
    PostgresResilienceService,
    ResilienceRateLimiter,
  ],
})
export class ResilienceModule {}

export * from './reliability.errors';
export * from './retry-classifier';
export * from './retry-policy';
export * from './timeout.util';
export * from './circuit-breaker';
export * from './circuit-breaker-registry';
export * from './postgres-resilience.service';
export * from './rate-limit-fallback.service';
