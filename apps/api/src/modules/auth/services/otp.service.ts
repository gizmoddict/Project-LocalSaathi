import { Injectable, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '@localsaathi/database';
import { getApiConfig } from '../../../config/env.config';

export interface CreateOtpResult {
  challengeId: string;
  rawOtp: string; // ONLY returned internally for dispatch via SmsProvider; NEVER logged or exposed to client
  expiresAt: Date;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a cryptographically secure numeric OTP string of specified length.
   * NEVER uses Math.random().
   */
  generateSecureOtp(length = 6): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const num = crypto.randomInt(min, max + 1);
    return num.toString();
  }

  /**
   * Hashes an OTP challenge using HMAC-SHA256 with the system auth pepper.
   */
  hashOtp(phone: string, rawOtp: string): string {
    const config = getApiConfig();
    return crypto
      .createHmac('sha256', config.AUTH_PEPPER)
      .update(`${phone}:${rawOtp}`)
      .digest('hex');
  }

  /**
   * Performs constant-time comparison between stored hash and computed candidate hash.
   * Protects against timing side-channel attacks.
   */
  verifyHashTimingSafe(candidateHash: string, storedHash: string): boolean {
    if (candidateHash.length !== storedHash.length) {
      return false;
    }
    const candidateBuf = Buffer.from(candidateHash, 'utf8');
    const storedBuf = Buffer.from(storedHash, 'utf8');
    return crypto.timingSafeEqual(candidateBuf, storedBuf);
  }

  /**
   * Creates a new OTP challenge in the database.
   * Enforces:
   * 1. Resend cooldown (rejects if an OTP was requested < cooldown seconds ago)
   * 2. Invalidation of previous pending OTP challenges for the phone
   * 3. Secure hashing before persistence
   */
  async createChallenge(phone: string, purpose = 'LOGIN'): Promise<CreateOtpResult> {
    const config = getApiConfig();
    const cooldownSeconds = config.OTP_RESEND_COOLDOWN_SECONDS;

    // 1. Check resend cooldown on the most recent challenge
    const recentChallenge = await this.prisma.otpChallenge.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });

    if (recentChallenge) {
      const elapsedSeconds = Math.floor((Date.now() - recentChallenge.createdAt.getTime()) / 1000);
      if (elapsedSeconds < cooldownSeconds) {
        const remaining = cooldownSeconds - elapsedSeconds;
        throw new HttpException(
          `Please wait ${remaining} seconds before requesting a new OTP.`,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    // 2. Invalidate previous pending challenges for this phone
    await this.prisma.otpChallenge.updateMany({
      where: {
        phone,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(), // Mark previous as consumed to prevent reuse
      },
    });

    // 3. Generate secure OTP and hash
    const rawOtp = this.generateSecureOtp(config.OTP_LENGTH);
    const otpHash = this.hashOtp(phone, rawOtp);
    const expiresAt = new Date(Date.now() + config.OTP_TTL_SECONDS * 1000);

    // 4. Persist challenge (NEVER storing rawOtp)
    const record = await this.prisma.otpChallenge.create({
      data: {
        phone,
        otpHash,
        purpose,
        expiresAt,
        maxAttempts: config.OTP_MAX_ATTEMPTS,
        attempts: 0,
      },
    });

    return {
      challengeId: record.id,
      rawOtp,
      expiresAt,
    };
  }

  /**
   * Verifies an OTP against the active challenge for the given phone.
   * Enforces:
   * 1. Expiration check
   * 2. Attempt count limiting (lockout on max attempts)
   * 3. Timing-safe cryptographic hash comparison
   * 4. Single-use consumption (invalidates challenge upon success)
   */
  async verifyChallenge(
    phone: string,
    rawOtp: string,
    verifyExternally?: (phone: string, otp: string) => Promise<boolean>
  ): Promise<boolean> {
    const now = new Date();

    // Find the latest unconsumed challenge for this phone
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        phone,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      this.logger.warn(`OTP verification failed: no active challenge found for phone`);
      throw new BadRequestException('Invalid or expired OTP challenge.');
    }

    // Check expiration
    if (now > challenge.expiresAt) {
      // Mark as consumed/expired
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      throw new BadRequestException('OTP has expired. Please request a new code.');
    }

    // Check attempt limit
    if (challenge.attempts >= challenge.maxAttempts) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      throw new BadRequestException('Maximum verification attempts exceeded. Please request a new OTP.');
    }

    // Compare hash
    const isMatch = verifyExternally
      ? await verifyExternally(phone, rawOtp)
      : this.verifyHashTimingSafe(this.hashOtp(phone, rawOtp), challenge.otpHash);

    if (!isMatch) {
      const updatedAttempts = challenge.attempts + 1;
      const isLocked = updatedAttempts >= challenge.maxAttempts;

      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: updatedAttempts,
          ...(isLocked ? { consumedAt: now } : {}),
        },
      });

      if (isLocked) {
        throw new BadRequestException('Maximum verification attempts exceeded. Please request a new OTP.');
      }

      const remainingAttempts = challenge.maxAttempts - updatedAttempts;
      throw new BadRequestException(`Incorrect OTP. ${remainingAttempts} attempt(s) remaining.`);
    }

    // Success: Mark challenge as consumed to prevent replay/reuse
    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: now },
    });

    return true;
  }
}
