# Phase 28 — Search Infrastructure Architecture

**Project:** LocalSaathi  
**Date:** October 12, 2026  
**Author:** Principal Search Infrastructure Engineer  
**Status:** Active  

---

## 1. Architectural Overview

LocalSaathi employs a **hybrid, dual-engine search topology** designed specifically for real-time hyperlocal blue-collar gig matching and high-throughput discovery:

```
[ Worker / Employer Web & Mobile Clients ]
                    │
                    ▼
       [ API Gateway / NestJS API ]
         │                       │
         │ (Synchronous Read)    │ (Transactional Outbox)
         ▼                       ▼
┌──────────────────┐    ┌────────────────────────┐
│ PostgreSQL 16    │    │ Transactional Outbox   │
│ + PostGIS 3.4    │    │ Domain Events (Events) │
│ Spatial GiST     │    └───────────┬────────────┘
│ Distance Ranking │                │
└──────────────────┘                ▼
                        [ Redis BullMQ Worker ]
                        (SEARCH_INDEXING Queue)
                                    │
                                    │ (Asynchronous REST Sync)
                                    ▼
                        ┌────────────────────────┐
                        │ OpenSearch 2.18        │
                        │ Full-Text & Autocomplete│
                        │ Edge-Ngram Analyzers   │
                        └────────────────────────┘
```

---

## 2. Query Paths and Workload Specialization

### A. Primary Hyperlocal Discovery (PostgreSQL / PostGIS)
- **Path:** `MatchingService.discoverJobsForWorker()` (`GET /api/v1/workers/me/jobs`) & `getNearbyJobsForWorker()` (`GET /api/v1/workers/me/jobs/nearby`).
- **Core Engine:** PostGIS geography point indexing (`USING GIST (location)`).
- **Function:** Real-time spatial candidate filtering via `ST_DWithin()` combined with exact distance calculation via `ST_Distance()`.
- **Ranking Engine:** Two-phase retrieval:
  1. Spatial candidate extraction (bounded candidate pool between 200 and 500 rows).
  2. In-memory deterministic scoring evaluating geographic decay, skill coverage, minimum experience prerequisites, date/time availability overlap, and wage comparison.

### B. Catalog Full-Text & Autocomplete (OpenSearch)
- **Path:** Queue-driven asynchronous document indexer (`QueueName.SEARCH_INDEXING`).
- **Target Indices:** `localsaathi-jobs-v1` (aliased to `localsaathi-jobs`) and `localsaathi-workers-v1` (aliased to `localsaathi-workers`).
- **Analyzers:** Custom edge-ngram analyzer (min 2, max 15) for partial-word matching on multilingual titles, localities, and trade names.

---

## 3. Correctness & Security Invariants

### A. Deterministic Sorting & Boundary Preservation
To prevent duplicate and skipped items during pagination traversal, all sorting branches enforce an invariant tie-breaker:
```typescript
evaluatedItems.sort((a, b) => {
  switch (query.sort) {
    case 'distance_asc':
      return a.distanceKm - b.distanceKm || b.match.score - a.match.score || a.id.localeCompare(b.id);
    case 'wage_desc':
      return b.wageAmount - a.wageAmount || b.match.score - a.match.score || a.id.localeCompare(b.id);
    case 'created_desc':
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.id.localeCompare(b.id);
    case 'score_desc':
    default:
      return b.match.score - a.match.score || a.distanceKm - b.distanceKm || a.id.localeCompare(b.id);
  }
});
```

### B. Bounded Candidate Pool
To prevent database memory exhaustion on malicious or deep pagination requests, the candidate window scales dynamically with page requests up to a strict ceiling:
$$\text{requiredCandidates} = \min(\max(200, \text{page} \times \text{limit} + \text{limit}), 500)$$

### C. Location Privacy & Authorization Scoping
1. **Worker Privacy:** Worker GPS coordinates (`latitude`, `longitude`) are strictly internal to the server and PostGIS queries; they are never returned to public API callers.
2. **Employer Privacy:** Employer location is projected only at locality/city granularity; sensitive contact numbers, personal identification, and employer user IDs are omitted from public discovery cards.
3. **Status Isolation:** Only `jp.status = 'PUBLISHED'` and `jp.deleted_at IS NULL` records are eligible for worker discovery.

### D. Version-Aware Idempotent Outbox Synchronization
- Indexing operations are serialized via Redis version tracking: `local_saathi:v1:search:version:${entityType}:${entityId}`.
- Any event arriving with `version < currentVersion` is rejected as a stale out-of-order write.
