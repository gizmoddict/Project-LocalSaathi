# Phase 31: Recommendation Quality Hardening & Telemetry Correctness Audit Report

**Project:** LocalSaathi  
**Role:** Principal Recommendation Systems Engineer  
**Standard:** Production-Grade Verification & Zero-Fabrication Architecture  
**Previous Verdict:** Phase 30 — PARTIALLY VERIFIED / BLOCKED  
**Current Verdict:** **PHASE 31 — PARTIALLY VERIFIED / BLOCKED**

---

## 1. Executive Summary & Verification State

Phase 31 conducted a rigorous, zero-fabrication quality hardening and telemetry correctness audit of LocalSaathi's recommendation engine, evaluation framework, feedback-event ingestion, and operational telemetry.

### Service Availability Matrix

| Service | Port | Target Version | Live Connection | Blocker Identifier | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL / PostGIS** | 5432 | 16 / 3.4 | Connection Refused | `LOCAL_DB_PORT_5432_OFFLINE` | **BLOCKED** |
| **OpenSearch** | 9200 | 2.18 | Connection Refused | `LOCAL_OPENSEARCH_PORT_9200_OFFLINE` | **BLOCKED** |
| **Node.js Test Engine** | N/A | v20+ / Jest 29 | Local Process | None | **VERIFIED (PASS)** |
| **TypeScript Compiler** | N/A | 5.3+ / Turbo 2.11 | Local Process | None | **VERIFIED (PASS)** |

Because external local infrastructure (PostgreSQL on port 5432 and OpenSearch on port 9200) remains offline, live spatial query plan execution and live database-backed event ingestion cannot run. In strict conformance with engineering truthfulness standards, the formal verdict is preserved as **PARTIALLY VERIFIED / BLOCKED**. Zero production metrics or synthetic live benchmarks have been fabricated.

---

## 2. Recommendation Evaluation Metric Hardening

The offline recommendation evaluation suite in [`recommendation.evaluation.ts`](file:///p:/Project%20Localsaathi/apps/api/src/modules/matching/recommendation.evaluation.ts) was hardened to prevent edge-case failures, division by zero, and unrated label contamination.

### 2.1 Metric Mathematical Definitions & Formal Semantics

1. **Precision@K**:
   $$\text{Precision@K} = \frac{|\{d \in \text{TopK} \mid \text{grade}(d) > 0\}|}{K}$$
   - *Denominator Policy:* Strictly fixed to $K$. If the model returns fewer than $K$ recommendations ($M < K$), unpopulated slots do not inflate precision.
   - *Missing Labels:* When a candidate item in TopK does not exist in ground-truth labels, it is explicitly tracked as `unratedCount`. In standard mode, it does not count as relevant; with `unknownAsNegative: true`, it is treated strictly as grade 0.

2. **Recall@K**:
   $$\text{Recall@K} = \begin{cases} \frac{|\{d \in \text{TopK} \mid \text{grade}(d) > 0\}|}{|\{d \in \mathcal{G} \mid \text{grade}(d) > 0\}|} & \text{if } |\{d \in \mathcal{G} \mid \text{grade}(d) > 0\}| > 0 \\ 0 & \text{otherwise} \end{cases}$$
   - Safe guards prevent division by zero when ground-truth contains zero relevant items.

3. **NDCG@K (Normalized Discounted Cumulative Gain)**:
   $$\text{DCG@K} = \sum_{i=1}^{\min(K, |\text{TopK}|)} \frac{2^{\text{grade}(d_i)} - 1}{\log_2(i + 1)}$$
   $$\text{IDCG@K} = \sum_{i=1}^{\min(K, |\mathcal{G}^+|)} \frac{2^{\text{grade}_{\text{ideal}}(i)} - 1}{\log_2(i + 1)}$$
   $$\text{NDCG@K} = \begin{cases} \frac{\text{DCG@K}}{\text{IDCG@K}} & \text{if } \text{IDCG@K} > 0 \\ 0 & \text{otherwise} \end{cases}$$
   - Filtered ideal grades ensure $\text{IDCG@K}$ strictly sums positive relevance grades, avoiding zero-gain rank dilution.

4. **MRR (Mean Reciprocal Rank)**:
   $$\text{MRR} = \begin{cases} \frac{1}{\text{rank}(d_{\text{first relevant}})} & \text{if relevant item found in TopK} \\ 0 & \text{otherwise} \end{cases}$$

5. **Eligibility Violation Rate (EVR)**:
   $$\text{EVR} = \frac{|\{d \in \text{TopK} \mid \text{gt}(d).\text{isEligible} = \text{false}\}|}{|\text{TopK}|}$$
   - Evaluated against independently supplied ground truth, not the engine's internal eligibility flag.

6. **Duplicate Recommendation Rate (DRR)**:
   $$\text{DRR} = \frac{\text{duplicates in TopK}}{|\text{TopK}|}$$

7. **Recommendation Catalog Coverage (RCC)**:
   $$\text{RCC} = \frac{|\bigcup_{q} \text{TopK}(q)|}{|\mathcal{C}|}$$

---

## 3. Telemetry and Observability Correctness

The telemetry payload in [`MatchingService.recommendJobsForWorker`](file:///p:/Project%20Localsaathi/apps/api/src/modules/matching/matching.service.ts) was audited and hardened against timing jitter and misreported candidate states.

### 3.1 Monotonic Latency Measurement
- **Audited Defect:** Previously measured using `Date.now() - startTime` (wall clock), susceptible to NTP clock drift and OS time adjustments.
- **Hardened Implementation:** Switched to nanosecond monotonic timer via `process.hrtime.bigint()`:
  ```typescript
  const startNs = process.hrtime.bigint();
  // ... candidate retrieval & scoring ...
  const elapsedNs = process.hrtime.bigint() - startNs;
  const latencyMs = Number(elapsedNs / 1000000n);
  ```

### 3.2 Candidate Truncation Invariant
- **Audited Defect:** `candidateTruncated` was set to `candidateRows.length >= maxCandidateCeiling`, which could trigger even if the caller only requested a smaller candidate window.
- **Hardened Invariant:** Evaluated strictly when both candidate retrieval meets or exceeds the ceiling AND the query demanded up to the ceiling:
  ```typescript
  const candidateTruncated =
    candidateRows.length >= maxCandidateCeiling && requiredCandidates >= maxCandidateCeiling;
  ```

### 3.3 Worker Attribute Completeness Telemetry
- `missingAttributesCount` deterministically tracks across 4 orthogonal dimensions:
  1. `worker.expectedWage === null`
  2. `worker.reliabilityScore === null || worker.reliabilityScore === undefined`
  3. `worker.workerSkills.length === 0`
  4. `worker.availabilities.length === 0`

### 3.4 PII & GPS Privacy Safeguards
- Exact GPS coordinates (`latitude`, `longitude`) are used strictly within PostgreSQL PostGIS parameterized queries (`ST_SetSRID(ST_MakePoint(${workerLon}, ${workerLat}), 4326)::geography`).
- Neither worker coordinates nor employer exact coordinates are exposed in telemetry payloads, response metadata, or application logs. Only relative `distanceKm` is returned.

---

## 4. Feedback Event Lifecycle & Data Integrity Audit

LocalSaathi captures feedback events via the existing `AnalyticsEvent`, `JobApplication`, and `Rating` tables without requiring redundant schema migrations.

```mermaid
sequenceDiagram
    autonumber
    actor Worker as Authenticated Worker
    participant API as Matching & Job API
    participant Event as Analytics Event Service
    participant DB as PostgreSQL 16
    
    Worker->>API: GET /api/v1/workers/me/jobs/recommendations
    API-->>Worker: HTTP 200 (Ranked items + recommendation explanation)
    
    Worker->>API: POST /api/v1/analytics/events (RECOMMENDATION_CLICKED)
    API->>Event: ingestEvent(RECOMMENDATION_CLICKED, jobId, workerId)
    Event->>DB: INSERT INTO analytics_events
    
    Worker->>API: POST /api/v1/applications (Apply to Job)
    API->>DB: INSERT INTO job_applications (workerProfileId, jobPostId)
    API->>Event: emitDomainEvent(APPLICATION_CREATED)
    
    Note over Worker,DB: After Job Completion & Settlement
    Worker->>API: POST /api/v1/ratings (Rate Employer)
    API->>DB: INSERT INTO ratings (score, feedback)
```

1. **Impression Tracking**: The recommendation response returns deterministic items and explanation metadata without fabricating synthetic click counts.
2. **Click Attribution**: Logged as `RECOMMENDATION_CLICKED` with `entityType: 'JOB_POST'` and `entityId: jobId`.
3. **Application Attribution**: Captured as primary business state transition in `job_applications`, excluding applied jobs from subsequent recommendation queries.
4. **Outcome / Conversion**: Post-completion `Rating` and `PaymentEvent` rows provide ground truth labels for offline model evaluation.

---

## 5. Verification Test Matrix

All test suites and monorepo quality gates were executed locally with zero regressions:

| Test Command | Scope | Result | Details |
| :--- | :--- | :--- | :--- |
| `npm.cmd test -- --testPathPattern="recommendation"` | Unit tests | **PASS (31/31)** | 3 suites: engine (10), evaluation (11), service (10) |
| `npm.cmd test -- --testPathPattern="matching-api"` | Controller & Guards | **PASS (9/9)** | RBAC worker vs employer role enforcement |
| `npm.cmd run typecheck` | Monorepo | **PASS** | 8 packages in scope; 13 tasks successful (0 errors) |
| `npm.cmd run lint` | Monorepo | **PASS** | 8 packages in scope; 13 tasks successful (0 errors) |
| Port 5432 & 9200 TCP Probe | Local Infra | **OFFLINE** | Documented blockers: `LOCAL_DB_PORT_5432_OFFLINE`, `LOCAL_OPENSEARCH_PORT_9200_OFFLINE` |

---

## 6. Final Honest Status

**FINAL VERDICT: PHASE 31 — PARTIALLY VERIFIED / BLOCKED**

- **Verified:** Offline recommendation evaluation mathematics, edge-case safety, monotonic telemetry measurement, candidate ceiling invariants, and monorepo TypeScript compilation.
- **Blocked:** Live PostGIS spatial index query verification and live OpenSearch ingestion pending local infrastructure initialization on ports 5432 and 9200.
