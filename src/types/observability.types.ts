// ==============================================================================
// LocalSaathi — Observability & Monitoring Platform Type Definitions (Phase 21)
// Centralized Logging, W3C Distributed Tracing, Metrics & System Health Taxonomy
// ==============================================================================

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

/**
 * Universal Structured JSON Log Entry Contract
 * Enforces machine-readable formatting, distributed correlation, and safe metadata.
 */
export interface StructuredLogEntry {
  timestamp: string;          // ISO 8601
  level: LogLevel;
  service: string;            // 'localsaathi-api' | 'localsaathi-worker' | etc.
  environment: string;        // 'development' | 'staging' | 'production'
  message: string;
  requestId?: string;         // Inbound request identifier
  correlationId?: string;     // Distributed end-to-end trace correlation
  traceId?: string;           // W3C TraceContext trace ID (32 hex)
  spanId?: string;            // W3C TraceContext span ID (16 hex)
  userId?: string;            // Authenticated user ID (safe)
  actorRole?: string;         // 'WORKER' | 'EMPLOYER' | 'ADMIN'
  route?: string;             // Route template (e.g. '/api/v1/jobs/:id')
  method?: string;            // HTTP Verb
  statusCode?: number;        // HTTP status
  durationMs?: number;        // Latency
  errorCode?: string;         // Standardized error code
  errorType?: string;         // Error class or failure category
  queueName?: string;         // BullMQ queue name if applicable
  jobId?: string;             // BullMQ or synthetic job ID
  eventId?: string;           // Outbox domain event ID
  sourceEventId?: string;     // Parent domain event ID
  paymentId?: string;         // Safe internal payment ID
  notificationId?: string;    // Internal notification ID
  cacheKeyHash?: string;      // Safe SHA256 snippet of cache key
  dbOperation?: string;       // Safe model/operation (e.g. 'Job.findMany')
  metadata?: Record<string, unknown>;
}

// ------------------------------------------------------------------------------
// Distributed Tracing Contracts (W3C TraceContext Compatible)
// ------------------------------------------------------------------------------

export interface TraceContext {
  traceId: string;            // 32-character hexadecimal string
  spanId: string;             // 16-character hexadecimal string
  traceFlags: string;         // '01' = sampled
  traceState?: string;
}

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER' | 'INTERNAL';
  startTimeMs: number;
  endTimeMs?: number;
  durationMs?: number;
  attributes: SpanAttributes;
  status: 'UNSET' | 'OK' | 'ERROR';
  statusMessage?: string;
}

// ------------------------------------------------------------------------------
// Metrics & Prometheus Exposition Contracts
// ------------------------------------------------------------------------------

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
}

export interface MetricSnapshot {
  name: string;
  help: string;
  type: MetricType;
  values: Array<{
    labels: Record<string, string>;
    value: number;
  }>;
}

export interface HistogramQuantiles {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  count: number;
  sum: number;
}

// ------------------------------------------------------------------------------
// System Health & Diagnostics Taxonomy
// ------------------------------------------------------------------------------

export enum SubsystemName {
  API = 'API',
  DATABASE = 'DATABASE',
  REDIS = 'REDIS',
  WEBSOCKET = 'WEBSOCKET',
  WORKERS = 'WORKERS',
  QUEUES = 'QUEUES',
  OUTBOX = 'OUTBOX',
  NOTIFICATIONS = 'NOTIFICATIONS',
  PAYMENTS = 'PAYMENTS',
  CACHE = 'CACHE',
}

export type SubsystemHealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

export interface ComponentHealthDetail {
  subsystem: SubsystemName;
  status: SubsystemHealthStatus;
  latencyMs?: number;
  lastChecked: string;
  degradedReason?: string;
  unhealthyReason?: string;
  details?: Record<string, unknown>;
}

export interface CentralizedSystemHealth {
  overallStatus: SubsystemHealthStatus;
  timestamp: string;
  activeIncidentsCount: number;
  components: Record<SubsystemName, ComponentHealthDetail>;
  summaryReasons: string[];
}

// ------------------------------------------------------------------------------
// Alerting Engine Contracts
// ------------------------------------------------------------------------------

export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  metricName: string;
  condition: 'GT' | 'LT' | 'EQ';
  threshold: number;
  currentValue?: number;
  isTriggered: boolean;
  evaluatedAt: string;
}

export interface ActiveAlert {
  alertId: string;
  ruleName: string;
  severity: AlertSeverity;
  message: string;
  currentValue: number;
  threshold: number;
  triggeredAt: string;
}

export interface AlertEvaluationSummary {
  status: 'CLEAR' | 'ALERTS_ACTIVE';
  totalEvaluated: number;
  activeCount: number;
  alerts: ActiveAlert[];
  timestamp: string;
}

export interface AlertNotifier {
  notify(alert: ActiveAlert): Promise<void>;
}
