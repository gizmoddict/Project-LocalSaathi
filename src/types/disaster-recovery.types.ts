// ==============================================================================
// LocalSaathi — Phase 23: Disaster Recovery, Data Integrity & Continuity Types
// Authoritative vs Rebuildable Classification, RPO/RTO & DR Tooling Types
// ==============================================================================

export type DataClassificationCategory =
  | 'AUTHORITATIVE'  // Irreplaceable primary source of truth (PostgreSQL)
  | 'REBUILDABLE'    // Derived data that can be recomputed from source (Redis, Search)
  | 'RECONCILABLE'   // External third-party state (Razorpay, SMS/Push, S3)
  | 'EPHEMERAL';     // In-memory, transient connection state (WebSockets, rate limits)

export type BackupType =
  | 'LOGICAL_FULL'
  | 'LOGICAL_SCHEMA'
  | 'PHYSICAL_SNAPSHOT';

export type BackupFormat =
  | 'JSON_PORTABLE'
  | 'SQL_DUMP'
  | 'CUSTOM_ARCHIVE';

export type BackupStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'VERIFIED'
  | 'CORRUPTED';

export type RestoreStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'VERIFIED';

export type IntegrityCheckSeverity =
  | 'PASS'
  | 'WARN'
  | 'FAIL';

export type MigrationSafetyClassification =
  | 'SAFE'
  | 'RISKY'
  | 'DESTRUCTIVE';

export interface DataClassificationRecord {
  entity: string;
  category: DataClassificationCategory;
  primaryStore: string;
  recoverySource: string;
  rpoTargetSeconds: number;
  rtoTargetSeconds: number;
  description: string;
}

export interface BackupMetadata {
  backupId: string;
  timestamp: string;
  environment: string;
  backupType: BackupType;
  format: BackupFormat;
  filePath: string;
  fileSizeBytes: number;
  checksumSha256: string;
  isEncrypted: boolean;
  encryptionAlgorithm?: string;
  tableCounts: Record<string, number>;
  databaseVersion?: string;
  durationMs: number;
  verifiedAt?: string;
  verificationStatus: BackupStatus;
}

export interface BackupVerificationResult {
  backupId: string;
  filePath: string;
  isValid: boolean;
  fileExists: boolean;
  sizeBytes: number;
  computedChecksum: string;
  expectedChecksum: string;
  checksumMatches: boolean;
  decryptionSuccessful?: boolean;
  archiveReadable: boolean;
  tableCountExpected: number;
  tableCountFound: number;
  errors: string[];
  verifiedAt: string;
  durationMs: number;
}

export interface RestoreDrillOptions {
  backupPath: string;
  targetDatabaseUrl: string;
  verifyChecksum?: boolean;
  runIntegrityChecks?: boolean;
  allowDestructivePrimaryOverwrite?: boolean;
}

export interface RestoreDrillResult {
  restoreId: string;
  backupId: string;
  status: RestoreStatus;
  targetDatabase: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  tablesRestored: number;
  recordsRestored: Record<string, number>;
  sourceRecordCounts: Record<string, number>;
  integrityCheckPassed: boolean;
  errors: string[];
}

export interface IntegrityAnomaly {
  code: string;
  entity: string;
  recordId?: string;
  severity: IntegrityCheckSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface IntegrityCheckReport {
  timestamp: string;
  overallStatus: IntegrityCheckSeverity;
  durationMs: number;
  checksRun: number;
  passes: number;
  warnings: number;
  failures: number;
  anomalies: IntegrityAnomaly[];
  domainChecks: {
    foreignKeysValid: boolean;
    orphanRecordsDetected: number;
    uniqueConstraintsValid: boolean;
    financialConsistencyValid: boolean;
    outboxConsistencyValid: boolean;
    acceptedApplicationsValid: boolean;
    bookingsValid: boolean;
    refundsValid: boolean;
  };
}

export interface FinancialIntegrityReport {
  timestamp: string;
  isConsistent: boolean;
  totalPaymentsAudited: number;
  totalRefundsAudited: number;
  totalVolumeAuditedInr: number;
  refundTotalDiscrepancies: number;
  negativeAmountCount: number;
  invalidStatusTransitionCount: number;
  pendingReconciliationCount: number;
  duplicateIdempotencyKeys: number;
  anomalies: IntegrityAnomaly[];
}

export interface MigrationSafetyAnalysis {
  migrationName: string;
  filePath: string;
  classification: MigrationSafetyClassification;
  requiresBackup: boolean;
  isReversible: boolean;
  destructiveOperations: string[];
  riskyOperations: string[];
  recommendedPrecautions: string[];
}

export interface RpoRtoMeasurement {
  environment: string;
  datasetName: string;
  totalRecordsAudited: number;
  backupSizeBytes: number;
  backupDurationMs: number;
  verificationDurationMs: number;
  restoreDurationMs: number;
  integrityCheckDurationMs: number;
  applicationRecoveryDurationMs: number;
  totalRecoveryTimeMs: number;
  rpoDemonstratedSeconds: number;
  rtoMeasuredSeconds: number;
  classification: 'LOCAL_DRILL' | 'STAGING_DRILL' | 'PRODUCTION_VALIDATED';
}

export interface DisasterRecoveryStatusResponse {
  latestBackup: BackupMetadata | null;
  lastVerification: BackupVerificationResult | null;
  lastRestoreDrill: RestoreDrillResult | null;
  latestIntegrityReport: IntegrityCheckReport | null;
  pendingReconciliationsCount: number;
  rpoRtoMetrics: {
    lastMeasuredRtoSeconds: number;
    lastMeasuredRpoSeconds: number;
  };
  rebuildableState: {
    redisStatus: 'HEALTHY' | 'REBUILD_REQUIRED';
    searchIndexStatus: 'SYNCED' | 'REBUILD_REQUIRED';
  };
}
