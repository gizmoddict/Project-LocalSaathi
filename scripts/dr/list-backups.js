// ==============================================================================
// LocalSaathi — Phase 23: Backup Listing & Management Utility
// ==============================================================================

const fs = require('fs');
const path = require('path');

function listBackups(outDir) {
  const backupDir = outDir || process.env.BACKUP_STORAGE_DIR || path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    return [];
  }

  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.meta.json'));
  const backups = [];

  for (const f of files) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(backupDir, f), 'utf-8'));
      backups.push(meta);
    } catch {}
  }

  // Sort by timestamp descending
  backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return backups;
}

if (require.main === module) {
  const backups = listBackups();
  console.log(`Found ${backups.length} backup archive(s):`);
  backups.forEach((b) => {
    console.log(`- ID:        ${b.backupId}`);
    console.log(`  Date:      ${b.timestamp}`);
    console.log(`  File:      ${b.filePath}`);
    console.log(`  Size:      ${b.fileSizeBytes} bytes`);
    console.log(`  Encrypted: ${b.isEncrypted}`);
    console.log(`  Status:    ${b.verificationStatus}`);
    console.log(`  Tables:    ${JSON.stringify(b.tableCounts)}`);
    console.log('--------------------------------------------------');
  });
}

module.exports = {
  listBackups,
};
