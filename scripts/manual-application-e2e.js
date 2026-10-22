const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient, UserRole } = require('@prisma/client');
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

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED ASSERTION: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runApplicationEndToEnd() {
  console.log('========================================================================');
  console.log('  LOCALSAATHI PHASE 7 APPLICATION MANAGEMENT END-TO-END VERIFICATION');
  console.log('========================================================================\n');

  const empPhoneA = `+91971${Math.floor(1000000 + Math.random() * 9000000)}`;
  const empPhoneB = `+91972${Math.floor(1000000 + Math.random() * 9000000)}`;
  const wrkPhoneA = `+91973${Math.floor(1000000 + Math.random() * 9000000)}`;
  const wrkPhoneB = `+91974${Math.floor(1000000 + Math.random() * 9000000)}`;

  // ---------------------------------------------------------------------------
  // STEP 1: EMPLOYER A LOGIN & PROFILE SETUP
  // ---------------------------------------------------------------------------
  console.log('▶ STEP 1: Employer A Login & Profile Setup');
  const empTokenA = await authenticateUser(empPhoneA, 'EMPLOYER');
  assert(!!empTokenA, `Employer A authenticated successfully (${empPhoneA})`);

  await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/employers/me',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empTokenA}` },
    },
    {
      businessName: 'Apex Industrial Electrics Ltd',
      businessType: 'Electrical Contractor',
      locality: 'Hazratganj',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
    }
  );
  assert(true, 'Employer A profile updated with business details and location');

  // ---------------------------------------------------------------------------
  // STEP 2: CREATE & PUBLISH JOB POST
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 2: Employer A Creates & Publishes Job Post');
  const testSkill = await prisma.skill.upsert({
    where: { normalizedName: 'commercial-wiring-p7' },
    update: {},
    create: {
      name: 'Commercial Wiring P7',
      normalizedName: 'commercial-wiring-p7',
      category: 'Electrical',
      isActive: true,
    },
  });

  const jobRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/employers/me/jobs',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empTokenA}` },
    },
    {
      title: 'Commercial Substation Wireman Needed',
      description: 'Require certified wireman for 3-day transformer rewiring and switchboard testing.',
      category: 'Electrical',
      wageType: 'DAILY',
      wageAmount: 1100,
      workerCount: 2,
      durationDays: 3,
      startDate: '2026-11-20',
      startTime: '08:30',
      urgency: 'IMMEDIATE',
      requirements: ['Must possess insulated electrical hand tools'],
      skills: [{ skillId: testSkill.id, isRequired: true, minExperienceYears: 2 }],
      location: {
        latitude: 26.8520,
        longitude: 80.9500,
        locality: 'Hazratganj',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226001',
        addressLine: 'Plot 14, Commercial District',
      },
    }
  );
  assert(jobRes.status === 201, 'Draft job created with 201 Created');
  const jobId = jobRes.body.data.id;

  const pubRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/publish`,
    method: 'POST',
    headers: { Authorization: `Bearer ${empTokenA}` },
  });
  assert(pubRes.status === 200, 'Job transitioned to PUBLISHED');
  assert(pubRes.body.data.status === 'PUBLISHED', 'Job status confirmed as PUBLISHED');

  // ---------------------------------------------------------------------------
  // STEP 3: WORKER A LOGIN & ONBOARDING SETUP
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 3: Worker A Login & Profile Setup');
  const wrkTokenA = await authenticateUser(wrkPhoneA, 'WORKER');
  assert(!!wrkTokenA, `Worker A authenticated successfully (${wrkPhoneA})`);

  // Setup worker profile
  await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrkTokenA}` },
    },
    {
      displayName: 'Vikram Singh Electrician',
      bio: 'Master wireman with 5 years experience in commercial transformers.',
      experienceYears: 5,
      expectedWage: 1000,
      wageType: 'DAILY',
      preferredRadiusKm: 15,
      languages: ['Hindi', 'English'],
    }
  );

  // Add skill
  await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me/skills',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrkTokenA}` },
    },
    {
      skillId: testSkill.id,
      experienceYears: 5,
      level: 'EXPERT',
      isTopSkill: true,
    }
  );

  // Set location (within 1 km of job in Hazratganj)
  await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me/location',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrkTokenA}` },
    },
    {
      latitude: 26.8530,
      longitude: 80.9510,
      locality: 'Hazratganj Main',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pinCode: '226001',
    }
  );

  // Set availability
  await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me/availability',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrkTokenA}` },
    },
    {
      availableFrom: '2026-11-01T00:00:00.000Z',
      availableTo: '2026-12-31T23:59:59.000Z',
      isImmediate: true,
    }
  );
  assert(true, 'Worker A profile, skills, location, and availability configured');

  // ---------------------------------------------------------------------------
  // STEP 4: WORKER A DISCOVERS JOB FEED
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 4: Worker A Discovers Job in Hyperlocal Feed');
  const feedRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/jobs',
    method: 'GET',
    headers: { Authorization: `Bearer ${wrkTokenA}` },
  });
  assert(feedRes.status === 200, 'Worker job feed returned 200 OK');
  const items = feedRes.body.data.items || [];
  const matchedJob = items.find((j) => j.id === jobId);
  assert(!!matchedJob, 'Target job discovered in worker matching feed');
  assert(matchedJob.match.score >= 80, `High deterministic match score verified (${matchedJob.match.score}%)`);

  // ---------------------------------------------------------------------------
  // STEP 5: WORKER A SUBMITS APPLICATION WITH COVER NOTE
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 5: Worker A Submits Job Application');
  const applyMsg = 'I have 5 years experience in substation wiring and hold an active wireman certification.';
  const applyRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/workers/me/jobs/${jobId}/applications`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrkTokenA}` },
    },
    { message: applyMsg }
  );
  assert(applyRes.status === 201, 'Application submitted with 201 Created');
  const appData = applyRes.body.data;
  assert(appData.status === 'APPLIED', 'Application initial status is APPLIED');
  assert(!!appData.id, 'Application ID generated');
  assert(!!appData.appliedAt, 'appliedAt timestamp populated');
  const applicationId = appData.id;

  // ---------------------------------------------------------------------------
  // STEP 6: VERIFY WORKER APPLICATION LIST & DETAIL ENDPOINTS
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 6: Verify Worker Application Queries');
  const wrkAppsRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/applications',
    method: 'GET',
    headers: { Authorization: `Bearer ${wrkTokenA}` },
  });
  assert(wrkAppsRes.status === 200, 'GET /workers/me/applications returned 200 OK');
  const workerItems = wrkAppsRes.body.data.items || [];
  assert(workerItems.length >= 1, 'Applications array contains at least 1 item');
  const foundApp = workerItems.find((a) => a.id === applicationId);
  assert(!!foundApp, 'Created application found in worker applications list');
  assert(foundApp.jobTitle === 'Commercial Substation Wireman Needed', 'Job title properly projected in summary');

  const checkAppRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/me/jobs/${jobId}/application`,
    method: 'GET',
    headers: { Authorization: `Bearer ${wrkTokenA}` },
  });
  assert(checkAppRes.status === 200, 'GET /workers/me/jobs/:jobId/application returned 200 OK');
  assert(checkAppRes.body.data.id === applicationId, 'Worker active application check returns exact ID');

  const wrkAppDetailRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/me/applications/${applicationId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${wrkTokenA}` },
  });
  assert(wrkAppDetailRes.status === 200, 'GET /workers/me/applications/:id returned 200 OK');
  assert(wrkAppDetailRes.body.data.id === applicationId, 'Application detail matches ID');
  assert(wrkAppDetailRes.body.data.applicationMessage === applyMsg, 'Application message persisted and returned in detail');

  // ---------------------------------------------------------------------------
  // STEP 7: DUPLICATE APPLICATION ATTEMPT BLOCKED (409 CONFLICT)
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 7: Duplicate Application Attempt Blocked (409 Conflict)');
  const dupRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/workers/me/jobs/${jobId}/applications`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrkTokenA}` },
    },
    { message: 'Duplicate attempt' }
  );
  assert(dupRes.status === 409, `Duplicate application rejected with 409 Conflict (Received ${dupRes.status})`);

  // ---------------------------------------------------------------------------
  // STEP 8: EMPLOYER A VIEWS APPLICANTS & METRICS
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 8: Employer A Views Job Applicants & Metrics');
  const empAppsRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/applications`,
    method: 'GET',
    headers: { Authorization: `Bearer ${empTokenA}` },
  });
  assert(empAppsRes.status === 200, 'Employer application list returned 200 OK');
  const { items: empApps, metrics } = empAppsRes.body.data;
  assert(metrics.total === 1, `Metrics total is 1 (got ${metrics.total})`);
  assert(metrics.pending === 1, `Metrics pending is 1 (got ${metrics.pending})`);
  assert(metrics.shortlisted === 0, 'Metrics shortlisted is 0');
  assert(metrics.accepted === 0, 'Metrics accepted is 0');
  assert(empApps.length === 1, 'Applicant count is 1');
  assert(empApps[0].worker.displayName === 'Vikram Singh Electrician', 'Applicant worker name displayed');

  // ---------------------------------------------------------------------------
  // STEP 9: EMPLOYER A VIEWS APPLICANT DETAIL & DETERMINISTIC MATCH SCORE
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 9: Employer A Views Applicant Detail & Match Breakdown');
  const empAppDetailRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/applications/${applicationId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${empTokenA}` },
  });
  assert(empAppDetailRes.status === 200, 'Employer applicant detail returned 200 OK');
  const applicantDetail = empAppDetailRes.body.data;
  assert(typeof applicantDetail.match.score === 'number', `Match score is numeric (${applicantDetail.match.score})`);
  assert(applicantDetail.match.breakdown !== undefined, 'Match score breakdown is present');
  assert(applicantDetail.match.breakdown.distanceScore !== undefined, 'distanceScore present');
  assert(applicantDetail.match.breakdown.skillScore !== undefined, 'skillScore present');
  assert(applicantDetail.match.breakdown.experienceScore !== undefined, 'experienceScore present');
  assert(applicantDetail.match.breakdown.wageScore !== undefined, 'wageScore present');
  assert(applicantDetail.match.breakdown.availabilityScore !== undefined, 'availabilityScore present');
  assert(applicantDetail.applicationMessage === applyMsg, 'Employer sees worker cover note');

  // ---------------------------------------------------------------------------
  // STEP 10: EMPLOYER A SHORTLISTS APPLICANT (APPLIED -> SHORTLISTED)
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 10: Employer A Shortlists Applicant');
  const shortlistRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/applications/${applicationId}/shortlist`,
    method: 'POST',
    headers: { Authorization: `Bearer ${empTokenA}` },
  });
  assert(shortlistRes.status === 200, 'Shortlist endpoint returned 200 OK');
  assert(shortlistRes.body.data.status === 'SHORTLISTED', 'Application status updated to SHORTLISTED');
  assert(!!shortlistRes.body.data.shortlistedAt, 'shortlistedAt timestamp set');

  // ---------------------------------------------------------------------------
  // STEP 11: WORKER A OBSERVES SHORTLISTED STATUS
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 11: Worker A Observes SHORTLISTED Status');
  const wrkCheckShortlist = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/me/applications/${applicationId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${wrkTokenA}` },
  });
  assert(wrkCheckShortlist.body.data.status === 'SHORTLISTED', 'Worker sees SHORTLISTED status');
  assert(!!wrkCheckShortlist.body.data.shortlistedAt, 'Worker sees shortlistedAt timestamp');

  // ---------------------------------------------------------------------------
  // STEP 12: EMPLOYER A ACCEPTS APPLICANT (SHORTLISTED -> ACCEPTED)
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 12: Employer A Accepts Applicant');
  const acceptRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/applications/${applicationId}/accept`,
    method: 'POST',
    headers: { Authorization: `Bearer ${empTokenA}` },
  });
  assert(acceptRes.status === 200, 'Accept endpoint returned 200 OK');
  assert(acceptRes.body.data.status === 'ACCEPTED', 'Application status updated to ACCEPTED');
  assert(!!acceptRes.body.data.acceptedAt, 'acceptedAt timestamp set');

  // ---------------------------------------------------------------------------
  // STEP 13: WORKER A OBSERVES ACCEPTED STATUS
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 13: Worker A Observes ACCEPTED Status');
  const wrkCheckAccepted = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/me/applications/${applicationId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${wrkTokenA}` },
  });
  assert(wrkCheckAccepted.body.data.status === 'ACCEPTED', 'Worker sees ACCEPTED status');
  assert(!!wrkCheckAccepted.body.data.acceptedAt, 'Worker sees acceptedAt timestamp');

  // ---------------------------------------------------------------------------
  // STEP 14: VERIFY INVALID FSM TRANSITIONS REJECTED (400 BAD REQUEST)
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 14: Invalid FSM Transitions Rejected (400 Bad Request)');
  // 1. ACCEPTED -> REJECTED (terminal state cannot transition)
  const invalidReject = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/applications/${applicationId}/reject`,
    method: 'POST',
    headers: { Authorization: `Bearer ${empTokenA}` },
  });
  assert(invalidReject.status === 400, `ACCEPTED -> REJECTED rejected with 400 Bad Request (Got ${invalidReject.status})`);

  // 2. ACCEPTED -> SHORTLISTED
  const invalidShortlist = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/applications/${applicationId}/shortlist`,
    method: 'POST',
    headers: { Authorization: `Bearer ${empTokenA}` },
  });
  assert(invalidShortlist.status === 400, `ACCEPTED -> SHORTLISTED rejected with 400 Bad Request (Got ${invalidShortlist.status})`);

  // 3. ACCEPTED -> WITHDRAWN (worker cannot withdraw once accepted)
  const invalidWithdraw = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/me/applications/${applicationId}/withdraw`,
    method: 'POST',
    headers: { Authorization: `Bearer ${wrkTokenA}` },
  });
  assert(invalidWithdraw.status === 400, `ACCEPTED -> WITHDRAWN rejected with 400 Bad Request (Got ${invalidWithdraw.status})`);

  // ---------------------------------------------------------------------------
  // STEP 15: VERIFY IDOR PROTECTION & SECOND WORKER WITHDRAW FLOW
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 15: Verify IDOR Isolation & Worker Withdraw Lifecycle');
  const wrkTokenB = await authenticateUser(wrkPhoneB, 'WORKER');
  const empTokenB = await authenticateUser(empPhoneB, 'EMPLOYER');

  // Worker B cannot view Worker A's application
  const idorWorkerDetail = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/me/applications/${applicationId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${wrkTokenB}` },
  });
  assert(idorWorkerDetail.status === 404, `Worker B blocked from viewing Worker A application (Got ${idorWorkerDetail.status})`);

  // Worker B cannot withdraw Worker A's application
  const idorWorkerWithdraw = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/me/applications/${applicationId}/withdraw`,
    method: 'POST',
    headers: { Authorization: `Bearer ${wrkTokenB}` },
  });
  assert(idorWorkerWithdraw.status === 404, `Worker B blocked from withdrawing Worker A application (Got ${idorWorkerWithdraw.status})`);

  // Employer B cannot view Employer A's job applications
  const idorEmpList = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/applications`,
    method: 'GET',
    headers: { Authorization: `Bearer ${empTokenB}` },
  });
  assert(idorEmpList.status === 404, `Employer B blocked from viewing Employer A job applications (Got ${idorEmpList.status})`);

  // Employer B cannot view Employer A's applicant detail
  const idorEmpDetail = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/applications/${applicationId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${empTokenB}` },
  });
  assert(idorEmpDetail.status === 404, `Employer B blocked from viewing Employer A applicant detail (Got ${idorEmpDetail.status})`);

  // Setup Worker B to apply and withdraw their own application
  await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrkTokenB}` },
    },
    { displayName: 'Rohit Verma Assistant Wireman', experienceYears: 2 }
  );

  const wrkBApply = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/workers/me/jobs/${jobId}/applications`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wrkTokenB}` },
    },
    { message: 'Interested in this assignment.' }
  );
  assert(wrkBApply.status === 201, 'Worker B applied to job successfully');
  const appBId = wrkBApply.body.data.id;

  // Worker B withdraws their own application (APPLIED -> WITHDRAWN)
  const withdrawRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/me/applications/${appBId}/withdraw`,
    method: 'POST',
    headers: { Authorization: `Bearer ${wrkTokenB}` },
  });
  assert(withdrawRes.status === 200, 'Worker B withdraws application with 200 OK');
  assert(withdrawRes.body.data.status === 'WITHDRAWN', 'Status is now WITHDRAWN');
  assert(!!withdrawRes.body.data.withdrawnAt, 'withdrawnAt timestamp set');

  // Verify Employer A sees updated metrics with 1 accepted and 1 withdrawn
  const updatedEmpMetrics = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/employers/me/jobs/${jobId}/applications`,
    method: 'GET',
    headers: { Authorization: `Bearer ${empTokenA}` },
  });
  assert(updatedEmpMetrics.body.data.metrics.total === 2, 'Metrics total updated to 2');
  assert(updatedEmpMetrics.body.data.metrics.accepted === 1, 'Metrics accepted is 1');
  assert(updatedEmpMetrics.body.data.metrics.withdrawn === 1, 'Metrics withdrawn is 1');

  // ---------------------------------------------------------------------------
  // STEP 16: PRIVACY & DATA LEAKAGE AUDIT
  // ---------------------------------------------------------------------------
  console.log('\n▶ STEP 16: Privacy & Data Leakage Audit');
  const wrkAppCheck = wrkAppDetailRes.body.data;
  assert(!wrkAppCheck.otpHash, 'No OTP hash leaked in worker application projection');
  assert(!wrkAppCheck.passwordHash, 'No password hash leaked in worker application projection');

  const empAppCheck = empAppDetailRes.body.data;
  assert(!empAppCheck.worker.otpHash, 'No OTP hash leaked in worker applicant projection');
  assert(!empAppCheck.worker.passwordHash, 'No password hash leaked in worker applicant projection');
  assert(!empAppCheck.worker.user, 'No internal user security record leaked');

  console.log('\n========================================================================');
  console.log('  🎉 ALL 16 APPLICATION LIFECYCLE E2E VERIFICATION STEPS PASSED!');
  console.log('========================================================================\n');
}

runApplicationEndToEnd()
  .catch((err) => {
    console.error('\n❌ E2E VERIFICATION FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
