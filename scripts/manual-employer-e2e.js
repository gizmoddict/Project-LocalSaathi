const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const crypto = require('crypto');
const { PrismaClient, UserRole } = require('@prisma/client');

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

  for (let i = 0; i <= 999999; i++) {
    const candidate = i.toString().padStart(6, '0');
    if (hashOtp(phone, candidate) === challenge.otpHash) {
      return candidate;
    }
  }

  throw new Error(`Could not recover OTP for ${phone}`);
}

async function runEmployerEndToEnd() {
  console.log('===============================================================');
  console.log('  LOCALSAATHI EMPLOYER END-TO-END MANUAL FLOW VERIFICATION');
  console.log('===============================================================');

  const randomSuffix = Math.floor(10000000 + Math.random() * 90000000).toString();
  const phone = `+9197${randomSuffix}`;
  const normPhone = normalizePhone(phone);

  // Clean previous test user if exists
  const existingUser = await prisma.user.findFirst({ where: { phone: normPhone } });
  if (existingUser) {
    const profile = await prisma.employerProfile.findUnique({ where: { userId: existingUser.id } });
    if (profile) {
      const jobs = await prisma.jobPost.findMany({ where: { employerProfileId: profile.id } });
      for (const j of jobs) {
        await prisma.jobLocation.deleteMany({ where: { jobPostId: j.id } });
        await prisma.jobRequiredSkill.deleteMany({ where: { jobPostId: j.id } });
        await prisma.jobPost.delete({ where: { id: j.id } });
      }
      await prisma.employerProfile.delete({ where: { id: profile.id } });
    }
    await prisma.session.deleteMany({ where: { userId: existingUser.id } });
    await prisma.otpChallenge.deleteMany({ where: { phone: normPhone } });
    await prisma.user.delete({ where: { id: existingUser.id } });
  }

  // -------------------------------------------------------------------------
  // STEP 1: LOGIN WITH EMPLOYER (Request OTP + Verify OTP)
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 1: LOGIN WITH EMPLOYER');
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

  if (otpReqRes.status !== 200) {
    throw new Error(`OTP Request failed with status ${otpReqRes.status}`);
  }

  const otpCode = await findOtpForPhone(phone);
  console.log(`1.2 Dispatched OTP recovered: ${otpCode}`);

  console.log(`1.3 Verifying OTP with role: EMPLOYER`);
  const otpVerifyRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/auth/otp/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { phone, otp: otpCode, role: 'EMPLOYER' }
  );

  if (otpVerifyRes.status !== 200) {
    throw new Error(`OTP Verify failed with status ${otpVerifyRes.status}: ${JSON.stringify(otpVerifyRes.body)}`);
  }

  const token = otpVerifyRes.body.data.accessToken;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  console.log(`1.4 Authentication successful! Acquired EMPLOYER JWT.`);

  // -------------------------------------------------------------------------
  // STEP 2: GET /employers/me
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 2: GET /api/v1/employers/me');
  console.log('---------------------------------------------------------------');
  const getProfileRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/employers/me',
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`GET /employers/me -> Status: ${getProfileRes.status}, Business: ${getProfileRes.body.data?.businessName}`);
  if (getProfileRes.status !== 200) throw new Error('GET /employers/me failed');

  // -------------------------------------------------------------------------
  // STEP 3: UPDATE PROFILE
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 3: UPDATE EMPLOYER PROFILE');
  console.log('---------------------------------------------------------------');
  const updateRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/employers/me',
      method: 'PATCH',
      headers: authHeaders,
    },
    {
      businessName: 'Sharma Mega Infra Ltd',
      description: 'Major infrastructure and construction developers across South India.',
      businessType: 'Civil Construction',
      contactPreferences: ['PHONE', 'IN_APP'],
      locality: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560038',
    }
  );
  console.log(`PATCH /employers/me -> Status: ${updateRes.status}, Business: ${updateRes.body.data?.businessName}`);
  if (updateRes.status !== 200) throw new Error('PATCH /employers/me failed');

  // -------------------------------------------------------------------------
  // STEP 4: CHECK COMPLETION & FINALIZE ONBOARDING
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 4: ONBOARDING COMPLETION');
  console.log('---------------------------------------------------------------');
  const compRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/employers/me/completion',
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`GET /employers/me/completion -> ${compRes.body.data?.completionPercentage}%, isComplete: ${compRes.body.data?.isComplete}`);

  const finalizeRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/employers/me/onboarding/complete',
    method: 'POST',
    headers: authHeaders,
  });
  console.log(`POST /employers/me/onboarding/complete -> Status: ${finalizeRes.status}, Status: ${finalizeRes.body.data?.onboardingStatus}`);
  if (finalizeRes.status !== 200) throw new Error('Finalize onboarding failed');

  // -------------------------------------------------------------------------
  // STEP 5: CREATE DRAFT JOB
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 5: CREATE DRAFT JOB');
  console.log('---------------------------------------------------------------');
  const createJobRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/employers/me/jobs',
      method: 'POST',
      headers: authHeaders,
    },
    {
      title: 'Structural Steel Fabricator Needed',
      description: 'Looking for a certified fabricator to assemble heavy structural columns on site.',
      category: 'Welding',
      wageType: 'DAILY',
      wageAmount: 1600,
      workerCount: 2,
      durationDays: 4,
      startDate: '2026-11-15',
      startTime: '08:30',
      urgency: 'STANDARD',
      skills: [{ name: 'Structural Welding', isRequired: true, minExperienceYears: 2 }],
      location: {
        latitude: 12.9716,
        longitude: 77.5946,
        locality: 'Whitefield',
        city: 'Bengaluru',
        state: 'Karnataka',
        pinCode: '560066',
      },
    }
  );
  console.log(`POST /employers/me/jobs -> Status: ${createJobRes.status}, Job ID: ${createJobRes.body.data?.id}, Status: ${createJobRes.body.data?.status}`);
  if (createJobRes.status !== 201) throw new Error('Create job failed');
  const jobId = createJobRes.body.data.id;

  // -------------------------------------------------------------------------
  // STEP 6: PUBLISH, PAUSE, RESUME, FILL, CLOSE LIFECYCLE
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 6: JOB LIFECYCLE FSM TRANSITIONS');
  console.log('---------------------------------------------------------------');

  // 6.1 Publish
  const pubRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/publish`,
    method: 'POST',
    headers: authHeaders,
  });
  console.log(`6.1 POST /publish -> Status: ${pubRes.status}, JobStatus: ${pubRes.body.data?.status}`);
  if (pubRes.status !== 200 || pubRes.body.data.status !== 'PUBLISHED') throw new Error('Publish failed');

  // 6.2 Pause
  const pauseRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/pause`,
    method: 'POST',
    headers: authHeaders,
  });
  console.log(`6.2 POST /pause -> Status: ${pauseRes.status}, JobStatus: ${pauseRes.body.data?.status}`);
  if (pauseRes.status !== 200 || pauseRes.body.data.status !== 'PAUSED') throw new Error('Pause failed');

  // 6.3 Resume
  const resumeRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/resume`,
    method: 'POST',
    headers: authHeaders,
  });
  console.log(`6.3 POST /resume -> Status: ${resumeRes.status}, JobStatus: ${resumeRes.body.data?.status}`);
  if (resumeRes.status !== 200 || resumeRes.body.data.status !== 'PUBLISHED') throw new Error('Resume failed');

  // 6.4 Fill
  const fillRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/fill`,
    method: 'POST',
    headers: authHeaders,
  });
  console.log(`6.4 POST /fill -> Status: ${fillRes.status}, JobStatus: ${fillRes.body.data?.status}`);
  if (fillRes.status !== 200 || fillRes.body.data.status !== 'FILLED') throw new Error('Fill failed');

  // 6.5 Close
  const closeRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/close`,
    method: 'POST',
    headers: authHeaders,
  });
  console.log(`6.5 POST /close -> Status: ${closeRes.status}, JobStatus: ${closeRes.body.data?.status}`);
  if (closeRes.status !== 200 || closeRes.body.data.status !== 'CANCELLED') throw new Error('Close failed');

  console.log('\n===============================================================');
  console.log('  SUCCESS: ALL EMPLOYER END-TO-END FLOWS VERIFIED!');
  console.log('===============================================================');
}

if (require.main === module) {
  runEmployerEndToEnd()
    .catch((err) => {
      console.error('E2E ERROR:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { runEmployerEndToEnd };
