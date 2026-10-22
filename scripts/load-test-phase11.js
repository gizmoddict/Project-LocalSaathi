/**
 * LOCALSAATHI — PHASE 11 LOAD & STRESS TEST SCRIPT
 *
 * Evaluates performance, ordering, and concurrency under load:
 *  - Concurrently sends batches of messages across conversations
 *  - Tests 100, 500, and 1,000 messages
 *  - Measures p50, p95, p99 send latencies
 *  - Calculates message throughput (messages / sec)
 *  - Verifies sequence numbers are strictly monotonic and sequential
 *  - Verifies zero collisions or duplicate inserts
 *  - Error rate must be 0% for all valid requests
 */

const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const AUTH_PEPPER =
  process.env.AUTH_PEPPER ||
  'localsaathi_development_auth_pepper_secret_minimum_32_characters';

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(buf);
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
  if (!challenge) throw new Error(`No active OTP challenge for ${phone}`);
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
      port: PORT,
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
      port: PORT,
      path: '/api/v1/auth/otp/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { phone, otp, role }
  );
  return {
    token: verifyRes.body.data.accessToken,
    userId: verifyRes.body.data.user.id,
  };
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return { p50, p95, p99 };
}

async function runLoadStage(stageName, totalMessages, concurrency, users, conversations) {
  console.log(`\n------------------------------------------------------------`);
  console.log(` Starting ${stageName}: ${totalMessages} messages (Concurrency: ${concurrency})`);
  console.log(`------------------------------------------------------------`);

  const latencies = [];
  let errors = 0;
  const startTime = Date.now();

  let messageIndex = 0;
  const workerQueue = async () => {
    while (true) {
      const idx = messageIndex++;
      if (idx >= totalMessages) break;

      const user = users[idx % users.length];
      const conv = conversations[idx % conversations.length];
      const clientMessageId = `load-${stageName}-${idx}-${Date.now()}`;

      const t0 = Date.now();
      try {
        const res = await request(
          {
            hostname: 'localhost',
            port: PORT,
            path: `/api/v1/conversations/${conv.id}/messages`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${user.token}`,
            },
          },
          {
            body: `Load test payload #${idx} at ${new Date().toISOString()}`,
            clientMessageId,
          }
        );
        const duration = Date.now() - t0;
        latencies.push(duration);

        if (res.status !== 201 && res.status !== 200) {
          errors++;
          console.error(`Error sending message #${idx}: HTTP ${res.status}`);
        }
      } catch (err) {
        errors++;
        console.error(`Network error sending message #${idx}:`, err.message);
      }
    }
  };

  // Launch concurrent workers
  const workers = [];
  for (let c = 0; c < concurrency; c++) {
    workers.push(workerQueue());
  }
  await Promise.all(workers);

  const totalTimeSeconds = (Date.now() - startTime) / 1000;
  const throughput = Math.round(totalMessages / (totalTimeSeconds || 1));
  const { p50, p95, p99 } = calculatePercentiles(latencies);
  const errorRate = ((errors / totalMessages) * 100).toFixed(2);

  console.log(`Results for ${stageName}:`);
  console.log(`  ✓ Total completed:  ${latencies.length}/${totalMessages}`);
  console.log(`  ✓ Total duration:   ${totalTimeSeconds.toFixed(2)}s`);
  console.log(`  ✓ Throughput:       ${throughput} messages/sec`);
  console.log(`  ✓ Latency p50:      ${p50}ms`);
  console.log(`  ✓ Latency p95:      ${p95}ms`);
  console.log(`  ✓ Latency p99:      ${p99}ms`);
  console.log(`  ✓ Error rate:       ${errorRate}% (${errors} failures)`);

  if (errors > 0) {
    throw new Error(`${stageName} had ${errors} errors!`);
  }
}

async function verifySequenceIntegrity(conversationIds) {
  console.log(`\nVerifying sequence monotonicity and uniqueness across conversations...`);
  for (const convId of conversationIds) {
    const messages = await prisma.message.findMany({
      where: { conversationId: convId },
      orderBy: { sequenceNumber: 'asc' },
      select: { sequenceNumber: true, id: true },
    });

    for (let i = 0; i < messages.length; i++) {
      const expected = i + 1;
      if (messages[i].sequenceNumber !== expected) {
        throw new Error(
          `Sequence integrity failed in conv ${convId}! Index ${i} has sequence ${messages[i].sequenceNumber}, expected ${expected}`
        );
      }
    }
  }
  console.log(`  ✓ Sequence integrity verified! All sequences strictly monotonic and gapless.`);
}

async function main() {
  console.log('=============================================================');
  console.log(' LOCALSAATHI — PHASE 11 REAL-TIME MESSAGING LOAD TEST');
  console.log('=============================================================\n');

  const ts = Date.now().toString().slice(-6);
  const senderPhone = `9822${ts}`;
  const receiverPhone = `9922${ts}`;

  console.log('Provisioning test users and conversations...');
  const sender = await authenticateUser(senderPhone, 'WORKER');
  const receiver = await authenticateUser(receiverPhone, 'EMPLOYER');

  // Ensure profiles
  await prisma.workerProfile.upsert({
    where: { userId: sender.userId },
    update: {},
    create: {
      userId: sender.userId,
      displayName: 'Load Worker',
      onboardingStatus: 'COMPLETED',
      experienceYears: 3,
      expectedWage: 600,
      wageType: 'DAILY',
    },
  });

  await prisma.employerProfile.upsert({
    where: { userId: receiver.userId },
    update: {},
    create: {
      userId: receiver.userId,
      businessName: 'LoadTest Infra',
      verificationState: 'VERIFIED',
    },
  });

  // Create 5 test conversations for distribution
  const conversations = [];
  for (let i = 0; i < 5; i++) {
    const conv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        members: {
          create: [
            { userId: sender.userId },
            { userId: receiver.userId },
          ],
        },
      },
    });
    conversations.push(conv);
  }
  console.log(`Created ${conversations.length} isolated test conversations.`);

  const users = [sender, receiver];

  // Stage 1: 100 Messages
  await runLoadStage('Stage 1 (100 messages)', 100, 10, users, conversations);

  // Stage 2: 500 Messages
  await runLoadStage('Stage 2 (500 messages)', 500, 25, users, conversations);

  // Stage 3: 1,000 Messages
  await runLoadStage('Stage 3 (1,000 messages)', 1000, 50, users, conversations);

  // Verification
  await verifySequenceIntegrity(conversations.map((c) => c.id));

  console.log('\n=============================================================');
  console.log(' ✅ ALL LOAD TEST STAGES COMPLETED WITH 0% ERROR RATE!');
  console.log('=============================================================\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Load test failed:', err);
    process.exit(1);
  });
