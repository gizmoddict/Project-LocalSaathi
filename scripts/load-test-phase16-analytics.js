/**
 * ==============================================================================
 * LocalSaathi — Phase 16 Product Analytics Load & Throughput Benchmark
 * Simulates high-throughput client telemetry ingestion and admin analytics queries
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
    const req = http.request(options, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(buf);
          if (json && typeof json === 'object' && json.success === true && json.data !== undefined) {
            json = json.data;
          }
        } catch {
          json = buf;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
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

async function runBenchmark() {
  console.log('⚡ STARTING PHASE 16 PRODUCT ANALYTICS LOAD & BENCHMARK SUITE');

  await prisma.$connect();
  const runId = Date.now();

  const adminPhone = `+91991${Math.floor(1000000 + Math.random() * 9000000)}`;
  const adminAuth = await authenticateUser(adminPhone, 'WORKER');
  await prisma.user.update({
    where: { id: adminAuth.userId },
    data: { role: 'ADMIN' },
  });
  const adminToken = adminAuth.token;

  try {
    // 1. High-throughput single event ingest benchmark
    console.log('\n--- 1. SINGLE EVENT INGESTION BENCHMARK (100 sequential events) ---');
    const startSingle = Date.now();
    for (let i = 0; i < 100; i++) {
      const res = await request(
        {
          hostname: 'localhost',
          port: 4000,
          path: '/api/v1/analytics/events',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          eventId: `bench_single_${runId}_${i}`,
          eventName: 'job_viewed',
          metadata: { index: i, benchmark: true },
        }
      );
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Single ingest failed at ${i}: status ${res.status}`);
      }
    }
    const singleDurationMs = Date.now() - startSingle;
    console.log(`✅ 100 single events ingested in ${singleDurationMs}ms (avg ${(singleDurationMs / 100).toFixed(2)}ms/req)`);

    // 2. High-throughput batch ingest benchmark (10 batches of 50 events = 500 events)
    console.log('\n--- 2. BATCH EVENT INGESTION BENCHMARK (10 batches of 50 events = 500 events) ---');
    const startBatch = Date.now();
    for (let b = 0; b < 10; b++) {
      const events = [];
      for (let j = 0; j < 50; j++) {
        events.push({
          eventId: `bench_batch_${runId}_${b}_${j}`,
          eventName: 'voice_search_used',
          metadata: { batchIndex: b, itemIndex: j, queryLang: 'hi' },
        });
      }
      const res = await request(
        {
          hostname: 'localhost',
          port: 4000,
          path: '/api/v1/analytics/events/batch',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        { events }
      );
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Batch ingest failed at batch ${b}: status ${res.status}`);
      }
    }
    const batchDurationMs = Date.now() - startBatch;
    console.log(`✅ 500 batch events ingested in ${batchDurationMs}ms (throughput: ${(500 / (batchDurationMs / 1000)).toFixed(1)} events/sec)`);

    // 3. Admin Explorer query latency under load
    console.log('\n--- 3. ADMIN EXPLORER LATENCY BENCHMARK ---');
    const startQuery = Date.now();
    const resExp = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/analytics/admin/events?page=1&limit=50',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const queryDurationMs = Date.now() - startQuery;
    console.log(`✅ Admin Explorer returned ${resExp.body?.data?.length} records in ${queryDurationMs}ms (Total DB events: ${resExp.body?.total})`);

    // 4. Metrics aggregation query latency
    console.log('\n--- 4. METRICS AGGREGATION LATENCY BENCHMARK ---');
    const startMetrics = Date.now();
    const resMet = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/analytics/admin/metrics?timeframe=30d',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const metricsDurationMs = Date.now() - startMetrics;
    console.log(`✅ Product Analytics Metrics computed in ${metricsDurationMs}ms (Total Interactions: ${resMet.body?.engagement?.totalInteractions})`);

    // Clean up benchmark events
    console.log('\n--- CLEANING UP BENCHMARK ARTIFACTS ---');
    await prisma.analyticsEvent.deleteMany({
      where: { eventId: { contains: String(runId) } },
    });
    await prisma.user.delete({ where: { id: adminAuth.userId } });
    console.log('✅ Benchmark cleanup finished cleanly.');

    console.log('\n🎉 LOAD & PERFORMANCE BENCHMARK COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('Benchmark error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runBenchmark();
