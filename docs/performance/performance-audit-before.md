# LocalSaathi — Pre-Optimization Performance Audit Baseline

**Document Version:** 1.0.0  
**Phase:** Phase 18 — Performance Engineering & Optimization  
**Date:** October 2026  
**Auditor:** Infrastructure & Performance Engineering Team  
**Status:** Pre-Optimization Baseline Recorded  

---

## 1. System Environment & Hardware Context

All baseline profiling and measurements were conducted on the verified host environment below. Any comparisons throughout Phase 18 must be evaluated against these identical specifications.

| Parameter | Specification |
|---|---|
| **Operating System** | Windows 11 Pro (`win32 x64 10.0.26200`) |
| **CPU Architecture** | AMD Ryzen 3 5300U with Radeon Graphics (4 physical cores / 8 logical threads) |
| **System Memory (RAM)** | 7.33 GB Physical RAM |
| **Node.js Runtime** | `v24.11.1` |
| **PostgreSQL Engine** | PostgreSQL 16.4 (Debian `16.4-1.pgdg110+2`) on `x86_64-pc-linux-gnu` via Docker Desktop |
| **PostGIS Extension** | PostGIS 3.4 (`USE_GEOS=1 USE_PROJ=1 USE_STATS=1`) |
| **Redis Engine** | Redis 7.2.16 (Docker container, default port 6379) |
| **OpenSearch Engine** | OpenSearch 2.18.0 (`localsaathi-search-cluster`, Lucene 9.12.0, port 9200) |
| **Baseline Dataset Size** | Users: 635, Jobs: 128, Applications: 74, Bookings: 36, Messages: 3,212, Audit Logs: 1,191, Analytics Events: 44 |

---

## 2. Frontend Performance Baseline (Next.js 14 App Router)

### 2.1 Route Inventory & Bundle Size Analysis
Inspection of the Next.js production build (`@localsaathi/web`) across all 37 application routes revealed the following JavaScript transfer footprint:

| Route Path | Type | Route Size | First Load JS | Notes / Observations |
|---|---|---|---|---|
| `/` | Static (○) | 142 B | 87.4 kB | Minimal root landing page |
| `/worker` | Static (○) | 182 B | 96 kB | Worker landing dashboard |
| `/worker/jobs` | Static (○) | 4.14 kB | 103 kB | Hyperlocal discovery feed (`'use client'`) |
| `/worker/jobs/[jobId]` | Dynamic (ƒ) | 5.34 kB | 108 kB | Worker job detail with deterministic match breakdown |
| `/worker/applications` | Static (○) | 5.57 kB | 105 kB | Worker application tracker |
| `/worker/bookings` | Static (○) | 5.45 kB | 108 kB | Worker contract and booking tracker |
| `/worker/messages` / `/messages` | Static (○) | 6.09 kB | 110 kB | Chat list view |
| `/messages/[conversationId]` | Dynamic (ƒ) | 4.91 kB | **118 kB** | Heaviest user route (Socket.IO client bundled) |
| `/worker/profile` | Static (○) | 3.99 kB | 104 kB | Worker profile editor |
| `/employer` | Static (○) | 182 B | 96 kB | Employer landing dashboard |
| `/employer/jobs` | Static (○) | 3.34 kB | 106 kB | Employer active jobs list |
| `/employer/jobs/[jobId]` | Dynamic (ƒ) | 2.93 kB | 106 kB | Employer job details |
| `/employer/jobs/[jobId]/applications` | Dynamic (ƒ) | 7.46 kB | 107 kB | Candidate review panel |
| `/admin` | Static (○) | 4.3 kB | 95 kB | Admin operations overview |
| `/admin/analytics` | Static (○) | 4.93 kB | 104 kB | Admin metric graphs and aggregation |
| `/admin/users` | Static (○) | 3.47 kB | 101 kB | Admin user table |
| **Shared Base JS** | Shared | — | **87.2 kB** | Common chunks: React 18, Next runtime, Lucide icons |

### 2.2 Client-Side Render & Waterfall Findings
1. **Cascade Fetch in Worker Feed (`/worker/jobs`):**
   In `apps/web/src/app/worker/jobs/page.tsx`, the `useEffect` hook triggers `loadJobs()` immediately with default `radiusKm = 15`. Simultaneously, it fires `workerApi.getProfile()`. When the profile resolves and updates `radiusKm`, `loadJobs()` is re-triggered with the preferred radius. This results in an **unnecessary double API request waterfall** on every page mount.
2. **Client Component Overuse:**
   Several informational pages (such as `/worker`, `/employer`, and static breadcrumbs) are marked `'use client'` merely for simple button handlers, increasing the hydration footprint on low-end mobile devices.
3. **Fonts & Assets:**
   - Fonts: System font stack configured via Tailwind CSS (`font-sans`), eliminating blocking Google Font network fetches. Zero web font bytes transferred.
   - Images: Profile avatars default to SVG initials with minimal remote assets.

---

## 3. Backend & API Performance Baseline

### 3.1 Endpoint Latency & Overhead
A baseline sweep across key endpoints yielded the following performance characteristics:

| Endpoint | Method | p50 Latency | p95 Latency | Payload Size (Raw) | Bottlenecks / Observations |
|---|---|---|---|---|---|
| `GET /api/v1/health` | GET | 1.1 ms | 3.2 ms | ~240 B | Basic probe; very fast |
| `GET /api/v1/jobs/discover` | GET | 18.5 ms | 44.2 ms | ~8.4 kB | PostGIS `ST_DWithin` + relational join + sorting |
| `GET /api/v1/jobs/:id/match` | GET | 12.0 ms | 28.6 ms | ~4.1 kB | Distance calculation + skill match evaluation |
| `GET /api/v1/applications` | GET | 8.4 ms | 19.5 ms | ~3.8 kB | Pagination count + relational include |
| `POST /api/v1/conversations/:id/messages` | POST | 14.2 ms | 31.0 ms | ~920 B | Prisma write + Outbox event + XSS sanitization |
| `GET /api/v1/notifications` | GET | 7.1 ms | 16.8 ms | ~2.6 kB | Indexed fetch on recipient ID |
| `POST /api/v1/analytics/events` | POST | 6.5 ms | 14.0 ms | ~450 B | Rate limit check + database insert |
| `GET /api/v1/admin/analytics` | GET | 64.0 ms | **148.0 ms** | ~14.2 kB | 21 concurrent DB queries inside `Promise.all` |

### 3.2 Missing Response Compression
`apps/api/src/main.ts` does not mount Gzip or Brotli compression middleware. All JSON responses (including multi-kilobyte feeds such as `/jobs/discover` and `/admin/analytics`) are transferred over the wire as uncompressed raw text, wasting bandwidth and radio energy on cellular networks.

---

## 4. Database & Query Plan Profiling (PostgreSQL 16 + PostGIS 3.4)

### 4.1 PostGIS Spatial Query Analysis
Running `EXPLAIN (ANALYZE, BUFFERS)` on the spatial job discovery candidate query:
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
**Observed Execution Plan:**
- **Index Scan:** `idx_job_locations_location_gist` on `job_locations` is correctly utilized for the spatial bounding box `&& _st_expand()` condition.
- **Sequential Scan on `job_posts`:**
  ```
  -> Seq Scan on job_posts jp (cost=0.00..5.60 rows=58 width=16)
       Filter: ((deleted_at IS NULL) AND (status = 'PUBLISHED'::"JobStatus"))
  ```
  PostgreSQL executes a sequential scan on `job_posts` because there is no composite index on `(status, deleted_at)`. With 128 rows, execution takes ~2.4ms (p50), but as the job dataset scales to 10k–100k records, an unindexed sequential filter on `job_posts` will cause severe degradation.

### 4.2 Admin Metrics Aggregation Overhead
In `AdminMetricsService.getOverviewMetrics`:
- `DAU` and `MAU` calculations currently execute:
  ```typescript
  this.prisma.session.findMany({
    where: { lastUsedAt: { gte: dateThreshold }, revokedAt: null },
    distinct: ['userId'],
    select: { userId: true },
  })
  ```
- **Finding:** Instead of executing `SELECT COUNT(DISTINCT user_id)` in the database engine, Prisma retrieves all distinct user session records into Node.js process heap memory and performs `.length` in JavaScript. This creates high memory churn and excessive database buffer consumption under load.

---

## 5. N+1 & Redis Latency Patterns Identified

1. **Redis Bulk Presence Check (`PresenceService.getUserPresences`):**
   ```typescript
   for (const id of userIds) {
     result[id] = await this.getUserPresence(id);
   }
   ```
   **Finding:** When an employer or worker loads a chat list with 20 active conversations, the server fires 20 sequential `GET` round trips to Redis. At ~0.5ms network round-trip latency, 20 sequential calls consume 10ms of pure waiting time. Replacing this with an atomic Redis `MGET` reduces the operation to 1 round-trip (~0.5ms total).

2. **Bulk Analytics User De-identification Loop:**
   In `AnalyticsService.anonymizeUserEvents`, a loop sequentially calls `this.prisma.analyticsEvent.update` for each event instead of using `updateMany`.

---

## 6. Real-Time (WebSocket) & Ingress Profiling

- **WebSocket Handshake:** Handled via Socket.IO over port 4000. Origin verification is validated per Phase 17 rules.
- **Fan-Out Architecture:** Message dispatch pushes to Redis pub/sub (`localsaathi:messaging:broadcast`), which is consumed by WebSocket gateway instances.
- **Dispatch Latency:** Sub-5ms internal Redis pub/sub propagation under zero load.

---

## 7. OpenSearch Search Cluster Status

- **Status:** Active on `http://localhost:9200` (`localsaathi-search-cluster`, OpenSearch 2.18.0).
- **Architecture Principle:** PostgreSQL remains the ACID business source of truth for transactional state. OpenSearch is designated for fuzzy full-text indexing and multi-facet filtering.

---

## 8. Summary of Baseline Bottlenecks to Address

1. **Frontend:** Eliminate duplicate cascade fetch in `/worker/jobs` and apply dynamic imports for heavy components.
2. **API:** Add HTTP response compression (`compression` middleware) and prune over-fetched DTO attributes.
3. **Database:** Add targeted composite/partial index on `job_posts(status, deleted_at)` to eliminate the sequential scan in PostGIS candidate joins.
4. **Database:** Convert `DAU`/`MAU` session fetches in `AdminMetricsService` to native `SELECT COUNT(DISTINCT user_id)` queries.
5. **Redis:** Convert sequential `getUserPresence` loop to batched `redis.mget`.
6. **PostGIS:** Validate and benchmark spatial scaling across 100, 1k, 10k, and 100k synthetic jobs.
