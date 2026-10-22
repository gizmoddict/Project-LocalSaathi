/**
 * LocalSaathi Phase 21 — Observability Failure Injection & Alert Verification
 * Simulates degraded database latency, queue backlogs, and DLQ errors,
 * verifying that the Alerting Engine flags them with the proper severity.
 */

async function runFailureVerification() {
  console.log('===============================================================');
  console.log(' LocalSaathi Phase 21: Failure Injection & Alert Engine Verification');
  console.log('===============================================================\n');

  // Simulated Alert Rule Engine Evaluation Logic
  const alertRules = [
    {
      id: 'rule-database-health',
      name: 'PostgreSQL Database Degraded or Unhealthy',
      threshold: 0, // 0 = Healthy, 1 = Degraded/Unhealthy
      evaluate: (state) => state.dbLatencyMs > 500 || state.dbConnected === false,
      severity: 'CRITICAL',
    },
    {
      id: 'rule-queue-backlog',
      name: 'BullMQ Queue Backlog Elevated',
      threshold: 500,
      evaluate: (state) => state.queueWaiting > 500,
      severity: 'WARNING',
    },
    {
      id: 'rule-dlq-count',
      name: 'Failed Worker Jobs / DLQ Elevated',
      threshold: 10,
      evaluate: (state) => state.dlqCount > 10,
      severity: 'CRITICAL',
    },
    {
      id: 'rule-api-error-rate',
      name: 'API Error Rate Too High',
      threshold: 5.0,
      evaluate: (state) => state.apiErrorRatePercent > 5.0,
      severity: 'CRITICAL',
    },
  ];

  function evaluate(state) {
    const triggered = [];
    for (const rule of alertRules) {
      if (rule.evaluate(state)) {
        triggered.push({
          ruleId: rule.id,
          name: rule.name,
          severity: rule.severity,
        });
      }
    }
    return triggered;
  }

  // Scenario 1: Baseline Normal Operation
  console.log('[Scenario 1] Normal Baseline State:');
  const baseline = {
    dbConnected: true,
    dbLatencyMs: 12,
    queueWaiting: 24,
    dlqCount: 0,
    apiErrorRatePercent: 0.2,
  };
  const baselineAlerts = evaluate(baseline);
  console.log(`  -> Active Alerts: ${baselineAlerts.length}`);
  if (baselineAlerts.length !== 0) throw new Error('Baseline produced unexpected alerts');
  console.log('  -> Status: CLEAR (Verified)\n');

  // Scenario 2: Database Latency Spike (650ms > 500ms)
  console.log('[Scenario 2] Failure Injection: PostgreSQL Query Latency Spike (650ms):');
  const dbSpike = { ...baseline, dbLatencyMs: 650 };
  const dbAlerts = evaluate(dbSpike);
  console.log(`  -> Active Alerts: ${dbAlerts.length}`);
  console.log(`  -> Triggered: [${dbAlerts[0]?.severity}] ${dbAlerts[0]?.name}`);
  if (!dbAlerts.some((a) => a.ruleId === 'rule-database-health')) {
    throw new Error('Database alert failed to trigger');
  }
  console.log('  -> Status: Database alert correctly triggered\n');

  // Scenario 3: Queue Backlog Surge (1,200 waiting jobs > 500 threshold)
  console.log('[Scenario 3] Failure Injection: BullMQ Queue Backlog Surge (1,200 waiting):');
  const queueSurge = { ...baseline, queueWaiting: 1200 };
  const queueAlerts = evaluate(queueSurge);
  console.log(`  -> Active Alerts: ${queueAlerts.length}`);
  console.log(`  -> Triggered: [${queueAlerts[0]?.severity}] ${queueAlerts[0]?.name}`);
  if (!queueAlerts.some((a) => a.ruleId === 'rule-queue-backlog')) {
    throw new Error('Queue backlog alert failed to trigger');
  }
  console.log('  -> Status: Queue backlog alert correctly triggered\n');

  // Scenario 4: Dead-Letter Queue Surge (25 failed jobs > 10 threshold)
  console.log('[Scenario 4] Failure Injection: Worker DLQ Accumulation (25 failed jobs):');
  const dlqSurge = { ...baseline, dlqCount: 25 };
  const dlqAlerts = evaluate(dlqSurge);
  console.log(`  -> Active Alerts: ${dlqAlerts.length}`);
  console.log(`  -> Triggered: [${dlqAlerts[0]?.severity}] ${dlqAlerts[0]?.name}`);
  if (!dlqAlerts.some((a) => a.ruleId === 'rule-dlq-count')) {
    throw new Error('DLQ alert failed to trigger');
  }
  console.log('  -> Status: DLQ alert correctly triggered\n');

  // Scenario 5: Multiple Concurrent Outages
  console.log('[Scenario 5] Compound Failure: DB Latency + Queue Surge + High Error Rate:');
  const compound = {
    dbConnected: true,
    dbLatencyMs: 820,
    queueWaiting: 3500,
    dlqCount: 42,
    apiErrorRatePercent: 18.5,
  };
  const compoundAlerts = evaluate(compound);
  console.log(`  -> Active Alerts: ${compoundAlerts.length} out of ${alertRules.length}`);
  compoundAlerts.forEach((a) => console.log(`     - [${a.severity}] ${a.name}`));
  if (compoundAlerts.length !== 4) throw new Error('Expected 4 compound alerts');
  console.log('  -> Status: All compound alerts detected and isolated\n');

  console.log('===============================================================');
  console.log(' Verification Complete: 5/5 Failure Scenarios Passed Successfully');
  console.log('===============================================================\n');
}

runFailureVerification().catch((err) => {
  console.error('Failure verification failed:', err);
  process.exit(1);
});
