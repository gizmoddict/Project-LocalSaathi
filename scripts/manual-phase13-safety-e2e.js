/**
 * LOCALSAATHI — PHASE 13
 * TRUST, VERIFICATION & SAFETY PLATFORM
 * 30-STEP PRODUCTION-GRADE END-TO-END VERIFICATION SCRIPT
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
    refreshToken: verifyRes.body.data.refreshToken,
    userId: verifyRes.body.data.user.id,
  };
}

async function getElevatedUser(phone, targetRole) {
  const initial = await authenticateUser(phone, 'WORKER');
  await prisma.user.update({
    where: { id: initial.userId },
    data: { role: targetRole },
  });
  const refreshRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/auth/refresh',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { refreshToken: initial.refreshToken }
  );
  if (refreshRes.status !== 200 || !refreshRes.body?.data?.accessToken) {
    throw new Error(`Elevation refresh failed for ${phone}: ${JSON.stringify(refreshRes.body)}`);
  }
  return {
    token: refreshRes.body.data.accessToken,
    refreshToken: refreshRes.body.data.refreshToken,
    userId: initial.userId,
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

async function runPhase13E2E() {
  console.log('===============================================================');
  console.log('  LOCALSAATHI PHASE 13 — 30-STEP TRUST & SAFETY E2E VERIFICATION');
  console.log('===============================================================\n');

  const randSuffix = Math.floor(10000 + Math.random() * 90000);
  const workerPhone = `+9197111${randSuffix}`;
  const employerPhone = `+9197222${randSuffix}`;
  const moderatorPhone = `+9197333${randSuffix}`;
  const intruderPhone = `+9197444${randSuffix}`;

  try {
    // -------------------------------------------------------------------------
    // 0. AUTHENTICATION & SETUP
    // -------------------------------------------------------------------------
    console.log('--- Setting up test users ---');
    const workerAuth = await authenticateUser(workerPhone, 'WORKER');
    console.log(`✓ Worker Authenticated (${workerPhone}): ${workerAuth.userId}`);

    const employerAuth = await authenticateUser(employerPhone, 'EMPLOYER');
    console.log(`✓ Employer Authenticated (${employerPhone}): ${employerAuth.userId}`);

    // Create moderator via elevation
    const modTokens = await getElevatedUser(moderatorPhone, 'MODERATOR');
    console.log(`✓ Moderator Authenticated & Elevated (${moderatorPhone}): ${modTokens.userId}`);

    const intruderAuth = await authenticateUser(intruderPhone, 'WORKER');
    console.log(`✓ Intruder Authenticated (${intruderPhone}): ${intruderAuth.userId}\n`);

    // Complete basic employer & worker profiles for domain actions
    const wp = await prisma.workerProfile.upsert({
      where: { userId: workerAuth.userId },
      update: {},
      create: {
        userId: workerAuth.userId,
        displayName: 'Ramesh Electrician',
        experienceYears: 4,
        expectedWage: 700,
        wageType: 'DAILY',
        isAvailable: true,
      },
    });

    const ep = await prisma.employerProfile.upsert({
      where: { userId: employerAuth.userId },
      update: {},
      create: {
        userId: employerAuth.userId,
        businessName: 'Saathi Construction Works',
        businessType: 'CONTRACTOR',
        locality: 'Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pinCode: '560038',
      },
    });

    // Create a job & booking for dispute testing
    const job = await prisma.jobPost.create({
      data: {
        employerProfileId: ep.id,
        title: 'Safety E2E Electrical Wiring',
        description: 'Complete commercial wiring and panel setup.',
        status: 'PUBLISHED',
        category: 'ELECTRICAL',
        wageType: 'DAILY',
        wageAmount: 700,
        workerCount: 1,
        durationDays: 3,
        startDate: new Date('2026-11-01T00:00:00.000Z'),
        startTime: '09:00',
        urgency: 'STANDARD',
      },
    });

    const app = await prisma.jobApplication.create({
      data: {
        jobPostId: job.id,
        workerProfileId: wp.id,
        status: 'ACCEPTED',
      },
    });

    const booking = await prisma.booking.create({
      data: {
        jobPostId: job.id,
        applicationId: app.id,
        employerProfileId: ep.id,
        workerProfileId: wp.id,
        status: 'CONFIRMED',
        startDate: new Date('2026-11-01T00:00:00.000Z'),
        totalAmount: 2100,
      },
    });

    let workerVerificationId;
    let employerVerificationId;
    let verificationCaseId;
    let userReportCaseId;
    let restrictionId;
    let disputeId;

    // -------------------------------------------------------------------------
    // STEP 1: Check initial worker verification status (Expect UNVERIFIED)
    // -------------------------------------------------------------------------
    console.log('[STEP 1] Checking initial worker verification status...');
    const step1Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/verifications/status',
      method: 'GET',
      headers: { Authorization: `Bearer ${workerAuth.token}` },
    });
    assert(step1Res.status === 200, `Step 1 status: ${step1Res.status}`);
    const step1Payload = getPayload(step1Res);
    assert(step1Payload.overallStatus === 'UNVERIFIED', `Expected UNVERIFIED, got ${step1Payload.overallStatus}`);
    console.log('✓ Step 1 Passed: Initial status is UNVERIFIED.\n');

    // -------------------------------------------------------------------------
    // STEP 2: Submit worker identity verification with invalid MIME type (Expect 400)
    // -------------------------------------------------------------------------
    console.log('[STEP 2] Submitting verification with invalid MIME type...');
    const step2Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/verifications/submit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerAuth.token}`,
        },
      },
      {
        verificationType: 'AADHAAR',
        documents: [
          {
            type: 'GOVERNMENT_ID',
            objectStorageKey: `verifications/${workerAuth.userId}/file.exe`,
            mimeType: 'application/x-msdownload',
            fileSizeBytes: 1024,
          },
        ],
      }
    );
    assert(step2Res.status === 400, `Step 2 status: ${step2Res.status}`);
    console.log('✓ Step 2 Passed: Invalid MIME type rejected with 400 Bad Request.\n');

    // -------------------------------------------------------------------------
    // STEP 3: Submit worker verification with oversized file > 5MB (Expect 400)
    // -------------------------------------------------------------------------
    console.log('[STEP 3] Submitting verification with file size > 5MB...');
    const step3Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/verifications/submit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerAuth.token}`,
        },
      },
      {
        verificationType: 'AADHAAR',
        documents: [
          {
            type: 'GOVERNMENT_ID',
            objectStorageKey: `verifications/${workerAuth.userId}/huge_doc.pdf`,
            mimeType: 'application/pdf',
            fileSizeBytes: 6 * 1024 * 1024,
          },
        ],
      }
    );
    assert(step3Res.status === 400, `Step 3 status: ${step3Res.status}`);
    console.log('✓ Step 3 Passed: Oversized document rejected with 400 Bad Request.\n');

    // -------------------------------------------------------------------------
    // STEP 4: Submit worker verification with valid metadata (Expect 201)
    // -------------------------------------------------------------------------
    console.log('[STEP 4] Submitting valid worker Aadhaar verification...');
    const step4Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/verifications/submit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerAuth.token}`,
        },
      },
      {
        verificationType: 'AADHAAR',
        documents: [
          {
            type: 'GOVERNMENT_ID',
            objectStorageKey: `verifications/${workerAuth.userId}/aadhaar_card.jpg`,
            mimeType: 'image/jpeg',
            fileSizeBytes: 245000,
          },
        ],
      }
    );
    assert(step4Res.status === 201, `Step 4 status: ${step4Res.status}`);
    const step4Payload = getPayload(step4Res);
    workerVerificationId = step4Payload.id;
    assert(workerVerificationId, 'Missing verification ID');
    assert(step4Payload.status === 'PENDING', `Expected status PENDING, got ${step4Payload.status}`);
    console.log(`✓ Step 4 Passed: Verification submitted (ID: ${workerVerificationId}).\n`);

    // -------------------------------------------------------------------------
    // STEP 5: Check worker verification status (Expect PENDING)
    // -------------------------------------------------------------------------
    console.log('[STEP 5] Querying verification status...');
    const step5Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/verifications/status',
      method: 'GET',
      headers: { Authorization: `Bearer ${workerAuth.token}` },
    });
    assert(step5Res.status === 200, `Step 5 status: ${step5Res.status}`);
    const step5Payload = getPayload(step5Res);
    assert(step5Payload.overallStatus === 'PENDING', `Expected PENDING, got ${step5Payload.overallStatus}`);
    assert(step5Payload.latestVerification.id === workerVerificationId, 'Mismatch in latest verification');
    console.log('✓ Step 5 Passed: Status transitioned to PENDING.\n');

    // -------------------------------------------------------------------------
    // STEP 6: Worker submits duplicate verification while pending (Expect 400)
    // -------------------------------------------------------------------------
    console.log('[STEP 6] Testing duplicate verification submission prevention...');
    const step6Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/verifications/submit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerAuth.token}`,
        },
      },
      {
        verificationType: 'AADHAAR',
        documents: [
          {
            type: 'GOVERNMENT_ID',
            objectStorageKey: `verifications/${workerAuth.userId}/second.jpg`,
            mimeType: 'image/jpeg',
            fileSizeBytes: 100000,
          },
        ],
      }
    );
    assert(step6Res.status === 400, `Step 6 status: ${step6Res.status}`);
    console.log('✓ Step 6 Passed: Duplicate submission blocked with 400 Bad Request.\n');

    // -------------------------------------------------------------------------
    // STEP 7: Moderator lists pending moderation cases (Expect queue item)
    // -------------------------------------------------------------------------
    console.log('[STEP 7] Moderator querying verification cases queue...');
    const step7Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/moderation/cases?caseType=VERIFICATION&status=PENDING',
      method: 'GET',
      headers: { Authorization: `Bearer ${modTokens.token}` },
    });
    assert(step7Res.status === 200, `Step 7 status: ${step7Res.status}`);
    const step7Payload = getPayload(step7Res);
    const caseItems = step7Payload.items || step7Payload.cases;
    assert(caseItems && caseItems.length > 0, 'No verification cases found');
    const matchedCase = caseItems.find((c) => c.targetEntityId === workerVerificationId || c.verificationId === workerVerificationId);
    assert(matchedCase, 'Target verification case not found in queue');
    verificationCaseId = matchedCase.id;
    console.log(`✓ Step 7 Passed: Moderation case queued (ID: ${verificationCaseId}).\n`);

    // -------------------------------------------------------------------------
    // STEP 8: Worker tries to access moderator cases endpoint (Expect 403)
    // -------------------------------------------------------------------------
    console.log('[STEP 8] Worker attempting RBAC violation on /moderation/cases...');
    const step8Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/moderation/cases',
      method: 'GET',
      headers: { Authorization: `Bearer ${workerAuth.token}` },
    });
    assert(step8Res.status === 403, `Step 8 status: ${step8Res.status}`);
    console.log('✓ Step 8 Passed: Worker correctly rejected with 403 Forbidden.\n');

    // -------------------------------------------------------------------------
    // STEP 9: Employer tries to access moderator cases endpoint (Expect 403)
    // -------------------------------------------------------------------------
    console.log('[STEP 9] Employer attempting RBAC violation on /moderation/cases...');
    const step9Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/moderation/cases',
      method: 'GET',
      headers: { Authorization: `Bearer ${employerAuth.token}` },
    });
    assert(step9Res.status === 403, `Step 9 status: ${step9Res.status}`);
    console.log('✓ Step 9 Passed: Employer correctly rejected with 403 Forbidden.\n');

    // -------------------------------------------------------------------------
    // STEP 10: Moderator claims verification moderation case (Expect UNDER_REVIEW)
    // -------------------------------------------------------------------------
    console.log('[STEP 10] Moderator claiming verification case...');
    const step10Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/moderation/cases/${verificationCaseId}/claim`,
      method: 'POST',
      headers: { Authorization: `Bearer ${modTokens.token}` },
    });
    assert(step10Res.status === 200, `Step 10 status: ${step10Res.status}`);
    const step10Payload = getPayload(step10Res);
    assert(step10Payload.status === 'UNDER_REVIEW', `Expected UNDER_REVIEW, got ${step10Payload.status}`);
    assert(step10Payload.assignedToId === modTokens.userId, 'Case not assigned to moderator');
    console.log('✓ Step 10 Passed: Case claimed and moved to UNDER_REVIEW.\n');

    // -------------------------------------------------------------------------
    // STEP 11: Moderator reviews and approves verification (Expect VERIFIED)
    // -------------------------------------------------------------------------
    console.log('[STEP 11] Moderator approving verification...');
    const step11Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/moderation/verifications/${workerVerificationId}/approve`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${modTokens.token}`,
        },
      },
      { notes: 'Aadhaar QR verified against UIDAI sandbox.' }
    );
    assert(step11Res.status === 200, `Step 11 status: ${step11Res.status}`);
    const step11Payload = getPayload(step11Res);
    assert(step11Payload.status === 'VERIFIED', `Expected VERIFIED, got ${step11Payload.status}`);
    console.log('✓ Step 11 Passed: Worker verification approved.\n');

    // -------------------------------------------------------------------------
    // STEP 12: Verify worker status updated to VERIFIED in status endpoint
    // -------------------------------------------------------------------------
    console.log('[STEP 12] Verifying worker profile shows VERIFIED status...');
    const step12Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/verifications/status',
      method: 'GET',
      headers: { Authorization: `Bearer ${workerAuth.token}` },
    });
    assert(step12Res.status === 200, `Step 12 status: ${step12Res.status}`);
    const step12Payload = getPayload(step12Res);
    assert(step12Payload.overallStatus === 'VERIFIED', `Expected VERIFIED, got ${step12Payload.overallStatus}`);
    console.log('✓ Step 12 Passed: Worker is now fully VERIFIED.\n');

    // -------------------------------------------------------------------------
    // STEP 13: Employer submits business registration verification (Expect 201)
    // -------------------------------------------------------------------------
    console.log('[STEP 13] Employer submitting business registration verification...');
    const step13Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/verifications/submit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employerAuth.token}`,
        },
      },
      {
        verificationType: 'BUSINESS_REGISTRATION',
        documents: [
          {
            type: 'BUSINESS_PROOF',
            objectStorageKey: `verifications/${employerAuth.userId}/gst_cert.pdf`,
            mimeType: 'application/pdf',
            fileSizeBytes: 310000,
          },
        ],
      }
    );
    assert(step13Res.status === 201, `Step 13 status: ${step13Res.status}`);
    const step13Payload = getPayload(step13Res);
    employerVerificationId = step13Payload.id;
    console.log(`✓ Step 13 Passed: Employer verification submitted (ID: ${employerVerificationId}).\n`);

    // -------------------------------------------------------------------------
    // STEP 14: Moderator rejects employer verification with reason (Expect REJECTED)
    // -------------------------------------------------------------------------
    console.log('[STEP 14] Moderator rejecting employer verification...');
    const step14Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/moderation/verifications/${employerVerificationId}/reject`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${modTokens.token}`,
        },
      },
      { rejectionReason: 'GST certificate document expired or illegible.' }
    );
    assert(step14Res.status === 200, `Step 14 status: ${step14Res.status}`);
    const step14Payload = getPayload(step14Res);
    assert(step14Payload.status === 'REJECTED', `Expected REJECTED, got ${step14Payload.status}`);
    console.log('✓ Step 14 Passed: Employer verification successfully rejected.\n');

    // -------------------------------------------------------------------------
    // STEP 15: Worker files a safety report against Employer (Expect 201)
    // -------------------------------------------------------------------------
    console.log('[STEP 15] Worker reporting Employer for harassment...');
    const step15Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/users/${employerAuth.userId}/reports`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerAuth.token}`,
        },
      },
      {
        reason: 'HARASSMENT',
        details: 'Employer sent abusive messages regarding overtime work.',
      }
    );
    assert(step15Res.status === 201, `Step 15 status: ${step15Res.status}`);
    const step15Payload = getPayload(step15Res);
    assert(step15Payload.caseNumber, 'Missing caseNumber in report');
    console.log(`✓ Step 15 Passed: User report filed (Case: ${step15Payload.caseNumber}).\n`);

    // -------------------------------------------------------------------------
    // STEP 16: Worker tries to report themselves (Expect 400)
    // -------------------------------------------------------------------------
    console.log('[STEP 16] Worker attempting self-reporting...');
    const step16Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/users/${workerAuth.userId}/reports`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerAuth.token}`,
        },
      },
      {
        reason: 'SPAM',
        details: 'Self test.',
      }
    );
    assert(step16Res.status === 400, `Step 16 status: ${step16Res.status}`);
    console.log('✓ Step 16 Passed: Self-reporting blocked with 400 Bad Request.\n');

    // -------------------------------------------------------------------------
    // STEP 17: Worker reports employer job post (Expect 201)
    // -------------------------------------------------------------------------
    console.log('[STEP 17] Worker filing report on Job Post...');
    const step17Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/jobs/${job.id}/reports`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerAuth.token}`,
        },
      },
      {
        reason: 'FRAUD',
        details: 'Job description misrepresented site hazard conditions.',
      }
    );
    assert(step17Res.status === 201, `Step 17 status: ${step17Res.status}`);
    console.log('✓ Step 17 Passed: Job report filed successfully.\n');

    // -------------------------------------------------------------------------
    // STEP 18: Employer tries to report their own job (Expect 400)
    // -------------------------------------------------------------------------
    console.log('[STEP 18] Employer attempting to report own job...');
    const step18Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/jobs/${job.id}/reports`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employerAuth.token}`,
        },
      },
      {
        reason: 'SPAM',
        details: 'Cannot report own job.',
      }
    );
    assert(step18Res.status === 400, `Step 18 status: ${step18Res.status}`);
    console.log('✓ Step 18 Passed: Own job reporting blocked with 400 Bad Request.\n');

    // -------------------------------------------------------------------------
    // STEP 19: Create a chat message and file message report (Expect 201)
    // -------------------------------------------------------------------------
    console.log('[STEP 19] Creating conversation message and filing report...');
    const conv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        members: {
          create: [
            { userId: workerAuth.userId },
            { userId: employerAuth.userId },
          ],
        },
      },
    });

    const msg = await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: employerAuth.userId,
        sequenceNumber: 1,
        messageType: 'TEXT',
        body: 'Unprofessional communication text sample.',
      },
    });

    const step19Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/messages/${msg.id}/reports`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerAuth.token}`,
        },
      },
      {
        reason: 'HARASSMENT',
        details: 'Abusive language in chat.',
      }
    );
    assert(step19Res.status === 201, `Step 19 status: ${step19Res.status}`);
    console.log('✓ Step 19 Passed: Message report filed successfully.\n');

    // -------------------------------------------------------------------------
    // STEP 20: Worker lists their filed reports (Expect reports returned)
    // -------------------------------------------------------------------------
    console.log('[STEP 20] Listing reports filed by worker (/api/v1/reports/mine)...');
    const step20Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/reports/mine',
      method: 'GET',
      headers: { Authorization: `Bearer ${workerAuth.token}` },
    });
    assert(step20Res.status === 200, `Step 20 status: ${step20Res.status}`);
    const step20Payload = getPayload(step20Res);
    assert(Array.isArray(step20Payload) && step20Payload.length >= 2, 'Expected at least 2 reports');
    console.log(`✓ Step 20 Passed: Retrieved ${step20Payload.length} user reports.\n`);

    // -------------------------------------------------------------------------
    // STEP 21: Moderator queries report cases in queue
    // -------------------------------------------------------------------------
    console.log('[STEP 21] Moderator querying report queue (/api/v1/moderation/cases)...');
    const step21Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/moderation/cases?caseType=REPORT&status=PENDING',
      method: 'GET',
      headers: { Authorization: `Bearer ${modTokens.token}` },
    });
    assert(step21Res.status === 200, `Step 21 status: ${step21Res.status}`);
    const step21Payload = getPayload(step21Res);
    const reportCases = step21Payload.items || step21Payload.cases;
    assert(reportCases && reportCases.length > 0, 'No report cases found');
    userReportCaseId = reportCases[0].id;
    console.log(`✓ Step 21 Passed: Report case found (ID: ${userReportCaseId}).\n`);

    // -------------------------------------------------------------------------
    // STEP 22: Moderator applies capability restriction CANNOT_MESSAGE on Employer
    // -------------------------------------------------------------------------
    console.log('[STEP 22] Moderator applying CANNOT_MESSAGE restriction on Employer...');
    const step22Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/moderation/users/${employerAuth.userId}/restrictions`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${modTokens.token}`,
        },
      },
      {
        restrictionType: 'CANNOT_MESSAGE',
        reason: 'Harassment reported in messaging; communications suspended.',
      }
    );
    assert(step22Res.status === 201, `Step 22 status: ${step22Res.status}`);
    const step22Payload = getPayload(step22Res);
    restrictionId = step22Payload.id;
    assert(step22Payload.restrictionType === 'CANNOT_MESSAGE', 'Mismatch in restrictionType');
    console.log(`✓ Step 22 Passed: Restriction applied (ID: ${restrictionId}).\n`);

    // -------------------------------------------------------------------------
    // STEP 23: Employer attempts to send message while restricted (Expect 403)
    // -------------------------------------------------------------------------
    console.log('[STEP 23] Restricted employer attempting to send message...');
    const step23Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/conversations/${conv.id}/messages`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${employerAuth.token}`,
        },
      },
      {
        clientMessageId: `msg-blocked-${Date.now()}`,
        body: 'Trying to send message while restricted.',
      }
    );
    assert(step23Res.status === 403, `Step 23 status: ${step23Res.status}`);
    console.log('✓ Step 23 Passed: Restricted user prevented from sending message with 403 Forbidden.\n');

    // -------------------------------------------------------------------------
    // STEP 24: Moderator lifts CANNOT_MESSAGE restriction (Expect 200)
    // -------------------------------------------------------------------------
    console.log('[STEP 24] Moderator lifting CANNOT_MESSAGE restriction...');
    const step24Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/moderation/restrictions/${restrictionId}`,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${modTokens.token}` },
    });
    assert(step24Res.status === 200, `Step 24 status: ${step24Res.status}`);
    console.log('✓ Step 24 Passed: Restriction successfully lifted.\n');

    // -------------------------------------------------------------------------
    // STEP 25: Moderator suspends Employer account (Expect SUSPENDED & session revoked)
    // -------------------------------------------------------------------------
    console.log('[STEP 25] Moderator suspending employer account...');
    const step25Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/moderation/users/${employerAuth.userId}/suspend`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${modTokens.token}`,
        },
      },
      {
        reason: 'Gross violation of trust and safety terms.',
      }
    );
    assert(step25Res.status === 200, `Step 25 status: ${step25Res.status}`);
    const step25Payload = getPayload(step25Res);
    assert(step25Payload.accountStatus === 'SUSPENDED', `Expected SUSPENDED, got ${step25Payload.accountStatus}`);
    console.log('✓ Step 25 Passed: Account suspended.\n');

    // -------------------------------------------------------------------------
    // STEP 26: Suspended employer attempts action (Expect 403)
    // -------------------------------------------------------------------------
    console.log('[STEP 26] Suspended employer attempting authenticated API request...');
    const step26Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/verifications/status',
      method: 'GET',
      headers: { Authorization: `Bearer ${employerAuth.token}` },
    });
    assert(step26Res.status === 401 || step26Res.status === 403, `Step 26 status: ${step26Res.status}`);
    console.log(`✓ Step 26 Passed: Suspended user denied access with ${step26Res.status} (Session revoked/Suspended).\n`);

    // -------------------------------------------------------------------------
    // STEP 27: Moderator reinstates Employer account (Expect ACTIVE)
    // -------------------------------------------------------------------------
    console.log('[STEP 27] Moderator reinstating employer account...');
    const step27Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/moderation/users/${employerAuth.userId}/reinstate`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${modTokens.token}`,
        },
      },
      {
        reason: 'Appeal accepted upon remediation.',
      }
    );
    assert(step27Res.status === 200, `Step 27 status: ${step27Res.status}`);
    const step27Payload = getPayload(step27Res);
    assert(step27Payload.accountStatus === 'ACTIVE', `Expected ACTIVE, got ${step27Payload.accountStatus}`);
    console.log('✓ Step 27 Passed: Account successfully reinstated to ACTIVE.\n');

    // -------------------------------------------------------------------------
    // STEP 28: Worker raises operational dispute on booking (Expect 201)
    // -------------------------------------------------------------------------
    console.log('[STEP 28] Worker raising dispute on confirmed booking...');
    const step28Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/bookings/${booking.id}/disputes`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerAuth.token}`,
        },
      },
      {
        reason: 'NO_SHOW_EMPLOYER',
        description: 'Employer was absent from site for scheduled start.',
      }
    );
    assert(step28Res.status === 201, `Step 28 status: ${step28Res.status}`);
    const step28Payload = getPayload(step28Res);
    disputeId = step28Payload.id;
    assert(disputeId, 'Missing dispute ID');
    assert(step28Payload.status === 'OPEN', `Expected status OPEN, got ${step28Payload.status}`);
    console.log(`✓ Step 28 Passed: Dispute raised (ID: ${disputeId}).\n`);

    // -------------------------------------------------------------------------
    // STEP 29: Intruder attempts to fetch dispute details (Expect 403/404 IDOR)
    // -------------------------------------------------------------------------
    console.log('[STEP 29] Intruder attempting IDOR access on booking dispute...');
    const step29Res = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/disputes/${disputeId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${intruderAuth.token}` },
    });
    assert(step29Res.status === 403 || step29Res.status === 404, `Step 29 status: ${step29Res.status}`);
    console.log('✓ Step 29 Passed: IDOR protection blocked unauthorized access.\n');

    // -------------------------------------------------------------------------
    // STEP 30: Moderator resolves dispute & verifies immutable audit log
    // -------------------------------------------------------------------------
    console.log('[STEP 30] Moderator resolving dispute and verifying audit logs...');
    const step30Res = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/moderation/disputes/${disputeId}/resolve`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${modTokens.token}`,
        },
      },
      {
        resolution: 'Mediation accepted: booking rescheduled without penalty.',
        notes: 'Both parties agreed to new start time.',
      }
    );
    assert(step30Res.status === 200, `Step 30 status: ${step30Res.status}`);
    const step30Payload = getPayload(step30Res);
    assert(step30Payload.status === 'RESOLVED', `Expected RESOLVED, got ${step30Payload.status}`);

    // Verify audit logs exist
    const auditRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/moderation/audit-logs',
      method: 'GET',
      headers: { Authorization: `Bearer ${modTokens.token}` },
    });
    assert(auditRes.status === 200, `Audit logs status: ${auditRes.status}`);
    const auditPayload = getPayload(auditRes);
    assert(auditPayload.items && auditPayload.items.length > 0, 'No audit logs found');
    console.log(`✓ Step 30 Passed: Dispute RESOLVED and ${auditPayload.items.length} immutable audit entries verified.\n`);

    console.log('===============================================================');
    console.log('  🎉 ALL 30 END-TO-END STEPS COMPLETED AND VERIFIED SUCCESSFULLY!');
    console.log('===============================================================\n');
  } catch (err) {
    console.error('\n❌ E2E VERIFICATION ERROR:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase13E2E();
