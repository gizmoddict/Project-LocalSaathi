# LocalSaathi — Production Release Checklist

## 1. Pre-Deployment Stage (T-24 Hours to T-1 Hour)

- [ ] **Code Freeze:** Release branch cut and tagged (`vX.Y.Z`).
- [ ] **CI Pipeline Passed:** All quality gates green (Lint, Typecheck, Unit, Integration, DR Suite).
- [ ] **Configuration Validation:** `npm run deploy:validate-config` passed without errors.
- [ ] **Secret Leak Audit:** `npm run deploy:secret-leak-test` passed with 0 leaks detected.
- [ ] **Database Backup Verified:** Fresh backup created and verified (`npm run db:backup:verify`).
- [ ] **Migration Safety Analyzer:** `npm run db:migration:safety` passed (zero unverified destructive DDL).
- [ ] **Staging Verification:** Staging deployment completed and smoke tests passed (`npm run deploy:smoke-test`).
- [ ] **On-Call Alignment:** Primary on-call engineer and incident commander assigned.

---

## 2. Deployment Rollout Stage (T-0)

- [ ] **Pre-Flight Health Check:** Verify production readiness endpoint returns `200 OK`.
- [ ] **Database Migration (Expand):** Run `npx prisma migrate deploy`.
- [ ] **Post-Migration Integrity Check:** Run `npm run db:integrity`.
- [ ] **Rolling API Rollout:** Update API pods; monitor readiness probes until 100% healthy.
- [ ] **Rolling Worker Rollout:** Update Worker pods; verify BullMQ connections established.
- [ ] **Rolling Web Rollout:** Update Web pods; verify static assets and root page respond.
- [ ] **Traceable Release Metadata:** Confirm `GET /api/v1/health/version` reports current Git SHA.

---

## 3. Post-Deployment Verification Stage (T+10 Minutes to T+60 Minutes)

- [ ] **Production Smoke Tests:** Run 18-step smoke test suite (`npm run deploy:smoke-test`).
- [ ] **Observability Verification:**
  - [ ] Error rate $\le 0.1\%$ across API routes.
  - [ ] p95 latency $\le 250$ ms.
  - [ ] Redis memory usage normal.
  - [ ] Database active connections within limits.
  - [ ] Outbox pending backlog $\le 50$ events.
- [ ] **WebSocket Connectivity:** Verify client Socket.IO connections and message delivery.
- [ ] **Release Sign-Off:** Release tagged as successful; incident commander stands down.
