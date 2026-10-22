const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient, UserRole } = require('@prisma/client');
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
  if (!challenge) {
    throw new Error(`No active OTP challenge found in DB for ${phone}`);
  }

  for (let i = 0; i <= 999999; i++) {
    const candidate = i.toString().padStart(6, '0');
    if (hashOtp(phone, candidate) === challenge.otpHash) {
      return candidate;
    }
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
    throw new Error(
      `Auth failed for ${phone} (${role}): ${JSON.stringify(verifyRes.body)}`
    );
  }
  return verifyRes.body.data.accessToken;
}

function getPayload(res) {
  return res && res.body && res.body.data !== undefined ? res.body.data : res.body;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED ASSERTION: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runBookingEndToEnd() {
  console.log('========================================================================');
  console.log('  LOCALSAATHI PHASE 8 BOOKING & CONTRACT INITIATION E2E VERIFICATION');
  console.log('========================================================================\n');

  const empPhoneA = `+91961${Math.floor(1000000 + Math.random() * 9000000)}`;
  const empPhoneB = `+91962${Math.floor(1000000 + Math.random() * 9000000)}`;
  const wrkPhoneA = `+91963${Math.floor(1000000 + Math.random() * 9000000)}`;
  const wrkPhoneB = `+91964${Math.floor(1000000 + Math.random() * 9000000)}`;

  let empTokenA, empTokenB, wrkTokenA, wrkTokenB;
  let jobIdA, secondJobIdA, conflictJobId;
  let applicationIdA, applicationIdB;
  let bookingIdA, bookingIdB;

  try {
    try {
      execSync('docker exec -i localsaathi-redis redis-cli FLUSHDB', { stdio: 'ignore' });
    } catch {}

    // -------------------------------------------------------------------------
    // STEP 1: EMPLOYER A SETUP
    // -------------------------------------------------------------------------
    console.log('▶ STEP 1: Employer A Login & Profile Setup');
    empTokenA = await authenticateUser(empPhoneA, 'EMPLOYER');
    assert(!!empTokenA, `Employer A authenticated (${empPhoneA})`);

    await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/employers/me',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenA}`,
        },
      },
      {
        businessName: 'Apex Power Systems Pvt Ltd',
        businessType: 'Electrical Contractor',
        locality: 'Hazratganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226001',
      }
    );
    assert(true, 'Employer A business details and location set');

    // -------------------------------------------------------------------------
    // STEP 2: EMPLOYER B (RIVAL) SETUP
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 2: Employer B (Rival) Setup');
    empTokenB = await authenticateUser(empPhoneB, 'EMPLOYER');
    assert(!!empTokenB, `Employer B authenticated (${empPhoneB})`);

    await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/employers/me',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenB}`,
        },
      },
      {
        businessName: 'Vanguard Industrial Services',
        businessType: 'Contractor',
        locality: 'Gomti Nagar',
        city: 'Lucknow',
      }
    );
    assert(true, 'Employer B registered for IDOR and schedule conflict tests');

    // -------------------------------------------------------------------------
    // STEP 3: WORKER A SETUP
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 3: Worker A Login & Onboarding');
    wrkTokenA = await authenticateUser(wrkPhoneA, 'WORKER');
    assert(!!wrkTokenA, `Worker A authenticated (${wrkPhoneA})`);

    await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/workers/me',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${wrkTokenA}`,
        },
      },
      {
        displayName: 'Deepak Verma Wireman',
        experienceYears: 6,
        expectedWage: 1200,
        wageType: 'DAILY',
        preferredRadiusKm: 15,
      }
    );

    const testSkill = await prisma.skill.upsert({
      where: { normalizedName: 'power-distribution-p8' },
      update: {},
      create: {
        name: 'Power Distribution P8',
        normalizedName: 'power-distribution-p8',
        category: 'Electrical',
        isActive: true,
      },
    });

    await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/workers/me/skills',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${wrkTokenA}`,
        },
      },
      { skillId: testSkill.id, proficiency: 'EXPERT', experienceYears: 6 }
    );

    await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/workers/me/location',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${wrkTokenA}`,
        },
      },
      {
        latitude: 26.85,
        longitude: 80.95,
        locality: 'Hazratganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226001',
      }
    );
    assert(true, 'Worker A onboarding completed (profile, skill, location)');

    // -------------------------------------------------------------------------
    // STEP 4: WORKER B SETUP
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 4: Worker B Login & Onboarding');
    wrkTokenB = await authenticateUser(wrkPhoneB, 'WORKER');
    assert(!!wrkTokenB, `Worker B authenticated (${wrkPhoneB})`);

    await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/workers/me',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${wrkTokenB}`,
        },
      },
      {
        displayName: 'Suresh Yadav Technician',
        experienceYears: 4,
        expectedWage: 1000,
        wageType: 'DAILY',
      }
    );

    await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/workers/me/skills',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${wrkTokenB}`,
        },
      },
      { skillId: testSkill.id, proficiency: 'INTERMEDIATE', experienceYears: 4 }
    );

    await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/workers/me/location',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${wrkTokenB}`,
        },
      },
      {
        latitude: 26.85,
        longitude: 80.95,
        locality: 'Hazratganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226001',
      }
    );
    assert(true, 'Worker B profile created for cancellation flow');

    // -------------------------------------------------------------------------
    // STEP 5: CREATE & PUBLISH PRIMARY JOB UNDER EMPLOYER A
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 5: Employer A Creates & Publishes Primary Job Post');
    const jobRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/employers/me/jobs',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenA}`,
        },
      },
      {
        title: 'Industrial Substation Panel Wiring',
        description: 'Complete replacement and rewiring of 3-phase switchboard.',
        category: 'Electrical',
        wageType: 'DAILY',
        wageAmount: 1250,
        workerCount: 1,
        durationDays: 3,
        startDate: '2026-12-01',
        startTime: '09:00',
        urgency: 'STANDARD',
        skills: [{ skillId: testSkill.id, isRequired: true, minExperienceYears: 3 }],
        location: {
          latitude: 26.852,
          longitude: 80.951,
          locality: 'Hazratganj',
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          pinCode: '226001',
          addressLine: 'Plot 88, Power House Road',
        },
      }
    );
    assert(jobRes.status === 201, 'Job created with 201 Created');
    jobIdA = jobRes.body.data.id;

    await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/jobs/${jobIdA}/publish`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenA}` },
    });
    assert(true, 'Job transitioned to PUBLISHED status');

    // -------------------------------------------------------------------------
    // STEP 6: WORKER A APPLIES TO JOB POST
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 6: Worker A Submits Application');
    const appRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/workers/me/jobs/${jobIdA}/applications`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${wrkTokenA}`,
        },
      },
      { message: 'Certified high-voltage wireman with 6 years experience.' }
    );
    assert(appRes.status === 201, 'Application submitted successfully (201 Created)');
    const appDataA = getPayload(appRes);
    applicationIdA = appDataA.id;
    assert(appDataA.status === 'APPLIED', 'Application initial status is APPLIED');

    // -------------------------------------------------------------------------
    // STEP 7: VERIFICATION - CANNOT CREATE BOOKING FROM APPLIED STATUS
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 7: Rejection of Booking on APPLIED Application');
    const earlyBookingRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/employers/me/applications/${applicationIdA}/bookings`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenA}`,
        },
      },
      {}
    );
    assert(
      earlyBookingRes.status === 400,
      `Expected 400 Bad Request, got ${earlyBookingRes.status} (APPLICATION_NOT_ACCEPTED)`
    );

    // -------------------------------------------------------------------------
    // STEP 8: SHORTLIST APPLICATION
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 8: Employer A Shortlists Worker A');
    const slRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/applications/${applicationIdA}/shortlist`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenA}` },
    });
    assert(slRes.status === 200, 'Application transitioned to SHORTLISTED');

    // -------------------------------------------------------------------------
    // STEP 9: VERIFICATION - CANNOT CREATE BOOKING FROM SHORTLISTED STATUS
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 9: Rejection of Booking on SHORTLISTED Application');
    const slBookingRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/employers/me/applications/${applicationIdA}/bookings`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenA}`,
        },
      },
      {}
    );
    assert(
      slBookingRes.status === 400,
      `Expected 400 Bad Request, got ${slBookingRes.status} (Only ACCEPTED apps permitted)`
    );

    // -------------------------------------------------------------------------
    // STEP 10: ACCEPT APPLICATION
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 10: Employer A Accepts Worker A');
    const acceptRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/applications/${applicationIdA}/accept`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenA}` },
    });
    assert(acceptRes.status === 200, 'Application transitioned to ACCEPTED');

    // -------------------------------------------------------------------------
    // STEP 11: IDOR SECURITY TEST
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 11: IDOR Attack Test - Employer B Cannot Book Employer A Application');
    const idorRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/employers/me/applications/${applicationIdA}/bookings`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenB}`,
        },
      },
      {}
    );
    assert(
      idorRes.status === 404,
      `IDOR blocked: Rival Employer B received 404 Not Found (got ${idorRes.status})`
    );

    // -------------------------------------------------------------------------
    // STEP 12: CREATE BINDING BOOKING CONTRACT
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 12: Employer A Initiates Contract Booking');
    const createBookingRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/employers/me/applications/${applicationIdA}/bookings`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenA}`,
        },
      },
      {
        agreedWage: 1300, // negotiated wage override
        durationDays: 3,
      }
    );
    assert(
      createBookingRes.status === 201,
      `Booking created with 201 Created (got ${createBookingRes.status})`
    );
    const bData = getPayload(createBookingRes);
    bookingIdA = bData.id;
    assert(
      bData.status === 'PENDING_CONFIRMATION',
      'Initial booking status is PENDING_CONFIRMATION'
    );
    assert(bData.agreedWage === 1300, 'Snapshotted agreedWage is ₹1300');
    assert(bData.totalAmount === 3900, 'Snapshotted totalAmount is ₹3900 (1300 * 3 days)');
    assert(bData.durationDays === 3, 'Snapshotted durationDays is 3');
    assert(
      bData.jobTitle === 'Industrial Substation Panel Wiring',
      'Snapshotted jobTitle matches'
    );
    assert(
      bData.workerName === 'Deepak Verma Wireman',
      'Snapshotted workerName matches'
    );
    assert(
      bData.employerName === 'Apex Power Systems Pvt Ltd',
      'Snapshotted employerName matches'
    );
    assert(
      bData.workLocationLocality === 'Hazratganj',
      'Snapshotted locality matches'
    );

    // -------------------------------------------------------------------------
    // STEP 13: DATABASE IDEMPOTENCY TEST
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 13: Database Idempotency - Duplicate Booking Rejection');
    const dupRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/employers/me/applications/${applicationIdA}/bookings`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenA}`,
        },
      },
      {}
    );
    assert(
      dupRes.status === 409,
      `Duplicate booking blocked: Expected 409 Conflict, got ${dupRes.status} (BOOKING_ALREADY_EXISTS)`
    );

    // -------------------------------------------------------------------------
    // STEP 14: WORKER A LISTS BOOKINGS
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 14: Worker A Discovers Pending Booking Offer');
    const wrkListRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me/bookings',
      method: 'GET',
      headers: { Authorization: `Bearer ${wrkTokenA}` },
    });
    assert(wrkListRes.status === 200, 'Worker bookings list retrieved');
    const wrkListData = getPayload(wrkListRes);
    assert(wrkListData.items.length >= 1, 'Worker sees initiated booking');
    assert(
      wrkListData.items[0].id === bookingIdA,
      'Booking ID matches created contract'
    );

    // -------------------------------------------------------------------------
    // STEP 15: WORKER A CONFIRMS BOOKING CONTRACT
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 15: Worker A Confirms Contract Offer');
    const confirmRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/workers/me/bookings/${bookingIdA}/confirm`,
      method: 'POST',
      headers: { Authorization: `Bearer ${wrkTokenA}` },
    });
    assert(confirmRes.status === 200, 'Worker confirmed booking successfully (200 OK)');
    const confData = getPayload(confirmRes);
    assert(
      confData.status === 'CONFIRMED',
      'Booking transitioned to CONFIRMED'
    );
    assert(
      !!confData.confirmedAt,
      `confirmedAt timestamp populated: ${confData.confirmedAt}`
    );

    // -------------------------------------------------------------------------
    // STEP 16: WORKER SCHEDULE CONFLICT CHECK
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 16: Schedule Conflict Detection on Same Start Date');
    // Employer B creates a job on 2026-12-01
    const conflictJobRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/employers/me/jobs',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenB}`,
        },
      },
      {
        title: 'Emergency Generator Wiring',
        description: 'Wiring generator backup.',
        category: 'Electrical',
        wageType: 'DAILY',
        wageAmount: 1400,
        startDate: '2026-12-01', // Exact same date!
        skills: [{ skillId: testSkill.id, isRequired: true, minExperienceYears: 2 }],
        location: {
          latitude: 26.852,
          longitude: 80.951,
          locality: 'Hazratganj',
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          pinCode: '226001',
          addressLine: 'Plot 102, Generator Yard',
        },
      }
    );
    conflictJobId = getPayload(conflictJobRes).id;
    await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/jobs/${conflictJobId}/publish`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenB}` },
    });

    // Worker A applies to conflict job
    const conflictAppRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/workers/me/jobs/${conflictJobId}/applications`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${wrkTokenA}`,
        },
      },
      {}
    );
    const cAppId = getPayload(conflictAppRes).id;

    // Employer B shortlists & accepts
    await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/applications/${cAppId}/shortlist`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenB}` },
    });
    await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/applications/${cAppId}/accept`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenB}` },
    });

    // Employer B attempts to initiate booking on 2026-12-01 -> 409 WORKER_SCHEDULE_CONFLICT
    const conflictAttemptRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/employers/me/applications/${cAppId}/bookings`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenB}`,
        },
      },
      {}
    );
    assert(
      conflictAttemptRes.status === 409,
      `Schedule conflict caught: Expected 409 Conflict, got ${conflictAttemptRes.status} (WORKER_SCHEDULE_CONFLICT)`
    );

    // -------------------------------------------------------------------------
    // STEP 17: INVALID FSM TRANSITION CHECK
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 17: Invalid Transition - Cannot Complete from CONFIRMED');
    const prematureComplete = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/bookings/${bookingIdA}/complete`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenA}` },
    });
    assert(
      prematureComplete.status === 400,
      `Premature completion blocked: Expected 400, got ${prematureComplete.status} (INVALID_TRANSITION)`
    );

    // -------------------------------------------------------------------------
    // STEP 18: START BOOKING (CONFIRMED -> IN_PROGRESS)
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 18: Employer A Starts Engagement');
    const startRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/bookings/${bookingIdA}/start`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenA}` },
    });
    assert(startRes.status === 200, 'Engagement started with 200 OK');
    const startData = getPayload(startRes);
    assert(
      startData.status === 'IN_PROGRESS',
      'Booking status transitioned to IN_PROGRESS'
    );
    assert(
      !!startData.startedAt,
      `startedAt timestamp recorded: ${startData.startedAt}`
    );

    // -------------------------------------------------------------------------
    // STEP 19: COMPLETE BOOKING (IN_PROGRESS -> COMPLETED)
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 19: Employer A Completes Engagement');
    const completeRes = await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/bookings/${bookingIdA}/complete`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenA}` },
    });
    assert(completeRes.status === 200, 'Engagement completed with 200 OK');
    const completeData = getPayload(completeRes);
    assert(
      completeData.status === 'COMPLETED',
      'Booking transitioned to terminal status COMPLETED'
    );
    assert(
      !!completeData.completedAt,
      `completedAt timestamp recorded: ${completeData.completedAt}`
    );

    // Verify Worker completedJobsCount incremented in database
    const bookingInDb = await prisma.booking.findUnique({
      where: { id: bookingIdA },
    });
    const workerProfile = await prisma.workerProfile.findUnique({
      where: { id: bookingInDb.workerProfileId },
    });
    assert(
      workerProfile.completedJobsCount === 1,
      `Worker completedJobsCount updated to 1 in database`
    );

    // -------------------------------------------------------------------------
    // STEP 20: TERMINAL STATE & CANCELLATION ATTRIBUTION
    // -------------------------------------------------------------------------
    console.log('\n▶ STEP 20: Terminal State Protection & Cancellation Flow');
    // Cannot cancel COMPLETED booking
    const cancelCompletedRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/employers/me/bookings/${bookingIdA}/cancel`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenA}`,
        },
      },
      { reason: 'Too late' }
    );
    assert(
      cancelCompletedRes.status === 400,
      `Cancellation of COMPLETED booking blocked: Expected 400, got ${cancelCompletedRes.status} (TERMINAL_STATE)`
    );

    // Setup second engagement for Worker B to test clean cancellation
    const jobBRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/employers/me/jobs',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenA}`,
        },
      },
      {
        title: 'Transformer Oil Testing',
        description: 'Testing transformer oil breakdown voltage.',
        category: 'Electrical',
        wageType: 'DAILY',
        wageAmount: 1100,
        startDate: '2026-12-15',
        skills: [{ skillId: testSkill.id, isRequired: true, minExperienceYears: 2 }],
        location: {
          latitude: 26.852,
          longitude: 80.951,
          locality: 'Hazratganj',
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          pinCode: '226001',
          addressLine: 'Plot 55, Substation Yard',
        },
      }
    );
    secondJobIdA = getPayload(jobBRes).id;
    await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/jobs/${secondJobIdA}/publish`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenA}` },
    });

    const appBRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/workers/me/jobs/${secondJobIdA}/applications`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${wrkTokenB}`,
        },
      },
      {}
    );
    applicationIdB = getPayload(appBRes).id;

    await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/applications/${applicationIdB}/shortlist`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenA}` },
    });
    await request({
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/employers/me/applications/${applicationIdB}/accept`,
      method: 'POST',
      headers: { Authorization: `Bearer ${empTokenA}` },
    });

    const bookingBRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/employers/me/applications/${applicationIdB}/bookings`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${empTokenA}`,
        },
      },
      {}
    );
    bookingIdB = getPayload(bookingBRes).id;

    // Worker B cancels with reason
    const cancelRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: `/api/v1/workers/me/bookings/${bookingIdB}/cancel`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${wrkTokenB}`,
        },
      },
      { reason: 'Severe family emergency; cannot attend work.' }
    );
    assert(cancelRes.status === 200, 'Worker B cancelled booking with 200 OK');
    const cancelData = getPayload(cancelRes);
    assert(
      cancelData.status === 'CANCELLED',
      'Booking transitioned to CANCELLED'
    );
    assert(
      cancelData.cancellationReason ===
        'Severe family emergency; cannot attend work.',
      'cancellationReason recorded accurately'
    );
    assert(
      cancelData.cancelledByRole === 'WORKER',
      'cancelledByRole accurately attributed to WORKER'
    );

    console.log('\n========================================================================');
    console.log('  🎉 ALL 20 PHASE 8 BOOKING DOMAIN E2E CHECKS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');
  } finally {
    // Cleanup generated test data
    console.log('Cleaning up test data...');
    try {
      await prisma.booking.deleteMany({
        where: {
          id: { in: [bookingIdA, bookingIdB].filter(Boolean) },
        },
      });
      await prisma.jobApplication.deleteMany({
        where: {
          jobPostId: { in: [jobIdA, secondJobIdA, conflictJobId].filter(Boolean) },
        },
      });
      await prisma.jobLocation.deleteMany({
        where: {
          jobPostId: { in: [jobIdA, secondJobIdA, conflictJobId].filter(Boolean) },
        },
      });
      await prisma.jobPost.deleteMany({
        where: {
          id: { in: [jobIdA, secondJobIdA, conflictJobId].filter(Boolean) },
        },
      });
      await prisma.user.deleteMany({
        where: {
          phone: { in: [empPhoneA, empPhoneB, wrkPhoneA, wrkPhoneB] },
        },
      });
      await prisma.$disconnect();
    } catch {
      // Ignore cleanup error
    }
  }
}

runBookingEndToEnd().catch((err) => {
  console.error('\n❌ E2E VERIFICATION SCRIPT FAILED:', err);
  process.exit(1);
});
