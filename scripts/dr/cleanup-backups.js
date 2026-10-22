// ==============================================================================
// LocalSaathi — Phase 23: Backup Retention & Safe Rotation Engine
// Enforces BACKUP_RETENTION_DAYS while Guaranteeing Newest Valid Backup is Preserved (Sec 35)
// ==============================================================================

const fs = require('fs');
const path = require('path');
const { listBackups } = require('./list-backups');

function cleanupExpiredBackups(options = {}) {
  const retentionDays = options.retentionDays || parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
  const backupDir = options.outDir || process.env.BACKUP_STORAGE_DIR || path.resolve(process.cwd(), 'backups');

  const backups = listBackups(backupDir);
  if (backups.length <= 1) {
    // Invariant: NEVER delete when only 1 or 0 backups exist
    return { deletedCount: 0, retainedCount: backups.length, message: 'Preserved latest backup; nothing pruned' };
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deletedCount = 0;
  let retainedCount = 0;

  // The first backup in sorted list is the newest — always protect it!
  const newestBackupId = backups[0].backupId;

  for (const b of backups) {
    if (b.backupId === newestBackupId) {
      retainedCount++;
      continue; // Always preserve newest backup
    }

    const backupTime = new Date(b.timestamp).getTime();
    if (backupTime < cutoff) {
      // Expired: delete dump and meta files
      if (fs.existsSync(b.filePath)) {
        try { fs.unlinkSync(b.filePath); } catch {}
      }
      const metaPath = b.filePath.replace(/\.dump\.(json|enc)$/, '.meta.json');
      if (fs.existsSync(metaPath)) {
        try { fs.unlinkSync(metaPath); } catch {}
      }
      deletedCount++;
    } else {
      retainedCount++;
    }
  }

  return {
    deletedCount,
    retainedCount,
    retentionDays,
    newestProtectedId: newestBackupId,
  };
}

if (require.main === module) {
  const res = cleanupExpiredBackups();
  console.log(`Backup cleanup complete:`);
  console.log(`  Deleted expired backups:  ${res.deletedCount}`);
  console.log(`  Retained valid backups:   ${res.retainedCount}`);
  console.log(`  Protected latest backup:  ${res.newestProtectedId}`);
}

module.exports = {
  cleanupExpiredBackups,
};
