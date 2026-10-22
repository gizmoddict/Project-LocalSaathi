// ==============================================================================
// LocalSaathi — Staging-Production Boundary Isolation Test (Rule 5)
// Ensures Staging Environment NEVER Shares Infrastructure with Production
// ==============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runBoundaryIsolationTest() {
  console.log('======================================================================');
  console.log('  LOCALSAATHI RULE 5: STAGING / PRODUCTION BOUNDARY ISOLATION TEST');
  console.log('======================================================================\n');

  // Load staging and production example configurations
  const stagingEnvPath = path.resolve(__dirname, '../../.env.staging.example');
  const prodEnvPath = path.resolve(__dirname, '../../.env.production.example');

  assert(fs.existsSync(stagingEnvPath), 'Missing .env.staging.example');
  assert(fs.existsSync(prodEnvPath), 'Missing .env.production.example');

  const parseEnv = (filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = {};
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        env[key] = val;
      }
    });
    return env;
  };

  const stagingEnv = parseEnv(stagingEnvPath);
  const prodEnv = parseEnv(prodEnvPath);

  const checks = [
    {
      name: 'Database URL Separation',
      test: () => {
        assert.notStrictEqual(
          stagingEnv.DATABASE_URL,
          prodEnv.DATABASE_URL,
          'STAGING DATABASE must not equal PRODUCTION DATABASE'
        );
        assert(stagingEnv.DATABASE_URL.includes('staging'), 'Staging DB must reference staging database');
        assert(
          prodEnv.DATABASE_URL.includes('prod') || prodEnv.DATABASE_URL.includes('production'),
          'Prod DB must reference production database'
        );
      },
    },
    {
      name: 'Redis URL Separation',
      test: () => {
        assert.notStrictEqual(
          stagingEnv.REDIS_URL,
          prodEnv.REDIS_URL,
          'STAGING REDIS must not equal PRODUCTION REDIS'
        );
        assert(stagingEnv.REDIS_URL.includes('staging'), 'Staging Redis must reference staging instance');
      },
    },
    {
      name: 'Storage Bucket Separation',
      test: () => {
        assert.notStrictEqual(
          stagingEnv.STORAGE_BUCKET,
          prodEnv.STORAGE_BUCKET,
          'STAGING BUCKET must not equal PRODUCTION BUCKET'
        );
        assert(stagingEnv.STORAGE_BUCKET.includes('staging'), 'Staging bucket must have staging namespace');
        assert(
          prodEnv.STORAGE_BUCKET.includes('prod'),
          'Prod bucket must have production namespace'
        );
      },
    },
    {
      name: 'Payment Sandbox Credentials Separation',
      test: () => {
        assert.notStrictEqual(
          stagingEnv.RAZORPAY_KEY_ID,
          prodEnv.RAZORPAY_KEY_ID,
          'STAGING PAYMENT CREDENTIALS must not equal PRODUCTION CREDENTIALS'
        );
        assert(stagingEnv.RAZORPAY_KEY_ID.startsWith('rzp_test_'), 'Staging MUST use Razorpay test credentials');
        assert(prodEnv.RAZORPAY_KEY_ID.startsWith('rzp_live_'), 'Production MUST use Razorpay live credentials');
      },
    },
    {
      name: 'JWT Access Secret Separation',
      test: () => {
        assert.notStrictEqual(
          stagingEnv.JWT_ACCESS_SECRET,
          prodEnv.JWT_ACCESS_SECRET,
          'Staging and Production must not share JWT access secret'
        );
      },
    },
    {
      name: 'JWT Refresh Secret Separation',
      test: () => {
        assert.notStrictEqual(
          stagingEnv.JWT_REFRESH_SECRET,
          prodEnv.JWT_REFRESH_SECRET,
          'Staging and Production must not share JWT refresh secret'
        );
      },
    },
    {
      name: 'Auth Pepper Separation',
      test: () => {
        assert.notStrictEqual(
          stagingEnv.AUTH_PEPPER,
          prodEnv.AUTH_PEPPER,
          'Staging and Production must not share authentication pepper'
        );
      },
    },
    {
      name: 'Environment Mode Separation',
      test: () => {
        assert.strictEqual(stagingEnv.APP_ENV, 'staging', 'Staging APP_ENV must be staging');
        assert.strictEqual(prodEnv.APP_ENV, 'production', 'Production APP_ENV must be production');
      },
    },
  ];

  let passed = 0;
  for (const c of checks) {
    try {
      c.test();
      console.log(`[PASS] ${c.name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${c.name}: ${err.message}`);
    }
  }

  console.log('\n======================================================================');
  console.log(`  BOUNDARY ISOLATION RESULT: ${passed}/${checks.length} CHECKS PASSED`);
  console.log('======================================================================\n');

  if (passed !== checks.length) {
    process.exit(1);
  }
}

if (require.main === module) {
  runBoundaryIsolationTest();
}

module.exports = { runBoundaryIsolationTest };
