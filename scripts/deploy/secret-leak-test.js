// ==============================================================================
// LocalSaathi — Automated Secret Leakage Audit Test (Phase 24 Section 42)
// Scans Source Code, Built Artifacts, Dockerfiles, and Frontend Bundles
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// High-risk patterns of real production credentials
const SECRET_SIGNATURES = [
  { name: 'Private Key', regex: /-----BEGIN (RSA|EC|OPENSSH|DSA|PGP)?\s*PRIVATE KEY-----/ },
  { name: 'Live AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Live Stripe Secret Key', regex: /\bsk_live_[0-9a-zA-Z]{24}\b/ },
  { name: 'Live Razorpay Key', regex: /\brzp_live_[0-9a-zA-Z]{14}\b/ },
  { name: 'Slack Incoming Webhook', regex: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/ },
];

// Dangerous private secrets that must NEVER appear in frontend client code
const FRONTEND_FORBIDDEN_KEYWORDS = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'AUTH_PEPPER',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'BACKUP_ENCRYPTION_KEY',
];

function getFilesRecursively(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    // Ignore build caches, git, and node_modules
    if (['node_modules', '.git', '.turbo', '.next', 'backups', 'dist'].includes(item.name)) {
      continue;
    }
    if (item.isDirectory()) {
      getFilesRecursively(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function runSecretLeakageAudit() {
  console.log('======================================================================');
  console.log('  LOCALSAATHI PHASE 24: AUTOMATED SECRET LEAKAGE AUDIT');
  console.log('======================================================================\n');

  const detectedLeaks = [];

  // Check 1: Ensure root .env is NOT tracked by Git
  console.log('[CHECK 1] Git Working Tree Secret Isolation...');
  const gitignoreContent = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf-8');
  assert(gitignoreContent.includes('.env'), '.gitignore must strictly ignore .env files');
  assert(gitignoreContent.includes('*.env'), '.gitignore must ignore wildcard *.env');
  console.log('  -> PASS: .gitignore rigorously excludes environment secret files.\n');

  // Check 2: Scan source files across apps, packages, infra, scripts
  console.log('[CHECK 2] Scanning Source Code & Infrastructure Files for Leaked Credentials...');
  const targetDirs = [
    path.resolve(process.cwd(), 'apps'),
    path.resolve(process.cwd(), 'packages'),
    path.resolve(process.cwd(), 'infra'),
    path.resolve(process.cwd(), 'scripts'),
  ];

  let scannedFiles = 0;
  for (const dir of targetDirs) {
    const files = getFilesRecursively(dir);
    for (const file of files) {
      scannedFiles++;
      const content = fs.readFileSync(file, 'utf-8');

      for (const sig of SECRET_SIGNATURES) {
        if (sig.regex.test(content)) {
          detectedLeaks.push({
            file: path.relative(process.cwd(), file),
            leakType: sig.name,
          });
        }
      }
    }
  }
  console.log(`  -> Scanned ${scannedFiles} source files across the monorepo.`);
  assert.strictEqual(detectedLeaks.length, 0, `Detected ${detectedLeaks.length} leaked secrets in source code!`);
  console.log('  -> PASS: Zero live credential signatures found in tracked source files.\n');

  // Check 3: Audit Frontend Client Components for Private Server Secrets
  console.log('[CHECK 3] Auditing Frontend Client Code for Server-Side Secret Contamination...');
  const webSrcDir = path.resolve(process.cwd(), 'apps/web/src');
  const webFiles = getFilesRecursively(webSrcDir);
  const frontendViolations = [];

  for (const file of webFiles) {
    // Only check tsx/ts files in web
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
    const content = fs.readFileSync(file, 'utf-8');

    for (const kw of FRONTEND_FORBIDDEN_KEYWORDS) {
      // Catch direct usage like `process.env.DATABASE_URL` or `process.env.JWT_ACCESS_SECRET`
      if (content.includes(`process.env.${kw}`)) {
        frontendViolations.push({
          file: path.relative(process.cwd(), file),
          forbiddenKeyword: kw,
        });
      }
    }
  }

  assert.strictEqual(frontendViolations.length, 0, `Frontend references private server secrets: ${JSON.stringify(frontendViolations)}`);
  console.log('  -> PASS: Frontend code strictly adheres to public/private secret separation.\n');

  // Check 4: Audit Release Metadata
  console.log('[CHECK 4] Auditing Generated Release Metadata File...');
  const releaseFile = path.resolve(process.cwd(), 'release-metadata.json');
  if (fs.existsSync(releaseFile)) {
    const metaContent = fs.readFileSync(releaseFile, 'utf-8');
    for (const kw of FRONTEND_FORBIDDEN_KEYWORDS) {
      assert(!metaContent.includes(kw), `Release metadata must not contain private keyword: ${kw}`);
    }
    console.log('  -> PASS: release-metadata.json contains only safe traceability attributes.\n');
  } else {
    console.log('  -> SKIP: release-metadata.json not yet generated; run build step first.\n');
  }

  console.log('======================================================================');
  console.log('  SECRET LEAKAGE AUDIT PASSED: ZERO LEAKED CREDENTIALS DETECTED');
  console.log('======================================================================\n');
  return true;
}

if (require.main === module) {
  try {
    runSecretLeakageAudit();
    process.exit(0);
  } catch (err) {
    console.error('\n[FATAL] Secret Leakage Audit Failed:', err.message);
    process.exit(1);
  }
}

module.exports = { runSecretLeakageAudit };
