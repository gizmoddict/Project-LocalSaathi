// ==============================================================================
// LocalSaathi — Phase 23: Backup Integrity & Readability Verification Engine
// Validates Checksums, Decrypts if Encrypted & Proves Archive Restorability (Section 7)
// ==============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function decryptBuffer(encryptedBuffer, secretKey) {
  try {
    const iv = encryptedBuffer.subarray(0, 12);
    const authTag = encryptedBuffer.subarray(12, 28);
    const data = encryptedBuffer.subarray(28);

    const key = crypto.createHash('sha256').update(secretKey).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch (err) {
    throw new Error(`Decryption failed: ${err.message}`);
  }
}

async function verifyBackup(dumpFilePath, options = {}) {
  const startTime = Date.now();
  const errors = [];

  // 1. File existence check
  if (!fs.existsSync(dumpFilePath)) {
    return {
      isValid: false,
      fileExists: false,
      errors: [`Backup file does not exist: ${dumpFilePath}`],
      durationMs: Date.now() - startTime,
    };
  }

  // 2. Locate companion metadata
  const metaPath = dumpFilePath.replace(/\.dump\.(json|enc)$/, '.meta.json');
  let metadata = null;
  if (fs.existsSync(metaPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch {
      errors.push('Companion .meta.json file exists but is malformed JSON');
    }
  } else {
    errors.push('Missing companion .meta.json metadata file');
  }

  const fileBuffer = fs.readFileSync(dumpFilePath);
  const sizeBytes = fileBuffer.length;

  // 3. Minimum threshold check (backups < 100 bytes are corrupt/empty)
  if (sizeBytes < 100) {
    errors.push(`Backup file size (${sizeBytes} bytes) is below minimum threshold (100 bytes)`);
  }

  // 4. SHA-256 Checksum validation
  const computedChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const expectedChecksum = metadata ? metadata.checksumSha256 : '';
  const checksumMatches = metadata ? computedChecksum === expectedChecksum : false;

  if (metadata && !checksumMatches) {
    errors.push(
      `Checksum mismatch! Expected SHA-256: ${expectedChecksum}, Computed: ${computedChecksum}. Potential file corruption or tampering.`
    );
  }

  // 5. Decryption & Readability check
  let rawPayload = fileBuffer;
  let decryptionSuccessful = true;

  if (metadata && metadata.isEncrypted) {
    const key = options.encryptionKey || process.env.BACKUP_ENCRYPTION_KEY;
    if (!key) {
      errors.push('Backup is encrypted but no BACKUP_ENCRYPTION_KEY was provided');
      decryptionSuccessful = false;
    } else {
      try {
        rawPayload = decryptBuffer(fileBuffer, key);
      } catch (err) {
        errors.push(err.message);
        decryptionSuccessful = false;
      }
    }
  }

  // 6. JSON Archive / Structural Parsing
  let archiveReadable = false;
  let parsedContent = null;
  let tableCountFound = 0;
  let tableCountExpected = metadata ? Object.keys(metadata.tableCounts || {}).length : 0;

  if (decryptionSuccessful) {
    try {
      parsedContent = JSON.parse(rawPayload.toString('utf-8'));
      if (parsedContent && parsedContent.data) {
        archiveReadable = true;
        tableCountFound = Object.keys(parsedContent.data).length;
      } else {
        errors.push('Archive payload missing valid schema structure (no .data object)');
      }
    } catch (err) {
      errors.push(`Archive parsing failed: ${err.message}`);
    }
  }

  const isValid = errors.length === 0;

  // 7. Update metadata file with verification result
  if (metadata && fs.existsSync(metaPath)) {
    metadata.verificationStatus = isValid ? 'VERIFIED' : 'CORRUPTED';
    metadata.verifiedAt = new Date().toISOString();
    try {
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch {}
  }

  const durationMs = Date.now() - startTime;

  return {
    backupId: metadata ? metadata.backupId : path.basename(dumpFilePath),
    filePath: dumpFilePath,
    isValid,
    fileExists: true,
    sizeBytes,
    computedChecksum,
    expectedChecksum,
    checksumMatches,
    decryptionSuccessful,
    archiveReadable,
    tableCountExpected,
    tableCountFound,
    errors,
    verifiedAt: new Date().toISOString(),
    durationMs,
  };
}

if (require.main === module) {
  let targetFile = process.argv[2];
  if (!targetFile) {
    const backupDir = process.env.BACKUP_STORAGE_DIR || path.resolve(process.cwd(), 'backups');
    if (fs.existsSync(backupDir)) {
      const dumps = fs.readdirSync(backupDir).filter((f) => f.endsWith('.dump.json') || f.endsWith('.dump.enc')).sort().reverse();
      if (dumps.length > 0 && dumps[0]) {
        targetFile = path.join(backupDir, dumps[0]);
        console.log(`No target specified. Defaulting to latest backup: ${path.basename(targetFile)}\n`);
      }
    }
  }

  if (!targetFile) {
    console.error('Usage: node scripts/dr/verify-backup.js <path-to-dump-file>');
    process.exit(1);
  }

  verifyBackup(targetFile)
    .then((res) => {
      console.log('Backup Verification Result:');
      console.log(`  Valid:            ${res.isValid ? 'YES' : 'NO'}`);
      console.log(`  File Size:        ${res.sizeBytes} bytes`);
      console.log(`  Checksum Match:   ${res.checksumMatches ? 'PASS' : 'FAIL'}`);
      console.log(`  Archive Readable: ${res.archiveReadable ? 'PASS' : 'FAIL'}`);
      console.log(`  Tables Found:     ${res.tableCountFound}/${res.tableCountExpected}`);
      if (res.errors.length > 0) {
        console.error('  Errors:');
        res.errors.forEach((e) => console.error(`    - ${e}`));
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Verification failed:', err.message);
      process.exit(1);
    });
}

module.exports = {
  verifyBackup,
  decryptBuffer,
};
