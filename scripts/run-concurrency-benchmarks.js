/**
 * ==============================================================================
 * LocalSaathi — Phase 18 Concurrency & Load Benchmark Suite
 * Measures real-world throughput, latency percentiles, error rate, and resource
 * consumption under concurrent loads.
 * ==============================================================================
 */

const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function request(options, body) {
  return new Promise((resolve, reject) => {
    const startTime = process.hrtime.bigint();
    const req = http.request(options, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1e6;
        let json;
        try {
          json = JSON.parse(buf);
          if (json && typeof json === 'object' && json.success === true && json.data !== undefined) {
            json = json.data;
          }
        } catch {
          json = buf;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json,
          latencyMs,
        });
      });
    });
    req.on('error', (err) => {
      const endTime = process.hrtime.bigint();
      const latencyMs = Number(endTime - startTime) / 1e6;
      resolve({
        status: 500,
        headers: {},
        body: err.message,
        latencyMs,
        error: err,
      });
    });
    if (body) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(data);
    }
    req.end();
  });
}

const AUTH_PEPPER =
  process.env.AUTH_PEPPER ||
  'localsaathi_development_auth_pepper_secret_minimum_32_characters';

function hashOtp(phone, otp) {
  return crypto
    .createHmac('sha256', AUTH_PEPPER)
    .update(`${phone}:${otp}`)
    .digest('hex');
}

function normalizePhone(p) {
  const digits = p.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function findOtpForPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) throw new Error(`No active OTP challenge in DB for ${phone}`);
  for (let i = 0; i <= 999999; i++) {
    const candidate = i.toString().padStart(6, '0');
    if (hashOtp(phone, candidate) === challenge.otpHash) return candidate;
  }
  throw new Error(`Could not recover OTP for ${phone}`);
}

async function authenticateUser(phone, role) {
  await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/auth/otp/request',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { phone, role }
  );
  const otp = await findOtpForPhone(phone);
  const verifyRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/auth/otp/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { phone, otp, role }
  );
  const accessToken = verifyRes.body?.accessToken || verifyRes.body?.data?.accessToken;
  const user = verifyRes.body?.user || verifyRes.body?.data?.user;

  if (verifyRes.status !== 200 || !accessToken) {
    throw new Error(`Auth failed for ${phone}: ${JSON.stringify(verifyRes.body)}`);
  }
  return { token: accessToken, userId: user.id };
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { p50, p95, p99, avg, min, max };
}

async function runConcurrentBatch(name, concurrency, makeRequestFn) {
  process.stdout.write(`  [Concurrency ${concurrency.toString().padStart(3)}] Running ${name}... `);
  const startCpu = process.cpuUsage();
  const startMem = process.memoryUsage().rss / (1024 * 1024);
  const startTime = Date.now();

  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    promises.push(makeRequestFn(i));
  }

  const results = await Promise.all(promises);
  const durationMs = Date.now() - startTime;
  const durationSec = durationMs / 1000;
  const endCpu = process.cpuUsage(startCpu);
  const endMem = process.memoryUsage().rss / (1024 * 1024);

  const errors = results.filter((r) => r.status < 200 || r.status >= 400);
  const errorRate = (errors.length / concurrency) * 100;
  const latencies = results.map((r) => r.latencyMs);
  const stats = calculatePercentiles(latencies);
  const throughput = concurrency / (durationSec || 0.001);

  console.log(
    `Done in ${durationMs}ms | Throughput: ${throughput.toFixed(1)} req/s | p50: ${stats.p50.toFixed(1)}ms | p95: ${stats.p95.toFixed(1)}ms | p99: ${stats.p99.toFixed(1)}ms | Errors: ${errorRate.toFixed(1)}%`
  );

  return {
    name,
    concurrency,
    totalRequests: concurrency,
    durationMs,
    throughput: Number(throughput.toFixed(2)),
    p50: Number(stats.p50.toFixed(2)),
    p95: Number(stats.p95.toFixed(2)),
    p99: Number(stats.p99.toFixed(2)),
    avg: Number(stats.avg.toFixed(2)),
    min: Number(stats.min.toFixed(2)),
    max: Number(stats.max.toFixed(2)),
    errorRate: Number(errorRate.toFixed(2)),
    memoryDeltaMb: Number((endMem - startMem).toFixed(2)),
    cpuUserMs: Math.round(endCpu.user / 1000),
    cpuSystemMs: Math.round(endCpu.system / 1000),
  };
}

async function runBenchmarkSuite() {
  console.log('================================================================');
  console.log('LOCALSAATHI PHASE 18 CONCURRENCY & LOAD BENCHMARKS');
  console.log('Target Scenarios: Discovery, Job Details, Messages, Notifications,');
  console.log('                  Analytics Ingest, and Admin Overview');
  console.log('================================================================\n');

  await prisma.$connect();
  const runId = Date.now();

  // 1. Setup Worker
  console.log('1. Setting up Authenticated Test Users & Profiles...');
  const workerPhone = `+91998${Math.floor(1000000 + Math.random() * 9000000)}`;
  const workerAuth = await authenticateUser(workerPhone, 'WORKER');
  
  await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerAuth.token}`,
      },
    },
    {
      displayName: 'Benchmark Worker',
      experienceYears: 4,
      preferredRadiusKm: 25,
    }
  );

  await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me/location',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerAuth.token}`,
      },
    },
    {
      latitude: 26.8500,
      longitude: 80.9480,
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
      accuracyMeters: 5,
    }
  );

  // 2. Setup Employer
  const employerPhone = `+91997${Math.floor(1000000 + Math.random() * 9000000)}`;
  const employerAuth = await authenticateUser(employerPhone, 'EMPLOYER');
  await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/employers/me',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employerAuth.token}`,
      },
    },
    {
      businessName: 'Benchmark Enterprise',
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
    }
  );

  // Find active published job
  let targetJob = await prisma.jobPost.findFirst({
    where: { status: 'PUBLISHED', deletedAt: null },
    include: { jobLocation: true },
  });

  if (!targetJob) {
    throw new Error('No published job found in database.');
  }

  // 3. Setup Admin User
  const adminPhone = `+91996${Math.floor(1000000 + Math.random() * 9000000)}`;
  const adminAuth = await authenticateUser(adminPhone, 'WORKER');
  await prisma.user.update({
    where: { id: adminAuth.userId },
    data: { role: 'ADMIN' },
  });

  // 4. Setup Conversation between Worker & Employer
  const convRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/conversations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerAuth.token}`,
      },
    },
    { recipientUserId: employerAuth.userId }
  );
  const conversationId = convRes.body?.id || convRes.body?.conversation?.id;

  console.log(`Entities ready: JobID=${targetJob.id}, ConvID=${conversationId || 'N/A'}\n`);

  const benchmarkResults = [];

  // ==========================================================================
  // SCENARIO 1: Job Discovery Concurrent Requests (10, 50, 100)
  // ==========================================================================
  console.log('--- SCENARIO 1: Job Discovery (PostGIS Geospatial Matching) ---');
  for (const c of [10, 50, 100]) {
    const res = await runConcurrentBatch('Job Discovery', c, () =>
      request({
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/workers/me/jobs',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${workerAuth.token}`,
          'Accept-Encoding': 'gzip, deflate',
        },
      })
    );
    benchmarkResults.push(res);
  }
  console.log('');

  // ==========================================================================
  // SCENARIO 2: Job Details Concurrent Requests (10, 50, 100)
  // ==========================================================================
  console.log('--- SCENARIO 2: Job Details Fetch (10, 50, 100) ---');
  for (const c of [10, 50, 100]) {
    const res = await runConcurrentBatch('Job Details', c, () =>
      request({
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/workers/jobs/${targetJob.id}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${workerAuth.token}`,
          'Accept-Encoding': 'gzip, deflate',
        },
      })
    );
    benchmarkResults.push(res);
  }
  console.log('');

  // ==========================================================================
  // SCENARIO 3: Messaging Traffic Concurrent Senders (10, 25, 50)
  // ==========================================================================
  if (conversationId) {
    console.log('--- SCENARIO 3: Messaging Senders Concurrent (10, 25, 50) ---');
    for (const c of [10, 25, 50]) {
      const res = await runConcurrentBatch('Messaging Send', c, (idx) =>
        request(
          {
            hostname: 'localhost',
            port: 4000,
            path: `/api/v1/conversations/${conversationId}/messages`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${workerAuth.token}`,
              'Accept-Encoding': 'gzip, deflate',
            },
          },
          {
            body: `Concurrent message ${idx} test at ${Date.now()}`,
            clientMessageId: crypto.randomUUID(),
          }
        )
      );
      benchmarkResults.push(res);
    }
    console.log('');
  }

  // ==========================================================================
  // SCENARIO 4: Notifications Burst (50 concurrent)
  // ==========================================================================
  console.log('--- SCENARIO 4: Notifications Burst (50 concurrent) ---');
  const notifRes = await runConcurrentBatch('Notification Fetch', 50, () =>
    request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/notifications',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${workerAuth.token}`,
        'Accept-Encoding': 'gzip, deflate',
      },
    })
  );
  benchmarkResults.push(notifRes);
  console.log('');

  // ==========================================================================
  // SCENARIO 5: Analytics Ingestion Burst (100 concurrent)
  // ==========================================================================
  console.log('--- SCENARIO 5: Analytics Ingestion Burst (100 concurrent) ---');
  const analyticsRes = await runConcurrentBatch('Analytics Event Ingest', 100, (idx) =>
    request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/analytics/events',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerAuth.token}`,
          'Accept-Encoding': 'gzip, deflate',
        },
      },
      {
        eventId: crypto.randomUUID(),
        eventName: 'job_viewed',
        occurredAt: new Date().toISOString(),
        platform: 'web',
        appVersion: '1.0.0',
        metadata: { jobId: targetJob.id, rank: idx },
      }
    )
  );
  benchmarkResults.push(analyticsRes);
  console.log('');

  // ==========================================================================
  // SCENARIO 6: Admin Dashboard Concurrent Queries (20 concurrent)
  // ==========================================================================
  console.log('--- SCENARIO 6: Admin Dashboard Overview (20 concurrent) ---');
  const adminRes = await runConcurrentBatch('Admin Overview Metrics', 20, () =>
    request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/admin/overview',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminAuth.token}`,
        'Accept-Encoding': 'gzip, deflate',
      },
    })
  );
  benchmarkResults.push(adminRes);
  console.log('');

  // ==========================================================================
  // SUMMARY REPORT
  // ==========================================================================
  console.log('================================================================');
  console.log('SUMMARY BENCHMARK REPORT TABLE');
  console.log('================================================================');
  console.table(
    benchmarkResults.map((r) => ({
      Scenario: r.name,
      Concurrency: r.concurrency,
      'Throughput (req/s)': r.throughput,
      'p50 (ms)': r.p50,
      'p95 (ms)': r.p95,
      'p99 (ms)': r.p99,
      'Errors (%)': `${r.errorRate}%`,
      'Mem Delta (MB)': r.memoryDeltaMb,
    }))
  );

  console.log('\nJSON Output:');
  console.log(JSON.stringify(benchmarkResults, null, 2));

  await prisma.$disconnect();
}

runBenchmarkSuite().catch((err) => {
  console.error('Benchmark suite error:', err);
  process.exit(1);
});
