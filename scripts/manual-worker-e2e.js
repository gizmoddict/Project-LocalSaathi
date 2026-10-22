const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const AUTH_PEPPER = process.env.AUTH_PEPPER || 'localsaathi_development_auth_pepper_secret_minimum_32_characters';

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
  return crypto.createHmac('sha256', AUTH_PEPPER).update(`${phone}:${otp}`).digest('hex');
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

  // Brute force 6 digits (000000 - 999999) using known pepper - takes < 100ms
  for (let i = 0; i <= 999999; i++) {
    const candidate = i.toString().padStart(6, '0');
    if (hashOtp(phone, candidate) === challenge.otpHash) {
      return candidate;
    }
  }

  throw new Error(`Could not recover OTP for ${phone}`);
}

async function runWorkerEndToEnd() {
  console.log('===============================================================');
  console.log('  LOCALSAATHI WORKER END-TO-END MANUAL FLOW VERIFICATION');
  console.log('===============================================================');

  // Use fresh phone number to avoid rate-limiting cooldowns
  const randomSuffix = Math.floor(10000000 + Math.random() * 90000000).toString();
  const phone = `+9198${randomSuffix}`;
  const normPhone = normalizePhone(phone);

  // Clean previous test user if exists for clean reproducible test
  const existingUser = await prisma.user.findFirst({ where: { phone: normPhone } });
  if (existingUser) {
    const profile = await prisma.workerProfile.findUnique({ where: { userId: existingUser.id } });
    if (profile) {
      await prisma.workerSkill.deleteMany({ where: { workerId: profile.id } });
      await prisma.workerAvailability.deleteMany({ where: { workerId: profile.id } });
      await prisma.workerLocation.deleteMany({ where: { workerId: profile.id } });
      await prisma.workerProfile.delete({ where: { id: profile.id } });
    }
    await prisma.session.deleteMany({ where: { userId: existingUser.id } });
    await prisma.otpChallenge.deleteMany({ where: { phone: normPhone } });
    await prisma.user.delete({ where: { id: existingUser.id } });
    console.log(`Cleaned up previous test user for ${normPhone}`);
  }

  // -------------------------------------------------------------------------
  // STEP 1: LOGIN WITH WORKER (Request OTP + Verify OTP)
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 1: LOGIN WITH WORKER');
  console.log('---------------------------------------------------------------');

  console.log(`1.1 Requesting OTP for phone: ${phone}`);
  const otpReqRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/auth/otp/request',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { phone }
  );

  console.log(`OTP Request HTTP Status: ${otpReqRes.status}`);
  console.log('OTP Request Response:', JSON.stringify(otpReqRes.body, null, 2));
  if (otpReqRes.status !== 200) {
    throw new Error(`OTP Request failed with status ${otpReqRes.status}`);
  }

  // Retrieve OTP
  const otpCode = await findOtpForPhone(phone);
  console.log(`1.2 Dispatched OTP recovered for authentication: ${otpCode}`);

  console.log(`1.3 Verifying OTP with role: WORKER`);
  const otpVerifyRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/auth/otp/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { phone, otp: otpCode, role: 'WORKER' }
  );

  console.log(`OTP Verify HTTP Status: ${otpVerifyRes.status}`);
  console.log('OTP Verify Response:', JSON.stringify(otpVerifyRes.body, null, 2));
  if (otpVerifyRes.status !== 200 || !otpVerifyRes.body.data?.accessToken) {
    throw new Error(`OTP Verification failed with status ${otpVerifyRes.status}`);
  }

  const accessToken = otpVerifyRes.body.data.accessToken;
  const authHeaders = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  console.log('Authenticated Bearer Token successfully obtained.');

  // -------------------------------------------------------------------------
  // STEP 2: GET /workers/me
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 2: GET /workers/me');
  console.log('---------------------------------------------------------------');

  const getMeRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me',
    method: 'GET',
    headers: authHeaders,
  });

  console.log(`GET /workers/me HTTP Status: ${getMeRes.status}`);
  console.log('GET /workers/me Response:', JSON.stringify(getMeRes.body, null, 2));
  if (getMeRes.status !== 200) {
    throw new Error(`GET /workers/me failed with status ${getMeRes.status}`);
  }

  // -------------------------------------------------------------------------
  // STEP 3: UPDATE PROFILE
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 3: UPDATE PROFILE');
  console.log('---------------------------------------------------------------');

  const updateProfilePayload = {
    displayName: 'Ramesh Kumar',
    bio: 'Professional certified electrician with 6 years experience in residential wiring.',
    gender: 'MALE',
    dateOfBirth: '1992-05-15',
    experienceYears: 6,
    expectedWage: 800,
    wageType: 'DAILY',
    languages: ['Hindi', 'English', 'Punjabi'],
  };

  console.log('PATCH /workers/me Payload:', JSON.stringify(updateProfilePayload, null, 2));
  const updateProfileRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me',
      method: 'PATCH',
      headers: authHeaders,
    },
    updateProfilePayload
  );

  console.log(`PATCH /workers/me HTTP Status: ${updateProfileRes.status}`);
  console.log('PATCH /workers/me Response:', JSON.stringify(updateProfileRes.body, null, 2));
  if (updateProfileRes.status !== 200) {
    throw new Error(`PATCH /workers/me failed with status ${updateProfileRes.status}`);
  }

  // -------------------------------------------------------------------------
  // STEP 4: ADD SKILL
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 4: ADD SKILL');
  console.log('---------------------------------------------------------------');

  const addSkillPayload = {
    name: 'Electrical Wiring',
    proficiency: 'EXPERT',
    experienceYears: 6,
  };

  console.log('POST /workers/me/skills Payload:', JSON.stringify(addSkillPayload, null, 2));
  const addSkillRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me/skills',
      method: 'POST',
      headers: authHeaders,
    },
    addSkillPayload
  );

  console.log(`POST /workers/me/skills HTTP Status: ${addSkillRes.status}`);
  console.log('POST /workers/me/skills Response:', JSON.stringify(addSkillRes.body, null, 2));
  if (addSkillRes.status !== 201) {
    throw new Error(`POST /workers/me/skills failed with status ${addSkillRes.status}`);
  }

  // -------------------------------------------------------------------------
  // STEP 5: SET LOCATION
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 5: SET LOCATION');
  console.log('---------------------------------------------------------------');

  const setLocationPayload = {
    latitude: 28.6139,
    longitude: 77.2090,
    accuracyMeters: 5,
    addressLine: 'Block B, Inner Circle',
    locality: 'Connaught Place',
    city: 'New Delhi',
    state: 'Delhi',
    pinCode: '110001',
    serviceRadiusKm: 20,
  };

  console.log('PUT /workers/me/location Payload:', JSON.stringify(setLocationPayload, null, 2));
  const setLocationRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me/location',
      method: 'PUT',
      headers: authHeaders,
    },
    setLocationPayload
  );

  console.log(`PUT /workers/me/location HTTP Status: ${setLocationRes.status}`);
  console.log('PUT /workers/me/location Response:', JSON.stringify(setLocationRes.body, null, 2));
  if (setLocationRes.status !== 200) {
    throw new Error(`PUT /workers/me/location failed with status ${setLocationRes.status}`);
  }

  // -------------------------------------------------------------------------
  // STEP 6: CREATE AVAILABILITY
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 6: CREATE AVAILABILITY');
  console.log('---------------------------------------------------------------');

  const createAvailPayload = {
    date: '2026-10-05',
    startTime: '08:00',
    endTime: '17:00',
    status: 'AVAILABLE',
  };

  console.log('POST /workers/me/availability Payload:', JSON.stringify(createAvailPayload, null, 2));
  const createAvailRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me/availability',
      method: 'POST',
      headers: authHeaders,
    },
    createAvailPayload
  );

  console.log(`POST /workers/me/availability HTTP Status: ${createAvailRes.status}`);
  console.log('POST /workers/me/availability Response:', JSON.stringify(createAvailRes.body, null, 2));
  if (createAvailRes.status !== 201) {
    throw new Error(`POST /workers/me/availability failed with status ${createAvailRes.status}`);
  }

  // -------------------------------------------------------------------------
  // STEP 7: CHECK COMPLETION
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 7: CHECK COMPLETION');
  console.log('---------------------------------------------------------------');

  const checkCompRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/completion',
    method: 'GET',
    headers: authHeaders,
  });

  console.log(`GET /workers/me/completion HTTP Status: ${checkCompRes.status}`);
  console.log('GET /workers/me/completion Response:', JSON.stringify(checkCompRes.body, null, 2));
  if (checkCompRes.status !== 200) {
    throw new Error(`GET /workers/me/completion failed with status ${checkCompRes.status}`);
  }

  const { isComplete, completionPercentage, remainingSteps } = checkCompRes.body.data;
  console.log(`\nProfile Readiness Assessment:`);
  console.log(`  - isComplete: ${isComplete}`);
  console.log(`  - completionPercentage: ${completionPercentage}%`);
  console.log(`  - remainingSteps: ${JSON.stringify(remainingSteps)}`);

  if (!isComplete || completionPercentage !== 100) {
    throw new Error(`Profile should be 100% complete, but got ${completionPercentage}%`);
  }

  // -------------------------------------------------------------------------
  // STEP 8: COMPLETE ONBOARDING
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 8: COMPLETE ONBOARDING');
  console.log('---------------------------------------------------------------');

  const completeOnboardingRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/onboarding/complete',
    method: 'POST',
    headers: authHeaders,
  });

  console.log(`POST /workers/me/onboarding/complete HTTP Status: ${completeOnboardingRes.status}`);
  console.log('POST /workers/me/onboarding/complete Response:', JSON.stringify(completeOnboardingRes.body, null, 2));
  if (completeOnboardingRes.status !== 200) {
    throw new Error(`POST /workers/me/onboarding/complete failed with status ${completeOnboardingRes.status}`);
  }

  // Verify worker profile state post-onboarding completion
  console.log('\n8.1 Verification: Re-fetching /workers/me to confirm status transition:');
  const finalProfileRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me',
    method: 'GET',
    headers: authHeaders,
  });

  console.log('Final Profile State:', JSON.stringify(finalProfileRes.body, null, 2));
  const finalWorker = finalProfileRes.body.data;
  console.log(`Worker Onboarding Status: ${finalWorker.onboardingStatus}`);
  console.log(`Worker Onboarding Completed At: ${finalWorker.onboardingCompletedAt}`);

  if (finalWorker.onboardingStatus !== 'COMPLETED' || !finalWorker.onboardingCompletedAt) {
    throw new Error('Onboarding status was not updated to COMPLETED!');
  }

  console.log('\n===============================================================');
  console.log('  SUCCESS: ALL 8 MANUAL WORKER END-TO-END STEPS VERIFIED 100%!');
  console.log('===============================================================');
}

runWorkerEndToEnd()
  .catch((err) => {
    console.error('FLOW FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
