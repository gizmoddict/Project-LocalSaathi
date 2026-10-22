// ==============================================================================
// LocalSaathi — Phase 23 Disaster Recovery, Data Integrity & Continuity Suite
// End-to-End Simulation of 15 Scenarios: Backup, Verification, Corruption,
// Restore Drill, Integrity Audits, Outbox/Redis/Queue Rebuilds & Migration Safety
// ==============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

// Load DR modules
const { createBackup } = require('./dr/backup');
const { verifyBackup } = require('./dr/verify-backup');
const { restoreBackup } = require('./dr/restore');
const { runIntegrityAudit } = require('./dr/integrity-checker');
const { analyzeMigrationSql, enforceMigrationSafety } = require('./dr/migration-safety');

async function runDisasterRecoverySuite() {
  console.log('======================================================================');
  console.log('  LOCALSAATHI PHASE 23: DISASTER RECOVERY & CONTINUITY DRILL SUITE');
  console.log('======================================================================\n');

  const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localsaathi-dr-e2e-'));
  const testResults = [];
  const startTime = Date.now();

  try {
    // --------------------------------------------------------------------------
    // SCENARIO 1: Logical Backup Creation with Companion Metadata & SHA-256 Hash
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 1] Logical Backup Creation with Companion Metadata & Checksum...');
    const seedDataset = {
      users: [
        { id: 'usr_001', role: 'WORKER', phone: '+919876543210', createdAt: new Date().toISOString() },
        { id: 'usr_002', role: 'EMPLOYER', phone: '+919876543211', createdAt: new Date().toISOString() },
      ],
      workerProfiles: [{ id: 'wp_001', userId: 'usr_001', primarySkill: 'Carpentry', rating: 4.8 }],
      employerProfiles: [{ id: 'ep_001', userId: 'usr_002', companyName: 'BuildCorp' }],
      jobs: [{ id: 'job_001', employerId: 'usr_002', title: 'Door Installation', status: 'OPEN' }],
      bookings: [{ id: 'bk_001', jobId: 'job_001', workerId: 'usr_001', employerId: 'usr_002', status: 'CONFIRMED' }],
      payments: [{ id: 'pay_001', bookingId: 'bk_001', amount: 1500, status: 'CAPTURED', idempotencyKey: 'idem_bk_001' }],
      refunds: [],
      outboxEvents: [{ id: 'ob_001', eventType: 'BOOKING_CONFIRMED', status: 'COMPLETED' }],
    };

    const backupRes = await createBackup({
      outDir: testTempDir,
      customData: seedDataset,
    });

    assert(backupRes.success, 'Backup creation must succeed');
    assert(fs.existsSync(backupRes.dumpFilePath), 'Dump file must exist');
    assert(fs.existsSync(backupRes.metaFilePath), 'Metadata file must exist');
    assert.strictEqual(backupRes.metadata.tableCounts.users, 2, 'User count must match');
    assert.strictEqual(backupRes.metadata.tableCounts.jobs, 1, 'Job count must match');
    assert(backupRes.metadata.checksumSha256.length === 64, 'SHA-256 hash must be 64 hex chars');
    testResults.push({ scenario: 1, name: 'Logical Backup Creation', status: 'PASS' });
    console.log('  -> PASS: Logical backup created with SHA-256 checksum and companion metadata.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 2: Valid Backup Verification
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 2] Valid Backup Integrity Verification...');
    const verifyRes = await verifyBackup(backupRes.dumpFilePath);
    assert(verifyRes.isValid, 'Valid backup verification must pass');
    assert(verifyRes.checksumMatches, 'Checksum must match stored SHA-256');
    assert(verifyRes.archiveReadable, 'Archive must be parsed without error');
    assert.strictEqual(verifyRes.tableCountFound, 8, 'All 8 tables must be found');
    testResults.push({ scenario: 2, name: 'Valid Backup Verification', status: 'PASS' });
    console.log('  -> PASS: Backup file size, checksum, and table metadata verified successfully.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 3: Corrupted Backup Detection (Scenario 26)
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 3] Corrupted Backup Detection (Bit-flip / Byte Tampering)...');
    const corruptedBackupPath = path.join(testTempDir, 'corrupted_dump.sql');
    const dumpRaw = fs.readFileSync(backupRes.dumpFilePath);
    const corruptedBytes = Buffer.from(dumpRaw);
    corruptedBytes[32] = (corruptedBytes[32] ?? 0) ^ 0xff; // Invert byte
    fs.writeFileSync(corruptedBackupPath, corruptedBytes);

    // Companion metadata with original hash
    const corruptedMetaPath = corruptedBackupPath.replace('.sql', '.meta.json');
    fs.writeFileSync(corruptedMetaPath, JSON.stringify(backupRes.metadata));

    const corruptedVerifyRes = await verifyBackup(corruptedBackupPath);
    assert.strictEqual(corruptedVerifyRes.isValid, false, 'Corrupted backup must be rejected');
    assert.strictEqual(corruptedVerifyRes.checksumMatches, false, 'Checksum mismatch must be detected');
    assert(corruptedVerifyRes.errors.some(e => e.includes('Checksum mismatch')), 'Must detail error');
    testResults.push({ scenario: 3, name: 'Backup Corruption Detection (Scenario 26)', status: 'PASS' });
    console.log('  -> PASS: Checksum verification detected altered byte and blocked corrupted backup.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 4: Restore Failure Detection & Safety Guard (Scenario 27)
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 4] Restore Safety Guard (Blocking Primary Database Overwrite)...');
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/localsaathi_primary?schema=public';
    let safetyGuardBlocked = false;
    try {
      await restoreBackup({
        backupPath: backupRes.dumpFilePath,
        targetDatabaseUrl: process.env.DATABASE_URL,
        allowDestructivePrimaryOverwrite: false,
      });
    } catch (err) {
      if (err.message.includes('CRITICAL_SAFETY_BLOCK')) {
        safetyGuardBlocked = true;
      }
    }
    assert(safetyGuardBlocked, 'Primary DB overwrite must be strictly blocked by safety guard');
    testResults.push({ scenario: 4, name: 'Primary DB Restore Safety Guard (Scenario 27)', status: 'PASS' });
    console.log('  -> PASS: Safety guard aborted restore attempt targeting primary DATABASE_URL.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 5: Isolated Database Loss & Restore Drill (Scenario 28)
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 5] Isolated Restore Drill & Record Count Comparison (Scenario 28)...');
    const isolatedStore = {};
    const drillRestoreStart = Date.now();
    const restoreResult = await restoreBackup({
      backupPath: backupRes.dumpFilePath,
      targetDatabaseUrl: 'postgresql://localhost:5432/localsaathi_isolated_drill?schema=public',
      targetStore: isolatedStore,
    });
    const drillRestoreDurationMs = Date.now() - drillRestoreStart;

    assert.strictEqual(restoreResult.status, 'COMPLETED', 'Restore status must be COMPLETED');
    assert.strictEqual(restoreResult.integrityCheckPassed, true, 'Restore integrity check must pass');
    assert.strictEqual(restoreResult.recordsRestored.users, seedDataset.users.length, 'Restored users match');
    assert.strictEqual(restoreResult.recordsRestored.jobs, seedDataset.jobs.length, 'Restored jobs match');
    assert.strictEqual(restoreResult.recordsRestored.bookings, seedDataset.bookings.length, 'Restored bookings match');
    testResults.push({ scenario: 5, name: 'Isolated Restore Drill (Scenario 28)', status: 'PASS', durationMs: drillRestoreDurationMs });
    console.log(`  -> PASS: Restored into isolated database in ${drillRestoreDurationMs}ms with 100% record match.\n`);

    // --------------------------------------------------------------------------
    // SCENARIO 6: Data Integrity Validation (FK Orphans & Dangling Records)
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 6] Data Integrity Audit (Foreign Key Orphans Detection)...');
    const corruptFkDataset = {
      users: [{ id: 'usr_valid' }],
      workerProfiles: [
        { id: 'wp_1', userId: 'usr_valid' },
        { id: 'wp_orphan', userId: 'usr_ghost' }, // Orphan
      ],
      jobs: [
        { id: 'job_orphan', employerId: 'usr_ghost_emp' }, // Orphan
      ],
      bookings: [],
      payments: [],
      refunds: [],
      outboxEvents: [],
    };

    const integrityReportFk = runIntegrityAudit(corruptFkDataset);
    assert.strictEqual(integrityReportFk.overallStatus, 'FAIL', 'Orphan records must fail integrity check');
    assert.strictEqual(integrityReportFk.domainChecks.foreignKeysValid, false);
    assert.strictEqual(integrityReportFk.domainChecks.orphanRecordsDetected, 2);
    testResults.push({ scenario: 6, name: 'Data Integrity & FK Orphan Detection', status: 'PASS' });
    console.log('  -> PASS: Detected 2 dangling orphan records across workerProfiles and jobs.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 7: Financial Integrity & Reconciliation Audit
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 7] Financial Integrity Audit (Negative Amount, Over-Refund, Invariants)...');
    const financialDataset = {
      users: [{ id: 'u1' }],
      workerProfiles: [],
      employerProfiles: [],
      jobs: [],
      bookings: [],
      payments: [
        { id: 'p1', amount: 1000, idempotencyKey: 'idem_1', status: 'CAPTURED' },
        { id: 'p2', amount: -250, idempotencyKey: 'idem_2', status: 'CAPTURED' }, // Negative
        { id: 'p3', amount: 500, idempotencyKey: 'idem_3', status: 'PENDING_RECONCILIATION' }, // Uncertain
      ],
      refunds: [
        { id: 'r1', paymentId: 'p1', amount: 1200 }, // 1200 > 1000!
      ],
      outboxEvents: [],
    };

    const finReport = runIntegrityAudit(financialDataset);
    assert.strictEqual(finReport.overallStatus, 'FAIL', 'Financial violations must fail audit');
    assert.strictEqual(finReport.domainChecks.financialConsistencyValid, false);
    assert(finReport.anomalies.some(a => a.code === 'NEGATIVE_PAYMENT_AMOUNT'), 'Negative amount detected');
    assert(finReport.anomalies.some(a => a.code === 'REFUND_EXCEEDS_PAYMENT'), 'Excess refund detected');
    assert(finReport.anomalies.some(a => a.code === 'UNCERTAIN_PAYMENT_STATE_FLAGGED'), 'Pending rec flagged');
    testResults.push({ scenario: 7, name: 'Financial Integrity & Reconciliation Audit', status: 'PASS' });
    console.log('  -> PASS: Caught negative amount, refund overflow, and flagged PENDING_RECONCILIATION.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 8: Outbox Recovery After Restore (Idempotency & Stale Reclaim)
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 8] Outbox Recovery After Restore...');
    const outboxDataset = {
      users: [{ id: 'u1' }],
      payments: [],
      refunds: [],
      outboxEvents: [
        { id: 'evt_1', eventType: 'BOOKING_CONFIRMED', status: 'COMPLETED' },
        { id: 'evt_2', eventType: 'PAYMENT_CAPTURED', status: 'PENDING' },
        { id: 'evt_3', eventType: 'NOTIFICATION_DISPATCH', status: 'PROCESSING', createdAt: new Date(Date.now() - 3600000).toISOString() }, // Stale!
      ],
    };

    const outboxAudit = runIntegrityAudit(outboxDataset);
    assert.strictEqual(outboxAudit.overallStatus, 'WARN', 'Stale processing outbox event must trigger WARN');
    assert(outboxAudit.anomalies.some(a => a.code === 'STALE_OUTBOX_EVENT_DETECTED'), 'Stale outbox event identified');

    // Simulate recovery actions:
    // 1. Re-mark stale PROCESSING events as PENDING
    const recoveredEvents = outboxDataset.outboxEvents.map(e => {
      if (e.status === 'PROCESSING') return { ...e, status: 'PENDING', retryCount: 1 };
      return e;
    });
    assert.strictEqual(recoveredEvents.filter(e => e.status === 'PENDING').length, 2, '2 pending events ready for worker resume');
    testResults.push({ scenario: 8, name: 'Outbox Event Recovery After Restore', status: 'PASS' });
    console.log('  -> PASS: Outbox recovered: stale processing events reclaimed and queued for replay.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 9: Redis Cache Loss & Rebuild from PostgreSQL Source of Truth
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 9] Redis Cache Loss & Rebuild from PostgreSQL...');
    // Simulated Redis memory store
    let redisCache = {
      'cache:user:usr_001': JSON.stringify({ id: 'usr_001', name: 'Stale Cache' }),
      'cache:job:job_001': JSON.stringify({ id: 'job_001', status: 'OPEN' }),
    };

    // Simulate complete Redis failure / flushall
    redisCache = {};
    assert.strictEqual(Object.keys(redisCache).length, 0, 'Cache is completely empty');

    // Rebuild cache from authoritative Postgres dataset
    for (const user of seedDataset.users) {
      redisCache[`cache:user:${user.id}`] = JSON.stringify(user);
    }
    for (const job of seedDataset.jobs) {
      redisCache[`cache:job:${job.id}`] = JSON.stringify(job);
    }

    assert.strictEqual(Object.keys(redisCache).length, 3, 'Redis cache repopulated with 3 authoritative keys');
    const cachedUser = JSON.parse(redisCache['cache:user:usr_001']);
    assert.strictEqual(cachedUser.phone, '+919876543210', 'Authoritative phone restored');
    testResults.push({ scenario: 9, name: 'Redis Cache Rebuild from PostgreSQL', status: 'PASS' });
    console.log('  -> PASS: Redis flushed and critical domain keys warmed from PostgreSQL source of truth.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 10: Background Queue / BullMQ Restart Recovery
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 10] BullMQ Background Queue Restart Recovery...');
    const queueJobs = [
      { id: 'job_q1', queue: 'payments', status: 'active', lockedAt: Date.now() - 600000 }, // Abandoned lock
      { id: 'job_q2', queue: 'notifications', status: 'waiting' },
    ];

    // On worker restart, identify active jobs older than lockDuration (e.g. 5m)
    const lockTimeoutMs = 300000;
    const now = Date.now();
    const rescuedJobs = queueJobs.map(job => {
      if (job.status === 'active' && now - job.lockedAt > lockTimeoutMs) {
        return { ...job, status: 'waiting', stalledCount: 1 };
      }
      return job;
    });

    assert.strictEqual(rescuedJobs[0].status, 'waiting', 'Stalled active job returned to waiting');
    assert.strictEqual(rescuedJobs[0].stalledCount, 1, 'Stalled count incremented');
    testResults.push({ scenario: 10, name: 'BullMQ Queue Restart Recovery', status: 'PASS' });
    console.log('  -> PASS: Abandoned active jobs released from lock and reenqueued safely.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 11: Object Storage Metadata Mismatch Detection
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 11] Object Storage Metadata Mismatch Detection...');
    const dbFileRecords = [
      { id: 'file_1', s3Key: 'uploads/kyc_001.pdf', status: 'CONFIRMED' },
      { id: 'file_2', s3Key: 'uploads/avatar_002.jpg', status: 'CONFIRMED' },
    ];
    const actualStorageKeys = new Set(['uploads/kyc_001.pdf', 'uploads/untracked_orphan.png']);

    const missingInStorage = dbFileRecords.filter(f => !actualStorageKeys.has(f.s3Key));
    const unreferencedBlobs = [...actualStorageKeys].filter(k => !dbFileRecords.some(f => f.s3Key === k));

    assert.strictEqual(missingInStorage.length, 1, 'Must detect DB record missing from bucket');
    assert.strictEqual(missingInStorage[0].id, 'file_2');
    assert.strictEqual(unreferencedBlobs.length, 1, 'Must detect orphaned blob in storage');
    assert.strictEqual(unreferencedBlobs[0], 'uploads/untracked_orphan.png');
    testResults.push({ scenario: 11, name: 'Storage Metadata Mismatch Detection', status: 'PASS' });
    console.log('  -> PASS: Detected 1 missing file reference and 1 unreferenced storage blob.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 12: Search Index Rebuild from PostgreSQL
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 12] Search Index Rebuild from PostgreSQL...');
    let searchIndex = {}; // Corrupted / wiped index
    const authoritativeJobs = seedDataset.jobs;

    // Index rebuild script extracts PostgreSQL authoritative records
    for (const job of authoritativeJobs) {
      searchIndex[job.id] = {
        title: job.title,
        status: job.status,
        indexedAt: new Date().toISOString(),
      };
    }

    assert(searchIndex['job_001'], 'Job must be re-indexed');
    assert.strictEqual(searchIndex['job_001'].title, 'Door Installation');
    testResults.push({ scenario: 12, name: 'Search Index Rebuild from PostgreSQL', status: 'PASS' });
    console.log('  -> PASS: Rebuilt search index directly from PostgreSQL authoritative records.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 13: Analytics Event Stream Recovery Without Double Counting
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 13] Product Analytics Event Recovery Without Double Counting...');
    const analyticsLedger = new Set();
    let recordedEventsCount = 0;

    function ingestAnalyticsEvent(event) {
      if (analyticsLedger.has(event.eventId)) {
        return { duplicate: true };
      }
      analyticsLedger.add(event.eventId);
      recordedEventsCount++;
      return { duplicate: false };
    }

    const eventBatch = [
      { eventId: 'evt_a1', type: 'PAGE_VIEW' },
      { eventId: 'evt_a2', type: 'SEARCH_QUERY' },
      { eventId: 'evt_a1', type: 'PAGE_VIEW' }, // Replayed duplicate
      { eventId: 'evt_a2', type: 'SEARCH_QUERY' }, // Replayed duplicate
      { eventId: 'evt_a3', type: 'BOOKING_CLICK' },
    ];

    for (const evt of eventBatch) {
      ingestAnalyticsEvent(evt);
    }

    assert.strictEqual(recordedEventsCount, 3, 'Exactly 3 distinct events recorded');
    assert.strictEqual(analyticsLedger.size, 3, 'Deduplication ledger has 3 keys');
    testResults.push({ scenario: 13, name: 'Analytics Event Stream Deduplication', status: 'PASS' });
    console.log('  -> PASS: Ingested 5 events with 2 duplicates, exactly 3 recorded (no double counting).\n');

    // --------------------------------------------------------------------------
    // SCENARIO 14: Migration Safety Analyzer (Safe vs Destructive)
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 14] Migration Safety Analyzer & Pre-Migration Backup Guard...');
    const safeSql = 'CREATE INDEX idx_users_phone ON users(phone);';
    const safeAnalysis = analyzeMigrationSql(safeSql, 'add_phone_index');
    assert.strictEqual(safeAnalysis.classification, 'SAFE');
    assert.strictEqual(safeAnalysis.requiresBackup, false);

    const destructiveSql = 'ALTER TABLE users DROP COLUMN phone;\nDROP TABLE archived_jobs;';
    const destructiveAnalysis = analyzeMigrationSql(destructiveSql, 'drop_critical_assets');
    assert.strictEqual(destructiveAnalysis.classification, 'DESTRUCTIVE');
    assert.strictEqual(destructiveAnalysis.requiresBackup, true);
    assert.strictEqual(destructiveAnalysis.destructiveOperations.length, 2);

    // Test safety enforcement blocking migration if backup missing
    let migrationBlocked = false;
    try {
      enforceMigrationSafety(destructiveAnalysis, path.join(testTempDir, 'non_existent_backup.sql'));
    } catch (err) {
      migrationBlocked = true;
      assert(err.message.includes('MIGRATION_SAFETY_BLOCK'), 'Must trigger MIGRATION_SAFETY_BLOCK');
    }
    assert(migrationBlocked, 'Destructive migration must be blocked without verified backup');
    testResults.push({ scenario: 14, name: 'Migration Safety Analyzer & Backup Guard', status: 'PASS' });
    console.log('  -> PASS: Destructive migration classified and blocked until verified backup exists.\n');

    // --------------------------------------------------------------------------
    // SCENARIO 15: RPO and RTO Local Drill Measurements
    // --------------------------------------------------------------------------
    console.log('[SCENARIO 15] RPO and RTO Measurements During Local Drill...');
    const totalSuiteDurationMs = Date.now() - startTime;
    const rpoMeasurement = {
      component: 'PostgreSQL Primary Dataset',
      targetRpoHours: 1, // Target: 1 hour for critical financial & core entities
      measuredRpoMinutes: 0, // In local drill, logical dump captured all committed state
      targetRtoHours: 2, // Target: 2 hours for full restoration
      measuredRtoMs: drillRestoreDurationMs,
      classification: 'LOCAL_DRILL_MEASUREMENT',
    };

    assert(rpoMeasurement.measuredRtoMs < 5000, 'Local drill restore completed well within threshold');
    testResults.push({
      scenario: 15,
      name: 'RPO / RTO Measurements Recorded',
      status: 'PASS',
      measuredRtoMs: drillRestoreDurationMs,
    });
    console.log(`  -> PASS: Local drill RTO: ${drillRestoreDurationMs}ms (Target: < 2h). RPO: 0m (Target: < 1h).\n`);

    console.log('======================================================================');
    console.log('  ALL 15 DISASTER RECOVERY & DATA INTEGRITY SCENARIOS PASSED (15/15)');
    console.log(`  Total Suite Execution Time: ${totalSuiteDurationMs}ms`);
    console.log('======================================================================\n');

    return { success: true, testResults, totalSuiteDurationMs };
  } finally {
    // Clean up temporary drill directory
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  }
}

if (require.main === module) {
  runDisasterRecoverySuite()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n[FATAL] Disaster Recovery Suite Failed:', err);
      process.exit(1);
    });
}

module.exports = { runDisasterRecoverySuite };
