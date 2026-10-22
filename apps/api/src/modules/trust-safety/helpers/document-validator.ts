import { BadRequestException } from '@nestjs/common';
import {
  ALLOWED_MIME_TYPES,
  MAX_DOCUMENT_FILE_SIZE,
  MAGIC_BYTE_SIGNATURES,
  TRUST_SAFETY_ERROR_CODES,
} from '../trust-safety.constants';

export class DocumentValidator {
  /**
   * Validates document metadata before database persistence.
   */
  static validateMetadata(mimeType: string, fileSizeBytes: number, objectStorageKey: string): void {
    if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
      throw new BadRequestException({
        code: TRUST_SAFETY_ERROR_CODES.DOCUMENT_INVALID_MIME,
        message: `Unsupported MIME type "${mimeType}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      });
    }

    if (fileSizeBytes <= 0 || fileSizeBytes > MAX_DOCUMENT_FILE_SIZE) {
      throw new BadRequestException({
        code: TRUST_SAFETY_ERROR_CODES.DOCUMENT_SIZE_EXCEEDED,
        message: `File size ${fileSizeBytes} bytes exceeds allowed maximum of ${MAX_DOCUMENT_FILE_SIZE} bytes (5MB).`,
      });
    }

    // Storage key hygiene: avoid directory traversal or leaked credential formats
    if (!objectStorageKey || objectStorageKey.includes('..') || objectStorageKey.startsWith('/')) {
      throw new BadRequestException({
        code: 'INVALID_STORAGE_KEY',
        message: 'Invalid object storage key path.',
      });
    }
  }

  /**
   * Validates magic bytes of an optional binary buffer to prevent executable masquerading.
   */
  static validateMagicBytes(buffer: Buffer, expectedMimeType: string): boolean {
    const signatures = MAGIC_BYTE_SIGNATURES[expectedMimeType];
    if (!signatures || signatures.length === 0) {
      return true; // No known signature for this MIME type
    }

    return signatures.some((sig) => {
      if (buffer.length < sig.length) return false;
      for (let i = 0; i < sig.length; i++) {
        if (buffer[i] !== sig[i]) return false;
      }
      return true;
    });
  }

  /**
   * Generates a safe canonical object storage key for user verification documents.
   */
  static generateStorageKey(userId: string, docType: string, extension: string): string {
    const safeExt = extension.replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 10);
    return `verifications/${userId}/${docType.toLowerCase()}_${timestamp}_${randomHex}.${safeExt}`;
  }
}
