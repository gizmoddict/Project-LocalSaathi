# LocalSaathi Background Worker Operations Runbook

## 1. Overview & Service Architecture

The LocalSaathi worker process (`apps/worker`) runs as an independent NodeJS background process handling 12 asynchronous BullMQ queues backed by Redis 7.2 and PostgreSQL 16.

### Key Entry Points
- Worker Daemon Entrypoint: `apps/worker/src/index.ts`
- Worker Engine Bootstrap: `apps/worker/src/worker.bootstrap.ts`
- Queue Configuration: `apps/worker/src/config/queue.config.ts`
- Dead Letter Queue Service: `apps/worker/src/dlq/dlq.service.ts`

---

## 2. Health Monitoring & Metrics

The worker bootstrap engine exposes programmatic health metrics via `bootstrap.getHealthStatus()`:

```typescript
const health = await bootstrap.getHealthStatus();
// Returns:
// {
//   status: 'HEALTHY' | 'DEGRADED' | 'DOWN',
//   timestamp: '2026-10-06T22:00:00.000Z',
//   totalQueues: 12,
//   queues: {
//     'notifications-queue': { active: 2, waiting: 14, failed: 0, delayed: 0 },
//     ...
//   },
//   dlqCounts: { 'sms-queue': 0, ... }
// }
```

### Critical Alert Thresholds
| Metric | Warning Threshold | Critical Threshold | Action |
| :--- | :---: | :---: | :--- |
| Queue Lag (`waiting` count) | > 500 jobs | > 2,000 jobs | Scale worker replicas; check consumer bottleneck |
| Queue Failure Rate | > 2% of throughput | > 5% of throughput | Inspect DLQ error classification & logs |
| DLQ Ingestion Spike | > 10 jobs in 5 min | > 50 jobs in 5 min | Trigger On-Call Incident; inspect downstream provider |
| Worker RSS Memory | > 750 MB | > 1.2 GB | Investigate memory leaks; rolling restart worker |
| Active Job Duration | > 45 seconds | > 90 seconds | Check external HTTP socket timeouts |

---

## 3. Incident Playbooks

### Playbook A: Queue Backlog & Lag Spike
**Symptoms:** `waiting` count grows monotonically; notifications or SMS are delayed.
**Root Cause Investigation:**
1. Check Redis connectivity and worker CPU utilization:
   ```bash
   redis-cli -h $REDIS_HOST -p $REDIS_PORT ping
   top -p $(pgrep -f "worker")
   ```
2. Verify worker process is running and actively processing:
   Check application logs for `[WorkerEngine] Processing job...` entries.
3. Check if downstream dependency (e.g. database pool, external API) is saturated.
**Mitigation:**
- Horizontally scale worker pods/containers (e.g., increase replicas from 2 to 4).
- If backlog is in non-critical queues (`analytics-queue`, `recommendations-queue`), pause or reduce concurrency on low-priority queues to allocate resources to high-priority queues.

---

### Playbook B: High DLQ Failure Rate
**Symptoms:** `DeadLetterQueueService` logs repeated `Captured job ... in DLQ` events.
**Root Cause Investigation:**
1. Query DLQ summary via admin API or Redis:
   ```bash
   redis-cli HGETALL dlq:job:<jobId>
   ```
2. Check `failureCategory` in DLQ records:
   - `VALIDATION_FAILED`: A breaking schema change was deployed in API without updating workers.
   - `PROVIDER_OUTAGE`: Third-party telecom or payment gateway is returning 5xx errors.
   - `TRANSIENT_NETWORK`: Redis or database connection dropped.
**Mitigation:**
- If third-party provider outage: Pause the affected queue (`sms-queue` or `payment-reconciliation-queue`) to prevent exhausting retries:
  ```typescript
  await worker.pause();
  ```
- Once the provider recovers, resume the queue and replay DLQ jobs:
  ```bash
  POST /api/v1/admin/queues/:queueName/replay-dlq
  ```

---

### Playbook C: Redis Connectivity Loss or Cluster Failover
**Symptoms:** Worker logs `Redis connection error: Connection refused` or `ETIMEDOUT`.
**Expected Behavior:**
- Workers enter degraded mode. BullMQ automatically attempts reconnection with exponential backoff.
- The transactional outbox in PostgreSQL retains pending events safely until Redis recovers.
**Mitigation:**
1. Verify Redis cluster status and failover sentinel logs.
2. Once Redis connectivity is restored, workers automatically resume polling without data loss.

---

### Playbook D: Memory Leak / OOM Termination
**Symptoms:** Worker process repeatedly crashes with `SIGABRT` or `JavaScript heap out of memory`.
**Root Cause Investigation:**
- Check for unbounded image buffer allocations in `image-processing.worker-handler.ts`.
- Check for large batch queries in `analytics.worker-handler.ts` or `cleanup.worker-handler.ts`.
**Mitigation:**
- Workers are configured with bounded batch sizes (e.g. `batchSize: 500` for analytics, `limit: 1000` for cleanup).
- Set NodeJS heap flag: `--max-old-space-size=2048`.

---

## 4. Maintenance & Administrative Commands

### Manually Triggering Reconciliation
If an unexpected payment webhook drop is suspected:
```bash
POST /api/v1/admin/queues/payment-reconciliation-queue/trigger
Content-Type: application/json
{
  "mode": "DISCREPANCY_RECHECK",
  "initiatedBy": "ADMIN_OPERATOR"
}
```

### Safe Zero-Downtime Rolling Deployment
1. Issue `SIGTERM` to the old worker process instance.
2. The worker bootstrap catches `SIGTERM` and initiates graceful shutdown:
   - Stops accepting new jobs from Redis.
   - Allows in-flight jobs up to 30 seconds to complete.
   - Flushes Redis connections.
3. Start new worker container with updated code.
4. Verify worker health status via health probe.
