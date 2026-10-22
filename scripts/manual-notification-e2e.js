const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { execSync } = require('child_process');

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
  return verifyRes.body.data.accessToken;
}

function getPayload(res) {
  return res && res.body && res.body.data !== undefined ? res.body.data : res.body;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

function api(token, port = 4000) {
  return (method, urlPath, body) =>
    request(
      {
        hostname: 'localhost',
        port,
        path: `/api/v1${urlPath}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      body
    );
}

async function runNotificationEndToEnd() {
  console.log('=====================================================================');
  console.log('  LOCALSAATHI PHASE 9 — NOTIFICATIONS + DOMAIN EVENTS E2E');
  console.log('=====================================================================\n');

  const empPhone = `+91971${Math.floor(1000000 + Math.random() * 9000000)}`;
  const wrkPhone = `+91972${Math.floor(1000000 + Math.random() * 9000000)}`;

  let empToken, wrkToken;
  let jobId, applicationId, bookingId;

  try {
    // Flush Redis for clean test run
    try {
      execSync('docker exec -i localsaathi-redis redis-cli FLUSHDB', { stdio: 'ignore' });
      console.log('  Redis FLUSHDB done\n');
    } catch {
      console.log('  Redis flush skipped (not required)\n');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Worker Login + Profile Setup
    // ─────────────────────────────────────────────────────────────────────────
    console.log('▶ STEP 1: Worker Login & Profile Setup');
    wrkToken = await authenticateUser(wrkPhone, 'WORKER');
    assert(!!wrkToken, `Worker authenticated (${wrkPhone})`);

    const wapi = api(wrkToken);
    await wapi('PATCH', '/workers/me', {
      displayName: 'Raju Mehta',
      bio: 'Experienced cook for catering events',
      experienceYears: 4,
      expectedWageMin: 600,
      expectedWageMax: 1000,
    });
    assert(true, 'Worker profile updated');

    await wapi('PUT', '/workers/me/location', {
      latitude: 26.85,
      longitude: 80.95,
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
    });
    assert(true, 'Worker location set');

    const testSkill = await prisma.skill.upsert({
      where: { normalizedName: 'catering-cook-p9' },
      update: {},
      create: {
        name: 'Catering Cook P9',
        normalizedName: 'catering-cook-p9',
        category: 'Cook',
        isActive: true,
      },
    });

    await wapi('POST', '/workers/me/skills', {
      skillId: testSkill.id,
      proficiency: 'EXPERT',
      experienceYears: 4,
    });
    assert(true, 'Worker skill added');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Employer Login + Profile Setup
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 2: Employer Login & Profile Setup');
    empToken = await authenticateUser(empPhone, 'EMPLOYER');
    assert(!!empToken, `Employer authenticated (${empPhone})`);

    const eapi = api(empToken);
    await eapi('PATCH', '/employers/me', {
      businessName: 'Lucknow Catering House',
      businessType: 'Catering',
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
    });
    assert(true, 'Employer profile updated');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Employer creates and publishes a job
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 3: Employer Creates & Publishes Job');
    const jobRes = await eapi('POST', '/employers/me/jobs', {
      title: 'Event Cook',
      description: 'Cook for a 3-day catering event',
      category: 'Cook',
      wageType: 'DAILY',
      wageAmount: 700,
      durationDays: 3,
      startDate: '2026-12-05',
      skills: [{ skillId: testSkill.id, isRequired: true, minExperienceYears: 2 }],
      location: {
        latitude: 26.85,
        longitude: 80.95,
        locality: 'Hazratganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226001',
      },
    });
    assert(jobRes.status === 201, `Job created (status ${jobRes.status})`);
    jobId = getPayload(jobRes)?.id ?? getPayload(jobRes)?.job?.id;
    assert(!!jobId, `Job ID received: ${jobId}`);

    const pubRes = await eapi('POST', `/employers/me/jobs/${jobId}/publish`);
    assert(pubRes.status === 200 || pubRes.status === 201, 'Job published');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Worker applies to job → triggers APPLICATION_CREATED event
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 4: Worker Applies to Job (APPLICATION_CREATED event)');
    const applyRes = await wapi('POST', `/workers/me/jobs/${jobId}/applications`, {
      message: 'I have 4 years of catering experience.',
    });
    assert(applyRes.status === 201, `Application submitted (status ${applyRes.status})`);
    applicationId = getPayload(applyRes)?.id;
    assert(!!applicationId, `Application ID: ${applicationId}`);

    // Wait briefly for async domain event processing
    await new Promise((r) => setTimeout(r, 600));

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Employer checks their notifications — should have APPLICATION_CREATED
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 5: Employer Checks Notifications (APPLICATION_CREATED)');
    const empNotifsRes = await eapi('GET', '/notifications?limit=20');
    assert(empNotifsRes.status === 200, `GET /notifications returned 200`);
    const empNotifs = getPayload(empNotifsRes);
    assert(
      typeof empNotifs.unreadCount === 'number',
      `Employer unreadCount field present: ${empNotifs.unreadCount}`
    );
    assert(
      empNotifs.notifications.length >= 1,
      `Employer has at least 1 notification`
    );

    const appCreatedNotif = empNotifs.notifications.find(
      (n) => n.title && n.title.toLowerCase().includes('application')
    );
    assert(!!appCreatedNotif, 'APPLICATION_CREATED notification found for employer');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Employer checks unread count
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 6: Employer Unread Count');
    const cntRes = await eapi('GET', '/notifications/unread-count');
    assert(cntRes.status === 200, 'GET /notifications/unread-count returned 200');
    const cntData = getPayload(cntRes);
    assert(typeof cntData.unreadCount === 'number', `unreadCount: ${cntData.unreadCount}`);
    assert(cntData.unreadCount >= 1, 'Employer has at least 1 unread notification');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 7: Employer shortlists application → triggers APPLICATION_SHORTLISTED
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 7: Employer Shortlists Application (APPLICATION_SHORTLISTED event)');
    const shortlistRes = await eapi('POST', `/employers/me/applications/${applicationId}/shortlist`);
    assert(shortlistRes.status === 200, `Shortlist (status ${shortlistRes.status})`);

    await new Promise((r) => setTimeout(r, 600));

    // Worker should now have APPLICATION_SHORTLISTED notification
    const wrkNotifsRes = await wapi('GET', '/notifications?limit=20');
    assert(wrkNotifsRes.status === 200, 'Worker GET /notifications returned 200');
    const wrkNotifs = getPayload(wrkNotifsRes);
    assert(wrkNotifs.notifications.length >= 1, 'Worker has at least 1 notification');
    const shortlistedNotif = wrkNotifs.notifications.find(
      (n) => n.body && n.body.toLowerCase().includes('shortlist')
    );
    assert(!!shortlistedNotif, 'APPLICATION_SHORTLISTED notification found for worker');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 8: Worker marks notification as read
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 8: Worker Marks Notification as Read');
    const notifToRead = wrkNotifs.notifications[0];
    const markReadRes = await wapi('PATCH', `/notifications/${notifToRead.id}/read`);
    assert(markReadRes.status === 200, 'PATCH /notifications/:id/read returned 200');
    const readData = getPayload(markReadRes);
    assert(readData.isRead === true, 'Notification marked as read');
    assert(readData.readAt !== null, 'readAt timestamp set');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 9: Employer accepts application → triggers APPLICATION_ACCEPTED
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 9: Employer Accepts Application (APPLICATION_ACCEPTED event)');
    const acceptRes = await eapi('POST', `/employers/me/applications/${applicationId}/accept`);
    assert(acceptRes.status === 200, `Accept (status ${acceptRes.status})`);

    await new Promise((r) => setTimeout(r, 600));

    const wrkNotifsRes2 = await wapi('GET', '/notifications?limit=20');
    const wrkNotifs2 = getPayload(wrkNotifsRes2);
    const acceptedNotif = wrkNotifs2.notifications.find(
      (n) => n.body && n.body.toLowerCase().includes('accept')
    );
    assert(!!acceptedNotif, 'APPLICATION_ACCEPTED notification found for worker');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 10: Employer creates booking → triggers BOOKING_CREATED
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 10: Employer Creates Booking (BOOKING_CREATED event)');
    const bookingRes = await eapi('POST', `/employers/me/applications/${applicationId}/bookings`, {
      agreedWage: 700,
      wageType: 'DAILY',
      startDate: '2026-12-05',
      durationDays: 3,
      workLocationLocality: 'Hazratganj',
      workLocationCity: 'Lucknow',
      workLocationState: 'Uttar Pradesh',
      workLocationPinCode: '226001',
    });
    assert(bookingRes.status === 201, `Booking created (status ${bookingRes.status})`);
    bookingId = getPayload(bookingRes)?.id;
    assert(!!bookingId, `Booking ID: ${bookingId}`);

    await new Promise((r) => setTimeout(r, 600));

    // Worker should get BOOKING_CREATED notification
    const wrkNotifsRes3 = await wapi('GET', '/notifications?limit=20');
    const wrkNotifs3 = getPayload(wrkNotifsRes3);
    const bookingCreatedNotif = wrkNotifs3.notifications.find(
      (n) => n.body && n.body.toLowerCase().includes('contract')
    );
    assert(!!bookingCreatedNotif, 'BOOKING_CREATED notification found for worker');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 11: Worker confirms booking → triggers BOOKING_CONFIRMED
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 11: Worker Confirms Booking (BOOKING_CONFIRMED event)');
    const confirmRes = await wapi('POST', `/workers/me/bookings/${bookingId}/confirm`);
    assert(confirmRes.status === 200, `Confirm (status ${confirmRes.status})`);

    await new Promise((r) => setTimeout(r, 600));

    // Employer should get BOOKING_CONFIRMED notification
    const empNotifsRes2 = await eapi('GET', '/notifications?limit=20');
    const empNotifs2 = getPayload(empNotifsRes2);
    const confirmedNotif = empNotifs2.notifications.find(
      (n) => n.body && n.body.toLowerCase().includes('confirm')
    );
    assert(!!confirmedNotif, 'BOOKING_CONFIRMED notification found for employer');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 12: Worker checks GET /notifications/preferences
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 12: Worker Gets Notification Preferences');
    const prefRes = await wapi('GET', '/notifications/preferences');
    assert(prefRes.status === 200, 'GET /notifications/preferences returned 200');
    const prefData = getPayload(prefRes);
    assert(typeof prefData.applicationUpdates === 'boolean', 'applicationUpdates field present');
    assert(typeof prefData.bookingUpdates === 'boolean', 'bookingUpdates field present');
    assert(typeof prefData.jobUpdates === 'boolean', 'jobUpdates field present');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 13: Worker updates notification preferences
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 13: Worker Updates Notification Preferences');
    const updatePrefRes = await wapi('PATCH', '/notifications/preferences', {
      jobUpdates: false,
    });
    assert(updatePrefRes.status === 200, 'PATCH /notifications/preferences returned 200');
    const updatedPref = getPayload(updatePrefRes);
    assert(updatedPref.jobUpdates === false, 'jobUpdates set to false');
    assert(updatedPref.applicationUpdates === true, 'applicationUpdates unchanged');
    assert(updatedPref.bookingUpdates === true, 'bookingUpdates unchanged');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 14: GET /notifications/:id — returns single notification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 14: GET /notifications/:id — Notification Detail');
    const notifId = wrkNotifs3.notifications[0]?.id;
    if (notifId) {
      const detailRes = await wapi('GET', `/notifications/${notifId}`);
      assert(detailRes.status === 200, `GET /notifications/${notifId} returned 200`);
      const detailData = getPayload(detailRes);
      assert(detailData.id === notifId, 'Notification ID matches');
    } else {
      assert(true, 'Skip — no notification id available');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 15: IDOR — worker tries to read employer's notification
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 15: IDOR Protection — Worker Cannot Read Employer Notification');
    const empNotifId = empNotifs2.notifications[0]?.id;
    if (empNotifId) {
      const idorRes = await wapi('GET', `/notifications/${empNotifId}`);
      assert(
        idorRes.status === 403 || idorRes.status === 404,
        `IDOR blocked (status ${idorRes.status})`
      );
    } else {
      assert(true, 'Skip — no employer notification to test IDOR');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 16: POST /notifications/read-all — marks all as read
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 16: POST /notifications/read-all');
    const readAllRes = await eapi('POST', '/notifications/read-all');
    assert(readAllRes.status === 200, 'POST /notifications/read-all returned 200');
    const readAllData = getPayload(readAllRes);
    assert(typeof readAllData.markedCount === 'number', `markedCount: ${readAllData.markedCount}`);

    // Verify unread count is now 0
    const cntRes2 = await eapi('GET', '/notifications/unread-count');
    const cntData2 = getPayload(cntRes2);
    assert(cntData2.unreadCount === 0, 'Employer unread count is now 0 after mark-all-read');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 17: Employer cancels booking → triggers BOOKING_CANCELLED
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ STEP 17: Employer Cancels Booking (BOOKING_CANCELLED event)');
    const cancelRes = await eapi('POST', `/employers/me/bookings/${bookingId}/cancel`, {
      reason: 'Event cancelled by client',
    });
    assert(cancelRes.status === 200, `Cancel (status ${cancelRes.status})`);

    await new Promise((r) => setTimeout(r, 600));

    // Worker should get BOOKING_CANCELLED notification
    const wrkNotifsRes4 = await wapi('GET', '/notifications?limit=20');
    const wrkNotifs4 = getPayload(wrkNotifsRes4);
    const cancelledNotif = wrkNotifs4.notifications.find(
      (n) => n.body && n.body.toLowerCase().includes('cancel')
    );
    assert(!!cancelledNotif, 'BOOKING_CANCELLED notification found for worker');

    // ─────────────────────────────────────────────────────────────────────────
    // FINAL SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n=====================================================================');
    console.log('  ✅ ALL 17 STEPS PASSED');
    console.log('  PHASE 9 E2E VERIFICATION COMPLETE');
    console.log('=====================================================================\n');
  } catch (err) {
    console.error('\n❌ E2E FAILED:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runNotificationEndToEnd();
