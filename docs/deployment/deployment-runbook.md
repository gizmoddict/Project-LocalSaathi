# LocalSaathi — Production Deployment Runbook

## 1. Overview & Release Workflow

This runbook establishes the formal, step-by-step production deployment procedure for LocalSaathi. All releases must follow the unidirectional progression:

```
[DEVELOPMENT] ---> [CI AUTOMATION] ---> [STAGING DEPLOY] ---> [PRODUCTION ROLLOUT]
```

---

## 2. Pre-Deployment Quality Gates (Must Be 100% Green)

Before initiating a release to Staging or Production, ensure:

1. **Continuous Integration Green:**
   * Linting passed: `npm run lint`
   * Typechecking passed: `npm run typecheck`
   * Unit and Integration tests passed: `npm run test`
   * DR Simulation passed: `node scripts/test-dr-suite.js`
   * Release metadata generated: `npm run deploy:metadata`
2. **Security & Secrets Verification:**
   * Secret leak scan passed: `npm run deploy:secret-leak-test`
   * Target environment config validated: `npm run deploy:validate-config`
3. **Database Pre-Flight Safety:**
   * Verified database backup present: `npm run db:backup:verify`
   * Migration safety analysis passed: `npm run db:migration:safety`

---

## 3. Staging Deployment Execution

1. **Deploy Staging Infrastructure:**
   ```bash
   docker compose -f docker-compose.staging.yml up -d --build
   ```
2. **Apply Staging Migrations:**
   ```bash
   npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
   ```
3. **Execute Staging Smoke Tests:**
   ```bash
   TARGET_URL=http://localhost:4000 npm run deploy:smoke-test
   ```
4. **Staging Acceptance:** Verify that the 18 smoke checks succeed and monitor Phase 21 telemetry for 15 minutes.

---

## 4. Production Rollout Execution (Zero-Downtime Rolling Update)

### Step 1: Pre-Flight Verification & Backup
```bash
# Verify active backup is valid
npm run db:backup:verify

# Check database and system readiness
curl -f https://api.localsaathi.com/api/v1/health/ready
```

### Step 2: Database Migration (Expand Phase)
```bash
# Execute backward-compatible schema expansion
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma

# Verify schema integrity post-migration
npm run db:integrity
```

### Step 3: Rolling Application Container Rollout
```bash
# Kubernetes / Container Service Rolling Update
kubectl set image deployment/localsaathi-api api=localsaathi/api:v0.1.0-prod
kubectl rollout status deployment/localsaathi-api

kubectl set image deployment/localsaathi-worker worker=localsaathi/worker:v0.1.0-prod
kubectl rollout status deployment/localsaathi-worker

kubectl set image deployment/localsaathi-web web=localsaathi/web:v0.1.0-prod
kubectl rollout status deployment/localsaathi-web
```

### Step 4: Post-Deployment Smoke Verification
```bash
TARGET_URL=https://api.localsaathi.com WEB_URL=https://localsaathi.com npm run deploy:smoke-test
```

### Step 5: Post-Deployment Monitoring (60-Minute Canary Watch)
* Inspect Prometheus error rate metrics: `rate(http_requests_total{status=~"5.."}[5m]) < 0.01`
* Inspect p95 latency: `< 300ms`
* Inspect Outbox backlog: `outbox_events_pending_total < 50`
* Confirm zero `CRITICAL` or `HIGH` alerts in `/api/v1/health/alerts`

---

## 5. Deployment Abort Criteria

Immediately halt rollout and trigger the **Rollback Runbook** (`rollback-runbook.md`) if:
* Readiness probes fail for $> 60$ seconds on new replicas.
* HTTP 5xx error rate exceeds 1% of total traffic.
* Database connections exceed 80% of `max_connections`.
* Worker DLQ receives sudden burst of unhandled failures.
