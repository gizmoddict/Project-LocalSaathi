# LocalSaathi — Observability & Incident Response Runbook (Phase 21 Hardened)

## 1. Overview & Operational Endpoints

This runbook guides Site Reliability Engineers (SRE) and backend engineers in responding to incidents detected by LocalSaathi's Phase 21 Observability Engine.

### 1.1 Core Observability Endpoints
- **Prometheus Metrics Text Format**: `GET /api/v1/metrics` (or `GET /metrics`)
- **JSON Telemetry Snapshot**: `GET /api/v1/metrics?format=json`
- **Centralized 10-Subsystem Health**: `GET /api/v1/health/system`
- **Active Observability Alerts**: `GET /api/v1/health/alerts`
- **Liveness Probe**: `GET /api/v1/health/live` (Process viability only; does not depend on PostgreSQL/Redis)
- **Readiness Probe**: `GET /api/v1/health/ready` (Returns 503 if PostgreSQL or Redis is down)
- **Admin System Health UI**: `https://localsaathi.com/admin/system-health`

### 1.2 Alert Delivery Clarification
> **Operational Status**: Phase 21 verifies alert condition evaluation and local alert notification behavior via `LogAlertNotifier`. External incident-provider delivery (PagerDuty, Slack, Opsgenie, Webhooks) requires a configured provider integration and is not claimed without runtime verification.

---

## 2. Standard Triage Procedures by Alert Rule

### 2.1 Alert: `API Error Rate Too High`
- **Trigger**: Error rate (`http_errors_total / http_requests_total`) exceeds `ALERT_API_ERROR_RATE_PERCENT` (default: 5.0%).
- **Severity**: CRITICAL
- **Diagnostic Steps**:
  1. Inspect `http_requests_total` grouped by `status_class` and `route` to identify the failing endpoint.
  2. Query logs using `type="HTTP_REQUEST_FAILURE"` and search for common `error` messages.
  3. Correlate using `requestId` or `correlationId` to inspect the full trace of failing requests.
- **Remediation**:
  - If database timeout: Check connection pool and long-running queries via `pg_stat_activity`.
  - If upstream service (e.g. Razorpay, SMS): Verify third-party status page and circuit breaker behavior.

### 2.2 Alert: `PostgreSQL Database Degraded or Unhealthy`
- **Trigger**: Database ping query latency > 300ms (Degraded) or connection failed (Unhealthy).
- **Severity**: CRITICAL / WARNING
- **Diagnostic Steps**:
  1. Inspect `db_slow_queries_total` for spike in queries exceeding `DB_SLOW_QUERY_MS` (default: 200ms).
  2. Check active PostgreSQL connections:
     ```sql
     SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
     ```
  3. Identify lock contention:
     ```sql
     SELECT pid, usename, query, state, age(clock_timestamp(), query_start) 
     FROM pg_stat_activity 
     WHERE state != 'idle' ORDER BY age DESC LIMIT 5;
     ```
- **Remediation**:
  - Terminate blocking idle-in-transaction sessions.
  - Scale database pool size or vertically scale instance if CPU/IOPS saturated.

### 2.3 Alert: `BullMQ Queue Backlog Elevated`
- **Trigger**: Total waiting jobs > `ALERT_QUEUE_BACKLOG` (default: 500).
- **Severity**: WARNING
- **Diagnostic Steps**:
  1. Check `queue_jobs_waiting` across all 12 queues to find which queue is accumulating backlog:
     - `notifications-high-priority`
     - `search-index-sync`
     - `analytics-events`
     - `payment-webhooks`
  2. Check worker process health in `apps/worker`.
- **Remediation**:
  - Scale worker pod replicas horizontally to increase consumer concurrency.
  - Check if downstream consumers (e.g., Elasticsearch or SMS gateway) are rate limiting.

### 2.4 Alert: `Failed Worker Jobs / DLQ Elevated`
- **Trigger**: Failed jobs count > `ALERT_DLQ_COUNT` (default: 10).
- **Severity**: CRITICAL
- **Diagnostic Steps**:
  1. Inspect failed jobs in BullMQ or `outbox_events` dead-letter partition (`status='DEAD_LETTER'`).
  2. Check job stack trace and error payload in structured logs.
- **Remediation**:
  - Fix any underlying bug in the worker job processor.
  - Replay failed dead-letter events using the admin outbox recovery endpoint (`POST /admin/outbox/dead-letter/:id/retry`).

### 2.5 Alert: `Transactional Outbox Backlog Elevated`
- **Trigger**: Pending outbox events > `ALERT_OUTBOX_BACKLOG` (default: 500).
- **Severity**: WARNING
- **Diagnostic Steps**:
  1. Check outbox processor loop in `OutboxProcessorService`.
  2. Check if database row locks or event publishing is bottlenecked.
- **Remediation**:
  - Verify outbox worker cron / interval scheduler is firing.
  - Ensure Redis connection is healthy so outbox events can be enqueued into BullMQ without rejection.

---

## 3. Distributed Log Correlation Guide

When troubleshooting an incident:
1. Obtain the `requestId` or `X-Request-Id` from the user or error response header.
2. In log aggregator, query:
   ```
   service:localsaathi-api AND requestId:"req-xyz..."
   ```
3. Extract the `correlationId` and `traceId` from the log entry.
4. Query all services using `correlationId:"corr-xyz..."`:
   - Inspect API logs for inbound parameters.
   - Inspect Outbox dispatch logs for domain events generated.
   - Inspect Worker logs `[correlationId=...]` for background job execution and failure causes.
