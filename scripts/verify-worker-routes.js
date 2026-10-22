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

async function verify() {
  console.log('=== 1. VERIFYING SWAGGER PATHS ===');
  const swaggerRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/docs-json',
    method: 'GET',
  });

  if (swaggerRes.status !== 200) {
    throw new Error(`Swagger docs returned status ${swaggerRes.status}`);
  }

  const paths = Object.keys(swaggerRes.body.paths).filter((p) => p.includes('worker'));
  console.log('Worker routes in Swagger:');
  paths.sort().forEach((p) => {
    const methods = Object.keys(swaggerRes.body.paths[p]).map((m) => m.toUpperCase());
    console.log(`  ${methods.join(', ')} -> ${p}`);
  });

  const hasDuplicatePrefix = Object.keys(swaggerRes.body.paths).some((p) =>
    p.includes('/api/v1/api/v1')
  );
  if (hasDuplicatePrefix) {
    throw new Error('FAIL: Found /api/v1/api/v1 in Swagger routes!');
  }
  console.log('PASS: No /api/v1/api/v1 duplicate prefix found in Swagger.\n');

  console.log('=== 2. VERIFYING PUBLIC & UNAUTHENTICATED ROUTES ===');
  const pubSkills = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/skills',
    method: 'GET',
  });
  console.log(`GET /api/v1/workers/skills -> Status: ${pubSkills.status} (Expected: 200)`);
  if (pubSkills.status !== 200) throw new Error('Failed to get public skills');

  const unauthMe = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me',
    method: 'GET',
  });
  console.log(`GET /api/v1/workers/me (unauthenticated) -> Status: ${unauthMe.status} (Expected: 401)`);
  if (unauthMe.status !== 401) throw new Error(`Expected 401, got ${unauthMe.status}`);

  const oldDuplicateMe = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/api/v1/workers/me',
    method: 'GET',
  });
  console.log(`GET /api/v1/api/v1/workers/me (old bug route) -> Status: ${oldDuplicateMe.status} (Expected: 404)`);
  if (oldDuplicateMe.status !== 404) throw new Error(`Expected 404, got ${oldDuplicateMe.status}`);

  console.log('\n=== 3. VERIFYING AUTHENTICATED WORKER ROUTES ===');
  // Create or find a test worker user and active session in PostgreSQL
  let user = await prisma.user.findFirst({
    where: { role: UserRole.WORKER, phone: '+919999900001' },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone: '+919999900001',
        role: UserRole.WORKER,
        accountStatus: 'ACTIVE',
      },
    });
  }

  // Ensure active session
  let session = await prisma.session.findFirst({
    where: { userId: user.id, revokedAt: null },
  });

  if (!session) {
    session = await prisma.session.create({
      data: {
        userId: user.id,
        sessionTokenHash: 'mock-session-hash',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Generate valid JWT access token
  const secret = process.env.JWT_ACCESS_SECRET || 'replace_with_secure_random_base64_string_min_32_chars';
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt(
    {
      sub: user.id,
      sessionId: session.id,
      role: user.role,
      iat: now,
      exp: now + 900,
    },
    secret
  );

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Test GET /api/v1/workers/me
  const getMe = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me',
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`GET /api/v1/workers/me -> Status: ${getMe.status}, Success: ${getMe.body.success}`);
  if (getMe.status !== 200) throw new Error(`GET /api/v1/workers/me failed: ${JSON.stringify(getMe.body)}`);

  // Test PATCH /api/v1/workers/me
  const patchMe = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me',
      method: 'PATCH',
      headers: authHeaders,
    },
    { bio: 'Verified professional electrician with 5 years experience', experienceYears: 5 }
  );
  console.log(`PATCH /api/v1/workers/me -> Status: ${patchMe.status}, Success: ${patchMe.body.success}`);
  if (patchMe.status !== 200) throw new Error(`PATCH /api/v1/workers/me failed: ${JSON.stringify(patchMe.body)}`);

  // Test GET /api/v1/workers/me/skills
  const getSkills = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/skills',
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`GET /api/v1/workers/me/skills -> Status: ${getSkills.status}, Count: ${getSkills.body.data?.length}`);
  if (getSkills.status !== 200) throw new Error(`GET /api/v1/workers/me/skills failed: ${JSON.stringify(getSkills.body)}`);

  // Test PUT /api/v1/workers/me/location
  const putLoc = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me/location',
      method: 'PUT',
      headers: authHeaders,
    },
    {
      latitude: 28.6139,
      longitude: 77.209,
      locality: 'Connaught Place',
      city: 'New Delhi',
      state: 'Delhi',
      pinCode: '110001',
      serviceRadiusKm: 15,
    }
  );
  console.log(`PUT /api/v1/workers/me/location -> Status: ${putLoc.status}, Success: ${putLoc.body.success}`);
  if (putLoc.status !== 200) throw new Error(`PUT /api/v1/workers/me/location failed: ${JSON.stringify(putLoc.body)}`);

  // Test GET /api/v1/workers/me/location
  const getLoc = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/location',
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`GET /api/v1/workers/me/location -> Status: ${getLoc.status}, Locality: ${getLoc.body.data?.locality}`);
  if (getLoc.status !== 200) throw new Error(`GET /api/v1/workers/me/location failed: ${JSON.stringify(getLoc.body)}`);

  // Test GET /api/v1/workers/me/availability
  const getAvail = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/availability',
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`GET /api/v1/workers/me/availability -> Status: ${getAvail.status}, Slots: ${getAvail.body.data?.length}`);
  if (getAvail.status !== 200) throw new Error(`GET /api/v1/workers/me/availability failed: ${JSON.stringify(getAvail.body)}`);

  // Test GET /api/v1/workers/me/completion
  const getComp = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/completion',
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`GET /api/v1/workers/me/completion -> Status: ${getComp.status}, Readiness: ${getComp.body.data?.completionPercentage}%`);
  if (getComp.status !== 200) throw new Error(`GET /api/v1/workers/me/completion failed: ${JSON.stringify(getComp.body)}`);

  // Test POST /api/v1/workers/me/skills
  const addSkill = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me/skills',
      method: 'POST',
      headers: authHeaders,
    },
    { name: 'House Painting', proficiency: 'INTERMEDIATE', experienceYears: 3 }
  );
  console.log(`POST /api/v1/workers/me/skills -> Status: ${addSkill.status}, Skill: ${addSkill.body.data?.name}`);
  if (addSkill.status !== 201) throw new Error(`POST /api/v1/workers/me/skills failed: ${JSON.stringify(addSkill.body)}`);
  const skillId = addSkill.body.data?.skillId;

  // Test PATCH /api/v1/workers/me/skills/:skillId
  const patchSkill = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/workers/me/skills/${skillId}`,
      method: 'PATCH',
      headers: authHeaders,
    },
    { proficiency: 'EXPERT', experienceYears: 5 }
  );
  console.log(`PATCH /api/v1/workers/me/skills/${skillId} -> Status: ${patchSkill.status}, Proficiency: ${patchSkill.body.data?.proficiency}`);
  if (patchSkill.status !== 200) throw new Error(`PATCH /api/v1/workers/me/skills failed: ${JSON.stringify(patchSkill.body)}`);

  // Test DELETE /api/v1/workers/me/skills/:skillId
  const deleteSkill = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/me/skills/${skillId}`,
    method: 'DELETE',
    headers: authHeaders,
  });
  console.log(`DELETE /api/v1/workers/me/skills/${skillId} -> Status: ${deleteSkill.status}`);
  if (deleteSkill.status !== 200) throw new Error(`DELETE /api/v1/workers/me/skills failed: ${JSON.stringify(deleteSkill.body)}`);

  // Test POST /api/v1/workers/me/availability
  const addAvail = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/workers/me/availability',
      method: 'POST',
      headers: authHeaders,
    },
    { date: '2026-10-01', startTime: '09:00', endTime: '18:00', status: 'AVAILABLE' }
  );
  console.log(`POST /api/v1/workers/me/availability -> Status: ${addAvail.status}, Id: ${addAvail.body.data?.id}`);
  if (addAvail.status !== 201) throw new Error(`POST /api/v1/workers/me/availability failed: ${JSON.stringify(addAvail.body)}`);
  const availId = addAvail.body.data?.id;

  // Test PATCH /api/v1/workers/me/availability/:id
  const patchAvail = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: `/api/v1/workers/me/availability/${availId}`,
      method: 'PATCH',
      headers: authHeaders,
    },
    { startTime: '10:00', endTime: '19:00' }
  );
  console.log(`PATCH /api/v1/workers/me/availability/${availId} -> Status: ${patchAvail.status}`);
  if (patchAvail.status !== 200) throw new Error(`PATCH /api/v1/workers/me/availability failed: ${JSON.stringify(patchAvail.body)}`);

  // Test DELETE /api/v1/workers/me/availability/:id
  const delAvail = await request({
    hostname: 'localhost',
    port: 4000,
    path: `/api/v1/workers/me/availability/${availId}`,
    method: 'DELETE',
    headers: authHeaders,
  });
  console.log(`DELETE /api/v1/workers/me/availability/${availId} -> Status: ${delAvail.status}`);
  if (delAvail.status !== 200) throw new Error(`DELETE /api/v1/workers/me/availability failed: ${JSON.stringify(delAvail.body)}`);

  // Test POST /api/v1/workers/me/onboarding/complete
  const completeOnboarding = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/workers/me/onboarding/complete',
    method: 'POST',
    headers: authHeaders,
  });
  console.log(`POST /api/v1/workers/me/onboarding/complete -> Status: ${completeOnboarding.status} (Validates onboarding gate)`);
  if (![200, 422].includes(completeOnboarding.status)) throw new Error(`Unexpected status: ${completeOnboarding.status}`);

  console.log('\n=== ALL WORKER ROUTES SUCCESSFULLY VERIFIED ON CORRECTED PATHS! ===');
}

verify()
  .catch((err) => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
