// ==============================================================================
// LocalSaathi — Environment Configuration Validation Test (Phase 24 Section 43)
// Tests Fast-Fail Rules Across Development, Test, Staging, and Production
// ==============================================================================

const assert = require('assert');
const { validateEnvironmentConfig } = require('../../packages/validation/dist/env.schema');

function runConfigValidationTests() {
  console.log('======================================================================');
  console.log('  LOCALSAATHI PHASE 24: ENVIRONMENT CONFIGURATION VALIDATION TESTS');
  console.log('======================================================================\n');

  let passed = 0;

  // Test 1: Development allows safe local defaults
  console.log('[TEST 1] Development Environment with Local Defaults...');
  const devConfig = {
    NODE_ENV: 'development',
    APP_ENV: 'development',
    API_URL: 'http://localhost:4000',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  };
  const devRes = validateEnvironmentConfig(devConfig, 'development');
  assert.strictEqual(devRes.isValid, true, 'Development configuration should be valid with local defaults');
  console.log('  -> PASS: Development environment accepts safe local defaults.\n');
  passed++;

  // Test 2: Production rejects missing DATABASE_URL
  console.log('[TEST 2] Production Fast-Fail: Missing DATABASE_URL...');
  const prodMissingDb = {
    NODE_ENV: 'production',
    APP_ENV: 'production',
    JWT_ACCESS_SECRET: 'production_super_secure_access_secret_entropy_64_bytes_long',
    JWT_REFRESH_SECRET: 'production_super_secure_refresh_secret_entropy_64_bytes_long',
    AUTH_PEPPER: 'production_super_secure_pepper_secret_entropy_64_bytes_long',
    CORS_ALLOWED_ORIGINS: 'https://localsaathi.com',
    BACKUP_ENCRYPTION_KEY: 'production_aes_backup_key_32_bytes_entropy',
    SMS_PROVIDER: 'msg91',
  };
  const resMissingDb = validateEnvironmentConfig(prodMissingDb, 'production');
  assert.strictEqual(resMissingDb.isValid, false, 'Production must reject missing DATABASE_URL');
  assert(resMissingDb.errors.some(e => e.includes('DATABASE_URL')), 'Must report missing DATABASE_URL error');
  console.log('  -> PASS: Production correctly failed fast on missing DATABASE_URL.\n');
  passed++;

  // Test 3: Production rejects localhost in DATABASE_URL
  console.log('[TEST 3] Production Fast-Fail: Localhost DATABASE_URL...');
  const prodLocalDb = {
    ...prodMissingDb,
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/db',
  };
  const resLocalDb = validateEnvironmentConfig(prodLocalDb, 'production');
  assert.strictEqual(resLocalDb.isValid, false, 'Production must reject localhost DATABASE_URL');
  assert(resLocalDb.errors.some(e => e.includes('localhost')), 'Must report localhost error');
  console.log('  -> PASS: Production rejected localhost DATABASE_URL.\n');
  passed++;

  // Test 4: Production rejects default development JWT secrets
  console.log('[TEST 4] Production Fast-Fail: Development JWT Placeholder...');
  const prodDevSecret = {
    ...prodMissingDb,
    DATABASE_URL: 'postgresql://user:pass@prod-db.internal:5432/db',
    JWT_ACCESS_SECRET: 'development_jwt_access_secret_only_for_dev_32char',
  };
  const resDevSecret = validateEnvironmentConfig(prodDevSecret, 'production');
  assert.strictEqual(resDevSecret.isValid, false, 'Production must reject default dev secret');
  assert(resDevSecret.errors.some(e => e.includes('JWT_ACCESS_SECRET')), 'Must report JWT secret error');
  console.log('  -> PASS: Production rejected default development secret string.\n');
  passed++;

  // Test 5: Production rejects wildcard CORS
  console.log('[TEST 5] Production Fast-Fail: Wildcard CORS (*)...');
  const prodWildcardCors = {
    ...prodMissingDb,
    DATABASE_URL: 'postgresql://user:pass@prod-db.internal:5432/db',
    CORS_ALLOWED_ORIGINS: '*',
  };
  const resWildcardCors = validateEnvironmentConfig(prodWildcardCors, 'production');
  assert.strictEqual(resWildcardCors.isValid, false, 'Production must reject wildcard CORS');
  assert(resWildcardCors.errors.some(e => e.includes('wildcard')), 'Must report wildcard CORS error');
  console.log('  -> PASS: Production rejected wildcard CORS with credentials.\n');
  passed++;

  // Test 6: Production rejects missing BACKUP_ENCRYPTION_KEY
  console.log('[TEST 6] Production Fast-Fail: Missing BACKUP_ENCRYPTION_KEY...');
  const prodNoBackupKey = {
    ...prodMissingDb,
    DATABASE_URL: 'postgresql://user:pass@prod-db.internal:5432/db',
    BACKUP_ENCRYPTION_KEY: '',
  };
  const resNoBackupKey = validateEnvironmentConfig(prodNoBackupKey, 'production');
  assert.strictEqual(resNoBackupKey.isValid, false, 'Production must reject missing backup key');
  assert(resNoBackupKey.errors.some(e => e.includes('BACKUP_ENCRYPTION_KEY')), 'Must report backup key error');
  console.log('  -> PASS: Production rejected missing backup encryption key.\n');
  passed++;

  // Test 7: Production rejects test payment key ('rzp_test_...')
  console.log('[TEST 7] Production Fast-Fail: Razorpay Sandbox Key in Production...');
  const prodTestRazorpay = {
    ...prodMissingDb,
    DATABASE_URL: 'postgresql://user:pass@prod-db.internal:5432/db',
    RAZORPAY_KEY_ID: 'rzp_test_sandbox_acc_12345',
  };
  const resTestRazorpay = validateEnvironmentConfig(prodTestRazorpay, 'production');
  assert.strictEqual(resTestRazorpay.isValid, false, 'Production must reject sandbox payment key');
  assert(resTestRazorpay.errors.some(e => e.includes('RAZORPAY_KEY_ID')), 'Must report test key error');
  console.log('  -> PASS: Production rejected sandbox rzp_test_* credential.\n');
  passed++;

  // Test 8: Valid Production Configuration passes completely
  console.log('[TEST 8] Valid Production Configuration Acceptance...');
  const validProd = {
    NODE_ENV: 'production',
    APP_ENV: 'production',
    DATABASE_URL: 'postgresql://app_user:strong_prod_pass@prod-db.internal:5432/localsaathi_prod?sslmode=require',
    JWT_ACCESS_SECRET: 'production_super_secure_access_secret_entropy_64_bytes_long',
    JWT_REFRESH_SECRET: 'production_super_secure_refresh_secret_entropy_64_bytes_long',
    AUTH_PEPPER: 'production_super_secure_pepper_secret_entropy_64_bytes_long',
    CORS_ALLOWED_ORIGINS: 'https://localsaathi.com,https://admin.localsaathi.com',
    BACKUP_ENCRYPTION_KEY: 'production_aes_backup_key_32_bytes_entropy',
    RAZORPAY_KEY_ID: 'rzp_live_merchant_acc_98765',
    SMS_PROVIDER: 'msg91',
  };
  const resValidProd = validateEnvironmentConfig(validProd, 'production');
  assert.strictEqual(resValidProd.isValid, true, 'Valid production config must pass');
  assert.strictEqual(resValidProd.errors.length, 0);
  console.log('  -> PASS: Valid production configuration passed all strict gates.\n');
  passed++;

  console.log('======================================================================');
  console.log(`  ALL ${passed} CONFIGURATION VALIDATION TESTS PASSED CLEANLY (${passed}/${passed})`);
  console.log('======================================================================\n');
  return true;
}

if (require.main === module) {
  try {
    runConfigValidationTests();
    process.exit(0);
  } catch (err) {
    console.error('[FATAL] Configuration Validation Test Failed:', err);
    process.exit(1);
  }
}

module.exports = { runConfigValidationTests };
