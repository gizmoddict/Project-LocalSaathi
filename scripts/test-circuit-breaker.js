// ==============================================================================
// LocalSaathi — Phase 22: Circuit Breaker State Machine & Probe Limiting Test
// Section 27 Verification Script
// ==============================================================================
// Verifies:
// 1. CLOSED state passes requests and records successes
// 2. Failure accumulation trips to OPEN when threshold reached
// 3. OPEN state immediately fast-rejects without invoking downstream
// 4. Timer expiry triggers transition to HALF_OPEN
// 5. HALF_OPEN strictly limits probe concurrency (bounded probe count)
// 6. Consecutive probe successes restore CLOSED state
// 7. Probe failure in HALF_OPEN immediately re-trips to OPEN with renewed timer
// ==============================================================================

const assert = require('assert');

class RigorousCircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.failureThreshold = config.failureThreshold || 3;
    this.rollingWindowMs = config.rollingWindowMs || 1000;
    this.openDurationMs = config.openDurationMs || 150;
    this.halfOpenProbes = config.halfOpenProbes || 2;

    this.state = 'CLOSED';
    this.failureTimestamps = [];
    this.lastStateChange = Date.now();
    this.halfOpenProbeCount = 0;
    this.consecutiveSuccesses = 0;
    this.totalRejected = 0;
    this.totalExecuted = 0;
  }

  checkStateTransition() {
    const now = Date.now();
    if (this.state === 'OPEN') {
      if (now - this.lastStateChange >= this.openDurationMs) {
        this.transitionTo('HALF_OPEN');
      }
    }
  }

  transitionTo(newState) {
    this.state = newState;
    this.lastStateChange = Date.now();
    if (newState === 'HALF_OPEN') {
      this.halfOpenProbeCount = 0;
      this.consecutiveSuccesses = 0;
    } else if (newState === 'CLOSED') {
      this.failureTimestamps = [];
      this.halfOpenProbeCount = 0;
      this.consecutiveSuccesses = 0;
    } else if (newState === 'OPEN') {
      this.halfOpenProbeCount = 0;
      this.consecutiveSuccesses = 0;
    }
  }

  async execute(fn, fallback) {
    this.checkStateTransition();

    if (this.state === 'OPEN') {
      this.totalRejected++;
      if (fallback) return fallback();
      const err = new Error(`CircuitBreaker '${this.name}' is OPEN`);
      err.code = 'CIRCUIT_BREAKER_OPEN';
      throw err;
    }

    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenProbeCount >= this.halfOpenProbes) {
        this.totalRejected++;
        if (fallback) return fallback();
        const err = new Error(`CircuitBreaker '${this.name}' is HALF_OPEN probe limit reached`);
        err.code = 'CIRCUIT_BREAKER_PROBE_LIMIT';
        throw err;
      }
      this.halfOpenProbeCount++;
    }

    this.totalExecuted++;
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.halfOpenProbes) {
        this.transitionTo('CLOSED');
      }
    }
  }

  onFailure() {
    const now = Date.now();
    if (this.state === 'HALF_OPEN') {
      // Any probe failure in HALF_OPEN immediately trips back to OPEN
      this.transitionTo('OPEN');
      return;
    }

    this.failureTimestamps.push(now);
    // Purge failures outside rolling window
    const windowStart = now - this.rollingWindowMs;
    this.failureTimestamps = this.failureTimestamps.filter((ts) => ts >= windowStart);

    if (this.failureTimestamps.length >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }
}

async function runCircuitBreakerTests() {
  console.log('===============================================================');
  console.log(' LocalSaathi Phase 22: Circuit Breaker State Machine Test');
  console.log(' Target: State Transitions, Timeouts & Probe Limiting (Section 27)');
  console.log('===============================================================');

  const cb = new RigorousCircuitBreaker('TEST_BREAKER', {
    failureThreshold: 3,
    rollingWindowMs: 1000,
    openDurationMs: 100,
    halfOpenProbes: 2,
  });

  // 1. Initial State: CLOSED
  assert.strictEqual(cb.state, 'CLOSED');
  const res1 = await cb.execute(async () => 'OK_1');
  assert.strictEqual(res1, 'OK_1');
  console.log('  [STEP 1] PASS - Initial state CLOSED allows regular traffic');

  // 2. Accumulate failures below threshold (2 failures < 3)
  for (let i = 0; i < 2; i++) {
    await assert.rejects(
      cb.execute(async () => {
        throw new Error('Transient error');
      }),
      /Transient error/
    );
  }
  assert.strictEqual(cb.state, 'CLOSED');
  console.log('  [STEP 2] PASS - Failures below threshold do not trip circuit breaker');

  // 3. 3rd failure trips the breaker to OPEN
  await assert.rejects(
    cb.execute(async () => {
      throw new Error('3rd error to trip breaker');
    }),
    /3rd error/
  );
  assert.strictEqual(cb.state, 'OPEN');
  console.log('  [STEP 3] PASS - Threshold reached: Circuit Breaker transitioned to OPEN');

  // 4. In OPEN state, calls fail fast without invoking downstream
  let downstreamCalledInOpen = false;
  const startOpen = Date.now();
  await assert.rejects(
    cb.execute(async () => {
      downstreamCalledInOpen = true;
      return 'should not run';
    }),
    /is OPEN/
  );
  const openDuration = Date.now() - startOpen;
  assert.strictEqual(downstreamCalledInOpen, false);
  assert(openDuration < 10, 'OPEN state must reject instantly');
  console.log('  [STEP 4] PASS - OPEN state fast-rejects calls with 0ms downstream overhead');

  // 4b. OPEN state with Fallback executes fallback cleanly
  const fallbackVal = await cb.execute(
    async () => 'never called',
    async () => 'FALLBACK_SUCCESS'
  );
  assert.strictEqual(fallbackVal, 'FALLBACK_SUCCESS');
  console.log('  [STEP 4b] PASS - OPEN state fallback executed cleanly without downstream call');

  // 5. Wait for openDurationMs (100ms) to elapse -> transitions to HALF_OPEN
  await new Promise((r) => setTimeout(r, 110));
  cb.checkStateTransition();
  assert.strictEqual(cb.state, 'HALF_OPEN');
  console.log('  [STEP 5] PASS - Timer expired: Circuit Breaker transitioned to HALF_OPEN');

  // 6. Test probe limiting in HALF_OPEN (2 probes max)
  // Let probe 1 run successfully
  const probe1 = await cb.execute(async () => 'PROBE_1_OK');
  assert.strictEqual(probe1, 'PROBE_1_OK');
  assert.strictEqual(cb.state, 'HALF_OPEN');
  assert.strictEqual(cb.consecutiveSuccesses, 1);
  console.log('  [STEP 6a] PASS - HALF_OPEN probe 1 recorded success');

  // Let probe 2 run successfully -> satisfies 2 consecutive successes -> CLOSED
  const probe2 = await cb.execute(async () => 'PROBE_2_OK');
  assert.strictEqual(probe2, 'PROBE_2_OK');
  assert.strictEqual(cb.state, 'CLOSED');
  console.log('  [STEP 6b] PASS - HALF_OPEN probe 2 recorded success: Breaker recovered to CLOSED');

  // 7. Test probe failure in HALF_OPEN immediately re-tripping to OPEN
  // Trip breaker again
  for (let i = 0; i < 3; i++) {
    await assert.rejects(cb.execute(async () => { throw new Error('fail'); }));
  }
  assert.strictEqual(cb.state, 'OPEN');

  // Wait for HALF_OPEN
  await new Promise((r) => setTimeout(r, 110));
  cb.checkStateTransition();
  assert.strictEqual(cb.state, 'HALF_OPEN');

  // Probe fails in HALF_OPEN
  await assert.rejects(
    cb.execute(async () => {
      throw new Error('Probe failed');
    }),
    /Probe failed/
  );
  assert.strictEqual(cb.state, 'OPEN');
  console.log('  [STEP 7] PASS - Probe failure in HALF_OPEN immediately re-trips breaker to OPEN');

  // 8. Test probe concurrency limiting in HALF_OPEN
  // Wait again for HALF_OPEN
  await new Promise((r) => setTimeout(r, 110));
  cb.checkStateTransition();
  assert.strictEqual(cb.state, 'HALF_OPEN');

  // Simulate probe count exhausted (already ran 2 probes)
  cb.halfOpenProbeCount = 2; // simulated limit reached
  await assert.rejects(
    cb.execute(async () => 'excess probe'),
    /probe limit reached/
  );
  console.log('  [STEP 8] PASS - Concurrency bounded in HALF_OPEN: excess probes rejected');

  console.log('\n===============================================================');
  console.log(' Circuit Breaker Test Completed: 8/8 State Verification Checks Passed');
  console.log('===============================================================');
}

runCircuitBreakerTests().catch((err) => {
  console.error('Circuit Breaker Test FAILED:', err);
  process.exit(1);
});
