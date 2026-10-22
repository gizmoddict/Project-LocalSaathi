# LocalSaathi — Performance Budgets & SLA Targets

**Document Version:** 1.0.0  
**Phase:** Phase 18 — Performance Engineering & Optimization  
**Date:** October 2026  
**Status:** Defined & Active  

---

## 1. Principles & Optimization Rationale

LocalSaathi targets informal and blue-collar workers and small local employers in tier-2 and tier-3 Indian cities. Users frequently operate on:
- **Low-end Android hardware** (e.g., 2GB–3GB RAM, entry-level MediaTek/Qualcomm SoCs)
- **Constrained cellular networks** (variable 3G/4G, fluctuating latency 150ms–400ms, packet jitter)
- **High data sensitivity** (strict prepaid mobile data limits)

Therefore, performance budgets are designed around **real-world mobile constraints** rather than high-end desktop environments.

---

## 2. Frontend Performance Budgets

| Metric / Dimension | Baseline (Pre-Opt) | Performance Budget (Target) | Enforcement Mechanism |
|---|---|---|---|
| **Shared Base JS Bundle** | 87.2 kB | **< 90 kB** | Next.js build stats check |
| **Worker Discovery First Load JS (`/worker/jobs`)** | 103.0 kB | **< 105 kB** | Route code-splitting |
| **Max Route Bundle (`/messages/[id]`)** | 118.0 kB | **< 120 kB** | Dynamic imports for heavy sockets/dialogs |
| **Initial HTML Size (SSR / Static)** | ~18 kB | **< 25 kB** | Compact Server Component markup |
| **Time to First Byte (TTFB)** | ~120 ms (local) | **< 200 ms** (4G simulated) | Edge caching / fast server response |
| **First Contentful Paint (FCP)** | 1.4 s | **< 1.8 s** (Slow 4G) | Zero render-blocking web fonts |
| **Largest Contentful Paint (LCP)** | 2.6 s | **< 2.5 s** (Slow 4G) | Preloaded hero elements, SVG avatars |
| **Cumulative Layout Shift (CLS)** | 0.02 | **< 0.05** | Explicit aspect ratio & min-height containers |
| **Interaction to Next Paint (INP)** | ~80 ms | **< 150 ms** | Debounced client events, lightweight state |
| **Network Requests on Discovery Page Mount** | 2 requests (waterfall) | **1 request (0 duplicate)** | Unified initial state loading |

---

## 3. Backend & API Latency Budgets (Server-Side)

All API budgets specify maximum acceptable server-side processing latency (excluding network transit) under moderate concurrency (50 concurrent clients):

| Endpoint | Method | Baseline p50 | Target p50 | Baseline p95 | Target p95 (Budget) |
|---|---|---|---|---|---|
| `GET /api/v1/health` | GET | 1.1 ms | < 2 ms | 3.2 ms | **< 5 ms** |
| `GET /api/v1/jobs/discover` | GET | 18.5 ms | < 15 ms | 44.2 ms | **< 35 ms** |
| `GET /api/v1/jobs/:id/match` | GET | 12.0 ms | < 10 ms | 28.6 ms | **< 25 ms** |
| `GET /api/v1/applications` | GET | 8.4 ms | < 7 ms | 19.5 ms | **< 18 ms** |
| `POST /api/v1/conversations/:id/messages` | POST | 14.2 ms | < 12 ms | 31.0 ms | **< 25 ms** |
| `GET /api/v1/notifications` | GET | 7.1 ms | < 6 ms | 16.8 ms | **< 15 ms** |
| `POST /api/v1/analytics/events` | POST | 6.5 ms | < 5 ms | 14.0 ms | **< 12 ms** |
| `GET /api/v1/admin/analytics` | GET | 64.0 ms | < 45 ms | 148.0 ms | **< 90 ms** |

---

## 4. API Payload & Compression Budgets

| Endpoint | Raw Baseline | Target Compressed Size | Reduction Target |
|---|---|---|---|
| `GET /api/v1/jobs/discover` (20 items) | ~8.4 kB | **< 2.5 kB** | ≥ 70% transfer reduction |
| `GET /api/v1/admin/analytics` | ~14.2 kB | **< 3.5 kB** | ≥ 75% transfer reduction |
| `GET /api/v1/notifications` (20 items) | ~2.6 kB | **< 1.0 kB** | ≥ 60% transfer reduction |

---

## 5. Database Query Budgets (PostgreSQL + PostGIS)

| Query Category | Metric / Scope | Target p95 Latency | Sequential Scan Policy |
|---|---|---|---|
| **PostGIS ST_DWithin (Spatial Discovery)** | 10,000 candidate dataset | **< 15 ms** | ZERO sequential scans on joined tables |
| **Worker Profile Single Lookup** | Primary Key / Unique ID | **< 3 ms** | Strict Index Scan / Unique Scan |
| **Job Applications by Post** | Bounded limit (20 rows) | **< 8 ms** | Index scan on `(job_post_id, status)` |
| **Messages by Conversation** | Bounded limit (50 rows) | **< 5 ms** | Index scan on `(conversation_id, created_at DESC)` |
| **Admin Aggregations (DAU/MAU)** | Native SQL `COUNT(DISTINCT)` | **< 20 ms** | Index scan on `(last_used_at, revoked_at)` |

---

## 6. Redis Latency & Memory Budgets

| Operation | Current Pattern | Budget / Standard |
|---|---|---|
| **Presence Bulk Fetch (`getUserPresences`)** | N sequential `GET` round trips | **1 atomic `MGET` round trip (< 2 ms)** |
| **Rate Limit Check (`INCR` + `EXPIRE`)** | Atomic pipeline | **< 1.5 ms** |
| **Pub/Sub Dispatch Propagation** | Local Redis instance | **< 5 ms** |
