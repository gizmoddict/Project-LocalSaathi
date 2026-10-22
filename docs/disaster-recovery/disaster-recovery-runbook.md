# LocalSaathi — Disaster Recovery Operational Runbook

## 1. Incident Classification & Severity

| Severity | Definition | Action Required | Response Time |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Primary PostgreSQL database corruption, complete data loss, unbootable database cluster, or catastrophic ransomware event. | Execute Full DR Restoration Procedure. Notify Incident Commander. | Immediate (< 15 mins) |
| **SEV-2 (High)** | Redis cache cluster failure, BullMQ queue partition, or search index corruption with intact PostgreSQL. | Execute Rebuildable Infrastructure Procedures. PostgreSQL untouched. | < 30 mins |
| **SEV-3 (Medium)** | Financial reconciliation discrepancy (e.g., gateway webhook failure) or outbox processor stall. | Execute Integrity Audit & Reconciliation Workflow. | < 2 hours |

---

## 2. Emergency Operational Playbook: Complete Database Restoration (SEV-1)

### Step 1: Isolate & Protect
1. Stop all web traffic ingress or route ingress traffic to the Maintenance Page:
   ```bash
   # Enable maintenance mode header on edge proxy or stop API pods
   kubectl scale deployment localsaathi-api --replicas=0
   kubectl scale deployment localsaathi-worker --replicas=0
   ```
2. Capture the current broken database state for forensics (if possible):
   ```bash
   # Take raw disk snapshot or forensic dump if PostgreSQL instance is accessible
   ```

### Step 2: Identify and Verify the Latest Valid Backup
1. List available backups:
   ```bash
   npm run db:backup:list
   ```
2. Verify the selected backup file integrity:
   ```bash
   npm run db:backup:verify -- /path/to/backup.dump.json
   # If encrypted:
   BACKUP_ENCRYPTION_KEY="<secret>" npm run db:backup:verify -- /path/to/backup.dump.enc
   ```
   * **Verification Criteria:** Checksum matches SHA-256 companion metadata; table count matches expected count; zero parsing errors.

### Step 3: Execute Restoration into Isolated Database (Dry Run / Drill)
1. Point to an isolated staging or forensic database instance:
   ```bash
   ISOLATED_RESTORE_DB_URL="postgresql://postgres:postgres@isolated-db:5432/localsaathi_restore?schema=public" \
   npm run db:restore -- /path/to/backup.dump.json
   ```
2. Verify table record counts between backup metadata and restored instance.

### Step 4: Promote Restored Database to Primary
1. Update database connection strings in application configuration or promote the restored instance in cloud RDS / patroni cluster.
2. If restoring into primary container directly with full operator consent:
   ```bash
   # DANGER: Only execute after verified isolated restore and incident commander sign-off
   node scripts/dr/restore.js /path/to/backup.dump.json --allow-destructive-primary-overwrite
   ```

### Step 5: Execute Data & Financial Integrity Audit
1. Run database integrity audit:
   ```bash
   npm run db:integrity
   ```
2. Inspect output for:
   * Foreign key orphan records (workers, employers, jobs, bookings).
   * Negative payment amounts.
   * Total refunds exceeding original capture amounts.
   * In-flight payments marked `PENDING_RECONCILIATION`.

### Step 6: Financial Reconciliation
1. Run automated reconciliation script with payment gateway:
   ```bash
   npm run db:reconcile:payments
   ```
2. Review any payments remaining in `PENDING_RECONCILIATION`. Verify status directly on the Razorpay/Stripe dashboard.
   > **Note:** Never automatically alter payment state to force check completion without provider confirmation.

### Step 7: Rebuild Non-Authoritative Subsystems
1. Flush stale Redis cache:
   ```bash
   redis-cli -u $REDIS_URL FLUSHALL
   ```
2. Warm primary reference caches:
   ```bash
   node scripts/cache/warm-critical-keys.js
   ```
3. Re-index search engine from PostgreSQL source of truth:
   ```bash
   node scripts/search/reindex-all.js
   ```
4. Reset and reclaim stalled Outbox events:
   ```bash
   # Mark stalled PROCESSING events back to PENDING
   psql $DATABASE_URL -c "UPDATE outbox_events SET status = 'PENDING', locked_at = NULL WHERE status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '5 minutes';"
   ```

### Step 8: Resume Normal Operations
1. Restart workers and web applications:
   ```bash
   kubectl scale deployment localsaathi-api --replicas=3
   kubectl scale deployment localsaathi-worker --replicas=2
   ```
2. Verify system health and DR endpoints:
   ```bash
   curl -s http://localhost:4000/api/v1/health
   curl -s http://localhost:4000/api/v1/health/disaster-recovery
   ```
3. Re-enable client traffic and monitor Phase 21 telemetry for 60 minutes.

---

## 3. Routine Maintenance & Backup Pruning

Execute weekly backup retention pruning to maintain compliance with retention policy while guaranteeing the latest backup is protected:
```bash
npm run db:backup:cleanup
```
