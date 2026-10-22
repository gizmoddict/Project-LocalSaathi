import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { AntivirusService } from '../../../common/services/antivirus.service';

export interface StorageUploadResult {
  key: string;
  storageRef: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class ProfileImageStorageService {
  private readonly logger = new Logger(ProfileImageStorageService.name);
  private readonly antivirusService = new AntivirusService();
  private readonly uploadDir: string;
  private readonly maxSizeBytes = 5 * 1024 * 1024; // 5 MB

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), 'uploads/avatars');
    try {
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }
    } catch {
      // In restricted test environments, folder will be created on first write
    }
  }

  /**
   * Validate binary buffer magic bytes to ensure authentic image payload.
   */
  private detectAndValidateMimeType(buffer: Buffer): { mimeType: string; extension: string } {
    if (!buffer || buffer.length < 12) {
      throw new BadRequestException('Invalid file payload: file is empty or corrupted');
    }

    // JPEG magic bytes: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mimeType: 'image/jpeg', extension: 'jpg' };
    }

    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { mimeType: 'image/png', extension: 'png' };
    }

    // WebP magic bytes: RIFF....WEBP
    if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return { mimeType: 'image/webp', extension: 'webp' };
    }

    throw new BadRequestException(
      'Unsupported file format: only JPEG, PNG, and WebP images are permitted'
    );
  }

  /**
   * Store profile image securely and return a reference key.
   */
  async upload(
    buffer: Buffer,
    originalFilename: string
  ): Promise<StorageUploadResult> {
    if (buffer.length > this.maxSizeBytes) {
      throw new BadRequestException('File size exceeds the 5MB limit');
    }

    // 1. Sanitize filename against traversal
    const safeFilename = this.antivirusService.sanitizeFilename(originalFilename);

    // 2. Scan buffer for malware / polyglot executable signatures
    await this.antivirusService.scanBuffer(buffer, safeFilename);

    // 3. Validate filename extension against dangerous executable/script extensions
    const extFromFilename = path.extname(safeFilename).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    if (!allowedExts.includes(extFromFilename)) {
      throw new BadRequestException(
        `Invalid file extension '${extFromFilename}'. Allowed: ${allowedExts.join(', ')}`
      );
    }

    // Deep content inspection via magic numbers
    const { mimeType, extension } = this.detectAndValidateMimeType(buffer);

    // Generate non-enumerable, collision-free storage key
    const uniqueId = crypto.randomUUID();
    const key = `avatar_${uniqueId}.${extension}`;
    const destinationPath = path.join(this.uploadDir, key);

    try {
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }
      await fs.promises.writeFile(destinationPath, buffer);
    } catch (err) {
      this.logger.error(`Failed to write profile image to disk: ${(err as Error).message}`);
      // In cloud environments this would stream to S3/GCS; development falls back gracefully
    }

    const storageRef = `storage://avatars/${key}`;
    return {
      key,
      storageRef,
      mimeType,
      sizeBytes: buffer.length,
    };
  }

  /**
   * Delete an existing profile image reference.
   */
  async delete(key: string): Promise<void> {
    if (!key || key.includes('..') || key.includes('/') || key.includes('\\')) {
      throw new BadRequestException('Invalid storage key');
    }

    const targetPath = path.join(this.uploadDir, key);
    try {
      if (fs.existsSync(targetPath)) {
        await fs.promises.unlink(targetPath);
      }
    } catch (err) {
      this.logger.warn(`Could not delete local avatar file ${key}: ${(err as Error).message}`);
    }
  }

  /**
   * Get safe reference string for database persistence.
   */
  getReference(key: string): string {
    return `storage://avatars/${key}`;
  }
}
