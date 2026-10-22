// ==============================================================================
// LocalSaathi — Antivirus & Malware Quarantine Scanner Service (Phase 17)
// File Upload Threat Inspection, Magic-Byte Integrity & Traversal Defense
// ==============================================================================

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as path from 'path';

export interface ScanResult {
  isClean: boolean;
  threatName?: string;
  fileSizeBytes: number;
  timestamp: string;
}

@Injectable()
export class AntivirusService {
  private readonly logger = new Logger(AntivirusService.name);

  // Standard EICAR Test Signature recognized by all industry AV scanners
  private readonly EICAR_SIGNATURE =
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

  // Dangerous script and executable signatures forbidden inside uploads
  private readonly MALICIOUS_PATTERNS = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/i,
    /<\?php/i,
    /<%[\s\S]*?%>/i,
    /eval\s*\(/i,
    /base64_decode\s*\(/i,
    /system\s*\(/i,
    /exec\s*\(/i,
  ];

  /**
   * Sanitizes user-supplied filenames to prevent path traversal attacks.
   * Strips directory components, null bytes, backslashes, and control characters.
   */
  sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') {
      return `upload_${Date.now()}.dat`;
    }

    // Strip path traversal sequences and null bytes
    let clean = filename
      .replace(/\0/g, '')
      .replace(/\\/g, '/')
      .trim();

    clean = path.basename(clean);

    // Keep only alphanumeric, hyphens, underscores, and single extension dot
    clean = clean.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Prevent double dot extensions or leading dots
    clean = clean.replace(/\.+/g, '.').replace(/^\./, '');

    if (!clean) {
      clean = `upload_${Date.now()}.dat`;
    }

    return clean;
  }

  /**
   * Scans a binary upload buffer for malware signatures and malicious embedded scripts.
   * Throws BadRequestException if malware is detected.
   */
  async scanBuffer(buffer: Buffer, filename: string): Promise<ScanResult> {
    const timestamp = new Date().toISOString();
    const fileSizeBytes = buffer.length;

    // 1. EICAR Antivirus Test Signature Check
    const contentAscii = buffer.toString('ascii');
    if (contentAscii.includes(this.EICAR_SIGNATURE)) {
      this.logger.error(
        `ANTIVIRUS ALERT: EICAR test signature detected in upload filename="${filename}"`
      );
      throw new BadRequestException({
        code: 'MALWARE_DETECTED',
        message: 'Security policy violation: malware signature detected in uploaded file.',
      });
    }

    // 2. Dangerous Embedded Script Check in non-script document uploads
    for (const pattern of this.MALICIOUS_PATTERNS) {
      if (pattern.test(contentAscii)) {
        this.logger.error(
          `ANTIVIRUS ALERT: Malicious executable script pattern detected in filename="${filename}"`
        );
        throw new BadRequestException({
          code: 'MALWARE_DETECTED',
          message: 'Security policy violation: unauthorized executable script code detected.',
        });
      }
    }

    // 3. Executable Header Check (PE / Windows MZ executable header)
    if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
      this.logger.error(
        `ANTIVIRUS ALERT: Windows PE executable binary (MZ) detected in upload filename="${filename}"`
      );
      throw new BadRequestException({
        code: 'EXECUTABLE_FORBIDDEN',
        message: 'Security policy violation: executable binaries are strictly forbidden.',
      });
    }

    // 4. Linux ELF executable header check
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46
    ) {
      this.logger.error(
        `ANTIVIRUS ALERT: Linux ELF executable binary detected in upload filename="${filename}"`
      );
      throw new BadRequestException({
        code: 'EXECUTABLE_FORBIDDEN',
        message: 'Security policy violation: executable binaries are strictly forbidden.',
      });
    }

    return {
      isClean: true,
      fileSizeBytes,
      timestamp,
    };
  }
}
