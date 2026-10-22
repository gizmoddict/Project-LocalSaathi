# LocalSaathi — Phase 22 Reliability & Resilience Architecture

## 1. Architectural Philosophy

The LocalSaathi Reliability and Resilience layer is designed according to core distributed systems principles:
1. **Fail Fast When Appropriate:** Never allow failing external systems to consume local resources indefinitely.
2. **Retry Only Safe Operations:** Differentiate strictly between idempotent/transient failures and deterministic/business errors.
3. **Exponential Backoff with Full Jitter:** Prevent thundering herds and lockstep resonance during downstream recovery.
4. **Bounded Blast Radius:** Isolate failure in non-critical components so the primary booking and matching engine functions uninterrupted.
5. **Preserve Truth Over Speed:** The PostgreSQL database is the single authoritative source of truth. External caches, queues, and providers are supplementary.

```
                    +-------------------------------------------------------------+
                    |                      Client Requests                        |
                    +-------------------------------------------------------------+
                                                   |
                                                   v
                         +-----------------------------------+
                         |    Resilience Rate Limiter        |
                         | (Redis Primary -> In-Memory Fall) |
                         +-----------------------------------+
                                                   |
                                                   v
                         +-----------------------------------+
                         |      Bounded Timeout Guard        |
                         |   (withTimeout: DB/Redis/HTTP)    |
                         +-----------------------------------+
                                                   |
                         +-------------------------+-------------------------+
                         |                                                   |
                         v                                                   v
      +-------------------------------------+             +-------------------------------------+
      |      Postgres Resilience Service    |             |       Circuit Breaker Registry      |
      | - 5000ms Bounded Timeout            |             | - Razorpay / SMS / Push / Email     |
      | - Deadlock / Serialization Retry    |             | - CLOSED -> OPEN -> HALF_OPEN       |
      | - Non-retryable Error Rejection     |             | - Probe Concurrency Limiter         |
      +-------------------------------------+             +-------------------------------------+
                         |                                                   |
                         v                                                   v
      +-------------------------------------+             +-------------------------------------+
      |        PostgreSQL Database          |             |       External Downstream APIs      |
      |   (Authoritative Source of Truth)   |             |   (Razorpay, Twilio, Firebase, etc) |
      +-------------------------------------+             +-------------------------------------+
```

---

## 2. Core Resilience Components

### 2.1 Centralized Error Classification (`RetryClassifier`)
Errors across network, database, and HTTP layers are mapped into three deterministic classifications:
* `RETRYABLE`: Transient network errors (`ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`), HTTP transient codes (`408`, `429`, `502`, `503`, `504`), and PostgreSQL concurrency errors (`40P01` deadlock, `40001` serialization failure, `P2034` Prisma transaction conflict).
* `NON_RETRYABLE`: Client errors (`400`, `401`, `403`, `404`, `409`, `422`), PostgreSQL constraint violations (`23505` unique key violation, `23503` foreign key violation), validation failures (`ZodError`), and business invariant rejections.
* `UNKNOWN`: Unrecognized exceptions, defaulted to non-retryable to prevent uncontrolled retry storms.

### 2.2 Bounded Retry Policy (`RetryPolicy`)
* **Algorithm:** Exponential backoff with full jitter:
  $$\text{delay} = \min(\text{maxDelay}, \text{initialDelay} \times \text{factor}^{\text{attempt} - 1})$$
  $$\text{jitteredDelay} = \text{delay} \times (1 \pm \text{jitterPercent} \times \text{rand}(-1, 1))$$
* **Configuration Defaults:**
  - `RETRY_MAX_ATTEMPTS`: 3
  - `RETRY_INITIAL_DELAY_MS`: 100ms
  - `RETRY_MAX_DELAY_MS`: 3000ms
  - `RETRY_JITTER_PERCENT`: 0.20 (20%)
* **Abort Signal Support:** Integrated with `AbortSignal` to cancel pending retries immediately upon request cancellation or timeout.

### 2.3 Centralized Bounded Timeouts (`withTimeout`)
All asynchronous I/O operations are strictly bounded to prevent thread and socket leaks:
* `DB_OPERATION_TIMEOUT_MS`: 5000ms
* `REDIS_OPERATION_TIMEOUT_MS`: 1500ms
* `EXTERNAL_HTTP_TIMEOUT_MS`: 10000ms
* `PAYMENT_PROVIDER_TIMEOUT_MS`: 8000ms
* `NOTIFICATION_PROVIDER_TIMEOUT_MS`: 5000ms
* **Implementation Safety:** Timer instances are explicitly cleared via `try/finally` blocks and set with `unref()` to avoid keeping Node.js event loops alive during shutdown.

### 2.4 Production Circuit Breakers (`CircuitBreaker` & `CircuitBreakerRegistry`)
Named circuit breakers isolate all external upstream dependencies without wrapping internal PostgreSQL operations:
* **Managed Providers:**
  1. `PAYMENT_PROVIDER` (Razorpay)
  2. `NOTIFICATION_PROVIDER` (FCM)
  3. `SMS_PROVIDER` (Twilio / MSG91)
  4. `EMAIL_PROVIDER` (SES / Resend)
  5. `TRANSLATION_PROVIDER`
  6. `VOICE_PROVIDER`
  7. `EMBEDDING_PROVIDER`
  8. `SEARCH_INDEX` (OpenSearch)
* **State Machine:**
  - `CLOSED`: Normal traffic. Failures are recorded within a rolling window (`CB_ROLLING_WINDOW_MS = 60000ms`).
  - `OPEN`: Tripped after `CB_FAILURE_THRESHOLD = 5` consecutive or windowed failures. Incoming requests are rejected instantly (0ms latency penalty) or directed to a non-blocking fallback.
  - `HALF_OPEN`: Entered after `CB_OPEN_DURATION_MS = 30000ms`. Allows a strictly bounded number of test probes (`CB_HALF_OPEN_PROBES = 2`). If probes succeed, state resets to `CLOSED`; if any probe fails, state immediately reverts to `OPEN`.

---

## 3. Subsystem Resilience Policies

### 3.1 Payment Gateway Resilience
* **Idempotency Guarantee:** All payment creation, capture, and refund requests use deterministic idempotency keys (`idempotency_key = orderId:attempt`).
* **Uncertain State Preservation:** In the event of a timeout or 504 Gateway Timeout during payment capture, the system preserves the payment in `PENDING_RECONCILIATION`. Under NO circumstances is an unconfirmed payment marked `FAILED` or charged a second time without reconciliation verification.

### 3.2 Redis Graceful Degradation
* **Cache Read Fallback:** Cache read failures or timeouts (>1500ms) log a warning, increment `fallback_total`, and read directly from PostgreSQL without failing the user request.
* **Rate Limiter Fallback (`ResilienceRateLimiter`):** When Redis is down, an in-memory sliding window rate limiter protects critical routes (OTP, Login, Payments) from abuse, preventing both total denial of service and unprotected vulnerability.
* **Distributed Locks:** Redis lock releases are protected in `try/finally` blocks and bounded with TTLs to prevent abandoned locks.

### 3.3 Database Resilience (`PostgresResilienceService`)
* **Transaction Deadlock Recovery:** Retries deadlocks (`40P01`) and serialization conflicts (`40001`/`P2034`) up to 3 times with exponential backoff.
* **Pool Exhaustion Protection:** Monitors active connections and query execution latency; raises `503 Service Unavailable` with `POOL_TIMEOUT` before hanging processes.
* **Deterministic Failures:** Immediately rejects duplicate keys (`23505`) and constraint violations without retrying.

### 3.4 Outbox & Queue Resilience
* **Stale Event Lease Recovery:** The outbox poller runs a scheduled recovery query (`recoverStaleEvents`) that detects events in `PROCESSING` status older than 300 seconds, resetting them to `PENDING` with incremented attempt counts.
* **Dead Letter Queue (DLQ):** Non-retryable worker job errors or jobs exceeding maximum retry attempts are routed immediately to the DLQ with structured failure metadata.

### 3.5 Bounded Graceful Shutdown
* Both `apps/api` and `apps/worker` intercept `SIGTERM` and `SIGINT`.
* Sets a hard termination deadline (`GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10000ms`).
* Sequence:
  1. Stop accepting new HTTP requests.
  2. Pause BullMQ queue workers.
  3. Drain active worker jobs and in-flight transactions.
  4. Close Redis and PostgreSQL connection pools.
  5. Exit with status 0.

---

## 4. Observability & Telemetry Integration

The resilience layer reports 17 low-cardinality metrics to the Prometheus/OpenTelemetry registry:
* `retry_attempts_total{operation, dependency}`
* `retry_exhausted_total{operation, dependency}`
* `retry_delay_ms{operation, dependency}`
* `timeout_total{operation, dependency}`
* `circuit_breaker_state{breaker_name}`
* `circuit_breaker_open_total{breaker_name}`
* `circuit_breaker_half_open_total{breaker_name}`
* `circuit_breaker_rejected_total{breaker_name}`
* `fallback_total{operation, dependency}`
* `degraded_mode_active{subsystem}`
* `db_pool_waiting_requests`
* `db_pool_timeouts_total`
* `reconnect_attempts_total{dependency}`
* `dlq_routed_total{queue_name}`
* `stale_outbox_events_recovered_total`
* `graceful_shutdown_duration_ms`
* `graceful_shutdown_forced_total`

All metrics avoid unbounded labels (e.g., user IDs, order IDs, or raw URLs) to guarantee strict cardinality safety.
