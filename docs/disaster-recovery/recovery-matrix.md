# LocalSaathi — Subsystem Recovery Matrix

## 1. Subsystem Recovery Characteristics

| Subsystem | Authority Status | Data Loss Tolerance (RPO) | Recovery Target (RTO) | Recovery Mechanism | Automated vs Manual |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | **Authoritative Source of Truth** | $\le 1$ hour | $\le 2$ hours | Restore logical backup or PITR WAL archive to isolated instance, run integrity audit, promote. | Semi-Automated (Operator Confirmed) |
| **Transactional Outbox** | **Authoritative Event Bridge** | $\le 0$ events (within DB transaction) | $\le 15$ mins | Reclaim stale `PROCESSING` events back to `PENDING`; workers resume at-least-once delivery. | Automated on Worker Boot |
| **Payment Gateway State** | **External Authoritative** | N/A (External Gateway) | $\le 1$ hour | Query provider APIs (Razorpay/Stripe); match against local DB; flag mismatches with `PENDING_RECONCILIATION`. | Automated Audit + Manual Adjudication |
| **Redis Cache** | **Rebuildable (Non-Authoritative)** | 100% loss tolerable | $\le 15$ mins | `FLUSHALL` corrupted memory; cold start fallback to DB; warm critical reference caches. | Automated Script |
| **BullMQ Job Queues** | **Rebuildable (Non-Authoritative)** | Active locks lost | $\le 15$ mins | Release expired locks; identify stalled jobs; re-enqueue from Outbox or scheduled jobs table. | Automated on Worker Restart |
| **Search Engine (OpenSearch)** | **Rebuildable (Non-Authoritative)** | 100% loss tolerable | $\le 30$ mins | Drop corrupted index; trigger PostgreSQL re-indexing worker to stream jobs and workers. | Automated Batch Script |
| **Product Analytics** | **Rebuildable / Derived** | $\le 24$ hours | $\le 2$ hours | Replay events from durable outbox / event logs with deduplication by `eventId`. | Automated Ingestion Deduplication |
| **Object Storage (KYC / Media)**| **Authoritative Blobs** | $\le 1$ hour | $\le 2$ hours | Reconcile database `file_records` against S3/GCS bucket; flag missing files or orphaned blobs. | Automated Mismatch Detector |

---

## 2. Failure Scenarios & Standard Operating Procedures

### Scenario A: Catastrophic PostgreSQL Node Failure
1. **Detection:** Phase 21 Health Check trips `DATABASE_DOWN`.
2. **Action:** Stand up new RDS/Compute instance.
3. **Execution:** Execute `npm run db:restore -- /path/to/backup.dump.json` into isolated instance.
4. **Validation:** Execute `npm run db:integrity` to confirm 0 FK orphans and valid financial invariants.
5. **Cutover:** Point `DATABASE_URL` to restored instance.

### Scenario B: Corrupted Redis Cluster
1. **Detection:** Redis `PING` timeout or memory allocation failure.
2. **Action:** Flush Redis instance or provision fresh container.
3. **Execution:** Application continues serving traffic with in-memory rate limiter fallback (Phase 22). Run cache warm script: `node scripts/cache/warm-critical-keys.js`.
4. **Validation:** Check `GET /health` to confirm Redis connection restored.

### Scenario C: Outbox Worker Crash During High-Volume Dispatch
1. **Detection:** Elevated metric `outbox_events_pending_total` and alert `Outbox Processing Stall`.
2. **Action:** Restart worker pods.
3. **Execution:** Worker runs stale lock reclamation on boot (`UPDATE outbox_events SET status = 'PENDING' WHERE locked_at < NOW() - 5 min`).
4. **Validation:** Observe outbox event processing resuming idempotently without double message generation.

### Scenario D: Payment Gateway Webhook Loss
1. **Detection:** In-flight bookings remaining in unconfirmed state after user payment.
2. **Action:** Trigger payment reconciliation job.
3. **Execution:** Query Razorpay orders endpoint using stored `order_id` / `idempotencyKey`. Update local state to `CAPTURED` or `REFUNDED`.
4. **Validation:** Ensure total captures equal gateway settlement statement.
