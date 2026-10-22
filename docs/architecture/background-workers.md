# LocalSaathi Background Worker & Queue Platform Architecture

## 1. Executive Summary

Phase 20 establishes a unified, resilient, and observable background asynchronous job-processing platform for the LocalSaathi hyperlocal service marketplace. LocalSaathi operates under high data integrity constraints: financial transactions, booking milestones, security alerts, and dispute resolutions require durable consistency, while real-time push notifications, voice transcription, multilingual translation, search index synchronizations, and vector embeddings demand high-throughput, non-blocking asynchronous processing.

The platform is built on an **authoritative-storage-first** foundation:
- **PostgreSQL 16 + PostGIS 3.4** remains the single authoritative durable business source of truth.
- The **Transactional Outbox Pattern** ensures zero message loss between business database mutations and event publications.
- **Redis 7.2 (ioredis) + BullMQ 5.34.4** serves as the distributed asynchronous queue orchestration infrastructure.
- Delivery guarantee: **At-least-once delivery** paired with **idempotent handlers** enforced at both the Redis memory cache and PostgreSQL database constraint layers.

```
+-------------------------------------------------------------------------------+
|                       LocalSaathi Dual-Engine Architecture                    |
+-------------------------------------------------------------------------------+
|                                                                               |
|   HTTP Mutation Request (API)                                                 |
|         |                                                                     |
|         v                                                                     |
|   +-------------------------------------------------------+                   |
|   | PostgreSQL 16 Transaction                              |                   |
|   | 1. Domain Entities (Booking, Payment, Job, User)      |                   |
|   | 2. Domain Events (Transactional Outbox Table)         |                   |
|   +-------------------------------------------------------+                   |
|         | (Durable Commit)                                                    |
|         v                                                                     |
|   Outbox Poller / Publisher Loop (Transactional Poller)                       |
|         |                                                                     |
|         +------------------------+------------------------+                   |
|         |                        |                        |                   |
|         v                        v                        v                   |
|   Redis Pub/Sub (Live)    In-App DB Updates     BullMQ Producer (QueueService)|
|         |                                                 |                   |
|         v                                                 v                   |
|   WebSocket Gateway                              Redis 7.2 Queue Streams      |
|   (Instant UI Broadcast)                                  |                   |
|                                                           v                   |
|                                                  Worker Process (Bootstrap)   |
|                                                  - Isolated Worker Handlers   |
|                                                  - Idempotency Locks          |
|                                                  - Dead-Letter Queue (DLQ)    |
|                                                  - Distributed Mutex Cron     |
+-------------------------------------------------------------------------------+
```

---

## 2. Universal Job Contract & Payload Validation

Every background job is wrapped in an immutable, strongly-typed envelope schema before being enqueued. Unvalidated, malformed, or ambiguous payloads are rejected at the producer boundary before entering Redis.

### 2.1 JobContract Envelope (`@localsaathi/types`)

```typescript
export interface JobContract<T = Record<string, unknown>> {
  jobName: string;            // Descriptive identifier (e.g. 'send-notification')
  schemaVersion: number;      // Contract version for zero-downtime schema evolution
  jobId: string;              // Deterministic or UUID job identifier
  correlationId?: string;     // Distributed trace ID spanning HTTP -> Outbox -> Worker
  payload: T;                 // Strongly-typed queue-specific payload
  createdAt: string;          // ISO 8601 creation timestamp
  attemptCount: number;       // Execution attempt count
  priority: JobPriority;      // Scheduling priority (CRITICAL=1, HIGH=2, NORMAL=5, LOW=10)
  idempotencyKey: string;     // Deduplication key
  sourceEventId?: string;     // Originating domain/outbox event ID
}
```

### 2.2 Zod Validation at Producer and Consumer Boundaries

Every queue has a designated Zod schema registered in `@localsaathi/validation` (`packages/validation/src/queue.schema.ts`):
1. **Producer-Side Validation**: `QueueService.enqueueJob()` validates incoming payloads against `getPayloadSchemaForQueue(queueName)`. If validation fails, a `ZodError` is thrown immediately, preventing invalid tasks from entering Redis.
2. **Consumer-Side Validation**: `BaseJobHandler.execute()` re-validates the incoming job payload before executing business logic. If an unexpected format is received, the job is classified as `VALIDATION_FAILED`, routed immediately to the Dead-Letter Queue (DLQ), and marked as `UnrecoverableError` in BullMQ to prevent wasteful retry storms.

---

## 3. Idempotency Architecture (At-Least-Once Delivery)

Because networks, worker processes, and message brokers can fail during transit, LocalSaathi implements an **At-Least-Once Delivery + Idempotent Handlers** architecture across two defensive tiers:

### Tier 1: Redis Distributed Idempotency Locks
Before executing any business logic, `BaseJobHandler` acquires an idempotency lock in Redis:
- **Lock Key**: `idempotency:worker:{queueName}:{idempotencyKey}`
- **Operation**: `SET {key} "IN_PROGRESS" EX 86400 NX` (Atomic set with 24-hour expiration)
- If key already exists with `"COMPLETED"`, the handler logs an idempotent skip and completes cleanly.
- If key already exists with `"IN_PROGRESS"`, the handler yields or rejects to avoid race conditions.
- Upon successful execution, the lock key is updated: `SET {key} "COMPLETED" EX 86400`.

### Tier 2: PostgreSQL Database Unique Constraints
If a Redis cache eviction or failure occurs, database-level unique constraints protect data integrity:
- **Notifications**: `@@unique([sourceEventId, recipientId])` ensures notifications are never duplicated for the same underlying domain event.
- **Analytics Events**: `@@unique([eventId])` ensures analytics events are never double-counted.
- **Search Indices**: Upserts rely on entity primary keys (`jobId`, `workerId`).

---

## 4. Failure Classification & Error Taxonomy

To prevent retry amplification attacks and cascading worker exhaustion, job errors are systematically classified into structured categories:

| Category | Typical Causes | Action / Policy |
| :--- | :--- | :--- |
| `TRANSIENT_NETWORK` | Redis socket blip, database connection pool exhaustion, transient DNS failure | Exponential backoff retry with jitter (`1s`, `2s`, `4s`...) |
| `PROVIDER_OUTAGE` | Third-party SMS gateway 503, Razorpay API rate limit, AI embedding endpoint error | Backoff retry up to queue limit, then route to DLQ |
| `TIMEOUT` | Long-running image processing, voice transcription exceeding bounds | Abort job via `AbortController`, backoff retry once |
| `VALIDATION_FAILED` | Corrupted JSON payload, missing required UUID, schema mismatch | **Fatal**: Throw `UnrecoverableError`, route to DLQ immediately |
| `BUSINESS_REJECTED` | Unverified antivirus scan, missing user identity, revoked permissions | **Fatal**: Throw `UnrecoverableError`, route to DLQ immediately |
| `FATAL_SYSTEM` | Missing database table, programming assertion violation | Route to DLQ, trigger PagerDuty alert |

---

## 5. Dead-Letter Queue (DLQ) Architecture

Failed jobs that have exhausted all retry attempts, or suffered unrecoverable validation/business errors, are captured by the `DeadLetterQueueService`:

1. **Secret & PII Sanitization**:
   Before persisting failure metadata, sensitive values (`otpCode`, `password`, `token`, `authorization`, `secret`, `creditCard`) are automatically scrubbed and replaced with `"[REDACTED]"`.
2. **Storage Topology**:
   - Primary: Stored in Redis Sorted Sets and Hashes (`dlq:{queueName}:jobs` and `dlq:job:{dlqId}`) with a 30-day retention TTL.
   - Audit Trail: Recorded in system audit logs for administrative inspection.
3. **Admin Operations**:
   The admin portal exposes endpoints to list, inspect sanitized payloads, purge, or replay DLQ records back into their primary queues once root causes are resolved.

---

## 6. Distributed Scheduled Jobs Engine

Periodic maintenance tasks (cleanup, reconciliation, retention enforcement) require distributed coordination to ensure they execute **exactly once across multi-instance worker deployments**.

- **Mutex Leases**: Implemented via Redis `SET {lockKey} {nodeId} NX PX {ttl}`.
- **Job Interval Evaluation**: `ScheduledJobsManager` manages intervals for:
  - `hourly-payment-reconciliation`: Runs every 60 minutes with a 15-minute distributed lease.
  - `daily-cleanup-notifications`: Prunes expired in-app notifications daily at 02:00 UTC.
  - `daily-cleanup-analytics`: Enforces 90-day retention policies on analytics events daily.
  - `daily-cleanup-sessions`: Cleans up revoked/expired authentication sessions.
  - `weekly-dlq-pruning`: Purges dead-letter records older than 30 days.

---

## 7. Graceful Shutdown & Lifecycle Management

Worker processes must terminate cleanly without losing in-flight jobs during rolling deployments or container restarts:

1. **Signal Interception**: Workers listen to `SIGTERM` and `SIGINT`.
2. **Queue Pause**: Immediately pauses incoming job acceptance on all 12 BullMQ worker instances.
3. **In-Flight Job Draining**: Awaits currently active jobs up to a bounded timeout (30 seconds).
4. **Connection Teardown**: Closes Redis connections and database connection pools cleanly.
5. **Zero Zombie Workers**: Guarantees no lock leaks or corrupted worker state in Redis.
