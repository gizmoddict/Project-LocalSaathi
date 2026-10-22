# LocalSaathi — Cache Invalidation Rules & Outbox Integration

**Phase:** Phase 19 — Distributed Redis Caching Platform  
**Architecture:** Transactional Outbox + Event-Driven Cache Purging  

---

## 1. Invalidation Philosophy & Invariants

1. **Post-Commit Invalidation:**
   - Under no circumstances should Redis keys be invalidated *before* the PostgreSQL transaction commits.
   - If an invalidation were issued prior to commit and the database transaction rolled back, the system would remain consistent. However, if an invalidation succeeded and a subsequent query re-cached pre-commit stale data before the rollback, cache pollution would occur.
   - Therefore, invalidations are triggered strictly:
     - **Synchronously** immediately after `prisma.<model>.update()` returns.
     - **Asynchronously** by the `CacheInvalidationHandler` when processing committed transactional outbox domain events.
2. **Read-Your-Own-Writes Consistency:**
   - When an employer updates or pauses a job, the mutation service purges the specific job key immediately before returning the HTTP response so the caller immediately observes the new state.
3. **Safe Pattern Deletion:**
   - Wildcard purges (e.g. `local_saathi:v1:jobs:geo:*`) use Redis `SCAN` in non-blocking batches of 100 rather than blocking `KEYS *`.

---

## 2. Invalidation Event Matrix

| Domain Event / Mutation | Originating Service | Target Cache Keys Purged | Invalidation Method | Consistency Window |
|:---|:---|:---|:---|:---|
| `JOB_PUBLISHED` | `JobService.publishJob` | `local_saathi:v1:jobs:detail:{jobId}`<br>`local_saathi:v1:jobs:geo:*`<br>`local_saathi:v1:admin:metrics:overview` | Exact DEL + Non-blocking SCAN Pattern | Immediate (< 5 ms) |
| `JOB_UPDATED` | `JobService.updateJob` | `local_saathi:v1:jobs:detail:{jobId}`<br>`local_saathi:v1:jobs:geo:*` | Exact DEL + SCAN Pattern | Immediate (< 5 ms) |
| `JOB_PAUSED` | `JobService.pauseJob` | `local_saathi:v1:jobs:detail:{jobId}`<br>`local_saathi:v1:jobs:geo:*`<br>`local_saathi:v1:admin:metrics:overview` | Exact DEL + SCAN Pattern | Immediate (< 5 ms) |
| `JOB_RESUMED` | `JobService.resumeJob` | `local_saathi:v1:jobs:detail:{jobId}`<br>`local_saathi:v1:jobs:geo:*`<br>`local_saathi:v1:admin:metrics:overview` | Exact DEL + SCAN Pattern | Immediate (< 5 ms) |
| `JOB_FILLED` | `JobService.fillJob` | `local_saathi:v1:jobs:detail:{jobId}`<br>`local_saathi:v1:jobs:geo:*`<br>`local_saathi:v1:admin:metrics:overview` | Exact DEL + SCAN Pattern | Immediate (< 5 ms) |
| `JOB_CANCELLED` | `JobService.closeJob` | `local_saathi:v1:jobs:detail:{jobId}`<br>`local_saathi:v1:jobs:geo:*`<br>`local_saathi:v1:admin:metrics:overview` | Exact DEL + SCAN Pattern | Immediate (< 5 ms) |
| `EMPLOYER_UPDATED` | `EmployerService.updateProfile` | `local_saathi:v1:employer:public:{employerId}`<br>`local_saathi:v1:employer:*:{employerId}` | Exact DEL + SCAN Pattern | Immediate (< 5 ms) |
| `EMPLOYER_VERIFIED` | `VerificationService` | `local_saathi:v1:employer:public:{employerId}`<br>`local_saathi:v1:admin:metrics:overview` | Outbox Handler Purge | Event loop dispatch (< 500 ms) |
| `SKILL_CREATED` | `AdminOperationsService` | `local_saathi:v1:skills:*` | Outbox Handler SCAN | Event loop dispatch (< 500 ms) |
| `SKILL_UPDATED` | `AdminOperationsService` | `local_saathi:v1:skills:*` | Outbox Handler SCAN | Event loop dispatch (< 500 ms) |
| `BOOKING_CREATED` | `BookingService.createBooking` | `local_saathi:v1:admin:metrics:overview` | Outbox Handler DEL | Event loop dispatch (< 500 ms) |
| `BOOKING_COMPLETED` | `BookingService.completeBooking` | `local_saathi:v1:admin:metrics:overview` | Outbox Handler DEL | Event loop dispatch (< 500 ms) |

---

## 3. Transactional Outbox Integration Flow

```
1. Employer mutates Job Post
        │
        ▼
2. PostgreSQL Transaction commits:
   BEGIN;
     UPDATE job_posts SET status = 'PAUSED' WHERE id = '...';
     INSERT INTO outbox_events (event_type, aggregate_id, ...) VALUES ('JOB_PAUSED', '...', ...);
   COMMIT;
        │
        ├──► Synchronous Purge (JobService):
        │      await cacheService.del('local_saathi:v1:jobs:detail:...');
        │
        └──► Asynchronous Outbox Processor Poller:
               SELECT * FROM outbox_events WHERE status = 'PENDING';
               Dispatch to registered handlers:
                 - NotificationHandler
                 - AnalyticsHandler
                 - SearchIndexHandler
                 - CacheInvalidationHandler:
                     await cacheService.delPattern('local_saathi:v1:jobs:geo:*');
                     await cacheService.del('local_saathi:v1:admin:metrics:overview');
```
