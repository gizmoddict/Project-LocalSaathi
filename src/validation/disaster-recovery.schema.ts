// ==============================================================================
// LocalSaathi — Phase 23: Disaster Recovery & Data Integrity Schemas
// Validation for Backups, Restores, Integrity Checks & Migration Safety
// ==============================================================================

import { z } from 'zod';

export const dataClassificationCategorySchema = z.enum([
  'AUTHORITATIVE',
  'REBUILDABLE',
  'RECONCILABLE',
  'EPHEMERAL',
]);

export const backupTypeSchema = z.enum([
  'LOGICAL_FULL',
  'LOGICAL_SCHEMA',
  'PHYSICAL_SNAPSHOT',
]);

export const backupFormatSchema = z.enum([
  'JSON_PORTABLE',
  'SQL_DUMP',
  'CUSTOM_ARCHIVE',
]);

export const backupStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'VERIFIED',
  'CORRUPTED',
]);

export const restoreStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'VERIFIED',
]);

export const integrityCheckSeveritySchema = z.enum([
  'PASS',
  'WARN',
  'FAIL',
]);

export const migrationSafetyClassificationSchema = z.enum([
  'SAFE',
  'RISKY',
  'DESTRUCTIVE',
]);

export const backupOptionsSchema = z.object({
  backupType: backupTypeSchema.default('LOGICAL_FULL'),
  format: backupFormatSchema.default('JSON_PORTABLE'),
  label: z.string().optional(),
  encrypt: z.boolean().default(false),
  outDir: z.string().optional(),
});

export const restoreOptionsSchema = z.object({
  backupPath: z.string().min(1, 'Backup file path is required'),
  targetDatabaseUrl: z.string().url('Target database URL must be valid'),
  verifyChecksum: z.boolean().default(true),
  runIntegrityChecks: z.boolean().default(true),
  allowDestructivePrimaryOverwrite: z.boolean().default(false),
});

export const integrityAnomalySchema = z.object({
  code: z.string(),
  entity: z.string(),
  recordId: z.string().optional(),
  severity: integrityCheckSeveritySchema,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export const backupMetadataSchema = z.object({
  backupId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  backupType: backupTypeSchema,
  format: backupFormatSchema,
  filePath: z.string(),
  fileSizeBytes: z.number().nonnegative(),
  checksumSha256: z.string(),
  isEncrypted: z.boolean(),
  encryptionAlgorithm: z.string().optional(),
  tableCounts: z.record(z.number()),
  databaseVersion: z.string().optional(),
  durationMs: z.number().nonnegative(),
  verifiedAt: z.string().optional(),
  verificationStatus: backupStatusSchema,
});
