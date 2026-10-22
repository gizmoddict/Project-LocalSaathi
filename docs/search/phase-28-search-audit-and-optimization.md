# Phase 28 — Search Scalability Audit & Optimization Report

**Project:** LocalSaathi  
**Date:** October 12, 2026  
**Auditor:** Principal Search Infrastructure Engineer  
**Standard:** Production-Grade Architecture, Zero Fabrication Rule  
**Verdict:** `PARTIALLY VERIFIED / BLOCKED`  

---

## 1. Executive Summary

This audit evaluated LocalSaathi's search infrastructure across spatial matching, text filtering, pagination stability, indexing pipelines, and service dependencies.

Targeted optimizations were implemented across the API, validation, types, and worker packages:
1. **Deterministic Pagination Tie-Breaking:** Fixed non-deterministic sorting across equal values by appending an invariant UUID tie-breaker (`a.id.localeCompare(b.id)`).
2. **Keyword Text Search Integration:** Added optional `query` parameter to `workerJobDiscoveryQuerySchema` enabling safe keyword filtering combined with PostGIS spatial radius.
3. **Bounded Candidate Pool Protection:** Implemented bounded candidate window scaling ($\min(\max(200, \text{page} \times \text{limit} + \text{limit}), 500)$) to prevent memory exhaustion.
4. **Monotonic Version Sequencing:** Updated `SearchIndexHandler` to generate monotonically increasing versions from domain event timestamps, eliminating stale document overwrites.
5. **Resilient OpenSearch Bridge:** Enhanced `SearchIndexingWorkerHandler` with real OpenSearch REST client handling, configurable timeout, basic auth, and graceful offline detection.
6. **Production Cluster Mappings & Reindexing Tool:** Authored OpenSearch index schemas for jobs and workers (`infra/opensearch/mappings/`) and zero-downtime reindexing tool (`scripts/search/reindex-search-cluster.js`).

---

## 2. Findings Ranked by Severity

| ID | Severity | Component | Finding | Remediated Status |
| :--- | :---: | :--- | :--- | :---: |
| **FIND-28-01** | **HIGH** | `MatchingService` | **Sort Instability at Page Boundaries:** Unstable sorting across equal distances, wages, or scores caused non-deterministic item order, leading to duplicate items on consecutive pages and skipped records. | **FIXED** (Added invariant `id` tie-breaker to all sort branches) |
| **FIND-28-02** | **HIGH** | `SearchIndexHandler` | **Static Event Versioning:** Hardcoded `version: 1` in outbox enqueue prevented the Redis version guard from differentiating new vs old events, risking stale overwrite on out-of-order delivery. | **FIXED** (Dynamic monotonic version computed from `occurredAt` timestamp) |
| **FIND-28-03** | **MEDIUM** | `MatchingService` | **Fixed Candidate Limit Truncation:** Hardcoded `LIMIT 200` in spatial candidate query truncated candidate evaluation on deeper page requests (`page >= 11`). | **FIXED** (Dynamic bounded ceiling scaling up to 500 candidates) |
| **FIND-28-04** | **MEDIUM** | Validation & API | **Missing Free-Text Keyword Discovery:** Workers lacked the ability to search job listings by trade keywords within their spatial radius. | **FIXED** (Added optional `query` field to schemas, DTOs, and SQL interpolation) |
| **FIND-28-05** | **MEDIUM** | Worker Handler | **Unimplemented OpenSearch REST Bridge:** Worker handler used simulated `setTimeout` delays without real HTTP cluster connectivity. | **FIXED** (Wired up REST client with configurable auth, timeout, and offline fallback) |
| **FIND-28-06** | **LOW** | Infrastructure | **Missing OpenSearch Index Schemas:** No index mappings or edge-ngram analyzers were defined in the repository. | **FIXED** (Authored `jobs-index-mapping.json` & `workers-index-mapping.json`) |

---

## 3. Files Changed and Rationale

1. [`packages/types/src/matching.types.ts`](file:///p:/Project%20Localsaathi/packages/types/src/matching.types.ts):
   - Added optional `query?: string;` to `WorkerJobDiscoveryQuery`.
2. [`packages/validation/src/matching.schema.ts`](file:///p:/Project%20Localsaathi/packages/validation/src/matching.schema.ts):
   - Added optional sanitized `query` field to `workerJobDiscoveryQuerySchema`.
3. [`apps/api/src/modules/matching/dto/worker-job-query.dto.ts`](file:///p:/Project%20Localsaathi/apps/api/src/modules/matching/dto/worker-job-query.dto.ts):
   - Added `query` parameter with Swagger metadata.
4. [`apps/api/src/modules/matching/matching.service.ts`](file:///p:/Project%20Localsaathi/apps/api/src/modules/matching/matching.service.ts):
   - Added keyword ILIKE filter to spatial candidate query.
   - Bounded candidate retrieval dynamically up to 500 items.
   - Added `a.id.localeCompare(b.id)` tie-breaker to all sort modes.
   - Added safe bounds slicing for pagination.
5. [`apps/api/src/modules/outbox/handlers/search-index.handler.ts`](file:///p:/Project%20Localsaathi/apps/api/src/modules/outbox/handlers/search-index.handler.ts):
   - Replaced static `version: 1` with monotonic timestamp-derived version.
6. [`apps/worker/src/handlers/search-indexing.worker-handler.ts`](file:///p:/Project%20Localsaathi/apps/worker/src/handlers/search-indexing.worker-handler.ts):
   - Implemented real OpenSearch REST PUT/DELETE operations with timeout and auth.
   - Preserved graceful offline handling when cluster port is unreachable.
7. [`infra/opensearch/mappings/jobs-index-mapping.json`](file:///p:/Project%20Localsaathi/infra/opensearch/mappings/jobs-index-mapping.json):
   - Production index settings, autocomplete edge-ngram analyzer, and geo_point field mappings.
8. [`infra/opensearch/mappings/workers-index-mapping.json`](file:///p:/Project%20Localsaathi/infra/opensearch/mappings/workers-index-mapping.json):
   - Production index settings and field mappings for worker discovery.
9. [`scripts/search/reindex-search-cluster.js`](file:///p:/Project%20Localsaathi/scripts/search/reindex-search-cluster.js):
   - Reindexing CLI tool with zero-downtime alias switching and cluster reachability diagnostics.
10. [`apps/api/src/modules/matching/tests/search-scalability.spec.ts`](file:///p:/Project%20Localsaathi/apps/api/src/modules/matching/tests/search-scalability.spec.ts):
    - Comprehensive unit test suite covering sort determinism, page boundaries, privacy, and candidate limits.
11. [`apps/worker/test/search-indexing.spec.ts`](file:///p:/Project%20Localsaathi/apps/worker/test/search-indexing.spec.ts):
    - Unit test suite verifying version guard, out-of-order discard, delete action, and offline resilience.

---

## 4. Test Verification Outcomes

| Test Suite | Command | Outcome | Live Cluster Connected? |
| :--- | :--- | :---: | :---: |
| **Search Scalability Unit Tests** | `npm --workspace=@localsaathi/api test -- search-scalability.spec.ts` | **PASS (13/13)** | No (Mocked Prisma) |
| **Matching Engine Unit Tests** | `npm --workspace=@localsaathi/api test -- matching-unit.spec.ts` | **PASS (6/6)** | No (Mocked inputs) |
| **Matching API Guard Tests** | `npm --workspace=@localsaathi/api test -- matching-api.spec.ts` | **PASS (7/7)** | No (Mocked context) |
| **Search Indexing Worker Tests** | `npm --workspace=@localsaathi/worker test -- search-indexing.spec.ts` | **PASS (8/8)** | No (Mocked Redis/Offline URL) |
| **Monorepo Typecheck** | `npm run typecheck` | **PASS (13/13)** | N/A |
| **Monorepo Linter** | `npm run lint` | **PASS (13/13)** | N/A |
| **Reindexing CLI Dry Run** | `node scripts/search/reindex-search-cluster.js` | **PASS (Code 0)** | No (Detected `PORT_9200_OFFLINE`) |
| **Live OpenSearch Integration** | `curl http://localhost:9200/_cluster/health` | **BLOCKED** | Port 9200 offline |
| **Live PostGIS Integration** | `npm --workspace=@localsaathi/database test:integration` | **BLOCKED** | Port 5432 offline |

---

## 5. In-Depth Correctness Audit Analysis

### 5.1 500-Candidate Ceiling Mechanics & Deep Pagination
- **Architecture**: In LocalSaathi's two-phase matching design, Phase 1 executes a PostGIS spatial query (`ST_DWithin`) to retrieve geographically proximate candidate jobs, and Phase 2 evaluates in-memory multidimensional scoring (distance, wage match, rating, profile completeness) followed by sorting and pagination.
- **Ceiling Implementation**: Candidate retrieval is bounded by:
  $$\text{candidateLimit} = \min(\max(200, \text{page} \times \text{limit} + \text{limit}), 500)$$
- **Deep Pagination Boundary Behavior**:
  - With standard `limit = 20`, pages 1 to 24 evaluate between 200 and 500 candidates. Page 24 yields 20 items with `hasNextPage = true`.
  - Page 25 reaches the exact 500-candidate boundary ($24 \times 20 + 20 = 500$), returning the final 20 items and correctly signaling `hasNextPage = false`.
  - Page 26 requests items beyond the ceiling ($startIndex = 500$, total evaluated = 500). Safe bounds slicing returns `items: []` with `hasNextPage = false`.
- **Limitation & Rationale**: In densely populated regions with $>500$ matching jobs within the radius, jobs ranked beyond the top 500 nearest candidates are omitted from Phase 2 reranking. This is an intentional architectural ceiling preventing unbounded Node.js heap consumption and event-loop lag. Deeper exploration is constrained by design; searchers must refine filters or radius.

### 5.2 Outbox Event Versioning, Ordering & Delete-vs-Update Race Prevention
- **Root Problem**: Raw millisecond timestamps (`occurredAt.getTime()`) can collide when consecutive events occur within the same millisecond or deliver out of order, risking resurrection of deleted entities.
- **Remediation**:
  1. Base versions are multiplied by 10 (`baseVersion = occurredAt.getTime() * 10`).
  2. Deletions are assigned a $+1$ action weight:
     $$\text{version} = \begin{cases} \text{baseVersion} + 1 & \text{if action} = \text{DELETE} \\ \text{baseVersion} & \text{if action} = \text{UPSERT} \end{cases}$$
  3. Redis version keys persist `${version}:${action}`.
  4. **Strict Tie-Breaking**:
     - If `incomingVersion < currentVersion`: silently discarded as stale.
     - If `incomingVersion === currentVersion`:
       - If `lastAction === 'DELETE'` and `incomingAction === 'UPSERT'`, the UPSERT is rejected, preventing resurrection.
       - If `lastAction === 'UPSERT'` and `incomingAction === 'DELETE'`, the DELETE supersedes the UPSERT.
       - Identical retries (`action === lastAction`) execute idempotently.

### 5.3 Keyword Search Parameterization & Constraint Preservation
- In `MatchingService.discoverJobsForWorker()`, the optional free-text keyword is validated by `workerJobDiscoveryQuerySchema` and sanitized.
- The SQL clause is parameterized as:
  ```sql
  (jp.title ILIKE $pattern OR jp.description ILIKE $pattern)
  ```
- Combined with `AND` against `jp.status = 'PUBLISHED'`, `jp.deleted_at IS NULL`, and `ST_DWithin(...)`. Parentheses strictly prevent the `OR` branch from bypassing lifecycle, status, or geographic radius constraints.

---

## 6. Verification Matrix & Blocker Disclosures

```
================================================================================
VERIFICATION MATRIX
================================================================================
[CODE-REVIEWED]
  ✔ Deterministic tie-breaker in Array.prototype.sort (a.id.localeCompare(b.id))
  ✔ Dynamic candidate ceiling calculation (min(max(200, page * limit + limit), 500))
  ✔ Keyword query parameter schema validation and SQL parameter interpolation
  ✔ Monotonic version sequencing with delete-precedence weighting (baseVersion + 1)
  ✔ OpenSearch index schema and edge-ngram autocomplete analyzer definition
  ✔ Non-overlapping page slice with safe-bounds handling

[LOCALLY TESTED (UNIT & OFFLINE)]
  ✔ 13/13 tests passing in search-scalability.spec.ts (realistic 500 ceiling, page 24/25/26)
  ✔ 6/6 tests passing in matching-unit.spec.ts
  ✔ 7/7 tests passing in matching-api.spec.ts
  ✔ 8/8 tests passing in search-indexing.spec.ts (out-of-order, delete precedence, retries)
  ✔ 13/13 tasks passing in npm run typecheck
  ✔ 13/13 tasks passing in npm run lint
  ✔ Reindexing script handles offline cluster gracefully without unhandled rejection

[SERVICE-BACKED LIVE VERIFIED]
  ✖ NONE (All live cluster execution is blocked)

[BLOCKED ITEMS]
  ⛔ Live OpenSearch cluster indexing and search queries (LOCAL_OPENSEARCH_PORT_9200_OFFLINE)
  ⛔ Live PostgreSQL 16 + PostGIS 3.4 spatial query benchmarking (LOCAL_DB_PORT_5432_OFFLINE)
================================================================================
```

### Final Phase 28 Verdict:
```
FINAL VERDICT: PHASE 28 — PARTIALLY VERIFIED / BLOCKED
```
