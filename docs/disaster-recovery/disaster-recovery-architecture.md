# LocalSaathi — Phase 23 Disaster Recovery Architecture

## 1. Architectural Overview & Philosophy

Disaster Recovery (DR) and Business Continuity in LocalSaathi are structured around the core principle that:
* **PostgreSQL is the sole durable source of truth** for all authoritative domain, transactional, and relational state.
* **External infrastructure (Redis, BullMQ, OpenSearch, local caches)** is strictly rebuildable and non-authoritative.
* **External Financial Gateways (Razorpay/Stripe)** hold authoritative financial ledger states that must be reconciled against local payment records rather than blindly overwritten.
* **Transactional Outbox** serves as the durable event bridge; events are safely retained in PostgreSQL until verified delivery to message queues or event consumers.

```
+--------------------------------------------------------------------------------------------------+
|                                    PRIMARY DATA INTEGRITY TIER                                   |
|                                                                                                  |
|   +------------------------------------+           +-----------------------------------------+   |
|   |        PostgreSQL Database         |           |       Transactional Outbox Table        |   |
|   |  - Users, Workers, Employers, Jobs |           |  - Durable Domain Event Ledger          |   |
|   |  - Bookings, Applications, Escrow  |           |  - At-Least-Once Delivery Guarantees    |   |
|   |  - Audit Logs, Moderation Records  |           |  - Replayable & Reconstructible         |   |
|   +------------------------------------+           +-----------------------------------------+   |
+--------------------------------------------------------------------------------------------------+
                                  |                                             |
                  Logical / Physical Dumps                      CDC / Outbox Polling
                                  v                                             v
+------------------------------------------------------+     +-------------------------------------+
|              DISASTER RECOVERY PLATFORM              |     |      REBUILDABLE TIERS (NON-AUTH)   |
|                                                      |     |                                     |
|  - Encrypted Backups (AES-256-GCM + SHA-256 Checksum)|     |  - Redis Cache (Wipe & Re-warm)     |
|  - Backup Verification Engine (`db:backup:verify`)   |     |  - BullMQ Queues (Re-enqueue)       |
|  - Safety-Guarded Isolated Restore Drill             |     |  - Search Index (Full DB Reindex)   |
|  - Data & Financial Integrity Auditor (`db:integrity)|     |  - Analytics Event Ledger (Dedupe)  |
|  - Migration Safety Analyzer (`db:migration:safety`) |     +-------------------------------------+
+------------------------------------------------------+
```

---

## 2. Data Classification Taxonomy

Every subsystem and table in LocalSaathi is classified into one of four distinct data tiers:

| Tier | Category | Storage Subsystem | RPO Target | RTO Target | Recovery Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Authoritative (Financial & Security)** | PostgreSQL (`payments`, `refunds`, `users`, `audit_logs`, `bookings`) | $\le 1$ hour (Target) | $\le 2$ hours (Target) | Point-in-time / Logical Dump Restore + External Gateway Reconciliation. |
| **Tier 2** | **Authoritative (Core Domain)** | PostgreSQL (`worker_profiles`, `employer_profiles`, `jobs`, `applications`, `reviews`) | $\le 1$ hour (Target) | $\le 2$ hours (Target) | Logical Dump Restore + Verification Drill. |
| **Tier 3** | **Rebuildable / Non-Authoritative** | Redis, BullMQ, OpenSearch / Bleve | $\le 24$ hours | $\le 30$ minutes | Complete flush and warm restart directly from PostgreSQL state. |
| **Tier 4** | **Reconcilable / Ephemeral** | WebSocket Sessions, In-memory metrics, Provider Webhooks | N/A | $\le 5$ minutes | Re-authenticate, re-subscribe, and sync pending webhooks via idempotency key. |

---

## 3. Disaster Recovery Lifecycle

The LocalSaathi DR lifecycle enforces a strict 8-step unidirectional progression:

```
[1. DETECT] ----> [2. ISOLATE] ----> [3. VERIFY BACKUP] ----> [4. RESTORE (ISOLATED)]
                                                                      |
[8. RESUME] <---- [7. RECOVER] <---- [6. RECONCILE]     <---- [5. VERIFY DATA]
```

1. **DETECT:** Incident identified via Phase 21 telemetry (`health_check_status`, database connectivity alerts, or data corruption anomalies).
2. **ISOLATE:** Cut off ingress API traffic or set application to read-only maintenance mode to prevent writing corrupted transactions.
3. **VERIFY BACKUP:** Execute automated verification (`npm run db:backup:verify`) confirming SHA-256 hash match, archive readability, and table count parity.
4. **RESTORE (ISOLATED):** Restore dump into an isolated target database. Direct overwrite of `DATABASE_URL` is blocked by safety guards unless explicit operational flags are provided.
5. **VERIFY DATA:** Execute structural integrity audits (`npm run db:integrity`) checking foreign key integrity, orphan records, and schema validity.
6. **RECONCILE:** Audit financial invariants against external payment provider APIs (Razorpay / Stripe) to detect in-flight or desynchronized captures. Flag ambiguous records with `PENDING_RECONCILIATION`.
7. **RECOVER REBUILDABLE TIERS:** Flush and rebuild Redis caches, BullMQ jobs, and search indexes from the restored PostgreSQL database.
8. **RESUME NORMAL OPERATIONS:** Re-enable API ingress, verify health endpoints (`/health`, `/health/disaster-recovery`), and resume worker consumers.

---

## 4. Key Architectural Safeguards

### 4.1 Primary Database Overwrite Guard
To prevent accidental operational catastrophe, the restore tool (`scripts/dr/restore.js`) compares `targetDatabaseUrl` against `process.env.DATABASE_URL`. If matching, restoration immediately aborts with `CRITICAL_SAFETY_BLOCK` unless `allowDestructivePrimaryOverwrite: true` is explicitly provided.

### 4.2 Non-Destructive Financial Auditing
Integrity anomalies in financial records are never mutated automatically by scripts. Instead, the auditor marks ambiguous payments with `PENDING_RECONCILIATION` or flags discrepancies (`REFUND_EXCEEDS_PAYMENT`) for manual operator verification.

### 4.3 Migration Safety Pre-Flight
The migration analyzer parses schema changes before execution:
* **SAFE:** Pure additions (`CREATE TABLE`, `ADD COLUMN`, `CREATE INDEX`).
* **RISKY:** Column alterations (`ALTER COLUMN TYPE`, `RENAME`).
* **DESTRUCTIVE:** Deletions (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`).
Destructive migrations are strictly blocked unless a verified backup exists in storage.
