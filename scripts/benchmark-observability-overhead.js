/**
 * LocalSaathi Phase 21 — Observability Runtime Overhead Benchmark
 * Measures execution time of AsyncLocalStorage, Structured Logging,
 * Prometheus Metric Recording, and Tracing Spans across 10,000 iterations.
 */

const { performance } = require('perf_hooks');
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

// 1. Secret Redaction Simulation
const SENSITIVE_KEYS = new Set([
  'password', 'passwordhash', 'token', 'accesstoken', 'refreshtoken',
  'jwt', 'authorization', 'cvv', 'cardnumber', 'pan', 'aadhaar', 'secret'
]);

function sanitizeLogData(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeLogData);
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    const norm = k.toLowerCase().replace(/[_\-]/g, '');
    if (SENSITIVE_KEYS.has(norm)) {
      out[k] = '[REDACTED_SECRET]';
    } else if (v && typeof v === 'object') {
      out[k] = sanitizeLogData(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// 2. Metrics Recording Simulation
class MockMetrics {
  constructor() {
    this.counters = new Map();
    this.histograms = new Map();
  }
  increment(name, labels = {}, value = 1) {
    const key = name + JSON.stringify(labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }
  recordHistogram(name, val) {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    this.histograms.get(name).push(val);
  }
}

async function runBenchmark() {
  console.log('===============================================================');
  console.log(' LocalSaathi Phase 21: Observability Telemetry Benchmark');
  console.log(' Target: Microsecond-scale overhead (< 2.0ms per HTTP lifecycle)');
  console.log('===============================================================\n');

  const ITERATIONS = 10000;
  const metrics = new MockMetrics();

  // Test 1: AsyncLocalStorage Context Bind & Retrieve
  const t0 = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    als.run({ requestId: `req-${i}`, correlationId: `corr-${i}` }, () => {
      const ctx = als.getStore();
      if (!ctx || ctx.requestId !== `req-${i}`) throw new Error('ALS failure');
    });
  }
  const alsDuration = performance.now() - t0;
  const alsPerOp = (alsDuration / ITERATIONS) * 1000; // in microseconds

  // Test 2: Recursive Secret Redaction on Rich Payload
  const samplePayload = {
    user: 'worker_ramesh',
    token: 'jwt-header.payload.signature',
    credentials: { password: 'secretPassword!', pan: 'ABCDE1234F' },
    job: { title: 'Masonry Work', wage: 800, payment: { cvv: '999', secret: 'abc' } },
    tags: ['verified', 'priority'],
  };

  const t1 = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const clean = sanitizeLogData(samplePayload);
    if (clean.credentials.password !== '[REDACTED_SECRET]') throw new Error('Redaction failed');
  }
  const redactDuration = performance.now() - t1;
  const redactPerOp = (redactDuration / ITERATIONS) * 1000;

  // Test 3: Prometheus Metrics Increment & Histogram Observation
  const t2 = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    metrics.increment('http_requests_total', { method: 'POST', status_class: '2xx' });
    metrics.recordHistogram('http_request_duration_ms', 45.2);
  }
  const metricsDuration = performance.now() - t2;
  const metricsPerOp = (metricsDuration / ITERATIONS) * 1000;

  // Total Combined Overhead per request
  const combinedPerRequestUs = alsPerOp + redactPerOp + metricsPerOp;
  const combinedPerRequestMs = combinedPerRequestUs / 1000;

  console.log(`[1] AsyncLocalStorage Bind + Retrieve : ${alsPerOp.toFixed(3)} µs/op (${(alsDuration).toFixed(2)} ms total)`);
  console.log(`[2] Deep Recursive Secret Redaction    : ${redactPerOp.toFixed(3)} µs/op (${(redactDuration).toFixed(2)} ms total)`);
  console.log(`[3] Metrics In-Memory Counter+Histogram: ${metricsPerOp.toFixed(3)} µs/op (${(metricsDuration).toFixed(2)} ms total)`);
  console.log('---------------------------------------------------------------');
  console.log(`Measured microbenchmark overhead was ${combinedPerRequestUs.toFixed(2)} µs per benchmark iteration under the documented benchmark workload (${combinedPerRequestMs.toFixed(4)} ms).`);
  console.log('---------------------------------------------------------------');
  console.log('Benchmark Environment Specifications:');
  console.log(`  - Node.js Version  : ${process.version}`);
  console.log(`  - Platform / Arch  : ${process.platform} / ${process.arch}`);
  console.log(`  - Iterations Count : ${ITERATIONS.toLocaleString()} iterations`);
  console.log('  - Payload Profile  : Nested user profile with authentication tokens, credentials, and job metadata');
  console.log('  - Workload Scope   : Database & Network I/O EXCLUDED; Concurrent requests EXCLUDED');
  console.log('Limitation:');
  console.log('  "This benchmark measures instrumentation computation overhead only and is not a production end-to-end latency measurement."');
  console.log('===============================================================\n');
}

runBenchmark().catch(console.error);
