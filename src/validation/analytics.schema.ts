// ==============================================================================
// LocalSaathi — Product Analytics Platform Schemas (Phase 16)
// Zod Validations for Client Events, Batches & Admin Explorer Queries
// ==============================================================================

import { z } from 'zod';
import {
  AnalyticsEventName,
  AnalyticsEventSource,
  AnalyticsPlatform,
  CLIENT_ALLOWED_EVENT_NAMES,
} from '@localsaathi/types';

/**
 * Metadata sanitizer rules: blacklisted keys that must NEVER be persisted
 */
export const SENSITIVE_METADATA_KEYS = [
  'password',
  'token',
  'refreshtoken',
  'accesstoken',
  'authorization',
  'secret',
  'otp',
  'otphash',
  'cardnumber',
  'cvv',
  'expiry',
  'pan',
  'aadhaar',
  'rawdocument',
  'documenturl',
  'messagecontent',
  'messagebody',
];

/**
 * Client-submitted single event schema
 */
export const clientTrackEventSchema = z.object({
  eventId: z
    .string()
    .min(1, 'eventId is required')
    .max(128, 'eventId cannot exceed 128 chars'),
  eventName: z
    .string()
    .min(1, 'eventName is required')
    .refine(
      (name) => CLIENT_ALLOWED_EVENT_NAMES.has(name) || Object.values(AnalyticsEventName).includes(name as any),
      {
        message: 'Invalid or unauthorized event name for client telemetry',
      },
    ),
  occurredAt: z.string().datetime().optional(),
  anonymousSessionId: z.string().max(128).optional(),
  platform: z
    .nativeEnum(AnalyticsPlatform)
    .or(z.string().max(32))
    .default(AnalyticsPlatform.WEB),
  appVersion: z.string().max(32).default('1.0.0'),
  correlationId: z.string().max(128).optional(),
  schemaVersion: z.number().int().min(1).max(10).default(1),
  metadata: z
    .record(z.unknown())
    .default({})
    .refine(
      (meta) => {
        const keys = Object.keys(meta).map((k) => k.toLowerCase().replace(/[^a-z]/g, ''));
        return !keys.some((k) => SENSITIVE_METADATA_KEYS.some((bad) => k.includes(bad)));
      },
      {
        message: 'Event metadata contains prohibited sensitive or PII fields',
      },
    ),
});

export const clientTrackBatchSchema = z.object({
  events: z
    .array(clientTrackEventSchema)
    .min(1, 'At least one event must be supplied in batch')
    .max(100, 'Maximum batch size is 100 events'),
});

/**
 * Admin Explorer Query Schema
 */
export const adminAnalyticsEventQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  eventName: z.string().optional(),
  source: z.nativeEnum(AnalyticsEventSource).optional(),
  platform: z.string().optional(),
  userId: z.string().uuid().optional(),
  anonymousSessionId: z.string().optional(),
  correlationId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Admin Aggregated Metrics Query Schema
 */
export const adminAnalyticsMetricsQuerySchema = z.object({
  timeframe: z.enum(['24h', '7d', '30d', '90d']).default('30d'),
});

export type ClientTrackEventDto = z.infer<typeof clientTrackEventSchema>;
export type ClientTrackBatchDto = z.infer<typeof clientTrackBatchSchema>;
export type AdminAnalyticsEventQueryDto = z.infer<typeof adminAnalyticsEventQuerySchema>;
export type AdminAnalyticsMetricsQueryDto = z.infer<typeof adminAnalyticsMetricsQuerySchema>;
