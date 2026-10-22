// ==============================================================================
// LocalSaathi — Phase 23: Migration Safety & Pre-Migration Guard
// Analyzes SQL Migrations: SAFE vs RISKY vs DESTRUCTIVE (Section 20, 21)
// Enforces Mandatory Verified Backup Before Applying Destructive Migrations
// ==============================================================================

const fs = require('fs');
const path = require('path');
const { verifyBackup } = require('./verify-backup');

function analyzeMigrationSql(sqlContent, migrationName = 'unknown') {
  const destructiveOps = [];
  const riskyOps = [];
  const lines = sqlContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim().toUpperCase();
    if (trimmed.startsWith('--')) continue; // skip comments

    if (trimmed.includes('DROP TABLE')) {
      destructiveOps.push(`DROP TABLE in line: "${line.trim()}"`);
    } else if (trimmed.includes('DROP COLUMN')) {
      destructiveOps.push(`DROP COLUMN in line: "${line.trim()}"`);
    } else if (trimmed.includes('TRUNCATE')) {
      destructiveOps.push(`TRUNCATE in line: "${line.trim()}"`);
    } else if (trimmed.includes('ALTER TABLE') && trimmed.includes('DROP')) {
      destructiveOps.push(`ALTER TABLE DROP in line: "${line.trim()}"`);
    } else if (trimmed.includes('ALTER COLUMN') && trimmed.includes('TYPE')) {
      riskyOps.push(`ALTER COLUMN TYPE (potential data truncation): "${line.trim()}"`);
    } else if (trimmed.includes('RENAME COLUMN') || trimmed.includes('RENAME TO')) {
      riskyOps.push(`RENAME operation (breaks backward compatibility): "${line.trim()}"`);
    }
  }

  let classification = 'SAFE';
  if (destructiveOps.length > 0) {
    classification = 'DESTRUCTIVE';
  } else if (riskyOps.length > 0) {
    classification = 'RISKY';
  }

  const requiresBackup = classification === 'DESTRUCTIVE' || classification === 'RISKY';
  const isReversible = classification === 'SAFE';

  return {
    migrationName,
    classification,
    requiresBackup,
    isReversible,
    destructiveOperations: destructiveOps,
    riskyOperations: riskyOps,
    recommendedPrecautions: requiresBackup
      ? ['Take full logical backup', 'Verify backup integrity', 'Test forward-fix script']
      : ['Safe to apply automatically'],
  };
}

async function verifyPreMigrationBackupSafety(migrationsDir, backupDir) {
  const bkpDir = backupDir || process.env.BACKUP_STORAGE_DIR || path.resolve(process.cwd(), 'backups');
  const migDir = migrationsDir || path.resolve(process.cwd(), 'packages/database/prisma/migrations');

  const results = [];
  let blocked = false;
  let reason = '';

  if (!fs.existsSync(migDir)) {
    return { canProceed: true, message: 'No migrations directory found' };
  }

  const migrationFolders = fs.readdirSync(migDir).filter((f) => {
    return fs.statSync(path.join(migDir, f)).isDirectory();
  });

  let hasRiskyOrDestructive = false;

  for (const folder of migrationFolders) {
    const sqlPath = path.join(migDir, folder, 'migration.sql');
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      const analysis = analyzeMigrationSql(sql, folder);
      results.push(analysis);
      if (analysis.requiresBackup) {
        hasRiskyOrDestructive = true;
      }
    }
  }

  // If any migration is risky or destructive, ensure a valid verified backup exists
  if (hasRiskyOrDestructive) {
    let hasValidBackup = false;
    if (fs.existsSync(bkpDir)) {
      const dumps = fs.readdirSync(bkpDir).filter((f) => f.endsWith('.dump.json') || f.endsWith('.dump.enc'));
      for (const d of dumps) {
        const v = await verifyBackup(path.join(bkpDir, d));
        if (v.isValid) {
          hasValidBackup = true;
          break;
        }
      }
    }

    if (!hasValidBackup) {
      blocked = true;
      reason = '[MIGRATION_SAFETY_BLOCK] Migrations contain RISKY or DESTRUCTIVE schema changes, but no valid verified backup was found in the backup directory! Run "npm run db:backup" and verify before proceeding.';
    }
  }

  return {
    canProceed: !blocked,
    blocked,
    reason,
    analyzedCount: results.length,
    results,
  };
}

if (require.main === module) {
  verifyPreMigrationBackupSafety()
    .then((res) => {
      console.log('Migration Safety Pre-flight Check:');
      console.log(`  Can Proceed:     ${res.canProceed ? 'YES' : 'NO'}`);
      console.log(`  Migrations Checked: ${res.analyzedCount}`);
      if (res.blocked) {
        console.error(`  Reason: ${res.reason}`);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Safety check failed:', err.message);
      process.exit(1);
    });
}

function enforceMigrationSafety(analysis, backupPath) {
  if (analysis && analysis.requiresBackup) {
    if (!backupPath || !fs.existsSync(backupPath)) {
      throw new Error(`[MIGRATION_SAFETY_BLOCK] Migration '${analysis.migrationName}' is ${analysis.classification} and requires a verified backup, but backup file was missing or invalid.`);
    }
  }
  return true;
}

module.exports = {
  analyzeMigrationSql,
  verifyPreMigrationBackupSafety,
  enforceMigrationSafety,
};
