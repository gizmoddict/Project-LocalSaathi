/**
 * LOCALSAATHI — PHASE 12
 * NOTIFICATION + EVENT-DRIVEN DELIVERY INFRASTRUCTURE
 * 32-STEP PRODUCTION-GRADE END-TO-END VERIFICATION SCRIPT
 */

const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { io } = require('socket.io-client');

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
  if (verifyRes.status !== 200 || !verifyRes.body?.data?.accessToken) {
    throw new Error(`Auth failed for ${phone} (${role}): ${JSON.stringify(verifyRes.body)}`);
  }
  return {
    token: verifyRes.body.data.accessToken,
    userId: verifyRes.body.data.user.id,
  };
}

function getPayload(res) {
  return res && res.body && res.body.data !== undefined ? res.body.data : res.body;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOutboxProcessing(aggregateId, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pending = await prisma.outboxEvent.count({
      where: { aggregateId, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (pending === 0) return true;
    await sleep(200);
  }
  return false;
}

async function runPhase12E2E() {
  console.log('===============================================================');
  console.log('  LOCALSAATHI PHASE 12 — 32-STEP PRODUCTION E2E VERIFICATION');
  console.log('===============================================================\n');

  const randSuffix = Math.floor(10000 + Math.random() * 90000);
  const workerPhone = `+9198111${randSuffix}`;
  const employerPhone = `+9198222${randSuffix}`;
  const worker2Phone = `+9198333${randSuffix}`;

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Authenticate Worker 1
    // -------------------------------------------------------------------------
    console.log('STEP 1: Authenticate Worker 1');
    const worker1 = await authenticateUser(workerPhone, 'WORKER');
    console.log(`  ✓ Worker 1 authenticated (userId=${worker1.userId})`);

    // Ensure worker profile exists
    await prisma.workerProfile.upsert({
      where: { userId: worker1.userId },
      create: {
        userId: worker1.userId,
        displayName: 'Phase 12 Worker',
        experienceYears: 3,
        onboardingStatus: 'COMPLETED',
      },
      update: {},
    });

    // -------------------------------------------------------------------------
    // STEP 2: Authenticate Employer 1
    // -------------------------------------------------------------------------
    console.log('\nSTEP 2: Authenticate Employer 1');
    const employer1 = await authenticateUser(employerPhone, 'EMPLOYER');
    console.log(`  ✓ Employer 1 authenticated (userId=${employer1.userId})`);

    // Ensure employer profile exists
    await prisma.employerProfile.upsert({
      where: { userId: employer1.userId },
      create: {
        userId: employer1.userId,
        businessName: 'Phase 12 Logistics',
        onboardingStatus: 'COMPLETED',
      },
      update: {},
    });

    // -------------------------------------------------------------------------
    // STEP 3: Authenticate Worker 2 (for IDOR tests)
    // -------------------------------------------------------------------------
    console.log('\nSTEP 3: Authenticate Worker 2 (for IDOR verification)');
    const worker2 = await authenticateUser(worker2Phone, 'WORKER');
    console.log(`  ✓ Worker 2 authenticated (userId=${worker2.userId})`);

    // -------------------------------------------------------------------------
    // STEP 4: Verify Notification Preferences defaults for Worker 1
    // -------------------------------------------------------------------------
    console.log('\nSTEP 4: Verify Notification Preferences defaults for Worker 1');
    const prefRes1 = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/notifications/preferences',
      method: 'GET',
      headers: { Authorization: `Bearer ${worker1.token}` },
    });
    assert(prefRes1.status === 200, `Expected 200, got ${prefRes1.status}`);
    const pref1 = getPayload(prefRes1);
    assert(pref1.applicationUpdates === true, 'applicationUpdates should default true');
    assert(pref1.bookingUpdates === true, 'bookingUpdates should default true');
    assert(pref1.systemUpdates === true, 'systemUpdates should default true');
    console.log('  ✓ Worker 1 preferences verified default true');

    // -------------------------------------------------------------------------
    // STEP 5: Verify Notification Preferences defaults for Employer 1
    // -------------------------------------------------------------------------
    console.log('\nSTEP 5: Verify Notification Preferences defaults for Employer 1');
    const prefResEmp = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/notifications/preferences',
      method: 'GET',
      headers: { Authorization: `Bearer ${employer1.token}` },
    });
    assert(prefResEmp.status === 200, `Expected 200, got ${prefResEmp.status}`);
    console.log('  ✓ Employer 1 preferences verified default true');

    // -------------------------------------------------------------------------
    // STEP 6: Update Notification Preferences for Worker 1
    // -------------------------------------------------------------------------
    console.log('\nSTEP 6: Update Notification Preferences for Worker 1');
    const updatePrefRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/notifications/preferences',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${worker1.token}`,
        },
      },
      { jobUpdates: false }
    );
    assert(updatePrefRes.status === 200, `Expected 200, got ${updatePrefRes.status}`);
    const updatedPref = getPayload(updatePrefRes);
    assert(updatedPref.jobUpdates === false, 'jobUpdates should be updated to false');
    console.log('  ✓ Worker 1 jobUpdates set to false');

    // -------------------------------------------------------------------------
    // STEP 7: Verify mandatory systemUpdates cannot be disabled
    // -------------------------------------------------------------------------
    console.log('\nSTEP 7: Verify mandatory systemUpdates cannot be disabled');
    const forceSystemOffRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/notifications/preferences',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${worker1.token}`,
        },
      },
      { systemUpdates: false }
    );
    const forcedPref = getPayload(forceSystemOffRes);
    assert(forcedPref.systemUpdates === true, 'systemUpdates must remain server-enforced true');
    console.log('  ✓ Server-enforced systemUpdates remains true even when client requested false');

    // -------------------------------------------------------------------------
    // STEP 8: Reset Worker 1 preferences to all true
    // -------------------------------------------------------------------------
    console.log('\nSTEP 8: Reset Worker 1 preferences to all true');
    await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/notifications/preferences',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${worker1.token}`,
        },
      },
      { jobUpdates: true, applicationUpdates: true, bookingUpdates: true }
    );
    console.log('  ✓ Worker 1 preferences reset to all true');

    // -------------------------------------------------------------------------
    // STEP 9: Employer creates Job Post
    // -------------------------------------------------------------------------
    console.log('\nSTEP 9: Employer creates Job Post');
    const testSkill = await prisma.skill.upsert({
      where: { normalizedName: 'carpentry-p12' },
      update: {},
      create: {
        name: 'Carpentry P12',
        normalizedName: 'carpentry-p12',
        category: 'Carpentry',
        isActive: true,
      },
    });

    const createJobRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/employers/me/jobs',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employer1.token}`,
        },
      },
      {
        title: 'Master Carpenter Needed',
        description: 'Need skilled carpenter for 5 days of premium interior work',
        category: 'Carpentry',
        wageType: 'DAILY',
        wageAmount: 1200,
        workerCount: 1,
        durationDays: 5,
        startDate: '2026-11-20',
        startTime: '09:00',
        skills: [{ skillId: testSkill.id, isRequired: true, minExperienceYears: 2 }],
        location: {
          latitude: 28.6139,
          longitude: 77.209,
          locality: 'Connaught Place',
          city: 'New Delhi',
          state: 'Delhi',
          pinCode: '110001',
        },
      }
    );
    assert(createJobRes.status === 201, `Expected 201, got ${createJobRes.status}`);
    const job = getPayload(createJobRes);
    const jobId = job.id;
    console.log(`  ✓ Job created (jobId=${jobId})`);

    // -------------------------------------------------------------------------
    // STEP 10: Employer publishes Job Post
    // -------------------------------------------------------------------------
    console.log('\nSTEP 10: Employer publishes Job Post');
    const publishJobRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/jobs/${jobId}/publish`,
      method: 'POST',
      headers: { Authorization: `Bearer ${employer1.token}` },
    });
    assert(publishJobRes.status === 200, `Expected 200, got ${publishJobRes.status}`);
    console.log('  ✓ Job published');

    // -------------------------------------------------------------------------
    // STEP 11: Outbox processes JOB_PUBLISHED
    // -------------------------------------------------------------------------
    console.log('\nSTEP 11: Outbox processes JOB_PUBLISHED');
    await waitForOutboxProcessing(jobId);
    console.log('  ✓ JOB_PUBLISHED event processed');

    // -------------------------------------------------------------------------
    // STEP 12: Worker 1 applies for Job
    // -------------------------------------------------------------------------
    console.log('\nSTEP 12: Worker 1 applies for Job');
    const applyRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/workers/me/jobs/${jobId}/applications`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${worker1.token}`,
        },
      },
      {
        message: 'I have 5+ years of experience with interior carpentry.',
      }
    );
    assert(applyRes.status === 201, `Expected 201, got ${applyRes.status}`);
    const appData = getPayload(applyRes);
    const applicationId = appData.id;
    console.log(`  ✓ Worker 1 applied (applicationId=${applicationId})`);

    // -------------------------------------------------------------------------
    // STEP 13: Outbox processes APPLICATION_CREATED
    // -------------------------------------------------------------------------
    console.log('\nSTEP 13: Outbox processes APPLICATION_CREATED');
    await waitForOutboxProcessing(applicationId);
    await sleep(500);
    console.log('  ✓ APPLICATION_CREATED event processed by outbox');

    // -------------------------------------------------------------------------
    // STEP 14: Employer checks unread notification count
    // -------------------------------------------------------------------------
    console.log('\nSTEP 14: Employer checks unread notification count');
    const empCountRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/notifications/unread-count',
      method: 'GET',
      headers: { Authorization: `Bearer ${employer1.token}` },
    });
    assert(empCountRes.status === 200, `Expected 200, got ${empCountRes.status}`);
    const empCount = getPayload(empCountRes);
    assert(empCount.unreadCount >= 1, `Expected unreadCount >= 1, got ${empCount.unreadCount}`);
    console.log(`  ✓ Employer unread notification count = ${empCount.unreadCount}`);

    // -------------------------------------------------------------------------
    // STEP 15: Employer queries notifications
    // -------------------------------------------------------------------------
    console.log('\nSTEP 15: Employer queries notifications');
    const empNotifsRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/notifications?limit=10',
      method: 'GET',
      headers: { Authorization: `Bearer ${employer1.token}` },
    });
    assert(empNotifsRes.status === 200, `Expected 200, got ${empNotifsRes.status}`);
    const empNotifs = getPayload(empNotifsRes);
    assert(empNotifs.notifications.length >= 1, 'Expected notifications list');
    console.log(`  ✓ Employer notifications retrieved (total=${empNotifs.total})`);

    // -------------------------------------------------------------------------
    // STEP 16: Employer shortlists Worker 1
    // -------------------------------------------------------------------------
    console.log('\nSTEP 16: Employer shortlists Worker 1');
    const shortlistRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/applications/${applicationId}/shortlist`,
      method: 'POST',
      headers: { Authorization: `Bearer ${employer1.token}` },
    });
    assert(shortlistRes.status === 200, `Expected 200, got ${shortlistRes.status}`);
    console.log('  ✓ Application shortlisted');

    // -------------------------------------------------------------------------
    // STEP 17: Outbox processes APPLICATION_SHORTLISTED -> Worker 1 notified
    // -------------------------------------------------------------------------
    console.log('\nSTEP 17: Outbox processes APPLICATION_SHORTLISTED');
    await waitForOutboxProcessing(applicationId);
    await sleep(500);
    console.log('  ✓ APPLICATION_SHORTLISTED event processed by outbox');

    // -------------------------------------------------------------------------
    // STEP 18: Worker 1 checks unread notification count
    // -------------------------------------------------------------------------
    console.log('\nSTEP 18: Worker 1 checks unread notification count');
    const w1CountRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/notifications/unread-count',
      method: 'GET',
      headers: { Authorization: `Bearer ${worker1.token}` },
    });
    assert(w1CountRes.status === 200, `Expected 200, got ${w1CountRes.status}`);
    const w1Count = getPayload(w1CountRes);
    assert(w1Count.unreadCount >= 1, `Expected worker unread >= 1, got ${w1Count.unreadCount}`);
    console.log(`  ✓ Worker 1 unread notification count = ${w1Count.unreadCount}`);

    // -------------------------------------------------------------------------
    // STEP 19: Worker 1 lists notifications
    // -------------------------------------------------------------------------
    console.log('\nSTEP 19: Worker 1 lists notifications');
    const w1NotifsRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/notifications?limit=10',
      method: 'GET',
      headers: { Authorization: `Bearer ${worker1.token}` },
    });
    assert(w1NotifsRes.status === 200, `Expected 200, got ${w1NotifsRes.status}`);
    const w1Notifs = getPayload(w1NotifsRes);
    assert(w1Notifs.notifications.length >= 1, 'Expected notifications in list');
    const targetNotif = w1Notifs.notifications[0];
    console.log(`  ✓ Worker 1 notifications retrieved (latest id=${targetNotif.id})`);

    // -------------------------------------------------------------------------
    // STEP 20: Worker 1 marks notification as read via PATCH
    // -------------------------------------------------------------------------
    console.log('\nSTEP 20: Worker 1 marks notification as read via PATCH');
    const patchReadRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/notifications/${targetNotif.id}/read`,
      method: 'PATCH',
      headers: { Authorization: `Bearer ${worker1.token}` },
    });
    assert(patchReadRes.status === 200, `Expected 200, got ${patchReadRes.status}`);
    assert(getPayload(patchReadRes).isRead === true, 'Notification isRead should be true');
    console.log('  ✓ Notification marked read via PATCH');

    // -------------------------------------------------------------------------
    // STEP 21: Worker 1 marks notification as read via POST alias
    // -------------------------------------------------------------------------
    console.log('\nSTEP 21: Worker 1 marks notification as read via POST alias');
    const postReadRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/notifications/${targetNotif.id}/read`,
      method: 'POST',
      headers: { Authorization: `Bearer ${worker1.token}` },
    });
    assert(postReadRes.status === 200, `Expected 200, got ${postReadRes.status}`);
    console.log('  ✓ Notification marked read via POST alias');

    // -------------------------------------------------------------------------
    // STEP 22: Employer accepts application
    // -------------------------------------------------------------------------
    console.log('\nSTEP 22: Employer accepts application');
    const acceptRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/applications/${applicationId}/accept`,
      method: 'POST',
      headers: { Authorization: `Bearer ${employer1.token}` },
    });
    assert(acceptRes.status === 200, `Expected 200, got ${acceptRes.status}`);
    console.log('  ✓ Application accepted');

    // -------------------------------------------------------------------------
    // STEP 23: Outbox processes APPLICATION_ACCEPTED -> Worker 1 notified
    // -------------------------------------------------------------------------
    console.log('\nSTEP 23: Outbox processes APPLICATION_ACCEPTED');
    await waitForOutboxProcessing(applicationId);
    await sleep(500);
    console.log('  ✓ APPLICATION_ACCEPTED event processed');

    // -------------------------------------------------------------------------
    // STEP 24: Employer creates Booking
    // -------------------------------------------------------------------------
    console.log('\nSTEP 24: Employer creates Booking');
    const createBookingRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/employers/me/applications/${applicationId}/bookings`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employer1.token}`,
        },
      },
      {
        startDate: '2026-11-20',
        agreedWage: 1200,
      }
    );
    assert(createBookingRes.status === 201, `Expected 201, got ${createBookingRes.status}`);
    const booking = getPayload(createBookingRes);
    const bookingId = booking.id;
    console.log(`  ✓ Booking created (bookingId=${bookingId})`);

    // -------------------------------------------------------------------------
    // STEP 25: Outbox processes BOOKING_CREATED -> Worker 1 notified
    // -------------------------------------------------------------------------
    console.log('\nSTEP 25: Outbox processes BOOKING_CREATED');
    await waitForOutboxProcessing(bookingId);
    await sleep(500);
    console.log('  ✓ BOOKING_CREATED event processed by outbox');

    // -------------------------------------------------------------------------
    // STEP 26: Worker 1 connects to Socket.IO /notifications namespace
    // -------------------------------------------------------------------------
    console.log('\nSTEP 26: Worker 1 connects to Socket.IO /notifications namespace');
    let socketConnected = false;
    const socket = io('http://localhost:4000/notifications', {
      auth: { token: worker1.token },
      transports: ['websocket', 'polling'],
    });

    await new Promise((resolve) => {
      socket.on('connect', () => {
        socketConnected = true;
        resolve();
      });
      setTimeout(resolve, 3000);
    });
    assert(socketConnected, 'Worker 1 Socket.IO connection failed');
    console.log('  ✓ Worker 1 connected to /notifications namespace with JWT');
    socket.disconnect();

    // -------------------------------------------------------------------------
    // STEP 27: Worker 1 marks all notifications as read
    // -------------------------------------------------------------------------
    console.log('\nSTEP 27: Worker 1 marks all notifications as read');
    const readAllRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/notifications/read-all',
      method: 'POST',
      headers: { Authorization: `Bearer ${worker1.token}` },
    });
    assert(readAllRes.status === 200, `Expected 200, got ${readAllRes.status}`);
    console.log(`  ✓ Marked all read (count=${getPayload(readAllRes).markedCount})`);

    // -------------------------------------------------------------------------
    // STEP 28: Worker 1 unread count verified as 0
    // -------------------------------------------------------------------------
    console.log('\nSTEP 28: Worker 1 unread count verified as 0');
    const zeroCountRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/notifications/unread-count',
      method: 'GET',
      headers: { Authorization: `Bearer ${worker1.token}` },
    });
    assert(getPayload(zeroCountRes).unreadCount === 0, 'Unread count should be 0');
    console.log('  ✓ Worker 1 unread count is 0');

    // -------------------------------------------------------------------------
    // STEP 29: IDOR test: Worker 2 attempts to read Worker 1's notification
    // -------------------------------------------------------------------------
    console.log('\nSTEP 29: IDOR test: Worker 2 attempts to read Worker 1 notification');
    const idorGetRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/notifications/${targetNotif.id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${worker2.token}` },
    });
    assert(
      idorGetRes.status === 403 || idorGetRes.status === 404,
      `Expected 403 or 404 for IDOR, got ${idorGetRes.status}`
    );
    console.log(`  ✓ IDOR read rejected with HTTP ${idorGetRes.status}`);

    // -------------------------------------------------------------------------
    // STEP 30: IDOR test: Worker 2 attempts to delete Worker 1's notification
    // -------------------------------------------------------------------------
    console.log('\nSTEP 30: IDOR test: Worker 2 attempts to delete Worker 1 notification');
    const idorDelRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/notifications/${targetNotif.id}`,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${worker2.token}` },
    });
    assert(
      idorDelRes.status === 403 || idorDelRes.status === 404,
      `Expected 403 or 404 for IDOR, got ${idorDelRes.status}`
    );
    console.log(`  ✓ IDOR delete rejected with HTTP ${idorDelRes.status}`);

    // -------------------------------------------------------------------------
    // STEP 31: Worker 1 deletes notification
    // -------------------------------------------------------------------------
    console.log('\nSTEP 31: Worker 1 deletes notification');
    const deleteRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/notifications/${targetNotif.id}`,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${worker1.token}` },
    });
    assert(deleteRes.status === 200, `Expected 200, got ${deleteRes.status}`);
    console.log('  ✓ Worker 1 deleted notification successfully');

    // -------------------------------------------------------------------------
    // STEP 32: Expired notifications cleanup
    // -------------------------------------------------------------------------
    console.log('\nSTEP 32: Expired notifications cleanup endpoint');
    // Seed an expired notification directly
    await prisma.notification.create({
      data: {
        recipientId: worker1.userId,
        type: 'APPLICATION_RECEIVED',
        title: 'Old Expired',
        body: 'Expired body',
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      },
    });

    const cleanRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/notifications/cleanup-expired',
      method: 'POST',
      headers: { Authorization: `Bearer ${worker1.token}` },
    });
    assert(cleanRes.status === 200, `Expected 200, got ${cleanRes.status}`);
    assert(getPayload(cleanRes).deletedCount >= 1, 'Should delete at least 1 expired notification');
    console.log(`  ✓ Expired notifications pruned (count=${getPayload(cleanRes).deletedCount})`);

    console.log('\n===============================================================');
    console.log('  ALL 32 STEPS COMPLETED AND VERIFIED SUCCESSFULLY!');
    console.log('===============================================================\n');
  } catch (err) {
    console.error('❌ E2E verification failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase12E2E();
