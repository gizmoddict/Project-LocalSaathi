# Phase 27 — Reproducible Database Benchmarks & Provenance Audit

**Project:** LocalSaathi  
**Date:** October 12, 2026  
**Auditor:** Principal Database Engineer  
**Audit Standard:** Strict Provenance & Ground-Truth Verification  

---

## 1. Provenance of Historical Benchmarks

In accordance with the evidence integrity directive, this document audits the exact origins, execution environments, query scripts, and measurement provenance of all performance figures referenced in the LocalSaathi database documentation.

### Historical Context & Source Documents:
- Originating Phase: Phase 18 (Performance Engineering & Optimization, conducted October 5, 2026).
- Primary Documentation: [`docs/performance/performance-report.md`](file:///p:/Project%20Localsaathi/docs/performance/performance-report.md) & [`docs/performance/performance-audit-before.md`](file:///p:/Project%20Localsaathi/docs/performance/performance-audit-before.md).
- Benchmark Automation Scripts: [`scripts/benchmark-postgis-scale.js`](file:///p:/Project%20Localsaathi/scripts/benchmark-postgis-scale.js) & [`scripts/run-concurrency-benchmarks.js`](file:///p:/Project%20Localsaathi/scripts/run-concurrency-benchmarks.js).

---

## 2. Provenance Audit: 0.61 ms vs 201.06 ms

### Metric A: 0.61 ms Spatial Join Execution Latency
- **Provenance:** Historical execution record from Phase 18 (October 5, 2026).
- **Execution Environment:** Windows 11 host with Docker Desktop running PostgreSQL 16.4 + PostGIS 3.4 (x86_64 Debian container).
- **Hardware Profile (Documented):** AMD Ryzen 3 5300U (4 cores / 8 threads), 8 GB RAM.
- **Query Text:**
  ```sql
  SELECT jp.id AS "jobPostId",
         ST_Distance(jl.location, ST_SetSRID(ST_MakePoint(80.948, 26.85), 4326)::geography) AS "distanceMeters"
  FROM job_locations jl
  JOIN job_posts jp ON jp.id = jl.job_post_id
  WHERE jp.status = 'PUBLISHED'
    AND jp.deleted_at IS NULL
    AND ST_DWithin(jl.location, ST_SetSRID(ST_MakePoint(80.948, 26.85), 4326)::geography, 15000)
  ORDER BY "distanceMeters" ASC
  LIMIT 200;
  ```
- **Dataset Size at Test Time:** Baseline database containing ~128 jobs, ~635 users.
- **Cache State:** PostgreSQL shared buffers pre-warmed (shared hit = 6).
- **Measurement Method:** Single `EXPLAIN (ANALYZE, BUFFERS)` execution run.
- **Pre-Optimization Comparison:** Evaluated against 22.58 ms (pre-index sequential scan on `job_posts` with 138 buffer hits on the same ~128 job dataset).
- **Current Status in Phase 27:** **HISTORICAL RECORD — NOT FRESHLY EXECUTED** (Local PostgreSQL port 5432 is currently offline on host).

### Metric B: 201.06 ms at 100,000 Synthetic Jobs
- **Provenance:** Historical execution record from Phase 18 benchmark script (`scripts/benchmark-postgis-scale.js`).
- **Execution Environment:** Identical Phase 18 host environment.
- **Query Text:** Identical query text as Metric A.
- **Dataset Size at Test Time:** 100,000 synthetic jobs populated in-memory via `generate_series` within a 15 km bounding box around Lucknow.
- **Cache State:** Buffer cache warmed over 30 repetitions.
- **Run Count & Aggregation:** 30 repetitions; computed arithmetic mean (201.06 ms), p50 (184.17 ms), p95 (320.99 ms), p99 (326.17 ms).
- **Observed Execution Plan:** PostgreSQL engaged parallel query execution (`Gather Merge` with 2 background workers) across GiST Bitmap Heap Scan.
- **Current Status in Phase 27:** **HISTORICAL RECORD — NOT FRESHLY EXECUTED** (Synthetic scaling drill completed in Phase 18; port 5432 currently offline).

---

## 3. Strict Comparison Guardrail

> [!WARNING]
> The **0.61 ms** measurement and the **201.06 ms** measurement CANNOT be directly compared as "before and after" metrics.
> - **0.61 ms** measures latency on a **small baseline table (~128 jobs)**.
> - **201.06 ms** measures latency under an **extreme synthetic density (100,000 jobs within 15 km)**.
>
> Presenting 0.61 ms as the general query speed and 201.06 ms without clear dataset tier qualifications is factually inaccurate. Both numbers reflect specific historical benchmark tiers.

---

## 4. Current Phase 27 Verification Status of Benchmarks

- **Re-Execution Status:** `BLOCKED` due to `LOCAL_DB_PORT_5432_OFFLINE`.
- **Script Integrity:** `scripts/benchmark-postgis-scale.js` and `scripts/run-concurrency-benchmarks.js` are present, intact, and syntax-valid.
- **Integrity Rule:** Neither benchmark is claimed to be freshly executed in Phase 27. All numbers are recorded as historical engineering references from Phase 18.
