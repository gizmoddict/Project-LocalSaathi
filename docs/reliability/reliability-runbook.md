# LocalSaathi — Phase 22 Incident Response & Reliability Runbook

## 1. Overview & On-Call Philosophy

This runbook guides on-call engineers responding to degraded dependencies, tripped circuit breakers, retry spikes, queue backlogs, or unexpected system behavior across LocalSaathi production environments.

**Core Directives:**
* **Observe Before Acting:** Check the Admin System Health Dashboard (`/admin/system-health`) and Prometheus metrics (`/metrics`).
* **Do Not Restart PostgreSQL Indiscriminately:** Allow pool timeouts and bounded retries to resolve transient concurrency contention.
* **Respect Circuit Breaker Autonomy:** Circuit breakers will self-heal through `HALF_OPEN` probes; manual intervention is only necessary if upstream credentials or URLs have changed.
* **Protect Payment Integrity:** Never manually force a payment to `FAILED` without confirming status in the Razorpay dashboard.

---

## 2. Standard Triage Checklist

```
+-------------------------------------------------------------+
| 1. Check /health/reliability and /admin/system-health       |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 2. Are any Circuit Breakers OPEN?                           |
|    - Yes -> Check Section 3.1                               |
|    - No  -> Proceed to Step 3                               |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 3. Are PostgreSQL Pool Waiters > 0 or Timeouts spiking?     |
|    - Yes -> Check Section 3.2                               |
|    - No  -> Proceed to Step 4                               |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 4. Is Redis Cache fallback active (fallback_total > 0)?     |
|    - Yes -> Check Section 3.3                               |
|    - No  -> Proceed to Step 5                               |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 5. Are DLQ queues or Stale Outbox Events accumulating?      |
|    - Yes -> Check Section 3.4 & 3.5                         |
+-------------------------------------------------------------+
```

---

## 3. Playbooks by Alert Scenario

### 3.1 Alert: Circuit Breaker Tripped (`circuit_breaker_open_total` Spike)
* **Symptom:** Upstream provider breaker (`PAYMENT_PROVIDER`, `SMS_PROVIDER`, etc.) is in `OPEN` state. Downstream requests fail fast.
* **Diagnosis:**
  1. Inspect `/health/reliability` to identify which breaker is `OPEN`.
  2. Inspect provider status page (e.g., status.razorpay.com, status.twilio.com).
  3. Verify API credentials, rate limits, and network egress connectivity.
* **Mitigation:**
  - If upstream is experiencing a known outage, wait for upstream resolution. The circuit breaker will transition to `HALF_OPEN` automatically and self-heal when probes succeed.
  - If upstream requires manual intervention (e.g., renewed API key), update environment secret and perform rolling restart of API pods.

### 3.2 Alert: Database Pool Exhaustion (`db_pool_waiting_requests > 5`)
* **Symptom:** Query latency spikes, `timeout_total` for database operations increases, HTTP 504 responses served.
* **Diagnosis:**
  1. Check PostgreSQL active connections:
     ```sql
     SELECT count(*), state FROM pg_stat_activity GROUP BY state;
     ```
  2. Identify slow or blocking queries:
     ```sql
     SELECT pid, query_start, now() - query_start AS duration, query 
     FROM pg_stat_activity 
     WHERE state != 'idle' ORDER BY duration DESC LIMIT 5;
     ```
* **Mitigation:**
  - Cancel runaway blocking query:
     ```sql
     SELECT pg_cancel_backend(<pid>);
     ```
  - Verify if Prisma connection pool size (`DATABASE_URL?connection_limit=X`) matches pod replica count and DB instance limits.

### 3.3 Alert: Redis Unavailable / High Fallback Rate (`fallback_total` Spike)
* **Symptom:** API logs report `Redis operation timed out. Falling back to direct database query.`
* **Diagnosis:**
  1. Check Redis process status:
     ```bash
     redis-cli ping
     ```
  2. Check memory usage:
     ```bash
     redis-cli info memory
     ```
* **Mitigation:**
  - The system is operating in safe degraded mode: database reads serve traffic and in-memory rate limiting protects sensitive endpoints.
  - If Redis crashed due to OOM, increase memory limit or adjust eviction policy to `allkeys-lru`.
  - Restart Redis container/service; clients will auto-reconnect and resume caching without restarting API pods.

### 3.4 Alert: Dead Letter Queue (DLQ) Growth (`dlq_routed_total > 0`)
* **Symptom:** Background jobs have exhausted maximum retry attempts and routed to DLQ.
* **Diagnosis:**
  1. Inspect failed job details in Redis BullMQ DLQ:
     ```bash
     node scripts/inspect-dlq.js
     ```
  2. Check failure reason: payload validation error, invalid phone number, or malformed data.
* **Mitigation:**
  - If failure is due to malformed payload (poison pill), do NOT re-enqueue blindly. Fix the producer schema.
  - If failure was caused by transient third-party outage that has resolved, run the retry DLQ script:
     ```bash
     node scripts/retry-dlq-jobs.js <queue-name>
     ```

### 3.5 Alert: Stale Outbox Events Recovered (`stale_outbox_events_recovered_total > 0`)
* **Symptom:** Outbox poller reports recovering stale events locked by crashed workers.
* **Diagnosis:**
  1. Verify if worker pods recently restarted or crashed (OOM kill / node preemption):
     ```bash
     kubectl get pods -l app=localsaathi-worker
     ```
  2. Check PostgreSQL outbox table status:
     ```sql
     SELECT status, count(*) FROM outbox_events GROUP BY status;
     ```
* **Mitigation:**
  - Reclamation is automated (`recoverStaleEvents` runs every 60s). Recovered events will be processed normally.
  - If worker crashes were due to memory exhaustion, increase pod memory limits or reduce worker concurrency.

### 3.6 Incident: Payment Verification Timeout / Ambiguous State
* **Symptom:** User payment verification returns `PENDING_RECONCILIATION`.
* **Diagnosis:**
  1. Find payment record by order ID:
     ```sql
     SELECT * FROM payments WHERE provider_order_id = '<order_id>';
     ```
  2. Query Razorpay API directly using Order ID to inspect true status on the gateway.
* **Mitigation:**
  - If Razorpay shows `captured`: run the reconciliation script:
     ```bash
     node scripts/reconcile-payment.js --order-id=<order_id>
     ```
  - If Razorpay shows `failed` or `created`: leave as `PENDING_RECONCILIATION` until webhook arrives or expiration cancels the order.
  - **NEVER** refund or charge twice without verifying payment gateway state.

---

## 4. Operational Commands Reference

| Action | Command | Expected Impact |
|---|---|---|
| **Health Check** | `curl -f http://localhost:4000/api/v1/health/reliability` | Non-blocking status check |
| **View Metrics** | `curl -s http://localhost:4000/metrics | grep -E "circuit_breaker|retry|timeout"` | Live Prometheus metrics dump |
| **Inspect Redis** | `redis-cli info stats` | Check client connections & hit rate |
| **Inspect DB Pool** | `curl -s http://localhost:4000/api/v1/health/reliability | jq .dbPool` | Active/waiting connections |
| **Graceful Drain** | `kill -SIGTERM <pid>` | Bounded 10s drain & clean exit |
