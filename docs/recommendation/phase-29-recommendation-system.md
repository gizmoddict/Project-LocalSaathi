# Phase 29 — Recommendation System Architecture & Audit Report

**Project:** LocalSaathi  
**Date:** October 12, 2026  
**Auditor:** Principal Recommendation Systems Engineer  
**Standard:** Production-Grade Architecture, Zero Fabrication Rule  
**Verdict:** `PARTIALLY VERIFIED / BLOCKED`

---

## 1. Executive Summary

Phase 29 designs and implements an explainable, deterministic recommendation engine for LocalSaathi, building directly upon the matching and search foundations established in Phases 27 and 28.

Key architectural objectives achieved:
1. **Explainable Multi-Dimensional Preference Model:** Leveraged existing authorized data attributes (trade skills, proximity, experience tenure, calendar availability, wage expectations, reliability score, and job freshness) with isolated hard eligibility constraints.
2. **Hard Constraint Isolation:** Hard criteria (spatial radius containment, prerequisite skill presence, scheduling non-conflict) are evaluated as boolean gates before preference weighting is applied.
3. **Deduplication & Safety Invariants:** Worker recommendations dynamically exclude jobs the worker has already applied to and jobs from employers blocked by the worker (or who have blocked the worker).
4. **Deterministic Ranking & Tie-Breaking:** Enforces strict deterministic ranking (`score DESC -> distance ASC -> id.localeCompare(id) ASC`), ensuring consistent results regardless of database order.
5. **Intelligent Fallback:** When a worker has zero matching eligible recommendations within their geographic boundary, the system provides nearby popular listings with clear fallback labeling.
6. **Backward Compatibility:** All existing matching endpoints (`GET /workers/me/jobs`, `GET /workers/me/jobs/nearby`, `GET /workers/jobs/:jobId`) remain completely untouched and backward-compatible.

---

## 2. Recommendation Mathematical Formulation

### 2.1 Hard Eligibility Gates
A job post $J$ is considered **eligible** for worker $W$ if and only if all hard boolean constraints pass:
$$\text{Eligible}(W, J) = \text{WithinRadius}(W, J) \land \text{BasicSkillMet}(W, J) \land \text{Available}(W, J)$$
Where:
- $\text{WithinRadius}(W, J) \iff \text{DistanceKm}(W, J) \le \text{EffectiveRadiusKm}$
- $\text{BasicSkillMet}(W, J) \iff |J.\text{RequiredSkills}| = 0 \lor \exists s \in J.\text{RequiredSkills} \text{ s.t. } s \in W.\text{Skills}$
- $\text{Available}(W, J) \iff W.\text{Availability}[J.\text{StartDate}] \notin \{\text{"UNAVAILABLE"}, \text{"BOOKED"}\}$

### 2.2 Preference Weighting Formulation
If $\text{Eligible}(W, J)$ is true, the aggregate recommendation score $S \in [0, 100]$ is computed deterministically as:
$$S = \text{round}\left( \sum_{i=1}^{7} w_i \cdot s_i \right)$$

| Dimension ($i$) | Weight ($w_i$) | Component Description | Computation |
| :--- | :---: | :--- | :--- |
| **Skills** | **0.30** | Required skill coverage | $100 \times \frac{|\text{MatchedRequiredSkills}|}{|\text{TotalRequiredSkills}|}$ |
| **Proximity** | **0.25** | Spatial distance decay | $\max\left(0, 100 \times \left(1 - \frac{\text{DistanceKm}}{\text{RadiusKm}}\right)\right)$ |
| **Experience** | **0.15** | Experience years threshold met | $100 \times \frac{|\text{SkillsExpMet}|}{|\text{SkillsRequiringExp}|}$ |
| **Availability** | **0.10** | Scheduling alignment | $100$ if confirmed available, $80$ baseline, $20$ if general offline |
| **Wage** | **0.10** | Compensation compatibility | $100$ if wage offered $\ge$ expected; proportional ratio if below |
| **Reliability** | **0.05** | Track record reliability | Worker reliability score $[0, 100]$ (defaults to 100) |
| **Freshness** | **0.05** | Recency decay of listing | $100 \times 2^{-\frac{\text{AgeInDays}}{3}}$ (3-day half-life exponential decay) |
| **Total Weight** | **1.00** | Strict normalized sum | $\sum w_i = 1.00$ |

---

## 3. Offline Evaluation & Benchmark Protocol

### 3.1 Evaluation Protocol
Recommendation ranking algorithms must be evaluated empirically using standard offline metrics:
1. **Precision@K:** Ratio of relevant recommended jobs in the top $K$ items.
2. **Recall@K:** Ratio of all relevant jobs captured in the top $K$ items.
3. **NDCG@K (Normalized Discounted Cumulative Gain):** Position-sensitive relevance ranking metric measuring whether top positions receive higher relevant items.
4. **MRR (Mean Reciprocal Rank):** Reciprocal rank of the first relevant job recommendation.

### 3.2 Evaluation Dataset & Limitations Disclosure
- **Dataset Context:** In the current offline development environment (PostgreSQL and OpenSearch offline), offline evaluation is performed against simulated and synthetic worker profiles with varied skills, experience levels, and geolocations.
- **Zero Fabrication Rule:** Because live historical application conversion logs and clickstream tracking are not yet collected in a production database, **no simulated precision/recall numbers are fabricated as live production performance**.
- **Limitations:**
  - Real worker click-through and hire-conversion distributions may exhibit behavioral biases (e.g. preference for specific localities regardless of distance) not captured in linear weighting.
  - Weights are fixed heuristics ($0.30$ skills, $0.25$ distance, etc.) and should be calibrated via offline A/B testing once live user engagement data is gathered.

---

## 4. Unresolved Phase 28 Event-Version Ordering Risk Disclosure

As mandated by Phase 28 audit findings:
- **Dependency & Risk:** Phase 28 established monotonic version sequencing in `SearchIndexHandler` ($baseVersion = timestamp \times 10$ with $+1$ action weight for deletions) and a Redis tie-breaker guard in `SearchIndexingWorkerHandler`.
- **Unresolved Dependency:** In live deployments with distributed Redis clusters, clock skew between application nodes or Redis failover could theoretically deliver out-of-order events across multiple nodes without guaranteed global sequencing.
- **Honest Tracking:** This remains an explicit dependency risk for search and recommendation indexing synchronization. It is not declared magically solved until distributed live cluster end-to-end stress tests are executed.

---

## 5. Test Verification Outcomes

| Test Suite | Command | Outcome | Service Dependencies |
| :--- | :--- | :---: | :---: |
| **Recommendation Engine Unit Tests** | `npm.cmd test -- --testPathPattern=recommendation-engine` | **PASS (10/10)** | Offline / Pure In-Memory |
| **Recommendation Service Unit Tests** | `npm.cmd test -- --testPathPattern=recommendation-service` | **PASS (9/9)** | Offline / Mocked Prisma |
| **Matching API Guard & Route Tests** | `npm.cmd test -- --testPathPattern=matching-api` | **PASS (9/9)** | Offline / Mocked Service |
| **Matching Engine Unit Tests** | `npm.cmd test -- --testPathPattern=matching-unit` | **PASS (6/6)** | Offline / Pure In-Memory |
| **Search Scalability Unit Tests** | `npm.cmd test -- --testPathPattern=search-scalability` | **PASS (13/13)** | Offline / Mocked Prisma |
| **Worker Search Indexing Tests** | `npm.cmd test -- --testPathPattern=search-indexing` | **PASS (8/8)** | Offline / Mocked Redis |
| **Monorepo Typecheck** | `npm.cmd run typecheck` | **PASS (13/13)** | Turborepo Monorepo Gate |
| **Monorepo Linter** | `npm.cmd run lint` | **PASS (13/13)** | Turborepo Monorepo Gate |
| **Live OpenSearch Cluster Search** | `curl http://localhost:9200` | **BLOCKED** | Port 9200 Offline (`LOCAL_OPENSEARCH_PORT_9200_OFFLINE`) |
| **Live PostGIS Database Matching** | `npm --workspace=@localsaathi/database test:integration` | **BLOCKED** | Port 5432 Offline (`LOCAL_DB_PORT_5432_OFFLINE`) |

---

## 6. Deep Boundary Audit & Candidate Window Mechanics

1. **500-Candidate Ceiling**:
   - Initial PostGIS candidate retrieval scales dynamically: $\min(\max(200, \text{page} \times \text{limit} + \text{limit}), 500)$.
   - At standard `limit = 20`, page 25 retrieves the final slice of the 500 ceiling ($480 - 499$), yielding 20 items with `hasNextPage = false`.
   - On page 26, requested start index ($500$) equals the evaluated candidate count ($500$). Safe bounds slicing returns `items: []` and `hasNextPage = false`.
   - In geographic regions with $>500$ matching listings, jobs beyond the top 500 nearest candidates are omitted from memory evaluation. Workers must narrow their radius or filter by category to discover further listings.
2. **Fallback Safety Invariants**:
   - When 0 eligible recommendations pass hard constraints, the fallback branch queries up to the top 10 nearest listings within the candidate pool.
   - Fallback items strictly enforce all security and data protection filters: they never include already-applied jobs, never include blocked employers, never include draft/soft-deleted records, and omit employer personal phone/PII.
   - Items are explicitly badged with `isFallback: true` and prefixed explanation reason `'Recommended as nearby popular listing (fallback)'`.
3. **Deterministic Tie-Breaking**:
   - Sorting invariant strictly follows:
     $$b.\text{recommendation.score} - a.\text{recommendation.score} \;\lor\; a.\text{distanceKm} - b.\text{distanceKm} \;\lor\; a.\text{id.localeCompare}(b.\text{id})$$

---

## 7. Verification Matrix & Blocker Disclosures

```
================================================================================
VERIFICATION MATRIX
================================================================================
[CODE-REVIEWED]
  ✔ Separation of hard eligibility constraints from soft preference weights
  ✔ Deduplication of applied jobs (via JobApplication workerProfileId lookup)
  ✔ Trust & Safety blocking enforcement (via BlockedUser bidirectional lookup)
  ✔ Invariant tie-breaking (score_desc -> distance_asc -> id.localeCompare)
  ✔ Safe fallback rendering for zero-match geographic pools
  ✔ Privacy preservation (omission of employer personal phone/PII)

[LOCALLY TESTED (UNIT & OFFLINE)]
  ✔ 10/10 tests passing in recommendation-engine.spec.ts (zero boundaries, explanations)
  ✔ 9/9 tests passing in recommendation-service.spec.ts (500 candidate ceiling, fallback)
  ✔ 9/9 tests passing in matching-api.spec.ts (RBAC worker role guards & routing)
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

### Final Phase 29 Verdict:
```
FINAL VERDICT: PHASE 29 — PARTIALLY VERIFIED / BLOCKED
```
