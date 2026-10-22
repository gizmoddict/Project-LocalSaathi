// ==============================================================================
// LocalSaathi — Traceable Release Metadata Generator (Phase 24 Section 28)
// Captures Git Commit SHA, Build Timestamp, Lockfile Hash, and Target Environment
// ==============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function getGitCommitSha() {
  if (process.env.COMMIT_SHA) return process.env.COMMIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown-commit';
  }
}

function getGitBranch() {
  if (process.env.BRANCH_NAME) return process.env.BRANCH_NAME;
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown-branch';
  }
}

function getLockfileSha256() {
  const lockfilePath = path.resolve(process.cwd(), 'package-lock.json');
  if (fs.existsSync(lockfilePath)) {
    const content = fs.readFileSync(lockfilePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  return 'no-lockfile';
}

function generateReleaseMetadata(outPath) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'));
  const commitSha = getGitCommitSha();
  const branch = getGitBranch();
  const lockfileHash = getLockfileSha256();
  const buildTimestamp = new Date().toISOString();
  const environment = process.env.APP_ENV || process.env.NODE_ENV || 'production';

  const metadata = {
    application: 'LocalSaathi',
    version: pkg.version || '0.1.0',
    environment,
    commitSha,
    branch,
    lockfileHash,
    buildTimestamp,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };

  const targetFile = outPath || path.resolve(process.cwd(), 'release-metadata.json');
  fs.writeFileSync(targetFile, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`[RELEASE] Generated traceable release metadata at: ${targetFile}`);
  console.log(`  Commit SHA:    ${commitSha}`);
  console.log(`  Version:       ${metadata.version}`);
  console.log(`  Build Time:    ${buildTimestamp}`);
  console.log(`  Lockfile Hash: ${lockfileHash.substring(0, 16)}...`);

  return metadata;
}

if (require.main === module) {
  const customOut = process.argv[2];
  generateReleaseMetadata(customOut);
}

module.exports = { generateReleaseMetadata };
