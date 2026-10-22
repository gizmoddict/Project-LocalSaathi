# Phase 30 — Recommendation Evaluation, Feedback & Observability Report

**Project:** LocalSaathi  
**Date:** October 12, 2026  
**Auditor:** Principal Recommendation Systems Engineer  
**Standard:** Production-Grade Architecture, Zero Fabrication Rule  
**Verdict:** `PHASE 30 — PARTIALLY VERIFIED / BLOCKED`

---

## 1. Executive Summary

Phase 30 establishes the evaluation framework, user feedback capture architecture, and privacy-safe operational observability for LocalSaathi's recommendation engine without requiring disruptive schema rewrites or compromising user data privacy.

Key milestones accomplished:
1. **Deterministic Offline Evaluation Library:** Created [`recommendation.evaluation.ts`](file:///p:/Project%20Localsaathi/apps/api/src/modules/matching/recommendation.evaluation.ts) implementing mathematically verifiable formulations for Precision@K, Recall@K, NDCG@K, Mean Reciprocal Rank (MRR), Eligibility Violation Rate, Duplicate Recommendation Rate, and Catalog Coverage.
2. **Implicit & Explicit Feedback Architecture:** Inspected existing models (`AnalyticsEvent`, `JobApplication`, `Rating`) and designed an implicit feedback loop where worker application conversions (`AnalyticsEventName.APPLICATION_SUBMITTED`) and clicks (`RECOMMENDATION_CLICKED`) serve as ground truth without collecting unneeded personal data or adding speculative tables.
3. **Privacy-Safe Structured Telemetry:** Embedded operational observability into `WorkerJobRecommendationResponse.metadata.telemetry`:
   - `latencyMs`: Request execution time.
   - `candidateTruncated`: Boolean flag indicating whether the PostGIS candidate query hit the 500-candidate boundary.
   - `eligibleCount`: Count of jobs passing all hard eligibility constraints.
   - `missingAttributesCount`: Number of omitted/defaulted worker profile attributes (reliability, expected wage, skills, availabilities).
   - Strict privacy safeguards: **Zero GPS coordinate logging, zero phone/PII exposure, zero token retention**.
4. **Comprehensive Test Suite:** Verified 8 hand-checkable metric tests, 10 recommendation engine tests, 9 recommendation service tests, 9 controller routing tests, and 13 search scalability tests.

---

## 2. Evaluation Metrics Formulation & Mathematical Definitions

### 2.1 Precision@K and Recall@K
For a recommendation list $R = [r_1, r_2, \dots, r_K]$ and a ground-truth set of relevant items $G_{\text{rel}}$:
$$\text{Precision}@K = \frac{|R \cap G_{\text{rel}}|}{K}$$
$$\text{Recall}@K = \begin{cases} \frac{|R \cap G_{\text{rel}}|}{|G_{\text{rel}}|} & \text{if } |G_{\text{rel}}| > 0 \\ 0 & \text{otherwise} \end{cases}$$

### 2.2 Mean Reciprocal Rank (MRR)
Measures the reciprocal rank of the first relevant item in the recommended list:
$$\text{MRR} = \begin{cases} \frac{1}{\min \{ i \mid r_i \in G_{\text{rel}} \}} & \text{if } \exists r_i \in G_{\text{rel}} \\ 0 & \text{otherwise} \end{cases}$$

### 2.3 NDCG@K (Normalized Discounted Cumulative Gain)
Discounted cumulative gain with graded relevance $g_i \in \{0, 1, 2\}$:
$$\text{DCG}@K = \sum_{i=1}^{K} \frac{2^{g_i} - 1}{\log_2(i + 1)}$$
$$\text{NDCG}@K = \frac{\text{DCG}@K}{\text{IDCG}@K}$$
Where $\text{IDCG}@K$ is the DCG of the ideal permutation sorted by $g_i$ descending.

### 2.4 Integrity & Safety Guard Metrics
- **Eligibility Violation Rate:**
  $$\text{EVR} = \frac{|\{ r \in R \mid r \text{ violates hard eligibility gates} \}|}{K}$$
- **Duplicate Recommendation Rate:**
  $$\text{DRR} = \frac{K - |\text{Unique}(R)|}{K}$$
- **Catalog Coverage:**
  $$\text{Coverage} = \frac{|\text{Unique}(R)|}{|C|}$$
  Where $|C|$ is the total number of active published listings in the geographic market.

---

## 3. Feedback Loop Design & Privacy Safeguards

### 3.1 Implicit Feedback (Canonical Analytics Taxonomy)
- **Impression Logging:** When recommendations are rendered, client emits `AnalyticsEventName.JOB_VIEWED` with metadata `{ source: 'recommendations', jobId, rank, score }`.
- **Click Feedback:** When worker selects a recommendation, client emits `AnalyticsEventName.RECOMMENDATION_CLICKED` with `{ jobId, rank, score, isFallback }`.
- **Conversion Signal:** When worker applies, server emits `AnalyticsEventName.APPLICATION_SUBMITTED` linked to `jobPostId` and `workerProfileId`.
- **Ground Truth Mapping:**
  - Grade 0: Viewed but not clicked.
  - Grade 1: Clicked/viewed detail.
  - Grade 2: Applied / Shortlisted / Booked.

### 3.2 Privacy Safeguards
- Exact GPS coordinates (`latitude`, `longitude`) are processed solely in PostGIS geography space (`ST_DWithin`, `ST_Distance`) and never written to analytics payloads or client responses.
- Employer phone numbers, emails, and address lines are omitted via public DTO projection (`PublicEmployerInfo`).
- Telemetry captures only aggregated cardinality signals (`latencyMs`, `candidateTruncated`, `eligibleCount`, `missingAttributesCount`).

---

## 4. Test Verification Outcomes

| Test Suite | Command | Outcome | Service Dependencies |
| :--- | :--- | :---: | :---: |
| **Recommendation Evaluation Tests** | `npm.cmd test -- --testPathPattern=recommendation-evaluation` | **PASS (8/8)** | Offline / Pure In-Memory |
| **Recommendation Engine Unit Tests** | `npm.cmd test -- --testPathPattern=recommendation-engine` | **PASS (10/10)** | Offline / Pure In-Memory |
| **Recommendation Service Unit Tests** | `npm.cmd test -- --testPathPattern=recommendation-service` | **PASS (9/9)** | Offline / Mocked Prisma |
| **Matching API Guard & Route Tests** | `npm.cmd test -- --testPathPattern=matching-api` | **PASS (9/9)** | Offline / Mocked Service |
| **Matching Engine Unit Tests** | `npm.cmd test -- --testPathPattern=matching-unit` | **PASS (6/6)** | Offline / Pure In-Memory |
| **Search Scalability Unit Tests** | `npm.cmd test -- --testPathPattern=search-scalability` | **PASS (13/13)** | Offline / Mocked Prisma |
| **Worker Search Indexing Tests** | `npm.cmd test -- --testPathPattern=search-indexing` | **PASS (8/8)** | Offline / Mocked Redis |
| **Monorepo Typecheck** | `npm.cmd run typecheck` | **PASS (13/13)** | Turborepo Monorepo Gate |
| **Monorepo Linter** | `npm.cmd run lint` | **PASS (13/13)** | Turborepo Monorepo Gate |
| **Live OpenSearch Cluster Telemetry** | `curl http://localhost:9200` | **BLOCKED** | Port 9200 Offline (`LOCAL_OPENSEARCH_PORT_9200_OFFLINE`) |
| **Live PostGIS Database Integration** | `npm --workspace=@localsaathi/database test:integration` | **BLOCKED** | Port 5432 Offline (`LOCAL_DB_PORT_5432_OFFLINE`) |

---

## 5. Verification Matrix & Blocker Disclosures

```
================================================================================
VERIFICATION MATRIX
================================================================================
[CODE-REVIEWED]
  ✔ Mathematical implementation of Precision@K, Recall@K, NDCG@K, MRR
  ✔ Eligibility violation detection and duplicate rate calculation
  ✔ Reuse of existing AnalyticsEvent model for implicit feedback
  ✔ Privacy-safe telemetry without GPS coordinates or contact PII
  ✔ Candidate truncation observability (candidateTruncated boolean flag)

[LOCALLY TESTED (UNIT & OFFLINE)]
  ✔ 8/8 tests passing in recommendation-evaluation.spec.ts (hand-checkable metrics)
  ✔ 10/10 tests passing in recommendation-engine.spec.ts
  ✔ 9/9 tests passing in recommendation-service.spec.ts
  ✔ 9/9 tests passing in matching-api.spec.ts
  ✔ 6/6 tests passing in matching-unit.spec.ts
  ✔ 13/13 tests passing in search-scalability.spec.ts
  ✔ 8/8 tests passing in search-indexing.spec.ts
  ✔ 13/13 tasks passing in npm run typecheck
  ✔ 13/13 tasks passing in npm run lint

[SERVICE-BACKED LIVE VERIFIED]
  ✖ NONE (All live cluster execution is blocked)

[BLOCKED ITEMS]
  ⛔ Live OpenSearch cluster query execution (LOCAL_OPENSEARCH_PORT_9200_OFFLINE)
  ⛔ Live PostgreSQL 16 + PostGIS 3.4 spatial indexing (LOCAL_DB_PORT_5432_OFFLINE)
================================================================================
```

### Final Phase 30 Verdict:
```
FINAL VERDICT: PHASE 30 — PARTIALLY VERIFIED / BLOCKED
```
