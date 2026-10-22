// ==============================================================================
// LocalSaathi — Queue & Job Payload Zod Validation Schemas (Phase 20)
// Prevents Malformed or Untrusted Payloads from Entering Worker Execution
// ==============================================================================

import { z } from 'zod';
import { QueueName, JobPriority } from '@localsaathi/types';

export const jobPrioritySchema = z.nativeEnum(JobPriority);
export const queueNameSchema = z.nativeEnum(QueueName);

/**
 * Base Universal Job Envelope Schema
 */
export const jobContractSchema = z.object({
  jobName: z.string().min(3).max(100),
  schemaVersion: z.number().int().positive().default(1),
  jobId: z.string().uuid().or(z.string().min(5).max(128)),
  correlationId: z.string().max(128).optional(),
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  attemptCount: z.number().int().nonnegative().default(0),
  priority: jobPrioritySchema.default(JobPriority.NORMAL),
  idempotencyKey: z.string().min(4).max(256),
  sourceEventId: z.string().uuid().or(z.string().min(4).max(128)).optional(),
});

// ------------------------------------------------------------------------------
// Queue-Specific Payload Schemas
// ------------------------------------------------------------------------------

export const notificationJobPayloadSchema = z.object({
  recipientUserId: z.string().uuid(),
  notificationType: z.string().min(2).max(100),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(128).optional(),
  priority: z.string().max(50).optional(),
  channel: z.enum(['IN_APP', 'PUSH', 'ALL']).default('ALL'),
  metadata: z.record(z.unknown()).optional(),
});

export const smsJobPayloadSchema = z.object({
  toPhone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid international phone format'),
  message: z.string().min(1).max(500),
  otpCode: z.string().length(6).optional(),
  templateId: z.string().max(100).optional(),
  purpose: z.enum(['AUTH_OTP', 'CRITICAL_ALERT', 'BOOKING_UPDATE']),
});

export const emailJobPayloadSchema = z.object({
  toEmail: z.string().email(),
  subject: z.string().min(1).max(200),
  templateName: z.string().min(1).max(100),
  templateData: z.record(z.unknown()).default({}),
  replyTo: z.string().email().optional(),
});

export const translationJobPayloadSchema = z.object({
  entityType: z.enum(['JOB_POST', 'WORKER_PROFILE']),
  entityId: z.string().uuid(),
  sourceLang: z.string().min(2).max(10),
  targetLangs: z.array(z.string().min(2).max(10)).min(1),
  fieldsToTranslate: z.record(z.string().min(1)),
});

export const voiceProcessingJobPayloadSchema = z.object({
  audioStoragePath: z.string().min(3).max(500),
  mimeType: z.string().min(3).max(100),
  durationSeconds: z.number().positive().max(300).optional(),
  callerUserId: z.string().uuid().optional(),
  purpose: z.enum(['VOICE_SEARCH', 'VOICE_NOTE', 'JOB_AUDIO']),
});

export const embeddingGenerationJobPayloadSchema = z.object({
  entityType: z.enum(['JOB_POST', 'WORKER_PROFILE']),
  entityId: z.string().uuid(),
  contentVersion: z.number().int().nonnegative(),
  rawText: z.string().min(5).max(10000),
  modelVersion: z.string().min(2).max(100).default('text-embedding-gecko@003'),
});

export const searchIndexingJobPayloadSchema = z.object({
  action: z.enum(['UPSERT', 'DELETE']),
  entityType: z.enum(['JOB', 'WORKER']),
  entityId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  document: z.record(z.unknown()).optional(),
});

export const recommendationsJobPayloadSchema = z.object({
  workerUserId: z.string().uuid(),
  radiusKm: z.number().positive().max(100).default(25),
  limit: z.number().int().positive().max(50).default(20),
  triggerEvent: z.string().max(100).optional(),
});

export const analyticsJobPayloadSchema = z.object({
  batchId: z.string().min(4).max(128),
  events: z.array(
    z.object({
      eventId: z.string().min(4).max(128),
      eventName: z.string().min(2).max(100),
      userId: z.string().uuid().nullable().optional(),
      occurredAt: z.string().datetime(),
      metadata: z.record(z.unknown()).optional(),
    }),
  ).min(1).max(500),
});

export const imageProcessingJobPayloadSchema = z.object({
  sourceFilePath: z.string().min(3).max(500),
  targetStorageKey: z.string().min(3).max(500),
  userId: z.string().uuid(),
  operations: z.array(z.enum(['THUMBNAIL_150', 'STANDARD_600', 'WEBP_OPTIMIZE'])).min(1),
  antivirusChecked: z.literal(true, {
    errorMap: () => ({ message: 'Cannot enqueue image without verified antivirus inspection' }),
  }),
});

export const paymentReconciliationJobPayloadSchema = z.object({
  windowStart: z.string().datetime().optional(),
  windowEnd: z.string().datetime().optional(),
  targetPaymentId: z.string().uuid().optional(),
  mode: z.enum(['SCHEDULED_AUDIT', 'DISCREPANCY_RECHECK']).default('SCHEDULED_AUDIT'),
  initiatedBy: z.string().max(100).optional(),
});

export const cleanupJobPayloadSchema = z.object({
  target: z.enum(['EXPIRED_NOTIFICATIONS', 'ANALYTICS_RETENTION', 'STALE_SESSIONS', 'DLQ_PRUNING']),
  retentionDays: z.number().int().nonnegative().default(30),
  batchSize: z.number().int().positive().max(5000).default(500),
});

/**
 * Universal payload validator mapping QueueName to corresponding Zod schema.
 */
export function getPayloadSchemaForQueue(queueName: QueueName): z.ZodTypeAny {
  switch (queueName) {
    case QueueName.NOTIFICATIONS:
      return notificationJobPayloadSchema;
    case QueueName.SMS:
      return smsJobPayloadSchema;
    case QueueName.EMAIL:
      return emailJobPayloadSchema;
    case QueueName.TRANSLATION:
      return translationJobPayloadSchema;
    case QueueName.VOICE_PROCESSING:
      return voiceProcessingJobPayloadSchema;
    case QueueName.EMBEDDING_GENERATION:
      return embeddingGenerationJobPayloadSchema;
    case QueueName.SEARCH_INDEXING:
      return searchIndexingJobPayloadSchema;
    case QueueName.RECOMMENDATIONS:
      return recommendationsJobPayloadSchema;
    case QueueName.ANALYTICS:
      return analyticsJobPayloadSchema;
    case QueueName.IMAGE_PROCESSING:
      return imageProcessingJobPayloadSchema;
    case QueueName.PAYMENT_RECONCILIATION:
      return paymentReconciliationJobPayloadSchema;
    case QueueName.CLEANUP:
      return cleanupJobPayloadSchema;
    default:
      return z.record(z.unknown());
  }
}
