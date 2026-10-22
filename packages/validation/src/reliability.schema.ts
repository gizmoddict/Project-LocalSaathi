// ==============================================================================
// LocalSaathi — Reliability & Resilience Validation Schemas (Phase 22)
// Zod schemas for retry, circuit breaker, timeout configs and reliability metrics
// ==============================================================================

import { z } from 'zod';

export const reliabilityErrorCodeSchema = z.enum([
  'TIMEOUT',
  'CONNECTION_FAILURE',
  'RATE_LIMITED',
  'DEPENDENCY_UNAVAILABLE',
  'DEPENDENCY_OVERLOADED',
  'CIRCUIT_OPEN',
  'TRANSIENT_DATABASE_ERROR',
  'SERIALIZATION_FAILURE',
  'DEADLOCK',
  'NON_RETRYABLE_ERROR',
  'UNKNOWN_EXTERNAL_STATE',
]);

export const retryPolicyConfigSchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  initialDelayMs: z.number().int().min(10).max(10000).default(250),
  maxDelayMs: z.number().int().min(100).max(60000).default(5000),
  backoffFactor: z.number().min(1.0).max(5.0).default(2.0),
  jitterPercent: z.number().min(0.0).max(1.0).default(0.2),
  timeoutMs: z.number().int().min(100).max(300000).optional(),
});

export const circuitBreakerConfigSchema = z.object({
  name: z.string().min(1).max(50),
  failureThreshold: z.number().int().min(1).max(50).default(5),
  rollingWindowMs: z.number().int().min(1000).max(60000).default(10000),
  openDurationMs: z.number().int().min(1000).max(120000).default(15000),
  halfOpenProbes: z.number().int().min(1).max(10).default(3),
  successThreshold: z.number().int().min(1).max(10).default(2),
});

export const timeoutConfigSchema = z.object({
  dbOperationTimeoutMs: z.number().int().min(500).max(60000).default(5000),
  redisOperationTimeoutMs: z.number().int().min(200).max(10000).default(1500),
  externalHttpTimeoutMs: z.number().int().min(1000).max(60000).default(10000),
  paymentProviderTimeoutMs: z.number().int().min(1000).max(60000).default(10000),
  notificationProviderTimeoutMs: z.number().int().min(1000).max(60000).default(8000),
  gracefulShutdownTimeoutMs: z.number().int().min(1000).max(30000).default(10000),
});
