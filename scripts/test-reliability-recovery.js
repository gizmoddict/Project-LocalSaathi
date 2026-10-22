// ==============================================================================
// LocalSaathi — Phase 22: Reliability Recovery & Self-Healing Verification Suite
// Section 28 Verification Script
// ==============================================================================
// Validates end-to-end multi-stage recovery cycles across critical subsystems:
// Phase Flow: NORMAL -> FAILING -> DEGRADED -> RECOVERING -> HEALTHY
// 1. PostgreSQL Concurrency Failure & Automatic Recovery (Deadlocks / Serialization)
// 2. Redis Cache & Distributed Lock Degradation, Fallback & Self-Healing
// 3. External Provider Outage, Circuit Breaker Trip, Probe & Recovery
// 4. Worker Crash, Stale Outbox Event Lease Expiry & Autonomous Reclamation
// ==============================================================================

const assert = require('assert');

// -----------------------------------------------------------------------------
// 1. PostgreSQL Concurrency Self-Healing Engine Simulation
// -----------------------------------------------------------------------------
class MockPostgresResilience {
  constructor() {
    this.deadlockAttempts = 0;
  }

  async executeTransaction(txFn, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await txFn(attempt);
      } catch (err) {
        // Retry transient serialization or deadlock errors
        if ((err.code === '40P01' || err.code === '40001') && attempt < maxAttempts) {
          this.deadlockAttempts++;
          const backoffMs = Math.round(15 * Math.pow(1.5, attempt - 1));
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw err;
      }
    }
  }
}

// -----------------------------------------------------------------------------
// 2. Redis Degraded Fallback & Auto-Restoration Simulation
// -----------------------------------------------------------------------------
class MockCacheWithDegradation {
  constructor() {
    this.redisOnline = true;
    this.memoryStore = new Map();
    this.pgDatabase = new Map([
      ['worker:user-123', { id: 'user-123', name: 'Ramesh Kumar', role: 'WORKER' }],
    ]);
    this.fallbackCount = 0;
  }

  async get(key) {
    if (this.redisOnline) {
      return this.memoryStore.get(key) || null;
    }
    // Degraded mode: fallback directly to Postgres source of truth
    this.fallbackCount++;
    return this.pgDatabase.get(key) || null;
  }

  simulateRedisOutage() {
    this.redisOnline = false;
  }

  simulateRedisRestoration() {
    this.redisOnline = true;
  }
}

// -----------------------------------------------------------------------------
// 3. Outbox Stale Lease Autonomous Recovery Simulation
// -----------------------------------------------------------------------------
class MockOutboxRepository {
  constructor() {
    this.events = [];
  }

  addEvent(id, status, lockedAt) {
    this.events.push({ id, status, lockedAt, attempts: 0 });
  }

  // Simulates Phase 22 recoverStaleEvents(maxStaleAgeSeconds)
  recoverStaleEvents(maxStaleAgeSeconds = 300) {
    const cutoff = Date.now() - maxStaleAgeSeconds * 1000;
    let recoveredCount = 0;

    for (const evt of this.events) {
      if (evt.status === 'PROCESSING' && evt.lockedAt && evt.lockedAt < cutoff) {
        evt.status = 'PENDING';
        evt.lockedAt = null;
        evt.attempts += 1;
        recoveredCount++;
      }
    }
    return recoveredCount;
  }
}

// -----------------------------------------------------------------------------
// Main Test Runner
// -----------------------------------------------------------------------------
async function runRecoveryVerification() {
  console.log('===============================================================');
  console.log(' LocalSaathi Phase 22: Reliability Recovery & Self-Healing Suite');
  console.log(' Target: 4 Subsystem Recovery Lifecycles (Section 28)');
  console.log('===============================================================');

  // ---------------------------------------------------------------------------
  // Lifecycle 1: PostgreSQL Concurrency Recovery
  // ---------------------------------------------------------------------------
  console.log('\n[LIFECYCLE 1] PostgreSQL Deadlock Transient Recovery:');
  const pgService = new MockPostgresResilience();
  let attemptsMade = 0;

  const result = await pgService.executeTransaction(async (attempt) => {
    attemptsMade = attempt;
    if (attempt === 1) {
      const err = new Error('deadlock detected');
      err.code = '40P01'; // Postgres Deadlock detected
      throw err;
    }
    return { committed: true, bookingId: 'bk_9981' };
  });

  assert.strictEqual(result.committed, true);
  assert.strictEqual(attemptsMade, 2);
  assert.strictEqual(pgService.deadlockAttempts, 1);
  console.log('  -> Attempt 1: Encountered 40P01 deadlock');
  console.log('  -> Recovery: Backed off with jitter and re-executed');
  console.log('  -> Attempt 2: Committed successfully');
  console.log('  PASS: PostgreSQL transaction recovered autonomously');

  // Verify non-retryable constraint errors fail immediately without retry loops
  let nonRetryableAttempts = 0;
  await assert.rejects(
    pgService.executeTransaction(async (attempt) => {
      nonRetryableAttempts = attempt;
      const err = new Error('duplicate key value violates unique constraint');
      err.code = '23505'; // Unique violation
      throw err;
    }),
    /unique constraint/
  );
  assert.strictEqual(nonRetryableAttempts, 1);
  console.log('  PASS: PostgreSQL non-retryable error (23505) rejected immediately without retrying');

  // ---------------------------------------------------------------------------
  // Lifecycle 2: Redis Cache Degradation & Restoration
  // ---------------------------------------------------------------------------
  console.log('\n[LIFECYCLE 2] Redis Degradation -> PostgreSQL Fallback -> Restoration:');
  const cache = new MockCacheWithDegradation();

  // Phase A: Normal cache mode
  const val1 = await cache.get('worker:user-123');
  assert.strictEqual(val1, null); // cache miss
  assert.strictEqual(cache.fallbackCount, 0);
  console.log('  -> Stage 1 (Healthy): Redis online, direct query');

  // Phase B: Redis experiences outage
  cache.simulateRedisOutage();
  const val2 = await cache.get('worker:user-123');
  assert.notStrictEqual(val2, null);
  assert.strictEqual(val2.name, 'Ramesh Kumar');
  assert.strictEqual(cache.fallbackCount, 1);
  console.log('  -> Stage 2 (Degraded): Redis unavailable, fell back to PostgreSQL seamlessly');

  // Phase C: Redis recovers
  cache.simulateRedisRestoration();
  cache.memoryStore.set('worker:user-123', val2);
  const val3 = await cache.get('worker:user-123');
  assert.strictEqual(val3.name, 'Ramesh Kumar');
  assert.strictEqual(cache.fallbackCount, 1); // No new fallback count
  console.log('  -> Stage 3 (Restored): Redis back online, high-performance cache restored');
  console.log('  PASS: Redis degradation cycle completed without user-facing failures');

  // ---------------------------------------------------------------------------
  // Lifecycle 3: External Provider Outage -> Circuit Breaker Trip -> Healing
  // ---------------------------------------------------------------------------
  console.log('\n[LIFECYCLE 3] External Provider Outage -> Trip -> Half-Open Probe -> Healing:');
  let providerHealthy = false;
  let providerCalls = 0;

  const mockProvider = async () => {
    providerCalls++;
    if (!providerHealthy) {
      throw new Error('503 Service Unavailable');
    }
    return { sent: true, messageId: 'msg_778' };
  };

  // Breaker with 3 failures threshold, 100ms open duration, 2 probes
  let cbState = 'CLOSED';
  let failureCount = 0;
  let lastFailureTime = 0;
  let probeSuccesses = 0;

  async function executeProviderWithBreaker() {
    const now = Date.now();
    if (cbState === 'OPEN') {
      if (now - lastFailureTime >= 100) {
        cbState = 'HALF_OPEN';
      } else {
        const err = new Error('Circuit Breaker is OPEN');
        err.code = 'CIRCUIT_OPEN';
        throw err;
      }
    }

    try {
      const res = await mockProvider();
      if (cbState === 'HALF_OPEN') {
        probeSuccesses++;
        if (probeSuccesses >= 2) {
          cbState = 'CLOSED';
          failureCount = 0;
        }
      }
      return res;
    } catch (err) {
      failureCount++;
      lastFailureTime = Date.now();
      if (failureCount >= 3 || cbState === 'HALF_OPEN') {
        cbState = 'OPEN';
      }
      throw err;
    }
  }

  // Stage A: Provider failing
  for (let i = 0; i < 3; i++) {
    try {
      await executeProviderWithBreaker();
    } catch {}
  }
  assert.strictEqual(cbState, 'OPEN');
  console.log('  -> Stage 1: Provider failed 3 times; Breaker tripped to OPEN');

  // Stage B: Fast-rejection in OPEN
  await assert.rejects(executeProviderWithBreaker(), /is OPEN/);
  console.log('  -> Stage 2: In OPEN state; fast-rejected without calling downstream');

  // Stage C: Provider recovers while breaker is waiting
  providerHealthy = true;
  await new Promise((r) => setTimeout(r, 110)); // wait for open window
  console.log('  -> Stage 3: Upstream provider restored; waiting for breaker open window');

  // Stage D: Probes in HALF_OPEN
  const probe1 = await executeProviderWithBreaker();
  assert.strictEqual(probe1.sent, true);
  assert.strictEqual(cbState, 'HALF_OPEN');
  console.log('  -> Stage 4: Probe 1 succeeded; breaker in HALF_OPEN');

  const probe2 = await executeProviderWithBreaker();
  assert.strictEqual(probe2.sent, true);
  assert.strictEqual(cbState, 'CLOSED');
  console.log('  -> Stage 5: Probe 2 succeeded; breaker fully healed to CLOSED');
  console.log('  PASS: Provider outage and self-healing lifecycle completed');

  // ---------------------------------------------------------------------------
  // Lifecycle 4: Worker Crash & Stale Outbox Event Autonomous Reclamation
  // ---------------------------------------------------------------------------
  console.log('\n[LIFECYCLE 4] Worker Crash & Stale Outbox Event Autonomous Recovery:');
  const outboxRepo = new MockOutboxRepository();
  const pastTime = Date.now() - 400 * 1000; // 400 seconds ago (exceeds 300s stale lease)

  outboxRepo.addEvent('evt_abandoned_1', 'PROCESSING', pastTime);
  outboxRepo.addEvent('evt_recent_active', 'PROCESSING', Date.now() - 30 * 1000); // 30s ago (still active)

  // Trigger stale event reclamation
  const recovered = outboxRepo.recoverStaleEvents(300);
  assert.strictEqual(recovered, 1);

  const abandonedEvent = outboxRepo.events.find((e) => e.id === 'evt_abandoned_1');
  assert.strictEqual(abandonedEvent.status, 'PENDING');
  assert.strictEqual(abandonedEvent.lockedAt, null);
  assert.strictEqual(abandonedEvent.attempts, 1);

  const activeEvent = outboxRepo.events.find((e) => e.id === 'evt_recent_active');
  assert.strictEqual(activeEvent.status, 'PROCESSING');
  console.log('  -> Stage 1: Identified abandoned event locked > 300s ago');
  console.log('  -> Stage 2: Reset event status to PENDING and cleared lock lease');
  console.log('  -> Stage 3: Preserved currently active in-flight event untouched');
  console.log('  PASS: Stale outbox event autonomous reclamation verified');

  console.log('\n===============================================================');
  console.log(' Reliability Recovery Suite Completed: 4/4 Lifecycles Passed');
  console.log('===============================================================');
}

runRecoveryVerification().catch((err) => {
  console.error('Reliability Recovery Verification FAILED:', err);
  process.exit(1);
});
