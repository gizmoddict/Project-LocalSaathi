# LocalSaathi — Distributed Redis Caching Architecture Audit

**Phase:** Phase 19 — Distributed Redis Caching Platform  
**Date:** October 5, 2026  
**Status:** Pre-Implementation Baseline  
**Architecture Principle:** The PostgreSQL database and domain services remain the durable, authoritative source of truth. Redis is strictly a non-authoritative cache and ephemeral message bus. Never allow cached values to become authoritative business state.

---

## 1. Existing Redis Infrastructure Audit

An exhaustive inspection of the LocalSaathi codebase reveals the following existing Redis touchpoints:

| Component / Service | File Path | Redis Pattern | Current Key Pattern | TTL / Retention | Role & Failover Behavior |
|:---|:---|:---|:---|:---|:---|
| **Rate Limiter** | `apps/api/src/modules/auth/services/rate-limiter.service.ts` | Sliding Window (Sorted Sets) | `ratelimit:{key}` | 60s – 3600s | Ephemeral throttle. Gracefully falls back to in-memory sliding window map if Redis disconnects. |
| **Worker Presence** | `apps/api/src/modules/messaging/services/presence.service.ts` | String keys + MGET batching | `presence:user:{userId}` | 120s | Heartbeat status (`ONLINE`/`OFFLINE`). If down, returns `OFFLINE`. |
| **Typing Indicators** | `apps/api/src/modules/messaging/services/typing.service.ts` | Ephemeral String | `typing:{conversationId}:{userId}` | 5s | Ephemeral UI flag. Silently degrades on failure. |
| **Messaging Dispatcher** | `apps/api/src/modules/messaging/realtime/messaging-dispatcher.service.ts` | Redis Pub/Sub | `realtime:messages:new`, `realtime:messages:status` | N/A (Pub/Sub) | Cross-node WebSocket messaging fanout. |
| **Notification Dispatcher** | `apps/api/src/modules/outbox/realtime/notification-dispatcher.service.ts` | Redis Pub/Sub | `realtime:notifications:new` | N/A (Pub/Sub) | Cross-node WebSocket notification fanout. |
| **Admin System Health** | `apps/api/src/modules/admin/services/admin-health.service.ts` | Direct Socket / Ping | `PING` probe | N/A | Diagnostic health check returning latency and status. |

### Observations:
1. **No Shared Cache Client Module:** Currently, each service independently instantiates or manages an `ioredis` client or raw connection. There is no unified cache abstraction, cache-aside helper, stampede protection, or centralized metrics tracking.
2. **No Data Caching for Read Paths:** Read-heavy entities—such as skill catalogs, public employer profiles, and published job details—currently execute direct relational queries against PostgreSQL on every HTTP request.
3. **No Centralized Namespace Standards:** Existing keys use divergent namespace conventions (`ratelimit:`, `presence:user:`, `typing:`, `realtime:`).
4. **Memory Sharing Risk:** Ephemeral rate-limit counters and presence keys share the same Redis instance without dedicated namespace partitioning or cache size constraints.

---

## 2. Repeated Expensive Reads & Bottleneck Identification

Evidence gathered from the Phase 18 performance profiling highlights several repeated read operations that put unnecessary load on PostgreSQL:

1. **Platform Skills Catalog (`WorkerService.getSkillsCatalog`):**
   - Executed on every worker onboarding step, profile edit, skill filter modal, and job creation view.
   - Executes `prisma.skill.findMany({ where: { isActive: true }, take: 100 })`.
   - The data is static reference data, rarely updated, yet queried hundreds of times per hour.
2. **Public Published Job Details (`MatchingService.getJobDetailForWorker`):**
   - Triggered when workers browse, inspect, or share job cards.
   - Fetches `jobPost` with 3 joins: `jobLocation`, `jobRequiredSkills` (nested with `skill`), and `employerProfile`.
   - For popular jobs, 50–100 workers concurrently fetch the exact same job post and employer details.
3. **Public Employer Profiles (`PublicEmployerInfo` projection):**
   - Repeatedly loaded alongside job postings across discovery lists and job detail views.
   - Contains immutable public business details (name, type, locality, city, verification badge) that change infrequently.
4. **Hyperlocal Job Candidate Discovery (`MatchingService.discoverJobsForWorker`):**
   - High spatial query volume in popular city hubs (e.g. Lucknow central 15 km radius).
   - Candidate job IDs within fixed geohash bounding boxes repeat across workers searching in the same locality.

---

## 3. Entity Classification Matrix

In accordance with strict security and data integrity requirements, every LocalSaathi data domain is classified into one of three tiers:

```
+-----------------------------------------------------------------------------------------+
|                               LOCALSAATHI CACHE CLASSIFICATION                          |
+------------------------------------+--------------------------------+--------------------+
|             CACHEABLE              |    CONDITIONALLY_CACHEABLE     |    DO NOT CACHE    |
| (High ROI, Static / Low Drift)     | (Requires Auth / Verification) | (Security / Truth) |
+------------------------------------+--------------------------------+--------------------+
| - Skill Catalog Metadata           | - Hyperlocal Spatial Job Lists | - Payments & Orders|
| - Platform Categories              | - Public Job Detail DTO        | - Booking Contracts|
| - Public Employer Info Projection  | - Admin Overview Metric Rollup | - User Suspensions |
| - Non-sensitive Config Constants   |                                | - Auth / RBAC      |
|                                    |                                | - KYC Documents    |
|                                    |                                | - Chat Messages    |
+------------------------------------+--------------------------------+--------------------+
```

### Tier 1: CACHEABLE
These entities represent static or slow-moving public reference data with high read-to-write ratios and zero sensitive user information:

1. **Skill Catalog Reference Data (`local_saathi:v1:skills:catalog:{category}:{queryHash}`)**:
   - *Data:* ID, name, normalizedName, category, isActive.
   - *TTL:* 24 Hours (86,400s).
   - *Invalidation:* Outbox event on admin skill mutation (`SKILL_CREATED`, `SKILL_UPDATED`).
   - *Consistency:* Eventually consistent.
2. **Public Employer Projection (`local_saathi:v1:employer:public:{employerId}`)**:
   - *Data:* Business name, business type, locality, city, verificationState, totalJobsPosted.
   - *TTL:* 1 Hour (3,600s).
   - *Invalidation:* Outbox event on employer profile update (`EMPLOYER_UPDATED`, `EMPLOYER_VERIFIED`).
   - *Consistency:* Eventually consistent.

### Tier 2: CONDITIONALLY_CACHEABLE
These entities may be cached under strict architectural boundaries, requiring secondary authorization, normalized keys, and rapid invalidation:

1. **Public Job Post Detail DTO (`local_saathi:v1:jobs:detail:{jobId}`)**:
   - *Data:* Public job fields (title, description, wage, duration, dates, required skills, location).
   - *Condition:* Only jobs in `PUBLISHED` status and not soft-deleted may be cached.
   - *Worker-Specific Invariant:* Worker-specific distance and match score MUST be computed dynamically in-memory against the worker's own location and skills.
   - *TTL:* 15 Minutes (900s).
   - *Invalidation:* Immediate invalidation via outbox events on `JOB_PAUSED`, `JOB_FILLED`, `JOB_CANCELLED`, `JOB_UPDATED`.
2. **Hyperlocal Nearby Job Spatial Candidate IDs (`local_saathi:v1:jobs:geo:{geohash}:{radiusKm}:{filterHash}`)**:
   - *Data:* Bounded list of active candidate `jobPostId` strings for a spatial grid cell.
   - *Condition:* Strictly an array of IDs; never contains worker personal data or pre-filtered authorization decisions. Suspended workers or blocked employers are filtered in domain logic.
   - *TTL:* 2 Minutes (120s).
   - *Invalidation:* Invalidated on any job status change in that locality or TTL expiry.
3. **Admin Dashboard Overview Rollup (`local_saathi:v1:admin:metrics:overview`)**:
   - *Data:* Aggregated counters (total workers, active jobs, completed bookings).
   - *Condition:* Non-authoritative metrics only; never used for financial settlement or audit compliance.
   - *TTL:* 30 Seconds (30s).

### Tier 3: DO_NOT_CACHE (Strictly Prohibited from Redis Caching)
The following objects MUST NEVER be cached as authoritative state in Redis under any circumstances:

1. **Payments, Orders, Refunds, Escrow, and Payouts:**
   - *Reason:* PostgreSQL ACID transactions and Razorpay provider signatures are the sole sources of financial truth. A stale cache could cause duplicate payouts, missed refunds, or incorrect escrow status.
2. **Booking Contract Financial State & Status Transitions:**
   - *Reason:* State machine integrity (`PENDING_CONFIRMATION`, `CONFIRMED`, `COMPLETED`, `CANCELLED`) requires row-level PostgreSQL transaction locks.
3. **User Account Status, Suspensions, and Bans:**
   - *Reason:* A stale suspension cache could permit a dangerous suspended user or fraudster to continue booking jobs or contacting workers.
4. **Session Revocation & Refresh Token State:**
   - *Reason:* Immediate token revocation is required for session security and anti-theft defense.
5. **Role-Based Access Control (RBAC) & Authorization Decisions:**
   - *Reason:* Access control must be validated dynamically against the authenticated JWT payload and database policy on every request.
6. **Identity Documents, Aadhaar/PAN Data, and Presigned URLs:**
   - *Reason:* Privacy and compliance. Ephemeral signed URLs expire rapidly and must never linger in Redis.
7. **Direct Messaging & Chat History:**
   - *Reason:* Messages are stored immutably in PostgreSQL. Realtime delivery uses Pub/Sub; historical fetching relies on cursor-paginated DB queries.

---

## 4. Architectural Risk Analysis

| Risk | Impact | Mitigation Strategy in Phase 19 |
|:---|:---|:---|
| **Cache Stampede (Thundering Herd)** | High concurrent misses on popular keys (e.g. cold start of job details) spike PostgreSQL connections. | Implement single-flight distributed mutex lock with bounded wait (500 ms) and automatic lock release. |
| **Cache Invalidation Desynchronization** | Redis key invalidated before database transaction commits; subsequent DB read caches stale data. | Invalidate Redis strictly via the **Transactional Outbox processor** AFTER database transaction commits. |
| **Cache Poisoning via User Input** | Malicious query parameters cause key explosion or unauthorized data leakage. | Enforce strict parameter normalization, hash generation, and schema validation via Zod before key construction. |
| **Redis Outage / Downtime** | Redis crash causes 500 errors across all read APIs. | Graceful fallback pattern: try Redis, catch error, log warning, fallback to PostgreSQL transparently. |
| **Memory Exhaustion (OOM)** | Large payloads or unbounded key growth consume Redis RAM needed for WebSocket presence/rate limits. | Set maximum serialized payload size (64 KB), maximum array length (100 items), and enforce explicit TTLs on 100% of keys. |

---

## 5. Next Steps for Implementation

1. **Centralized Typed Cache Key Generator:** Create `packages/types` / `packages/validation` definitions and `apps/api/src/modules/cache/cache-keys.ts` with strict versioning (`local_saathi:v1:...`).
2. **Distributed Cache Module & Service:** Implement `CacheService` with cache-aside, single-flight stampede protection, negative caching, and Redis disconnect resilience.
3. **Outbox Event Invalidation Handler:** Implement `CacheInvalidationHandler` to subscribe to domain events (`JOB_*`, `EMPLOYER_*`, `SKILL_*`) and purge affected keys.
4. **Service Integration:** Integrate cache-aside logic into `WorkerService` (skills), `EmployerService` (public profiles), and `MatchingService` (job details & spatial candidates).
5. **Verification & Benchmarks:** Comprehensive unit tests, Redis failure simulation, concurrent stampede load benchmarks, and full monorepo quality gate execution.
