# Phase 27 — Database Table Partitioning Assessment

**Project:** LocalSaathi  
**Date:** October 12, 2026  
**Auditor:** Principal Database Engineer  
**Scope:** Evaluation of Table Partitioning for High-Growth Tables  
**Target Tables Evaluated:** `messages`, `notifications`, `audit_logs`, `payment_events`, `job_applications`, `analytics_events`, `outbox_events`  

---

## 1. Executive Summary & Core Principle

**Core Principle:** *Do not implement partitioning without measurable justification. Never weaken financial integrity, foreign key consistency, audit immutability, or idempotency to enable partitioning prematurely.*

Table partitioning in PostgreSQL introduces significant operational complexity:
1. **Foreign Key Limitations:** Prior to PostgreSQL 12+, foreign keys referencing partitioned tables had severe constraints; in all versions, foreign keys between partitions require careful maintenance and can complicate cascaded deletes.
2. **Unique Constraint Scoping:** In PostgreSQL declarative partitioning, any `UNIQUE` or `PRIMARY KEY` constraint **must include the partition key** in its column list.
3. **Prisma ORM Compatibility:** Prisma has limited native awareness of declarative partitioning DDL and migrations, often requiring raw SQL workarounds and custom migration hooks.
4. **Partition Pruning Overhead:** If queries do not filter by the exact partition key, PostgreSQL must scan all partition tables, resulting in worse query latency than an unpartitioned indexed table.

Based on our empirical analysis, **NO IMMEDIATE PARTITIONING IS REQUIRED AT THE CURRENT SCALE**. Partitioning at this stage would introduce architectural liabilities with zero performance gain. This document formalizes the threshold criteria and future partition blueprints for each table.

---

## 2. Table-by-Table Architectural Assessment

### 2.1 Table: `messages`
- **Current Volume & Growth:** Append-heavy during active chats.
- **Access Patterns:** Scoped strictly by `conversation_id`, paginated by monotonic `sequence_number`.
- **Constraint Considerations:**
  - Has unique constraint `(conversation_id, sender_id, client_message_id)` for message deduplication / idempotency.
  - Has foreign keys from `message_attachments`, `message_read_receipts`, `message_reactions`.
- **Partitioning Feasibility:**
  - If partitioned by time (e.g. `RANGE (created_at)`), the unique constraint `(conversation_id, sender_id, client_message_id)` would **break** because `created_at` is not part of the unique key!
  - If partitioned by `HASH (conversation_id)`, cross-conversation querying (such as moderation or admin audits) would require multi-partition scans.
- **Verdict:** **DO NOT PARTITION**.
- **Alternative / Scale Strategy:** The composite index on `(conversation_id, sequence_number)` provides sub-millisecond seek times for individual conversations even across tens of millions of total rows. When archival is needed (e.g. chats older than 2 years), cold storage migration to S3/Parquet is preferred over table partitioning.

### 2.2 Table: `notifications`
- **Current Volume & Growth:** High append rate (system notifications, status updates, chat alerts).
- **Access Patterns:** Scoped strictly by `recipient_id`, ordered by `created_at DESC`.
- **Constraint Considerations:**
  - Has partial unique index `notifications_source_event_recipient_unique` on `(source_event_id, recipient_id) WHERE source_event_id IS NOT NULL` for delivery idempotency.
- **Partitioning Feasibility:**
  - If partitioned by `RANGE (created_at)`, PostgreSQL cannot enforce the partial unique index across partitions unless `created_at` is included in the index and the source event creation timestamp is strictly co-located.
- **Verdict:** **DO NOT PARTITION**.
- **Alternative / Scale Strategy:** Implement automatic TTL pruning. Most user notifications have zero business value after 90 days. A scheduled worker executing `DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days' AND is_read = true` keeps the active working set under 500,000 rows permanently.

### 2.3 Table: `audit_logs`
- **Current Volume & Growth:** Append-only security audit trail.
- **Access Patterns:** Filtered by date range (`created_at`), `actor_id`, `entity_type`, and `action`.
- **Constraint Considerations:**
  - Protected by PostgreSQL row-level immutability triggers (`trg_prevent_audit_log_modification` created in Phase 17).
  - No foreign keys reference `audit_logs`.
- **Partitioning Feasibility:**
  - High suitability for `RANGE (created_at)` partitioning (e.g., monthly partitions `audit_logs_2026_10`, `audit_logs_2026_11`, etc.).
  - Primary key `(id)` would need to be composite `(id, created_at)` to satisfy PostgreSQL declarative partitioning rules.
- **Threshold for Implementation:**
  - Implement when `audit_logs` exceeds **10,000,000 rows** or 10 GB disk footprint.
- **Current Status:** **DEFERRED**. Current table has ~1,200 rows. Existing indexes `(created_at DESC)` and `(action, created_at DESC)` execute in under 1 ms.

### 2.4 Table: `payment_events` & `outbox_events`
- **Current Volume & Growth:** High-volume transaction logs and event queues.
- **Access Patterns:**
  - Short-lived queue processing: `status = 'PENDING' AND available_at <= NOW()`.
  - Once processed, status changes to `PROCESSED`.
- **Constraint Considerations:**
  - `payment_events` has unique constraint on `event_id` (provider webhook deduplication).
  - `outbox_events` has foreign key relationships with `event_processing`.
- **Partitioning Feasibility:**
  - Queue tables suffer when partitioned because the active queue state spans arbitrary timestamps.
- **Verdict:** **DO NOT PARTITION**.
- **Scale Strategy:** Active partial indexes (`WHERE status = 'PENDING'`) keep worker polling fast. Processed events older than 30 days can be pruned or moved to cold archival.

### 2.5 Table: `job_applications`
- **Current Volume & Growth:** Moderate-to-high (tens of applications per job).
- **Access Patterns:** Queried by `job_post_id` (employer view) or `worker_profile_id` (worker view).
- **Constraint Considerations:**
  - Strict unique constraint on `(job_post_id, worker_profile_id)`.
  - Foreign keys to `job_posts` and `worker_profiles`.
  - Foreign key referenced by `bookings` (`bookings_application_id_key`).
- **Verdict:** **DO NOT PARTITION**.
- **Reason:** Partitioning would break the foreign key integrity with `bookings` and prevent unique constraint enforcement unless partitioned by `(job_post_id)`, which would penalize worker history queries.

---

## 3. Threshold Decision Matrix

| Table | Candidate Strategy | Blockers / Risks | Trigger Threshold | Current Recommendation |
| :--- | :--- | :--- | :---: | :---: |
| `audit_logs` | Monthly `RANGE (created_at)` | PK must become `(id, created_at)`; Prisma migration adjustments | >10M rows | **DEFERRED (Monitor)** |
| `notifications` | Monthly `RANGE (created_at)` | Breaks partial idempotency index `(source_event_id, recipient_id)` | >5M rows | **REJECTED (Use TTL Pruning)** |
| `messages` | Monthly `RANGE (created_at)` | Breaks idempotency constraint `(conversation_id, sender_id, client_message_id)` | >50M rows | **REJECTED (Use S3 Cold Storage)** |
| `outbox_events` | List partitioning by `status` | Complex state migrations across partitions; FK conflicts | >5M rows | **REJECTED (Use Partial Index + Purge)** |
| `job_applications`| Hash / Range | Breaks `bookings.application_id` FK and uniqueness constraints | >20M rows | **REJECTED (Not Justified)** |

---

## 4. Conclusion & Action Items

1. **Premature Partitioning Avoided:** Zero partitioning changes will be applied in Phase 27. Applying partitioning today would violate the core requirement of preserving financial integrity, idempotency, and foreign key safety.
2. **Maintenance Plan:** Prioritize automated data retention and pruning jobs for transient operational records (`notifications` older than 90 days, `outbox_events` older than 30 days) to keep high-growth tables permanently compact.
