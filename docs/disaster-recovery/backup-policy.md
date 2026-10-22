# LocalSaathi — Backup & Retention Policy

## 1. Backup Scope & Objectives

The primary objective of the LocalSaathi backup policy is to guarantee durability and recoverability for all business-critical transactional data with minimal data loss (RPO) and operational downtime (RTO).

### Target Service Level Objectives (SLOs)
* **Target Recovery Point Objective (RPO):**
  * Critical Financial Data (`payments`, `refunds`, `bookings`): $\le 1$ hour.
  * Core Business Domain (`users`, `jobs`, `applications`): $\le 1$ hour.
  * Non-critical telemetry / transient events: $\le 24$ hours.
* **Target Recovery Time Objective (RTO):**
  * Isolated database restoration: $\le 30$ minutes.
  * Full cluster failover & reconciliation: $\le 2$ hours.

> **Discipline Note:** Target RPO and RTO represent operational architecture goals under production infrastructure. Timings documented in local verification scripts represent simulated test drills and do not constitute cloud SLA guarantees.

---

## 2. Backup Schedule & Frequencies

| Backup Type | Frequency | Execution Window | Retention Window | Storage Tier | Encryption |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Continuous WAL Archiving** | Continuous (streaming) | Real-time | 7 days | Primary DR Bucket (S3/GCS) | Server-side AES-256 |
| **Daily Full Logical Backup** | Daily (02:00 UTC) | Off-peak | 30 days | Secondary Encrypted Bucket | AES-256-GCM client-side |
| **Weekly Snapshot** | Weekly (Sunday 03:00 UTC) | Off-peak | 90 days | Cold Archive / Glacier | Encrypted |
| **Pre-Migration Safety Backup** | Ad-hoc (Prior to DDL) | Deployment pipeline | 14 days | Hot Storage | AES-256-GCM |

---

## 3. Storage Architecture & Encryption

### 3.1 Dual-Artifact Structure
Every backup execution produces two synchronized artifacts:
1. **The Dump Archive (`.dump.json` or `.dump.enc`):** Contains table row data, table count headers, and database version info.
2. **The Companion Metadata File (`.meta.json`):** Contains:
   * `backupId`: Unique identifier (`bkp_YYYY-MM-DDTHH-mm-ss-SSSZ_hash`).
   * `checksumSha256`: Hex-encoded SHA-256 digest of the raw dump file.
   * `tableCounts`: Record counts per table at backup creation time.
   * `isEncrypted`: Boolean flag.
   * `encryptionAlgorithm`: `AES-256-GCM` (when enabled).
   * `sourceDatabase`: Redacted database name and schema.

### 3.2 Client-Side Encryption
When `BACKUP_ENCRYPTION_KEY` is supplied, backups are encrypted using `AES-256-GCM` with a 12-byte random initialization vector (IV) and a 16-byte authentication tag prepended to the ciphertext. Unencrypted backups are strictly rejected in production environments.

---

## 4. Retention & Pruning Policy

* Backups exceeding `BACKUP_RETENTION_DAYS` (default: 30 days) are pruned by `npm run db:backup:cleanup`.
* **Permanent Latest Backup Protection:** The cleanup algorithm enforces an inviolable rule: **at least one valid verified backup is permanently retained**, preventing accidental deletion of the entire backup history even if all backups exceed the expiration threshold.
* Expired backups are safely purged only after verifying that younger valid backups exist and have passed verification checks.
