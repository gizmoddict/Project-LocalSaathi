const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function request(options) {
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
    req.end();
  });
}

async function verifyMatchingRoutes() {
  console.log('===============================================================');
  console.log('  LOCALSAATHI PHASE 6 MATCHING & DISCOVERY ROUTES VERIFICATION');
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

  const allPaths = Object.keys(swaggerRes.body.paths);

  // Check for duplicate /api/v1/api/v1 prefix anywhere in Swagger
  const hasDuplicatePrefix = allPaths.some((p) => p.includes('/api/v1/api/v1'));
  if (hasDuplicatePrefix) {
    throw new Error('FAIL: Found duplicate /api/v1/api/v1 in Swagger routes!');
  }
  console.log('PASS: Zero duplicate /api/v1/api/v1 prefixes found in Swagger.');

  // Check matching endpoints exist
  const expectedRoutes = [
    '/api/v1/workers/me/jobs',
    '/api/v1/workers/me/jobs/nearby',
    '/api/v1/workers/jobs/{jobId}',
  ];

  console.log('\nVerifying Expected Phase 6 Endpoints:');
  for (const expected of expectedRoutes) {
    if (allPaths.includes(expected)) {
      const methods = Object.keys(swaggerRes.body.paths[expected]).map((m) => m.toUpperCase());
      console.log(`  ✓ FOUND: ${methods.join(', ')} -> ${expected}`);
    } else {
      throw new Error(`FAIL: Missing expected route: ${expected}`);
    }
  }

  console.log('\nPASS: All Phase 6 routes registered cleanly and verified!\n');
}

if (require.main === module) {
  verifyMatchingRoutes().catch((err) => {
    console.error('Route verification failed:', err.message);
    process.exit(1);
  });
}

module.exports = { verifyMatchingRoutes };
