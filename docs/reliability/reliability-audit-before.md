# LocalSaathi — Phase 22 Reliability Audit (Before Hardening)

## 1. Executive Summary

Prior to Phase 22, LocalSaathi possessed production-grade observability (Phase 21), background processing with BullMQ and transactional outbox (Phase 20), distributed Redis caching (Phase 19), performance optimizations (Phase 18), and security hardening (Phase 17). However, an adversarial failure-mode audit revealed systemic resilience vulnerabilities under degraded network conditions, dependency outages, resource exhaustion, and concurrency edge cases.

This audit establishes the baseline vulnerabilities identified across the monorepo and informs the architecture designed and implemented in Phase 22.

---

## 2. Identified Vulnerabilities & Systemic Gaps

### 2.1 Unbounded or Inconsistent Timeouts
* **Vulnerability:** External HTTP calls, Redis operations, and certain database queries lacked strict timeout boundaries or relied on arbitrary default timeouts (e.g., Axios/fetch defaults of 0 or 60+ seconds).
* **Impact:** In the event of an upstream stall (e.g., payment gateway hanging on request processing or a network blackhole), worker threads and connection pools remained blocked indefinitely, leading to thread pool starvation, port exhaustion, and cascading request backlogs.
* **Blast Radius:** Single slow external dependency could cascade into API gateway unavailability.

### 2.2 Uncontrolled Retries & Risk of Retry Storms
* **Vulnerability:** Retry logic across different modules was ad-hoc, with some calling loops lacking jitter or exponential backoff, and others attempting retries on non-transient errors (e.g., HTTP 400 Bad Request or PostgreSQL unique constraint violations `23505`).
* **Impact:** During transient outages of downstream services (such as SMS or payment providers), hundreds of incoming user requests retrying simultaneously on fixed intervals create lockstep harmonic spikes ("retry storms"), amplifying pressure on struggling downstream dependencies and causing self-inflicted denial of service.

### 2.3 Absence of Circuit Breakers for External Integrations
* **Vulnerability:** Third-party provider calls (Razorpay, SMS, Email, Push Notifications, AI translation) lacked automated failure breakers.
* **Impact:** When an external provider returned 503 or experienced complete degradation, every client request continued attempting remote HTTP roundtrips until timing out, consuming local connections, worker pools, and memory.
* **Blast Radius:** Third-party downtime caused severe degradation of core application paths.

### 2.4 Ambiguous Payment State Handling Under Timeout
* **Vulnerability:** If a payment capture or verification call timed out, some flows risked marking the payment as `FAILED` or triggering duplicate charge attempts.
* **Impact:** Double debits or false failure notifications. In financial workflows, an unanswered HTTP response does *not* indicate transaction failure (`UNKNOWN PAYMENT STATE ≠ PAYMENT FAILED`).
* **Remediation Requirement:** Maintain `PENDING_RECONCILIATION` state, never mark `FAILED` purely due to network timeouts, and reconcile via webhook or scheduled verification.

### 2.5 Redis Dependency Coupling & Rate Limiter Fail-Open Risks
* **Vulnerability:** If Redis went down or timed out, rate limiters on sensitive endpoints (OTP sending, user authentication, payment initiation) could fail completely or crash the request pipeline.
* **Impact:** Complete Redis downtime threatened either total API lockout (failing closed) or uncontrolled abuse vulnerability (failing open).
* **Remediation Requirement:** Redis cache must degrade gracefully to PostgreSQL; rate limiting on sensitive routes must fall back to an in-memory sliding window limiter to prevent abuse during Redis outages.

### 2.6 PostgreSQL Concurrency Hazards (Deadlocks & Serialization)
* **Vulnerability:** High-concurrency operations (such as simultaneous job applications, booking status transitions, and wallet updates) occasionally triggered transient database deadlocks (`40P01`) or serialization errors (`40001`/`P2034`). Without automated retry wrappers, these transient concurrency errors bubbled up as user-facing 500 errors.
* **Remediation Requirement:** Automated transient deadlock retry with backoff, while strictly rejecting deterministic business errors (e.g., unique key conflicts, foreign key violations) without pointless retries.

### 2.7 Worker Crashes & Stale Outbox Event Orphanage
* **Vulnerability:** If a worker node crashed while processing an outbox event marked `PROCESSING`, the event remained indefinitely locked unless manually intervened.
* **Impact:** Silent message dropping and unfulfilled notifications or analytics ingestion.
* **Remediation Requirement:** Automated stale event reclamation routine that detects abandoned locks (`now - lockedAt > maxStaleAgeSeconds`) and returns them to `PENDING` with incremented retry attempts.

### 2.8 Unbounded Graceful Shutdown
* **Vulnerability:** Process shutdown handlers lacked bounded execution timeouts.
* **Impact:** Long-running active connections or stuck background promises could hang process termination indefinitely during Kubernetes pod evictions or rolling deployments.
* **Remediation Requirement:** Enforce `GRACEFUL_SHUTDOWN_TIMEOUT_MS` (10s) with active connection draining, queue pausing, and deterministic exit.

---

## 3. Resilience Classification Matrix (Pre-Hardening)

| Subsystem | Failure Behavior (Pre-Phase 22) | Target State (Phase 22) |
|---|---|---|
| **PostgreSQL Queries** | Unbounded timeout risk, deadlocks fail with 500 | 5000ms query timeout, automatic transient deadlock retry |
| **Redis Cache** | Potential request failure on timeout | 1500ms timeout, seamless fallback to PostgreSQL |
| **Sensitive Rate Limits** | Total failure or unguarded if Redis down | Local in-memory sliding window fallback |
| **Payment Provider** | Timeout risks duplicate charges or false `FAILED` | 8000ms timeout, Circuit Breaker, `PENDING_RECONCILIATION` preservation |
| **SMS/Notification** | Repeated attempts hammer failing provider | 5000ms timeout, Circuit Breaker, unrecoverable to DLQ |
| **Outbox Processor** | Worker crash permanently locks event in `PROCESSING` | Automated lease expiration & stale event reclamation |
| **API Process Shutdown** | Potential hang on pod eviction | Bounded shutdown timer (`GRACEFUL_SHUTDOWN_TIMEOUT_MS`) |

---

## 4. Conclusion

Phase 22 addresses every vulnerability identified above with centralized, production-grade resilience primitives that guarantee bounded blast radiuses, predictable degradation, and self-healing recovery across the LocalSaathi platform.
