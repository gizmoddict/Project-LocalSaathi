# LocalSaathi — Incident Response Framework

## 1. Incident Severity Definitions & Response SLAs

| Severity | Definition | Target Acknowledgment | Target Mitigation | Communication Cadence |
| :--- | :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Core platform outage, primary database down, payment system failure, security breach, or data loss. | $< 10$ minutes | $< 1$ hour | Every 15 minutes to stakeholders |
| **SEV-2 (Major)** | Degraded booking flow, background workers stalled, search subsystem down, Redis partition. | $< 20$ minutes | $< 2$ hours | Hourly updates |
| **SEV-3 (Minor)** | Non-critical feature degraded (e.g., analytics delay, rating notifications delayed), partial provider outage. | $< 1$ hour | $< 8$ hours | Daily standup update |
| **SEV-4 (Low)** | Minor cosmetic or non-blocking bug, admin telemetry discrepancy. | Next business day | Next sprint | Jira ticket update |

---

## 2. Six-Phase Incident Response Lifecycle

```
[1. DETECT] ---> [2. TRIAGE] ---> [3. CONTAIN] ---> [4. MITIGATE] ---> [5. VERIFY] ---> [6. RETROSPECT]
```

### Phase 1: Detection
* Triggered by Prometheus alerts (`/api/v1/health/alerts`), Phase 21 telemetry spikes, or user reports.

### Phase 2: Triage & Incident Command
* Primary On-Call assumes role of **Incident Commander (IC)**.
* Establish dedicated incident bridge (Slack `#incident-sev1` / Google Meet).
* Classify severity according to the table above.

### Phase 3: Containment
* Prevent blast-radius expansion:
  * Trip circuit breakers if downstream APIs (Razorpay / SMS) are failing.
  * Enable maintenance mode or rate limiting if traffic surge / DDoS.
  * Revert deployment if incident followed a recent rollout.

### Phase 4: Mitigation & Recovery
* Focus on restoring service over root cause analysis:
  * Application bug: Trigger application rollback (`kubectl rollout undo`).
  * Database issue: Follow Phase 23 Disaster Recovery Runbook.
  * Stalled queues: Restart worker pods to trigger outbox and lock recovery.

### Phase 5: Verification
* Run production smoke test suite: `npm run deploy:smoke-test`.
* Monitor error rates and p95 latency for 30 minutes.

### Phase 6: Post-Incident Review (PIR)
* Complete blameless retrospective within 48 hours.
* Identify Root Cause, Timeline, Impact, Action Items, and Prevention Measures.
