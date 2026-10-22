# LocalSaathi — Observability & Alerting Operational Runbook

## 1. Observability Architecture & Metrics Topology

LocalSaathi delivers unified observability across structured logs, Prometheus metrics, distributed tracing, and health endpoints:

```
               [NestJS API / Worker / Web Applications]
                                  |
                +-----------------+-----------------+
                |                                   |
         Prometheus Metrics                  JSON Structured Logs
          (GET /metrics)                       (AsyncLocalStorage)
                |                                   |
                v                                   v
        [Prometheus Server]                   [Fluentd / Vector]
                |                                   |
                v                                   v
         [Grafana Dashboards]                  [Elastic / Loki]
                |
                v
      [AlertManager / Slack / PagerDuty]
```

---

## 2. Key Service Level Indicators (SLIs) & Objectives (SLOs)

| Service Indicator | Metric Expression | Target SLO | Alert Threshold | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **API Availability** | `sum(rate(http_requests_total{status!~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` | $\ge 99.9\%$ | $< 99.5\%$ over 5m | **CRITICAL** |
| **API Latency (p95)**| `histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le))` | $\le 250$ ms | $> 500$ ms over 5m | **HIGH** |
| **Database Pool Saturation** | `database_active_connections / database_max_connections` | $\le 70\%$ | $> 85\%$ over 3m | **CRITICAL** |
| **Worker Queue Latency** | `queue_job_duration_ms{quantile="0.95"}` | $\le 5000$ ms | $> 15000$ ms | **HIGH** |
| **Outbox Event Backlog** | `outbox_events_pending_total` | $\le 50$ events | $> 200$ events over 5m | **HIGH** |
| **Circuit Breaker Open** | `circuit_breaker_state{state="OPEN"}` | $0$ open breakers | $\ge 1$ open breaker | **MEDIUM** |
| **Backup Verification Status** | `backup_verification_failed_total` | $0$ failures | $> 0$ failures | **CRITICAL** |

---

## 3. Operational Triage Playbook

### High API Error Rate (`API Error Rate > 5%`)
1. Query Prometheus: `sum by (path, status) (rate(http_requests_total{status=~"5.."}[5m]))`
2. Check recent application logs filtered by `trace_id` or `requestId`.
3. Check `/api/v1/health/system` to verify if a specific database or Redis dependency is down.
4. If downstream provider (SMS / Payments) is timing out, check circuit breaker state.

### Outbox Processing Backlog (`outbox_events_pending_total > 200`)
1. Check worker logs: `kubectl logs -l app=localsaathi-worker`.
2. Inspect if worker pods are running or crash-looping.
3. Check for locked stale events in PostgreSQL:
   ```sql
   SELECT count(*), status FROM outbox_events GROUP BY status;
   ```
4. Restart worker pods to trigger lease reclamation if workers crashed mid-processing.
