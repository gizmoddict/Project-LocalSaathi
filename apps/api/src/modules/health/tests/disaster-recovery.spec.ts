// ==============================================================================
// LocalSaathi — Phase 23: Disaster Recovery, Data Integrity & Continuity Tests
// Comprehensive Test Suite Covering Backup, Verification, Corruption, Restoration,
// Financial Consistency, Migration Safety & Rebuildable Infrastructure (Section 38)
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Import DR scripts
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createBackup } = require('../../../../../../scripts/dr/backup');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyBackup } = require('../../../../../../scripts/dr/verify-backup');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { restoreBackup } = require('../../../../../../scripts/dr/restore');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runIntegrityAudit } = require('../../../../../../scripts/dr/integrity-checker');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { analyzeMigrationSql } = require('../../../../../../scripts/dr/migration-safety');

describe('Phase 23 — Disaster Recovery & Data Integrity Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localsaathi-dr-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ----------------------------------------------------------------------------
  // 1. Backup Creation & Integrity Verification
  // ----------------------------------------------------------------------------
  describe('1. Logical Backup & Checksum Verification', () => {
    it('creates a deterministic logical backup with companion metadata and SHA-256 checksum', async () => {
      const customData = {
        users: [{ id: 'u1', phone: '+919876543210' }],
        jobs: [{ id: 'j1', title: 'Painter' }],
        bookings: [{ id: 'b1', status: 'CONFIRMED' }],
      };

      const res = await createBackup({ outDir: tempDir, customData });
      expect(res.success).toBe(true);
      expect(fs.existsSync(res.dumpFilePath)).toBe(true);
      expect(fs.existsSync(res.metaFilePath)).toBe(true);
      expect(res.metadata.checksumSha256).toBeDefined();
      expect(res.metadata.tableCounts.users).toBe(1);
      expect(res.metadata.tableCounts.jobs).toBe(1);

      // Verify the backup
      const verification = await verifyBackup(res.dumpFilePath);
      expect(verification.isValid).toBe(true);
      expect(verification.checksumMatches).toBe(true);
      expect(verification.archiveReadable).toBe(true);
      expect(verification.tableCountFound).toBe(3);
    });

    it('creates encrypted backup with AES-256-GCM and decrypts successfully', async () => {
      const secretKey = 'my-super-secret-dr-key-for-testing';
      const customData = { users: [{ id: 'u_enc_1', phone: '+919999999999' }] };

      const res = await createBackup({
        outDir: tempDir,
        customData,
        encryptionKey: secretKey,
      });

      expect(res.metadata.isEncrypted).toBe(true);
      expect(res.metadata.format).toBe('CUSTOM_ARCHIVE');

      // Verification fails if key is omitted
      const failedVerify = await verifyBackup(res.dumpFilePath);
      expect(failedVerify.isValid).toBe(false);

      // Verification passes with correct key
      const successVerify = await verifyBackup(res.dumpFilePath, { encryptionKey: secretKey });
      expect(successVerify.isValid).toBe(true);
      expect(successVerify.decryptionSuccessful).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Backup Corruption Detection (Scenario 26)
  // ----------------------------------------------------------------------------
  describe('2. Backup Corruption Detection (Scenario 26)', () => {
    it('detects byte-tampering and rejects corrupted backup', async () => {
      const customData = { users: [{ id: 'u1' }] };
      const res = await createBackup({ outDir: tempDir, customData });

      // Tamper with dump file (simulate bit-flip / truncation)
      const content = fs.readFileSync(res.dumpFilePath);
      const corrupted = Buffer.from(content);
      if (corrupted.length > 20) {
        corrupted[20] = (corrupted[20] ?? 0) ^ 0xff; // Flip bits
      }
      fs.writeFileSync(res.dumpFilePath, corrupted);

      const verification = await verifyBackup(res.dumpFilePath);
      expect(verification.isValid).toBe(false);
      expect(verification.checksumMatches).toBe(false);
      expect(verification.errors.some((e: string) => e.includes('Checksum mismatch'))).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Isolated Restore Drill & Safety Guards (Scenario 27 & 28)
  // ----------------------------------------------------------------------------
  describe('3. Isolated Restore Drill & Safety Guards', () => {
    it('refuses to restore into primary database without explicit override (Safety Guard)', async () => {
      const res = await createBackup({ outDir: tempDir, customData: { users: [] } });
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/localsaathi_prod?schema=public';

      await expect(
        restoreBackup({
          backupPath: res.dumpFilePath,
          targetDatabaseUrl: process.env.DATABASE_URL,
          allowDestructivePrimaryOverwrite: false,
        }),
      ).rejects.toThrow(/CRITICAL_SAFETY_BLOCK/);
    });

    it('completes isolated restoration drill and validates record count match', async () => {
      const customData = {
        users: [{ id: 'u1' }, { id: 'u2' }],
        jobs: [{ id: 'j1' }],
      };
      const res = await createBackup({ outDir: tempDir, customData });

      const targetStore: Record<string, any[]> = {};
      const restoreResult = await restoreBackup({
        backupPath: res.dumpFilePath,
        targetDatabaseUrl: 'postgresql://localhost:5432/localsaathi_isolated_drill',
        targetStore,
      });

      expect(restoreResult.status).toBe('COMPLETED');
      expect(restoreResult.integrityCheckPassed).toBe(true);
      expect(restoreResult.recordsRestored.users).toBe(2);
      expect(restoreResult.recordsRestored.jobs).toBe(1);
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Data Integrity & Financial Consistency Checks
  // ----------------------------------------------------------------------------
  describe('4. Data Integrity & Financial Consistency Checks', () => {
    it('detects orphan records and foreign key violations', () => {
      const corruptedDataset = {
        users: [{ id: 'u1' }],
        workerProfiles: [
          { id: 'wp1', userId: 'u1' },
          { id: 'wp2', userId: 'u_non_existent' }, // Orphan
        ],
        jobs: [{ id: 'j1', employerId: 'u_missing_employer' }], // Orphan
      };

      const report = runIntegrityAudit(corruptedDataset);
      expect(report.overallStatus).toBe('FAIL');
      expect(report.domainChecks.foreignKeysValid).toBe(false);
      expect(report.domainChecks.orphanRecordsDetected).toBe(2);
      expect(report.anomalies.some((a: any) => a.code === 'ORPHAN_WORKER_PROFILE')).toBe(true);
      expect(report.anomalies.some((a: any) => a.code === 'ORPHAN_JOB_EMPLOYER')).toBe(true);
    });

    it('detects negative payment amount and excessive refunds', () => {
      const financialDataset = {
        users: [{ id: 'u1' }],
        payments: [
          { id: 'pay1', amount: 500, idempotencyKey: 'idem_1', status: 'CAPTURED' },
          { id: 'pay2', amount: -100, idempotencyKey: 'idem_2', status: 'CAPTURED' }, // Negative!
        ],
        refunds: [
          { id: 'ref1', paymentId: 'pay1', amount: 600 }, // 600 > 500!
        ],
      };

      const report = runIntegrityAudit(financialDataset);
      expect(report.overallStatus).toBe('FAIL');
      expect(report.domainChecks.financialConsistencyValid).toBe(false);
      expect(report.anomalies.some((a: any) => a.code === 'NEGATIVE_PAYMENT_AMOUNT')).toBe(true);
      expect(report.anomalies.some((a: any) => a.code === 'REFUND_EXCEEDS_PAYMENT')).toBe(true);
    });

    it('flags PENDING_RECONCILIATION payments as WARN for provider check', () => {
      const reconciliationDataset = {
        users: [{ id: 'u1' }],
        payments: [
          { id: 'pay1', amount: 500, idempotencyKey: 'idem_1', status: 'PENDING_RECONCILIATION' },
        ],
      };

      const report = runIntegrityAudit(reconciliationDataset);
      expect(report.overallStatus).toBe('WARN');
      expect(report.anomalies.some((a: any) => a.code === 'UNCERTAIN_PAYMENT_STATE_FLAGGED')).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // 5. Migration Safety Classification
  // ----------------------------------------------------------------------------
  describe('5. Migration Safety Classification', () => {
    it('classifies additions as SAFE', () => {
      const sql = 'CREATE TABLE worker_badges (id UUID PRIMARY KEY, name VARCHAR(50));';
      const analysis = analyzeMigrationSql(sql, 'add_badges');
      expect(analysis.classification).toBe('SAFE');
      expect(analysis.requiresBackup).toBe(false);
    });

    it('classifies DROP TABLE / TRUNCATE as DESTRUCTIVE and requires backup', () => {
      const sql = 'DROP TABLE deprecated_logs;';
      const analysis = analyzeMigrationSql(sql, 'drop_deprecated');
      expect(analysis.classification).toBe('DESTRUCTIVE');
      expect(analysis.requiresBackup).toBe(true);
      expect(analysis.destructiveOperations.length).toBeGreaterThan(0);
    });

    it('classifies ALTER COLUMN TYPE as RISKY', () => {
      const sql = 'ALTER TABLE users ALTER COLUMN phone TYPE VARCHAR(20);';
      const analysis = analyzeMigrationSql(sql, 'alter_phone_type');
      expect(analysis.classification).toBe('RISKY');
      expect(analysis.requiresBackup).toBe(true);
    });
  });
});
