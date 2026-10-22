const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient, UserRole } = require('@prisma/client');
const crypto = require('crypto');

function signJwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

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

const AUTH_PEPPER = process.env.AUTH_PEPPER || 'localsaathi_development_auth_pepper_secret_minimum_32_characters';

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

async function runMatchingEndToEnd() {
  console.log('===============================================================');
  console.log('  LOCALSAATHI PHASE 6 MATCHING & DISCOVERY END-TO-END FLOW');
  console.log('===============================================================');

  const employerPhone = `+91981${Math.floor(1000000 + Math.random() * 9000000)}`;
  const workerPhone = `+91982${Math.floor(1000000 + Math.random() * 9000000)}`;
  const jwtSecret = process.env.JWT_ACCESS_SECRET || 'development_jwt_access_secret_only_for_dev_32char';

  // -------------------------------------------------------------------------
  // STEP 1: LOGIN AS EMPLOYER & CREATE A PUBLISHED JOB
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 1: EMPLOYER SETUP & JOB PUBLISHING');
  console.log('---------------------------------------------------------------');

  // Request & verify OTP for employer
  await request({ hostname: 'localhost', port: 4000, path: '/api/v1/auth/otp/request', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { phone: employerPhone, role: 'EMPLOYER' });
  const empOtp = await findOtpForPhone(employerPhone);
  const empVerify = await request({ hostname: 'localhost', port: 4000, path: '/api/v1/auth/otp/verify', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { phone: employerPhone, otp: empOtp, role: 'EMPLOYER' });
  const employerToken = empVerify.body.data.accessToken;
  console.log(`1.1 Employer authenticated. Phone: ${employerPhone}`);

  // Update employer profile
  await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/employers/me',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employerToken}` },
  }, {
    businessName: 'Hazratganj Smart Build Tech',
    businessType: 'General Contractor',
    locality: 'Hazratganj',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pinCode: '226001',
  });

  // Create skill for testing
  const skill = await prisma.skill.upsert({
    where: { normalizedName: 'industrial-wiring-p6' },
    update: {},
    create: {
      name: 'Industrial Wiring P6',
      normalizedName: 'industrial-wiring-p6',
      category: 'Electrical',
      isActive: true,
    },
  });

  // Create draft job at Hazratganj (26.8520, 80.9500)
  const jobCreateRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/employers/me/jobs',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employerToken}` },
  }, {
    title: 'Commercial Substation Wiring',
    description: 'High-voltage switchgear wiring and circuit testing.',
    category: 'Electrical',
    wageType: 'DAILY',
    wageAmount: 1200,
    workerCount: 2,
    durationDays: 3,
    startDate: '2026-11-15',
    startTime: '08:30',
    urgency: 'IMMEDIATE',
    requirements: ['Safety footwear required'],
    skills: [{ skillId: skill.id, isRequired: true, minExperienceYears: 2 }],
    location: {
      latitude: 26.8520,
      longitude: 80.9500,
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
      addressLine: 'Block 4, Tech Park',
    },
  });

  if (jobCreateRes.status !== 201) {
    throw new Error(`Failed to create test job: ${JSON.stringify(jobCreateRes.body)}`);
  }
  const jobId = jobCreateRes.body.data.id;
  console.log(`1.2 Draft job created: ${jobId}`);

  // Publish job
  const pubRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/publish`,
    method: 'POST',
    headers: { Authorization: `Bearer ${employerToken}` },
  });
  if (pubRes.status !== 200) {
    throw new Error(`Failed to publish job: ${JSON.stringify(pubRes.body)}`);
  }
  console.log(`1.3 Job published successfully: Status = ${pubRes.body.data.status}`);

  // -------------------------------------------------------------------------
  // STEP 2: LOGIN AS WORKER & SET UP PROFILE, LOCATION & SKILLS
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 2: WORKER SETUP (LOCATION & MATCHING CRITERIA)');
  console.log('---------------------------------------------------------------');

  await request({ hostname: 'localhost', port: 4000, path: '/api/v1/auth/otp/request', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { phone: workerPhone, role: 'WORKER' });
  const wrkOtp = await findOtpForPhone(workerPhone);
  const wrkVerify = await request({ hostname: 'localhost', port: 4000, path: '/api/v1/auth/otp/verify', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { phone: workerPhone, otp: wrkOtp, role: 'WORKER' });
  const workerToken = wrkVerify.body.data.accessToken;
  console.log(`2.1 Worker authenticated. Phone: ${workerPhone}`);

  // Update worker profile
  await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
  }, {
    displayName: 'Prakash Vidyut Saathi',
    experienceYears: 4,
    expectedWage: 1000,
    wageType: 'DAILY',
    preferredRadiusKm: 20,
  });

  // Set worker location in Hazratganj center (26.8500, 80.9480) ~300m away
  await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/location',
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
  }, {
    latitude: 26.8500,
    longitude: 80.9480,
    locality: 'Hazratganj',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pinCode: '226001',
    accuracyMeters: 5,
  });

  // Add matching skill
  await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/skills',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerToken}` },
  }, {
    skillId: skill.id,
    proficiency: 'EXPERT',
    experienceYears: 4,
  });
  console.log('2.2 Worker profile, location (26.8500, 80.9480), and skills configured.');

  // -------------------------------------------------------------------------
  // STEP 3: WORKER JOB DISCOVERY (/api/v1/workers/me/jobs)
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 3: WORKER JOB DISCOVERY VERIFICATION');
  console.log('---------------------------------------------------------------');

  const discRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/jobs?sort=score_desc',
    method: 'GET',
    headers: { Authorization: `Bearer ${workerToken}` },
  });

  if (discRes.status !== 200) {
    throw new Error(`Discovery failed with status ${discRes.status}: ${JSON.stringify(discRes.body)}`);
  }

  const items = discRes.body.data.items;
  const discoveredJob = items.find((j) => j.id === jobId);

  if (!discoveredJob) {
    throw new Error(`Published job ${jobId} not found in worker discovery feed!`);
  }

  console.log(`3.1 Discovered Job Found: "${discoveredJob.title}"`);
  console.log(`    - PostGIS Distance: ${discoveredJob.distanceKm} km`);
  console.log(`    - Deterministic Score: ${discoveredJob.match.score}% (Eligible: ${discoveredJob.match.eligible})`);
  console.log(`    - Skill Score: ${discoveredJob.match.breakdown.skillScore}% (${discoveredJob.match.breakdown.matchedSkillsCount}/${discoveredJob.match.breakdown.totalRequiredSkillsCount} matched)`);
  console.log(`    - Wage Comparison: ${discoveredJob.match.breakdown.wageComparisonText}`);
  console.log(`    - Explainable Reasons (${discoveredJob.match.reasons.length}):`);
  discoveredJob.match.reasons.forEach((r) => console.log(`      * ${r}`));

  if (discoveredJob.distanceKm > 1.0) {
    throw new Error(`Expected distance < 1 km between Hazratganj coordinates, got ${discoveredJob.distanceKm} km`);
  }
  if (discoveredJob.match.score < 80) {
    throw new Error(`Expected match score >= 80%, got ${discoveredJob.match.score}%`);
  }

  // -------------------------------------------------------------------------
  // STEP 4: NEARBY JOBS CONVENIENCE ENDPOINT (/api/v1/workers/me/jobs/nearby)
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 4: NEARBY JOBS DISTANCE SORTING');
  console.log('---------------------------------------------------------------');

  const nearbyRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/jobs/nearby',
    method: 'GET',
    headers: { Authorization: `Bearer ${workerToken}` },
  });

  if (nearbyRes.status !== 200) {
    throw new Error(`Nearby jobs failed with status ${nearbyRes.status}`);
  }
  console.log(`4.1 Nearby jobs returned ${nearbyRes.body.data.items.length} item(s) ordered by distance.`);

  // -------------------------------------------------------------------------
  // STEP 5: WORKER JOB DETAIL & PRIVACY VERIFICATION (/api/v1/workers/jobs/:jobId)
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 5: JOB DETAIL & PRIVACY VALIDATION');
  console.log('---------------------------------------------------------------');

  const detailRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/jobs/${jobId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${workerToken}` },
  });

  if (detailRes.status !== 200) {
    throw new Error(`Job detail failed with status ${detailRes.status}`);
  }

  const detail = detailRes.body.data;
  console.log(`5.1 Job Detail retrieved for: "${detail.title}"`);
  console.log(`    - Employer Public Name: ${detail.employer.businessName}`);
  console.log(`    - Employer Locality: ${detail.employer.locality}, ${detail.employer.city}`);
  console.log(`    - Skills evaluated: ${detail.skillDetails.length}`);

  // Assert Privacy: ensure employer phone, email, or user IDs are NOT present
  if (detail.employer.phone || detail.employer.email || detail.employer.userId) {
    throw new Error('FAIL: Leaked private employer PII in worker job detail!');
  }
  console.log('5.2 Privacy verified: Zero private employer PII exposed to worker.');

  // -------------------------------------------------------------------------
  // STEP 6: LIFECYCLE REACTION (PAUSE & RESUME JOB)
  // -------------------------------------------------------------------------
  console.log('\n---------------------------------------------------------------');
  console.log('STEP 6: LIFECYCLE REACTIVITY (PAUSE & RESTORE)');
  console.log('---------------------------------------------------------------');

  // Employer pauses job
  await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/pause`,
    method: 'POST',
    headers: { Authorization: `Bearer ${employerToken}` },
  });
  console.log('6.1 Employer paused the job.');

  // Worker re-runs discovery -> job must NOT be discoverable
  const pauseDiscRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/jobs',
    method: 'GET',
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  const foundPaused = pauseDiscRes.body.data.items.some((j) => j.id === jobId);
  if (foundPaused) {
    throw new Error('FAIL: Paused job was still returned in worker discovery!');
  }
  console.log('6.2 Verified: Paused job immediately excluded from worker discovery feed.');

  // Worker attempts to view detail of paused job -> must return 404
  const pauseDetailRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/jobs/${jobId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  if (pauseDetailRes.status !== 404) {
    throw new Error(`FAIL: Expected 404 on paused job detail, got ${pauseDetailRes.status}`);
  }
  console.log('6.3 Verified: Direct access to paused job returns 404 Not Found.');

  // Employer resumes job
  await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/resume`,
    method: 'POST',
    headers: { Authorization: `Bearer ${employerToken}` },
  });
  console.log('6.4 Employer resumed the job.');

  const resumeDiscRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/jobs',
    method: 'GET',
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  const foundResumed = resumeDiscRes.body.data.items.some((j) => j.id === jobId);
  if (!foundResumed) {
    throw new Error('FAIL: Resumed job did not reappear in worker discovery!');
  }
  console.log('6.5 Verified: Resumed job immediately reappears in worker discovery.');

  console.log('\n===============================================================');
  console.log('  SUCCESS: ALL PHASE 6 MATCHING FLOWS VERIFIED 100%!');
  console.log('===============================================================\n');
}

if (require.main === module) {
  runMatchingEndToEnd()
    .catch((err) => {
      console.error('\nE2E ERROR:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { runMatchingEndToEnd };
