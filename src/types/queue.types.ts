// ==============================================================================
// LocalSaathi — Background Worker & Queue Platform Type Definitions (Phase 20)
// Centralized Job Contracts, Queue Taxonomy, DLQ Schemas & Concurrency Policies
// ==============================================================================

export enum QueueName {
  NOTIFICATIONS = 'notifications-queue',
  SMS = 'sms-queue',
  EMAIL = 'email-queue',
  TRANSLATION = 'translation-queue',
  VOICE_PROCESSING = 'voice-processing-queue',
  EMBEDDING_GENERATION = 'embedding-generation-queue',
  SEARCH_INDEXING = 'search-indexing-queue',
  RECOMMENDATIONS = 'recommendations-queue',
  ANALYTICS = 'analytics-queue',
  IMAGE_PROCESSING = 'image-processing-queue',
  PAYMENT_RECONCILIATION = 'payment-reconciliation-queue',
  CLEANUP = 'cleanup-queue',
}

export enum JobPriority {
  CRITICAL = 1,
  HIGH = 2,
  NORMAL = 5,
  LOW = 10,
}

export type FailureCategory =
  | 'TRANSIENT_NETWORK'
  | 'PROVIDER_OUTAGE'
  | 'TIMEOUT'
  | 'VALIDATION_FAILED'
  | 'BUSINESS_REJECTED'
  | 'FATAL_SYSTEM';

/**
 * Universal Typed Job Envelope Contract
 * Enforces strict typing, idempotency key, source tracing, and schema versioning.
 */
export interface JobContract<T = Record<string, unknown>> {
  /** Descriptive job identifier (e.g. 'notifications.dispatch_in_app') */
  jobName: string;
  /** Schema contract version for forward/backward compatibility */
  schemaVersion: number;
  /** Unique deterministic or UUID job identifier */
  jobId: string;
  /** Trace or correlation ID from initiating request */
  correlationId?: string;
  /** Strongly typed payload */
  payload: T;
  /** Timestamp when job was constructed (ISO 8601) */
  createdAt: string;
  /** Execution attempt counter */
  attemptCount: number;
  /** Priority level for queue scheduling */
  priority: JobPriority;
  /** Idempotency key for deduplication */
  idempotencyKey: string;
  /** Optional source transactional outbox event ID */
  sourceEventId?: string;
}

// ------------------------------------------------------------------------------
// Queue-Specific Payload Contracts
// ------------------------------------------------------------------------------

export interface NotificationJobPayload {
  recipientUserId: string;
  notificationType: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  priority?: string;
  channel: 'IN_APP' | 'PUSH' | 'ALL';
  metadata?: Record<string, unknown>;
}

export interface SmsJobPayload {
  toPhone: string;
  message: string;
  otpCode?: string;
  templateId?: string;
  purpose: 'AUTH_OTP' | 'CRITICAL_ALERT' | 'BOOKING_UPDATE';
}

export interface EmailJobPayload {
  toEmail: string;
  subject: string;
  templateName: string;
  templateData: Record<string, unknown>;
  replyTo?: string;
}

export interface TranslationJobPayload {
  entityType: 'JOB_POST' | 'WORKER_PROFILE';
  entityId: string;
  sourceLang: string;
  targetLangs: string[];
  fieldsToTranslate: Record<string, string>;
}

export interface VoiceProcessingJobPayload {
  audioStoragePath: string;
  mimeType: string;
  durationSeconds?: number;
  callerUserId?: string;
  purpose: 'VOICE_SEARCH' | 'VOICE_NOTE' | 'JOB_AUDIO';
}

export interface EmbeddingGenerationJobPayload {
  entityType: 'JOB_POST' | 'WORKER_PROFILE';
  entityId: string;
  contentVersion: number;
  rawText: string;
  modelVersion: string;
}

export interface SearchIndexingJobPayload {
  action: 'UPSERT' | 'DELETE';
  entityType: 'JOB' | 'WORKER';
  entityId: string;
  version: number;
  document?: Record<string, unknown>;
}

export interface RecommendationsJobPayload {
  workerUserId: string;
  radiusKm: number;
  limit: number;
  triggerEvent?: string;
}

export interface AnalyticsJobPayload {
  batchId: string;
  events: Array<{
    eventId: string;
    eventName: string;
    userId?: string | null;
    occurredAt: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface ImageProcessingJobPayload {
  sourceFilePath: string;
  targetStorageKey: string;
  userId: string;
  operations: Array<'THUMBNAIL_150' | 'STANDARD_600' | 'WEBP_OPTIMIZE'>;
  antivirusChecked: boolean;
}

export interface PaymentReconciliationJobPayload {
  windowStart?: string;
  windowEnd?: string;
  targetPaymentId?: string;
  mode: 'SCHEDULED_AUDIT' | 'DISCREPANCY_RECHECK';
  initiatedBy?: string;
}

export interface CleanupJobPayload {
  target: 'EXPIRED_NOTIFICATIONS' | 'ANALYTICS_RETENTION' | 'STALE_SESSIONS' | 'DLQ_PRUNING';
  retentionDays: number;
  batchSize: number;
}

// ------------------------------------------------------------------------------
// Dead Letter Queue Record
// ------------------------------------------------------------------------------

export interface DeadLetterJobRecord {
  dlqId: string;
  queueName: QueueName | string;
  jobId: string;
  jobName: string;
  idempotencyKey: string;
  sourceEventId?: string;
  failureCategory: FailureCategory;
  attemptCount: number;
  createdAt: string;
  failedAt: string;
  safeErrorMetadata: {
    message: string;
    stack?: string;
    code?: string;
  };
  sanitizedPayload: Record<string, unknown>;
}

// ------------------------------------------------------------------------------
// Worker Observability, Metrics & Queue Configuration
// ------------------------------------------------------------------------------

export interface QueueConfigPolicy {
  queueName: QueueName;
  concurrency: number;
  defaultPriority: JobPriority;
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  timeoutMs: number;
  rateLimit?: {
    max: number;
    durationMs: number;
  };
}

export interface QueueHealthStats {
  queueName: QueueName | string;
  isPaused: boolean;
  waitingCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
  delayedCount: number;
  dlqCount: number;
  throughputPerMinute: number;
}

export interface WorkerPlatformHealth {
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  workerProcessId: number;
  uptimeSeconds: number;
  redisConnected: boolean;
  activeWorkerCount: number;
  queues: Record<string, QueueHealthStats>;
  totalCompletedJobs: number;
  totalFailedJobs: number;
  totalDlqJobs: number;
}
