# Phase 27 — PostgreSQL Query Plans & Performance Analysis

**Project:** LocalSaathi  
**Date:** October 12, 2026  
**Auditor:** Principal Database Engineer  
**Audit Standard:** Code-Reviewed vs Empirical Execution Plan Provenance  

---

## 1. Plan Verification Methodology & Status Classification

In accordance with the evidence integrity directive, every query plan in this document is explicitly classified into one of two empirical categories:
1. **HISTORICAL EMPIRICAL RECORD:** Plan was measured and recorded under live PostgreSQL 16.4 + PostGIS 3.4 execution during Phase 18 (October 5, 2026).
2. **CODE-REVIEWED EXPECTATION (UNVERIFIED ON LIVE CLUSTER):** Plan structure is derived from static analysis of Prisma migrations and PostgreSQL query planner semantics, but has NOT been verified via live `EXPLAIN` in Phase 27 due to `LOCAL_DB_PORT_5432_OFFLINE`.

---

## 2. Spatial Job Discovery Query Plans

### Query Text:
```sql
SELECT 
  jp.id AS "jobPostId",
  ST_Distance(
    jl.location,
    ST_SetSRID(ST_MakePoint(80.948, 26.85), 4326)::geography
  ) AS "distanceMeters"
FROM job_locations jl
JOIN job_posts jp ON jp.id = jl.job_post_id
WHERE jp.status = 'PUBLISHED'
  AND jp.deleted_at IS NULL
  AND ST_DWithin(
    jl.location,
    ST_SetSRID(ST_MakePoint(80.948, 26.85), 4326)::geography,
    15000
  )
ORDER BY "distanceMeters" ASC
LIMIT 200;
```

### Empirical Record A: Pre-Optimization Baseline (Historical Record — Phase 18)
- **Status:** Historical live record from Phase 18 (~128 jobs in local Docker PostgreSQL).
- **Execution Latency:** 22.580 ms
- **Buffer Page Hits:** 138 shared hits
- **Plan Structure:**
  ```
  Limit  (cost=18.45..18.50 rows=20 width=48) (actual time=22.450..22.480 rows=18 loops=1)
    ->  Sort  (cost=18.45..18.50 rows=20 width=48) (actual time=22.448..22.465 rows=18 loops=1)
          ->  Nested Loop  (cost=0.15..17.95 rows=20 width=48) (actual time=0.450..21.800 rows=18 loops=1)
                ->  Seq Scan on job_posts jp  (cost=0.00..5.60 rows=58 width=16)
                      Filter: ((deleted_at IS NULL) AND (status = 'PUBLISHED'::"JobStatus"))
                ->  Index Scan using job_locations_job_post_id_key on job_locations jl
  ```

### Empirical Record B: Optimized with `idx_job_posts_active_published` (Historical Record — Phase 18)
- **Status:** Historical live record from Phase 18 (~128 jobs in local Docker PostgreSQL).
- **Execution Latency:** 0.612 ms
- **Buffer Page Hits:** 6 shared hits
- **Plan Structure:**
  ```
  Limit  (cost=8.12..8.14 rows=18 width=48) (actual time=0.582..0.598 rows=18 loops=1)
    ->  Sort  (cost=8.12..8.14 rows=18 width=48) (actual time=0.580..0.590 rows=18 loops=1)
          ->  Nested Loop  (cost=0.28..7.70 rows=18 width=48) (actual time=0.045..0.510 rows=18 loops=1)
                ->  Bitmap Heap Scan on job_locations jl  (using idx_job_locations_location_gist)
                ->  Index Only Scan using idx_job_posts_active_published on job_posts jp
  ```

---

## 3. Worker Application History Listing Query Plan

### Query Text:
```sql
SELECT ja.id, ja.job_post_id, ja.status, ja.applied_at
FROM job_applications ja
WHERE ja.worker_profile_id = $1
ORDER BY ja.applied_at DESC
LIMIT 20 OFFSET 0;
```

### Plan Status in Phase 27:
- **Code-Reviewed Status:** `CODE-REVIEWED`
- **Live Verification Status:** `BLOCKED` (Port 5432 offline).
- **Analysis:**
  - The migration `20261012000000_add_job_applications_worker_applied_at_idx` adds:
    `CREATE INDEX "job_applications_worker_profile_id_applied_at_idx" ON "job_applications" ("worker_profile_id", "applied_at" DESC);`
  - In theory and relational planner design, this index provides a composite path matching the equality filter `worker_profile_id` and order `applied_at DESC`, allowing the planner to avoid an explicit Sort node.
  - **Important Note:** Because PostgreSQL 16 is offline in this environment, this Sort node elimination is **code-reviewed and structurally expected, but NOT empirically proven on live database execution in Phase 27**.

---

## 4. Conversation Messages Monotonic Keyset Pagination

### Query Text:
```sql
SELECT id, conversation_id, sender_id, sequence_number, body, created_at
FROM messages
WHERE conversation_id = $1 AND sequence_number < $2
ORDER BY sequence_number ASC
LIMIT 50;
```

### Plan Status in Phase 27:
- **Code-Reviewed Status:** `CODE-REVIEWED`
- **Supported Index:** `messages_conversation_id_sequence_number_idx` on `(conversation_id, sequence_number)`.
- **Expected Node:** Index Scan using `messages_conversation_id_sequence_number_idx`.
- **Live Verification Status:** `BLOCKED` (Port 5432 offline).

---

## 5. Summary of Plan Audit Statuses

| Query | Supporting Index | Code Review Status | Live Plan Verification |
| :--- | :--- | :---: | :---: |
| **Spatial Discovery (~128 jobs)** | `idx_job_locations_location_gist` + `idx_job_posts_active_published` | VERIFIED | Historical record (0.61 ms in Phase 18) |
| **Spatial Discovery (100k jobs)** | Parallel Bitmap Scan on GiST | VERIFIED | Historical record (201.06 ms in Phase 18) |
| **Worker Applications Feed** | `job_applications_worker_profile_id_applied_at_idx` | VERIFIED | BLOCKED (Port 5432 offline) |
| **Messages Keyset Pagination** | `messages_conversation_id_sequence_number_idx` | VERIFIED | BLOCKED (Port 5432 offline) |
| **Unread Notifications Feed** | `notifications_recipient_id_is_read_created_at_idx` | VERIFIED | BLOCKED (Port 5432 offline) |
