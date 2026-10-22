# LocalSaathi — Background Workers & Queue Subsystem Pre-Implementation Audit

**Phase:** Phase 20 — Background Worker & Queue Platform  
**Date:** October 6, 2026  
**Status:** COMPLETE AUDIT  
**Author:** Antigravity Performance & Architecture Team  

---

## 1. Executive Summary

This pre-implementation audit inspects all asynchronous execution patterns, background processing, transactional outbox handlers, scheduled/cron operations, and third-party provider calls across the LocalSaathi platform (Phases 1–19).

Prior to Phase 20, asynchronous tasks relied primarily on two disparate execution paths:
1. **The Transactional Outbox Polling Loop** (`OutboxProcessor` inside the API process using an interval timer of 2,000ms and PostgreSQL `FOR UPDATE SKIP LOCKED` row-claiming).
2. **Synchronous or Fire-and-Forget Request-Path Execution** (such as synchronous Antivirus scanning in avatar uploads, synchronous payment reconciliation via admin endpoints, synchronous notification generation inside HTTP transaction handlers, and in-process WebSocket dispatching).

This audit catalogs existing async operations, identifies current failure behaviors, pinpoints missing queues and architectural bottlenecks, and defines the unified Redis/BullMQ queue architecture that will bridge the transactional outbox with dedicated background worker execution.

---

## 2. Existing Asynchronous Operations Catalog

| Domain / Subsystem | Current Execution Mechanism | Failure Behavior | Concurrency / Backpressure | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **Transactional Outbox Polling** | `setInterval(2000)` in `OutboxProcessor` running directly inside the NestJS API process. | Retries up to 3 times in PostgreSQL; moves to `DEAD_LETTER` state if max retries exceeded or error is non-retryable. | Single-threaded batch claiming per API instance; competes for Node.js event loop with user traffic. | **HIGH**: Long-running handler tasks delay HTTP request throughput. |
| **Notification Dispatch (In-App)** | Synchronous PostgreSQL row creation within `NotificationHandler` during outbox poll, plus direct in-process WebSocket dispatch. | If socket dispatch throws, logged and skipped. If DB write fails, outbox retry kicks in. | Unbounded; synchronous database calls per notification recipient. | **MEDIUM**: Large broadcast notifications (e.g. 50 candidate matches) block outbox processing. |
| **Notification Cleanup** | Synchronous HTTP POST endpoint (`/api/v1/notifications/cleanup-expired`). | If endpoint fails or times out, old notifications remain unpruned. | Zero automation; relies on external cron hitting HTTP endpoints. | **MEDIUM**: Stale data builds up unless manually triggered. |
| **Analytics Event Ingestion** | In-process queue / database batch insert via `AnalyticsService.recordServerEvent()`. | Batch insert retry; failures logged without persistent queue buffer. | Bounded batch sizes, but executed on API runtime resources. | **MEDIUM**: Telemetry spikes compete with core transaction compute. |
| **Analytics Retention Cleanup** | Synchronous service method `AnalyticsService.pruneOldEvents()`. | Manual admin endpoint invocation; transaction lock contention if large row count. | No rate limiting; risks table lock on `analytics_events`. | **HIGH**: Can degrade transactional queries during heavy prune. |
| **Search Indexing (OpenSearch)** | Placeholder in `SearchIndexHandler` (logs message; no real indexing worker). | Silently drops document sync if not fully connected. | No queuing or version-aware throttling. | **CRITICAL**: Outbox completes without durable search synchronization. |
| **Payment Reconciliation** | Synchronous HTTP GET endpoint `/admin/payments/reconcile` running `ReconciliationService.runReconciliation()`. | Throws HTTP 500 or timeout if external provider / DB is slow. | Single HTTP request thread; checks up to 100 payments sequentially. | **HIGH**: Long HTTP request subject to proxy timeouts; no automatic periodic schedule. |
| **Avatar / Profile Image Upload** | Synchronous ClamAV antivirus buffer scanning + local filesystem write in `ProfileImageStorageService`. | Returns HTTP 400/500 to user if scanning or saving fails. | Blocked HTTP request until file is inspected and written to disk. | **HIGH**: Large image uploads consume API thread and bandwidth. No resizing/derivatives queue. |
| **Cache Invalidation** | Outbox event handler `CacheInvalidationHandler` calling Redis `delPattern` via `SCAN`. | Catches error and logs; does not block outbox event completion. | Sequential `SCAN` over Redis per event. | **LOW**: Non-blocking, but runs in API event loop. |
| **User Presence Updates** | Fire-and-forget promise in WebSocket gateway (`.catch(() => undefined)`). | Unhandled rejections silently swallowed; DB update discarded. | Unbounded parallel promises during mass disconnects. | **LOW**: Non-critical transient state. |

---

## 3. Current Architectural Limitations & Risks

### 3.1 Monolithic Process Contention (API + Background Work)
The `OutboxProcessor` currently executes directly inside `@localsaathi/api`. When background tasks perform I/O-intensive or compute-intensive workloads (such as ClamAV scanning, batch notification fanout, or heavy aggregation calculations), they compete with the NestJS HTTP request/response thread pool for CPU cycles, PostgreSQL connection pool slots, and memory.

### 3.2 Lack of Distributed Scheduling
Scheduled jobs—such as payment reconciliation, expired notification purging, and analytics retention pruning—are currently implemented as HTTP controller methods. There is no distributed scheduler with distributed locking (`SET NX`), meaning running multiple API instances would either:
- Cause duplicate concurrent cron executions (if cron triggers are fired per instance), or
- Require external unauthenticated crons hitting HTTP endpoints.

### 3.3 No Dedicated Dead-Letter Queue (DLQ) Operational Subsystem
While the `Transactional Outbox` in PostgreSQL stores `DEAD_LETTER` status for failed domain events, there is no dedicated BullMQ/Redis DLQ with exponential backoff jitter, inspection interfaces, replay capabilities, or alerting metadata.

### 3.4 Missing Media & AI Pipelines
Image thumbnails, WebP transcoding, audio transcription for voice search (`VOICE_SEARCH_USED`), translation for multilingual job postings, and embedding vector generation are currently stubbed or performed synchronously without backpressure control or provider timeout bounds.

---

## 4. Proposed Phase 20 Queue Topology

To solve these deficiencies, Phase 20 establishes a centralized queue platform hosted in `@localsaathi/worker` using BullMQ and Redis 7.2, tightly integrated with the PostgreSQL Transactional Outbox.

### 4.1 Queue Architecture & Flow

```
+-----------------------------------------------------------------------------------+
|                            PostgreSQL 16 (Source of Truth)                       |
|   1. Domain Business Mutation (Job, Booking, Payment, Moderation, User)           |
|   2. Atomic Write to `outbox_events` Table (Within the Same Transaction)          |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        Outbox Publisher Service (API / Relay)                     |
|   - Claims batches via `FOR UPDATE SKIP LOCKED`                                   |
|   - Enqueues typed, schema-validated jobs into Redis BullMQ Queues                |
|   - Marks outbox event as `PUBLISHED` only after queue acknowledgement            |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                               Redis 7.2 (BullMQ Queues)                           |
|   - Typed Job Contract (Idempotency Key, Correlation ID, Schema Version, Payload) |
|   - Backpressure, Rate Limiting & Priority Partitioning                           |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                      LocalSaathi Worker Process (@localsaathi/worker)             |
|   - Dedicated Process Isolated from HTTP Traffic                                  |
|   - Concurrency Bounds per Queue (CPU vs I/O vs Provider-limited)                 |
|   - Dual-Layer Idempotency Check (Redis Sentinel + DB Unique Constraints)         |
|   - Graceful Signal Handling (SIGINT / SIGTERM)                                   |
|   - Exponential Backoff with Jitter & DLQ Routing                                 |
+-----------------------------------------------------------------------------------+
```

### 4.2 Queue Catalog & Operational Classification

1. **`notifications-queue`**: In-app notifications, push notifications, and template resolution. (Priority: HIGH/MEDIUM, Concurrency: 10, Timeout: 15s).
2. **`sms-otp-queue`**: High-priority SMS delivery and OTP notifications. (Priority: HIGH, Concurrency: 5, Rate-limited: 20 ops/sec, Timeout: 10s).
3. **`email-queue`**: Transactional emails (booking receipts, disputes, verification notices). (Priority: MEDIUM, Concurrency: 5, Timeout: 20s).
4. **`analytics-queue`**: Asynchronous batch buffering of product analytics and user telemetry events. (Priority: LOW, Concurrency: 20, Timeout: 10s).
5. **`search-index-queue`**: Incremental OpenSearch document indexing for jobs and worker profiles. (Priority: MEDIUM, Concurrency: 5, Timeout: 15s).
6. **`payment-reconciliation-queue`**: Automated periodic audit and reconciliation of payment statuses with Razorpay/Mock provider. (Priority: HIGH, Concurrency: 2, Timeout: 45s).
7. **`image-processing-queue`**: Asynchronous thumbnail generation, WebP optimization, and avatar derivative processing following Phase 17 antivirus quarantine. (Priority: LOW, Concurrency: 3 [CPU-bound], Timeout: 30s).
8. **`voice-transcription-queue`**: Audio processing, transcription, and speech-to-text indexing. (Priority: LOW, Concurrency: 2, Timeout: 60s).
9. **`translation-queue`**: Multilingual job posting and profile localization. (Priority: LOW, Concurrency: 3, Timeout: 20s).
10. **`embeddings-queue`**: Vector generation for semantic worker-job matching and recommendation candidates. (Priority: LOW, Concurrency: 2, Timeout: 30s).
11. **`cleanup-queue`**: Periodic scheduled data pruning (expired notifications, old analytics events, stale tokens, and aged DLQ jobs). (Priority: LOW, Concurrency: 1, Timeout: 120s, Distributed Mutex Protected).

---

## 5. Migration & Backwards Compatibility Impact

1. **No Breaking Schema Changes**: PostgreSQL remains the durable source of truth; existing database models and foreign key constraints remain unmodified.
2. **Zero Outbox Replacement**: The existing `outbox_events` and `event_processing` tables remain the foundational source for event production. The outbox relay is enhanced to dispatch to Redis queues rather than executing heavy consumer logic synchronously in the API poll loop.
3. **Graceful Fallback**: If Redis or `@localsaathi/worker` is offline, outbox events remain safely persisted in PostgreSQL until worker recovery.
4. **Independent Scalability**: The worker process can be scaled horizontally and independently from the API server without impacting user-facing latency.

---

*Audit completed and certified for Phase 20 implementation.*
