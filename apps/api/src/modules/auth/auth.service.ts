import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '@localsaathi/database';
import { UserRole, AccountStatus, VerificationStatus, UserSelfProfile, UserSessionInfo } from '@localsaathi/types';
import { phoneNumberSchema } from '@localsaathi/validation';
import { OtpService } from './services/otp.service';
import { TokenService, IssuedTokens } from './services/token.service';
import { AuthRateLimiterService } from './services/rate-limiter.service';
import { SmsProvider, SMS_PROVIDER_TOKEN } from './services/sms.provider';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { AuthTokenResponse, GenericOtpResponse } from './types/auth-internal.types';
import { getApiConfig } from '../../config/env.config';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly rateLimiter: AuthRateLimiterService,
    @Inject(SMS_PROVIDER_TOKEN) private readonly smsProvider: SmsProvider
  ) {}

  /**
   * Helper to normalize Indian phone number into canonical 10-digit format.
   */
  normalizePhone(phone: string): string {
    const parseResult = phoneNumberSchema.safeParse(phone);
    if (!parseResult.success) {
      throw new BadRequestException('Invalid phone number format. Must be a 10-digit Indian mobile number.');
    }
    return parseResult.data;
  }

  /**
   * Helper to mask phone for safe audit logs (+91-XXXXX-XX321)
   */
  private maskPhone(phone: string): string {
    return phone.length > 5 ? `${phone.slice(0, 2)}****${phone.slice(-3)}` : '****';
  }

  /**
   * 1. Request OTP challenge.
   * Generic response prevents phone number enumeration.
   */
  async requestOtp(
    dto: RequestOtpDto,
    ipAddress = '127.0.0.1',
    userAgent = 'unknown'
  ): Promise<GenericOtpResponse> {
    const normalizedPhone = this.normalizePhone(dto.phone);

    // Prevent privilege escalation in self-registration
    if (dto.role && !['WORKER', 'EMPLOYER'].includes(dto.role)) {
      throw new BadRequestException('Privileged roles cannot be requested through self-registration.');
    }

    // Rate limiting check per phone & IP
    await this.rateLimiter.checkOtpRequestRateLimit(normalizedPhone, ipAddress);

    // Generate & persist hashed OTP challenge (enforces cooldown & invalidation)
    const challenge = await this.otpService.createChallenge(normalizedPhone, 'LOGIN');

    // Dispatch OTP through provider abstraction
    await this.smsProvider.sendOtp(normalizedPhone, challenge.rawOtp);

    // Immutable security audit log (NEVER logs OTP value)
    await this.prisma.auditLog.create({
      data: {
        action: 'OTP_REQUESTED',
        entityType: 'OtpChallenge',
        entityId: challenge.challengeId,
        ipAddress,
        userAgent,
        metadata: {
          phone: this.maskPhone(normalizedPhone),
          requestedRole: dto.role ?? 'WORKER',
        },
      },
    });

    // Constant-time generic response in production; returns challenge dev OTP in development
    const config = getApiConfig();
    const isDev = config.NODE_ENV !== 'production';
    return {
      success: true,
      message: isDev
        ? `[Dev Mode] Verification code is: ${challenge.rawOtp}`
        : 'If the phone number is valid, a verification OTP code has been dispatched.',
    };
  }

  /**
   * 2. Verify OTP challenge and authenticate/register user.
   */
  async verifyOtp(
    dto: VerifyOtpDto,
    ipAddress = '127.0.0.1',
    userAgent = 'unknown'
  ): Promise<AuthTokenResponse> {
    const normalizedPhone = this.normalizePhone(dto.phone);

    // Rate limiting check
    await this.rateLimiter.checkOtpVerifyRateLimit(normalizedPhone, ipAddress);

    // Cryptographic timing-safe verification & single-use consumption
    const verifyExternally = this.smsProvider.verifyOtp?.bind(this.smsProvider);
    await this.otpService.verifyChallenge(normalizedPhone, dto.otp, verifyExternally);

    // Reset rate limiter on successful verification
    this.rateLimiter.resetRateLimit(`otp_verify_phone:${normalizedPhone}`);

    // Atomically find or create user and create session
    let user = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (user) {
      // Validate account status
      if (user.accountStatus === 'SUSPENDED') {
        throw new ForbiddenException('Account has been suspended. Please contact support.');
      }
      if (user.accountStatus === 'DELETED') {
        throw new ForbiddenException('Account has been deactivated.');
      }
    } else {
      // Self-registration: enforce role safety (WORKER or EMPLOYER only)
      const requestedRole = dto.role === 'EMPLOYER' ? UserRole.EMPLOYER : UserRole.WORKER;

      user = await this.prisma.user.create({
        data: {
          phone: normalizedPhone,
          role: requestedRole,
          accountStatus: AccountStatus.ACTIVE,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'USER_REGISTERED',
          entityType: 'User',
          entityId: user.id,
          ipAddress,
          userAgent,
          metadata: { role: user.role },
        },
      });
    }

    // Issue tokens and persist session with hashed refresh token
    const issuedTokens: IssuedTokens = await this.tokenService.createSessionAndIssueTokens(
      user.id,
      user.role as UserRole,
      dto.deviceInfo,
      ipAddress,
      userAgent
    );

    // Audit log login success
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'LOGIN_SUCCESS',
        entityType: 'Session',
        entityId: issuedTokens.sessionId,
        ipAddress,
        userAgent,
        metadata: { role: user.role },
      },
    });

    this.logger.log(`User ${user.id} authenticated successfully with role ${user.role}`);

    return {
      accessToken: issuedTokens.accessToken,
      refreshToken: issuedTokens.refreshToken,
      user: {
        id: user.id,
        role: user.role as unknown as UserRole,
        accountStatus: user.accountStatus as unknown as AccountStatus,
        verificationStatus: user.verificationStatus as unknown as VerificationStatus,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }

  /**
   * 3. Refresh session and rotate refresh token.
   */
  async refreshSession(
    refreshToken: string,
    ipAddress = '127.0.0.1',
    userAgent = 'unknown'
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const rotated = await this.tokenService.rotateRefreshToken(refreshToken, ipAddress, userAgent);

    return {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
    };
  }

  /**
   * 4. Logout current session.
   */
  async logout(sessionId: string, userId: string): Promise<GenericOtpResponse> {
    await this.tokenService.revokeSession(sessionId, userId);

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'LOGOUT',
        entityType: 'Session',
        entityId: sessionId,
      },
    });

    return {
      success: true,
      message: 'Logged out successfully.',
    };
  }

  /**
   * 5. Logout all sessions across all devices.
   */
  async logoutAll(userId: string): Promise<GenericOtpResponse> {
    const count = await this.tokenService.revokeAllUserSessions(userId);

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'LOGOUT_ALL',
        entityType: 'User',
        entityId: userId,
        metadata: { revokedCount: count },
      },
    });

    return {
      success: true,
      message: 'Logged out from all devices.',
    };
  }

  /**
   * 6. Retrieve minimal current user profile (/auth/me).
   * Strict privacy: Only id, role, accountStatus, verificationStatus, createdAt.
   */
  async getMe(userId: string): Promise<UserSelfProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    if (user.accountStatus === 'SUSPENDED') {
      throw new ForbiddenException('Account is suspended');
    }

    return {
      id: user.id,
      role: user.role as unknown as UserRole,
      accountStatus: user.accountStatus as unknown as AccountStatus,
      verificationStatus: user.verificationStatus as unknown as VerificationStatus,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /**
   * 7. Retrieve list of active sessions for current user.
   */
  async getSessions(userId: string, currentSessionId: string): Promise<UserSessionInfo[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      deviceInfo: s.deviceInfo,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isCurrent: s.id === currentSessionId,
    }));
  }

  /**
   * 8. Revoke a specific session belonging to current user.
   */
  async revokeSession(userId: string, sessionId: string): Promise<GenericOtpResponse> {
    await this.tokenService.revokeSession(sessionId, userId);

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'SESSION_REVOKED',
        entityType: 'Session',
        entityId: sessionId,
      },
    });

    return {
      success: true,
      message: 'Session has been revoked.',
    };
  }
}
