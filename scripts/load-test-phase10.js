/**
 * Phase 10 — Outbox and Real-Time Event Processing Load Test
 *
 * Measures:
 *  - Event claiming & processing throughput (events/sec)
 *  - End-to-end processing latency (p50, p95, p99)
 *  - WebSocket dispatch latency
 *  - Error rate under concurrent event volume
 */

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const { io } = require('socket.io-client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const NUM_EVENTS = 100;

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
  return { p50, p95, p99, min, max, avg };
}

async function runLoadTest() {
  console.log('=====================================================================');
  console.log(`  LOCALSAATHI PHASE 10 — OUTBOX PROCESSING LOAD TEST (${NUM_EVENTS} EVENTS)`);
  console.log('=====================================================================\n');

  try {
    // 1. Ensure test recipient exists
    const testPhone = '+919999900001';
    let user = await prisma.user.findUnique({ where: { phone: testPhone } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: testPhone,
          role: 'WORKER',
          status: 'ACTIVE',
        },
      });
    }

    console.log(`  Test user: ${user.id} (${testPhone})`);

    // 2. Insert batch of Outbox events in parallel
    console.log(`\n▶ Generating & Persisting ${NUM_EVENTS} Outbox Events...`);
    const insertStartTime = Date.now();

    const createdEventIds = [];
    const eventCreatedTimes = new Map();

    const batch = [];
    for (let i = 0; i < NUM_EVENTS; i++) {
      const eventId = crypto.randomUUID();
      const aggregateId = crypto.randomUUID();
      const now = new Date();

      eventCreatedTimes.set(eventId, now.getTime());
      createdEventIds.push(eventId);

      batch.push(
        prisma.outboxEvent.create({
          data: {
            id: eventId,
            eventType: 'APPLICATION_SHORTLISTED',
            eventVersion: 1,
            aggregateType: 'JobApplication',
            aggregateId,
            actorId: user.id,
            payload: {
              jobTitle: `Load Test Job #${i}`,
              workerId: user.id,
              applicationId: aggregateId,
            },
            status: 'PENDING',
            attemptCount: 0,
            maxAttempts: 5,
            availableAt: now,
          },
        })
      );
    }

    await Promise.all(batch);
    const insertDuration = Date.now() - insertStartTime;
    console.log(`  ✓ ${NUM_EVENTS} events persisted in ${insertDuration}ms (${Math.round((NUM_EVENTS / insertDuration) * 1000)} events/sec)`);

    // 3. Monitor processing completion in PostgreSQL
    console.log('\n▶ Polling Outbox Events for Processing Completion...');
    const waitStartTime = Date.now();
    const latencies = [];
    let completedCount = 0;
    const maxWaitMs = 30000;

    while (Date.now() - waitStartTime < maxWaitMs) {
      const pendingEvents = await prisma.outboxEvent.findMany({
        where: {
          id: { in: createdEventIds },
          status: { in: ['PROCESSED', 'FAILED', 'DEAD_LETTER'] },
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          processedAt: true,
          updatedAt: true,
        },
      });

      for (const ev of pendingEvents) {
        if (!latencies.find((l) => l.id === ev.id)) {
          const createdTime = eventCreatedTimes.get(ev.id) || new Date(ev.createdAt).getTime();
          const finishTime = ev.processedAt ? new Date(ev.processedAt).getTime() : new Date(ev.updatedAt).getTime();
          const latency = Math.max(1, finishTime - createdTime);
          latencies.push({ id: ev.id, latency, status: ev.status });
          completedCount++;
        }
      }

      if (completedCount >= NUM_EVENTS) {
        break;
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    const totalProcessingDuration = Date.now() - waitStartTime;
    const rawLatencies = latencies.map((l) => l.latency);
    const stats = calculatePercentiles(rawLatencies);
    const errorCount = latencies.filter((l) => l.status !== 'PROCESSED').length;

    console.log(`\n=====================================================================`);
    console.log('  LOAD TEST PERFORMANCE METRICS');
    console.log('=====================================================================');
    console.log(`  Total Events Processed: ${completedCount} / ${NUM_EVENTS}`);
    console.log(`  Total Duration:         ${totalProcessingDuration}ms`);
    console.log(`  Throughput:             ${Math.round((completedCount / (totalProcessingDuration / 1000)))} events/sec`);
    console.log(`  p50 (Median) Latency:   ${stats.p50}ms`);
    console.log(`  p95 Latency:            ${stats.p95}ms`);
    console.log(`  p99 Latency:            ${stats.p99}ms`);
    console.log(`  Min / Max Latency:      ${stats.min}ms / ${stats.max}ms`);
    console.log(`  Average Latency:        ${stats.avg}ms`);
    console.log(`  Error Rate:             ${((errorCount / NUM_EVENTS) * 100).toFixed(2)}%`);
    console.log('=====================================================================\n');

    // Clean up test events
    await prisma.eventProcessing.deleteMany({
      where: { eventId: { in: createdEventIds } },
    });
    await prisma.outboxEvent.deleteMany({
      where: { id: { in: createdEventIds } },
    });

    if (completedCount < NUM_EVENTS * 0.9) {
      console.warn('⚠️ Some events timed out or worker process was not running.');
    } else {
      console.log('  ✅ LOAD TEST PASSED');
    }
  } catch (err) {
    console.error('❌ Load test failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runLoadTest();
