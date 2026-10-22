# Phase 28 — Search Benchmark Results & Performance Provenance

**Project:** LocalSaathi  
**Date:** October 12, 2026  
**Auditor:** Principal Search Infrastructure Engineer  
**Standard:** Zero Fabrication Rule — Empirical Evidence & Historical Provenance  

---

## 1. Provenance Disclosure

In accordance with strict empirical reporting standards:
1. **No Live Cluster Benchmarks Were Fabricated:**
   - OpenSearch cluster (port `9200`) and PostgreSQL (port `5432`) are currently offline on the local host.
   - Live cluster latencies and query throughput numbers are marked **EXPLICITLY BLOCKED**.
2. **Historical Benchmark Provenance:**
   - The spatial query performance figures referenced in repository reports originate from Phase 18 performance profiling executed on October 5, 2026, using `scripts/benchmark-postgis-scale.js`.

---

## 2. Historical Spatial Discovery Scale Benchmarks (Phase 18)

### Workload Characteristics:
- **Query Type:** PostGIS `ST_DWithin` spatial radius filter + `ST_Distance` distance calculation + relational join on active published jobs (`idx_job_posts_active_published`).
- **Center Coordinate:** Hazratganj, Lucknow (`26.85° N, 80.948° E`).
- **Search Radius:** 15,000 meters (15 km).
- **Repetitions:** 30 consecutive executions per tier.

### Measured Latency by Dataset Tier:

| Tier Label | Dataset Size | p50 Latency | p95 Latency | p99 Latency | Average Latency | Execution Plan Type |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Baseline Tier** | ~128 Jobs | 0.54 ms | 0.82 ms | 1.15 ms | **0.61 ms** | Bitmap Index Scan on `idx_job_locations_location_gist` |
| **Synthetic 1K Tier** | 1,000 Jobs | 1.82 ms | 2.45 ms | 3.10 ms | **1.94 ms** | Bitmap Index Scan + Nested Loop Join |
| **Synthetic 10K Tier**| 10,000 Jobs | 12.40 ms | 18.20 ms | 24.10 ms | **13.85 ms** | GiST Spatial Scan + Parallel Bitmap Heap Scan |
| **Synthetic 100K Tier**| 100,000 Jobs | 188.50 ms | 245.10 ms | 310.20 ms | **201.06 ms** | Spatial GiST Scan across high-density radius |

> **Analysis & Scaling Limitations:**  
> At 100,000 jobs localized strictly inside a single 15 km urban radius, GiST spatial bounding box filtering returns thousands of dense candidates, requiring significant CPU for distance calculation. Partitioning by city/region (as assessed in Phase 27) will reduce active partition size and maintain sub-20 ms latencies at scale.

---

## 3. Phase 28 Determinism & Scalability Evaluation (Local Test Suite)

### A. Sort Determinism Evaluation
- **Benchmark Shape:** Evaluated sorting of identical items across all 4 sort modes (`distance_asc`, `wage_desc`, `created_desc`, `score_desc`).
- **Result:**
  - Before Phase 28: Identical values relied on JavaScript engine Timsort relative placement, producing shifting order across queries.
  - After Phase 28: Guaranteed invariant ordering via UUID string comparison (`a.id.localeCompare(b.id)`). Zero page boundary overlaps across 100% of test runs.

### B. Candidate Limit Scaling
- **Candidate Ceiling:** Capped at 500 candidates.
- **Memory Consumption:** Predictable bounded array allocation ($\le 500$ objects in V8 heap) regardless of requested page depth.

---

## 4. Live OpenSearch Status

- **Status:** `BLOCKED`
- **Blocker Identifier:** `LOCAL_OPENSEARCH_PORT_9200_OFFLINE`
- **Observation:** `Test-NetConnection -Port 9200` failed (`TcpTestSucceeded: False`).
- **Action Taken:** Authored index schema definitions and reindexing migration tool ready for execution upon cluster initialization.
