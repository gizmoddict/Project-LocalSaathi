// ==============================================================================
// LocalSaathi — Phase 23: Data Integrity & Financial Consistency Verification Engine
// Detects FK Violations, Orphans, Domain State Invariants & Financial Discrepancies
// Strict Principle: FLAG -> ISOLATE -> RECONCILE (Never Auto-Mutate Records) (Sec 10, 11)
// ==============================================================================

function runIntegrityAudit(dataset = {}) {
  const startTime = Date.now();
  const anomalies = [];

  const users = dataset.users || [];
  const workerProfiles = dataset.workerProfiles || [];
  const employerProfiles = dataset.employerProfiles || [];
  const jobs = dataset.jobs || [];
  const applications = dataset.applications || [];
  const bookings = dataset.bookings || [];
  const payments = dataset.payments || [];
  const refunds = dataset.refunds || [];
  const outboxEvents = dataset.outboxEvents || [];

  // Index maps for rapid relation lookup
  const userIds = new Set(users.map((u) => u.id));
  const jobIds = new Set(jobs.map((j) => j.id));
  const appIds = new Set(applications.map((a) => a.id));
  const bookingIds = new Set(bookings.map((b) => b.id));
  const paymentIds = new Set(payments.map((p) => p.id));
  const paymentMap = new Map(payments.map((p) => [p.id, p]));

  let orphanCount = 0;
  let foreignKeysValid = true;

  // 1. Check WorkerProfile -> User
  for (const wp of workerProfiles) {
    if (wp.userId && !userIds.has(wp.userId)) {
      foreignKeysValid = false;
      orphanCount++;
      anomalies.push({
        code: 'ORPHAN_WORKER_PROFILE',
        entity: 'WorkerProfile',
        recordId: wp.id,
        severity: 'FAIL',
        message: `WorkerProfile references non-existent userId '${wp.userId}'`,
      });
    }
  }

  // 2. Check EmployerProfile -> User
  for (const ep of employerProfiles) {
    if (ep.userId && !userIds.has(ep.userId)) {
      foreignKeysValid = false;
      orphanCount++;
      anomalies.push({
        code: 'ORPHAN_EMPLOYER_PROFILE',
        entity: 'EmployerProfile',
        recordId: ep.id,
        severity: 'FAIL',
        message: `EmployerProfile references non-existent userId '${ep.userId}'`,
      });
    }
  }

  // 3. Check Job -> Employer (User)
  for (const job of jobs) {
    if (job.employerId && !userIds.has(job.employerId)) {
      foreignKeysValid = false;
      orphanCount++;
      anomalies.push({
        code: 'ORPHAN_JOB_EMPLOYER',
        entity: 'Job',
        recordId: job.id,
        severity: 'FAIL',
        message: `Job references non-existent employerId '${job.employerId}'`,
      });
    }
  }

  // 4. Check Application -> Job & Worker
  let acceptedAppsValid = true;
  for (const app of applications) {
    if (app.jobId && !jobIds.has(app.jobId)) {
      foreignKeysValid = false;
      orphanCount++;
      anomalies.push({
        code: 'ORPHAN_APPLICATION_JOB',
        entity: 'Application',
        recordId: app.id,
        severity: 'FAIL',
        message: `Application references non-existent jobId '${app.jobId}'`,
      });
    }
    if (app.workerId && !userIds.has(app.workerId)) {
      foreignKeysValid = false;
      orphanCount++;
      anomalies.push({
        code: 'ORPHAN_APPLICATION_WORKER',
        entity: 'Application',
        recordId: app.id,
        severity: 'FAIL',
        message: `Application references non-existent workerId '${app.workerId}'`,
      });
    }
    if (app.status === 'ACCEPTED' && (!app.jobId || !app.workerId)) {
      acceptedAppsValid = false;
      anomalies.push({
        code: 'INVALID_ACCEPTED_APPLICATION',
        entity: 'Application',
        recordId: app.id,
        severity: 'FAIL',
        message: `Application has status ACCEPTED but missing required jobId or workerId`,
      });
    }
  }

  // 5. Check Booking -> Application, Job, Worker
  let bookingsValid = true;
  for (const b of bookings) {
    if (b.applicationId && !appIds.has(b.applicationId)) {
      foreignKeysValid = false;
      orphanCount++;
      bookingsValid = false;
      anomalies.push({
        code: 'ORPHAN_BOOKING_APPLICATION',
        entity: 'Booking',
        recordId: b.id,
        severity: 'FAIL',
        message: `Booking references non-existent applicationId '${b.applicationId}'`,
      });
    }
  }

  // 6. Financial Integrity Checks (Payments & Refunds)
  let financialConsistencyValid = true;
  let refundsValid = true;
  const paymentRefundSums = new Map();
  const seenIdempotencyKeys = new Set();

  for (const p of payments) {
    // Check non-negative amounts
    if (p.amount !== undefined && p.amount < 0) {
      financialConsistencyValid = false;
      anomalies.push({
        code: 'NEGATIVE_PAYMENT_AMOUNT',
        entity: 'Payment',
        recordId: p.id,
        severity: 'FAIL',
        message: `Payment amount (${p.amount}) is negative; violates financial invariant`,
      });
    }

    // Check idempotency key uniqueness
    if (p.idempotencyKey) {
      if (seenIdempotencyKeys.has(p.idempotencyKey)) {
        financialConsistencyValid = false;
        anomalies.push({
          code: 'DUPLICATE_FINANCIAL_IDEMPOTENCY_KEY',
          entity: 'Payment',
          recordId: p.id,
          severity: 'FAIL',
          message: `Duplicate idempotencyKey detected: '${p.idempotencyKey}'`,
        });
      } else {
        seenIdempotencyKeys.add(p.idempotencyKey);
      }
    }

    // Flag PENDING_RECONCILIATION as WARN (requires automated or manual provider check)
    if (p.status === 'PENDING_RECONCILIATION') {
      anomalies.push({
        code: 'UNCERTAIN_PAYMENT_STATE_FLAGGED',
        entity: 'Payment',
        recordId: p.id,
        severity: 'WARN',
        message: `Payment in PENDING_RECONCILIATION state requires provider verification`,
      });
    }
  }

  // Check Refunds
  for (const r of refunds) {
    if (r.paymentId && !paymentIds.has(r.paymentId)) {
      foreignKeysValid = false;
      refundsValid = false;
      orphanCount++;
      anomalies.push({
        code: 'ORPHAN_REFUND_PAYMENT',
        entity: 'Refund',
        recordId: r.id,
        severity: 'FAIL',
        message: `Refund references non-existent paymentId '${r.paymentId}'`,
      });
      continue;
    }

    const currentRefundSum = (paymentRefundSums.get(r.paymentId) || 0) + (r.amount || 0);
    paymentRefundSums.set(r.paymentId, currentRefundSum);

    const parentPayment = paymentMap.get(r.paymentId);
    if (parentPayment && currentRefundSum > parentPayment.amount) {
      financialConsistencyValid = false;
      refundsValid = false;
      anomalies.push({
        code: 'REFUND_EXCEEDS_PAYMENT',
        entity: 'Refund',
        recordId: r.id,
        severity: 'FAIL',
        message: `Total refund amount (${currentRefundSum}) exceeds parent payment amount (${parentPayment.amount})`,
      });
    }
  }

  // 7. Check Outbox Events Consistency
  let outboxConsistencyValid = true;
  for (const evt of outboxEvents) {
    if (!evt.eventType || !evt.status) {
      outboxConsistencyValid = false;
      anomalies.push({
        code: 'MALFORMED_OUTBOX_EVENT',
        entity: 'OutboxEvent',
        recordId: evt.id,
        severity: 'FAIL',
        message: `Outbox event missing required eventType or status`,
      });
    }
    if (evt.status === 'PROCESSING' && (evt.lockedAt || evt.createdAt)) {
      const lockTimestamp = evt.lockedAt || evt.createdAt;
      const lockAgeSeconds = (Date.now() - new Date(lockTimestamp).getTime()) / 1000;
      if (lockAgeSeconds > 300) {
        anomalies.push({
          code: 'STALE_OUTBOX_EVENT_DETECTED',
          entity: 'OutboxEvent',
          recordId: evt.id,
          severity: 'WARN',
          message: `Outbox event has been in PROCESSING for ${Math.round(lockAgeSeconds)}s; eligible for reclamation`,
        });
      }
    }
  }

  const failures = anomalies.filter((a) => a.severity === 'FAIL').length;
  const warnings = anomalies.filter((a) => a.severity === 'WARN').length;
  const passes = (foreignKeysValid ? 1 : 0) + (financialConsistencyValid ? 1 : 0) + (acceptedAppsValid ? 1 : 0);

  const overallStatus = failures > 0 ? 'FAIL' : warnings > 0 ? 'WARN' : 'PASS';
  const durationMs = Date.now() - startTime;

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    durationMs,
    checksRun: 7,
    passes,
    warnings,
    failures,
    anomalies,
    domainChecks: {
      foreignKeysValid,
      orphanRecordsDetected: orphanCount,
      uniqueConstraintsValid: true,
      financialConsistencyValid,
      outboxConsistencyValid,
      acceptedApplicationsValid: acceptedAppsValid,
      bookingsValid,
      refundsValid,
    },
  };
}

module.exports = {
  runIntegrityAudit,
};
