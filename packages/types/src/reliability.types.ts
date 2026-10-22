// ==============================================================================
// LocalSaathi — Reliability & Resilience Engineering Types (Phase 22)
// Standardized Failure Taxonomy, Centralized Retry Policies, Circuit Breakers & Timeouts
// ==============================================================================

/**
 * Standardized Reliability Error Taxonomy (Section 24)
 */
export enum ReliabilityErrorCode {
  TIMEOUT = 'TIMEOUT',
  CONNECTION_FAILURE = 'CONNECTION_FAILURE',
  RATE_LIMITED = 'RATE_LIMITED',
  DEPENDENCY_UNAVAILABLE = 'DEPENDENCY_UNAVAILABLE',
  DEPENDENCY_OVERLOADED = 'DEPENDENCY_OVERLOADED',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  TRANSIENT_DATABASE_ERROR = 'TRANSIENT_DATABASE_ERROR',
  SERIALIZATION_FAILURE = 'SERIALIZATION_FAILURE',
  DEADLOCK = 'DEADLOCK',
  NON_RETRYABLE_ERROR = 'NON_RETRYABLE_ERROR',
  UNKNOWN_EXTERNAL_STATE = 'UNKNOWN_EXTERNAL_STATE',
}

/**
 * Centralized Retry Failure Classification (Section 3)
 */
export type RetryClassification = 'RETRYABLE' | 'NON_RETRYABLE' | 'UNKNOWN';

/**
 * Circuit Breaker State Machine States (Section 7)
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit Breaker Configuration
 */
export interface CircuitBreakerConfig {
  /** Breaker identifier (e.g. 'PAYMENT_PROVIDER', 'SMS_PROVIDER') */
  name: string;
  /** Number of failures within rolling window before opening (default: 5) */
  failureThreshold: number;
  /** Duration of rolling observation window in milliseconds (default: 10000) */
  rollingWindowMs: number;
  /** How long the circuit stays OPEN before transitioning to HALF_OPEN in ms (default: 15000) */
  openDurationMs: number;
  /** Number of test probe requests allowed in HALF_OPEN state (default: 3) */
  halfOpenProbes: number;
  /** Number of consecutive successes in HALF_OPEN required to transition to CLOSED (default: 2) */
  successThreshold: number;
}

/**
 * Circuit Breaker Operational Runtime Statistics
 */
export interface CircuitBreakerStats {
  name: string;
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  consecutiveSuccesses: number;
  lastFailureTime?: number;
  lastStateChange: number;
  rejectedRequests: number;
  halfOpenProbeCount: number;
}

/**
 * Centralized Retry Policy Options (Section 4)
 */
export interface RetryPolicyOptions {
  /** Maximum total attempts including initial call (default: 3) */
  maxAttempts: number;
  /** Initial backoff delay in milliseconds (default: 250) */
  initialDelayMs: number;
  /** Maximum backoff delay cap in milliseconds (default: 5000) */
  maxDelayMs: number;
  /** Exponential backoff multiplier factor (default: 2.0) */
  backoffFactor: number;
  /** Jitter variance percentage from 0.0 to 1.0 (default: 0.20 = 20%) */
  jitterPercent: number;
  /** Optional overall timeout in milliseconds */
  timeoutMs?: number;
  /** Logical operation name for logging and metrics */
  operationName?: string;
  /** Dependency name for metric attribution */
  dependency?: string;
  /** Custom predicate to determine whether error should be retried */
  isRetryable?: (error: unknown, attempt: number) => boolean | RetryClassification;
  /** Hook executed before each retry delay */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Optional AbortSignal for cooperative cancellation */
  signal?: AbortSignal;
}

/**
 * Bounded Timeout Configuration Options (Section 6)
 */
export interface TimeoutOptions {
  /** Timeout threshold in milliseconds */
  timeoutMs: number;
  /** Name of the operation being executed */
  operationName: string;
  /** Name of the downstream dependency (e.g. 'REDIS', 'RAZORPAY', 'POSTGRES') */
  dependency: string;
  /** Optional hook called when timeout occurs */
  onTimeout?: () => void;
}

/**
 * Centralized Reliability Environment Configuration
 */
export interface ReliabilityConfig {
  RETRY_MAX_ATTEMPTS: number;
  RETRY_INITIAL_DELAY_MS: number;
  RETRY_MAX_DELAY_MS: number;
  RETRY_JITTER_PERCENT: number;
  DB_OPERATION_TIMEOUT_MS: number;
  REDIS_OPERATION_TIMEOUT_MS: number;
  EXTERNAL_HTTP_TIMEOUT_MS: number;
  PAYMENT_PROVIDER_TIMEOUT_MS: number;
  NOTIFICATION_PROVIDER_TIMEOUT_MS: number;
  CB_FAILURE_THRESHOLD: number;
  CB_ROLLING_WINDOW_MS: number;
  CB_OPEN_DURATION_MS: number;
  CB_HALF_OPEN_PROBES: number;
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: number;
}
