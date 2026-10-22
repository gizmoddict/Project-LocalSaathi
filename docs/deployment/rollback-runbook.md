# LocalSaathi — Rollback Operational Runbook

## 1. Rollback Philosophy & Architectural Decision Tree

Rollbacks must strictly differentiate between **Application Rollback** (stateless container reversion) and **Database Rollback** (stateful data schema changes).

```
                            INCIDENT DETECTED
                                    |
                                    v
                 +--------------------------------------+
                 |  Is the failure purely Application   |
                 |  Code / Configuration? (No DB DDL)   |
                 +--------------------------------------+
                               /          \
                             YES          NO (Schema Changed)
                             /              \
                            v                v
            [APPLICATION ROLLBACK]    +-----------------------------+
            - Revert container image  | Did the migration follow    |
            - Re-point CDN / routing  | Expand/Contract pattern?    |
            - Time: < 3 minutes       +-----------------------------+
                                              /             \
                                            YES             NO (Destructive)
                                            /                 \
                                           v                   v
                             [SAFE FORWARD-FIX]     [ISOLATED DB RESTORE]
                             - Keep expanded schema - Halt ingress traffic
                             - Revert app image     - Restore verified backup
                             - Deprecate old fields - Reconcile payments
```

---

## 2. Stateless Application Rollback Procedure

When an incident is isolated to application logic, memory leaks, or bad environment configurations:

1. **Revert Deployment to Previous Known-Good Image:**
   ```bash
   kubectl rollout undo deployment/localsaathi-api
   kubectl rollout undo deployment/localsaathi-worker
   kubectl rollout undo deployment/localsaathi-web
   ```
2. **Verify Rollout Status:**
   ```bash
   kubectl rollout status deployment/localsaathi-api
   kubectl rollout status deployment/localsaathi-web
   ```
3. **Execute Post-Rollback Smoke Check:**
   ```bash
   TARGET_URL=https://api.localsaathi.com npm run deploy:smoke-test
   ```

---

## 3. Stateful Database Schema Rollback Guidelines

> **CRITICAL RULE:** Never blindly execute down-migrations or `DROP` statements in response to an application failure.

### Case A: Backward-Compatible "Expand" Migration
If the migration followed the **Expand/Contract** design (only added columns or tables):
* **Action:** Do NOT alter the database schema.
* Leave newly added columns/tables intact (they are nullable or default-valued).
* Revert application containers to the previous version. The previous version will safely ignore newly added columns.
* Deploy a forward-fix migration in the next scheduled release window.

### Case B: Destructive Migration or Corrupted Data
If destructive schema changes occurred or unrecoverable data corruption took place:
1. **Immediately Isolate Database (Enter Maintenance Mode):**
   ```bash
   kubectl scale deployment localsaathi-api --replicas=0
   kubectl scale deployment localsaathi-worker --replicas=0
   ```
2. **Execute Verified Disaster Recovery Restoration:**
   Follow Phase 23 Runbook ([`docs/disaster-recovery/disaster-recovery-runbook.md`](file:///p:/Project%20Localsaathi/docs/disaster-recovery/disaster-recovery-runbook.md)):
   ```bash
   npm run db:backup:verify -- /var/backups/localsaathi/pre-migration-backup.dump.enc
   npm run db:restore -- /var/backups/localsaathi/pre-migration-backup.dump.enc
   ```
3. **Run Integrity Audit:**
   ```bash
   npm run db:integrity
   ```
4. **Reconcile Gateway Payments:**
   Match external payments with gateway APIs before lifting maintenance mode.
