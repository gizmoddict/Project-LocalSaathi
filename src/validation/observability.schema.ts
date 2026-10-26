// ==============================================================================
// LocalSaathi — Observability & Monitoring Zod Validation Schemas (Phase 21)
// Machine-Readable Log Schemas, Health Contracts & Config Validation
// ==============================================================================

import { z } from 'zod';
import {
  LogLevel,
  SubsystemName,
  AlertSeverity,
} from '@localsaathi/types';

export const logLevelSchema = z.nativeEnum(LogLevel);
export const subsystemNameSchema = z.nativeEnum(SubsystemName);
export const subsystemHealthStatusSchema = z.enum(['HEALTHY', 'DEGRADED', 'UNHEALTHY']);
export const alertSeveritySchema = z.nativeEnum(AlertSeverity);

export const structuredLogEntrySchema = z.object({
  timestamp: z.string().datetime(),
  level: logLevelSchema,
  service: z.string().min(1).max(100),
  environment: z.string().min(1).max(50),
  message: z.string().min(1).max(5000),
  requestId: z.string().max(128).optional(),
  correlationId: z.string().max(128).optional(),
  traceId: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  spanId: z.string().regex(/^[0-9a-f]{16}$/).optional(),
  userId: z.string().uuid().optional(),
  actorRole: z.string().max(50).optional(),
  route: z.string().max(255).optional(),
  method: z.string().max(10).optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  durationMs: z.number().nonnegative().optional(),
  errorCode: z.string().max(100).optional(),
  errorType: z.string().max(100).optional(),
  queueName: z.string().max(100).optional(),
  jobId: z.string().max(128).optional(),
  eventId: z.string().max(128).optional(),
  sourceEventId: z.string().max(128).optional(),
  paymentId: z.string().max(128).optional(),
  notificationId: z.string().max(128).optional(),
  cacheKeyHash: z.string().max(64).optional(),
  dbOperation: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const componentHealthDetailSchema = z.object({
  subsystem: subsystemNameSchema,
  status: subsystemHealthStatusSchema,
  latencyMs: z.number().nonnegative().optional(),
  lastChecked: z.string().datetime(),
  degradedReason: z.string().max(500).optional(),
  unhealthyReason: z.string().max(500).optional(),
  details: z.record(z.unknown()).optional(),
});

export const centralizedSystemHealthSchema = z.object({
  overallStatus: subsystemHealthStatusSchema,
  timestamp: z.string().datetime(),
  activeIncidentsCount: z.number().int().nonnegative(),
  components: z.record(subsystemNameSchema, componentHealthDetailSchema),
  summaryReasons: z.array(z.string()),
});

export const activeAlertSchema = z.object({
  alertId: z.string().min(1).max(128),
  ruleName: z.string().min(1).max(100),
  severity: alertSeveritySchema,
  message: z.string().min(1).max(500),
  currentValue: z.number(),
  threshold: z.number(),
  triggeredAt: z.string().datetime(),
});

export const alertEvaluationSummarySchema = z.object({
  status: z.enum(['CLEAR', 'ALERTS_ACTIVE']),
  totalEvaluated: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  alerts: z.array(activeAlertSchema),
  timestamp: z.string().datetime(),
});

export const observabilityConfigSchema = z.object({
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).default('INFO'),
  LOG_FORMAT: z.enum(['JSON', 'TEXT']).default('JSON'),
  METRICS_ENABLED: z.boolean().default(true),
  TRACING_ENABLED: z.boolean().default(true),
  OTEL_ENABLED: z.boolean().default(false),
  OTEL_SERVICE_NAME: z.string().default('localsaathi-core'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  TRACE_SAMPLE_RATE: z.number().min(0).max(1).default(1.0),
  DB_SLOW_QUERY_MS: z.number().positive().default(200),
  REDIS_SLOW_COMMAND_MS: z.number().positive().default(50),
  ALERT_API_ERROR_RATE_PERCENT: z.number().min(0).max(100).default(5),
  ALERT_API_P95_MS: z.number().positive().default(1000),
  ALERT_QUEUE_BACKLOG: z.number().positive().default(500),
  ALERT_DLQ_COUNT: z.number().nonnegative().default(10),
  ALERT_OUTBOX_BACKLOG: z.number().positive().default(500),
  ALERT_PAYMENT_FAILURE_RATE: z.number().min(0).max(100).default(5),
});
