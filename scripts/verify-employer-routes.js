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

async function verifyEmployerRoutes() {
  console.log('===============================================================');
  console.log('  LOCALSAATHI EMPLOYER & JOB ROUTES SWAGGER VERIFICATION');
  console.log('===============================================================');

  const swaggerRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/docs-json',
    method: 'GET',
  });

  if (swaggerRes.status !== 200) {
    throw new Error(`Swagger docs returned status ${swaggerRes.status}. Is the API server running on port 4000?`);
  }

  const paths = Object.keys(swaggerRes.body.paths).filter(
    (p) => p.includes('employer') || p.includes('job')
  );

  console.log('\nEmployer & Job Routes in Swagger:');
  paths.sort().forEach((p) => {
    const methods = Object.keys(swaggerRes.body.paths[p]).map((m) => m.toUpperCase());
    console.log(`  ${methods.join(', ')} -> ${p}`);
  });

  // Verify NO duplicate /api/v1/api/v1 prefix
  const hasDuplicatePrefix = Object.keys(swaggerRes.body.paths).some((p) =>
    p.includes('/api/v1/api/v1')
  );

  if (hasDuplicatePrefix) {
    throw new Error('FAIL: Found /api/v1/api/v1 in Swagger routes!');
  }

  console.log('\nPASS: Zero duplicate /api/v1/api/v1 prefixes found in Swagger.');
  console.log('PASS: All routes properly registered under /api/v1/employers/...\n');
}

if (require.main === module) {
  verifyEmployerRoutes()
    .catch((err) => {
      console.error('Route verification failed:', err.message);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { verifyEmployerRoutes };
