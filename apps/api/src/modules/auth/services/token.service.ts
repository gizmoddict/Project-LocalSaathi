import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '@localsaathi/database';
import { UserRole, JwtAccessTokenPayload, AuthenticatedUser } from '@localsaathi/types';
import { getApiConfig } from '../../../config/env.config';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string; // Raw refresh token returned to client (never stored plaintext in DB)
  sessionId: string;
  expiresInSeconds: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Hashes a raw refresh token using HMAC-SHA256 with the auth pepper.
   * Only this hash is stored in PostgreSQL.
   */
  hashRefreshToken(rawToken: string): string {
    const config = getApiConfig();
    return crypto
      .createHmac('sha256', config.AUTH_PEPPER)
      .update(rawToken)
      .digest('hex');
  }

  /**
   * Generates a cryptographically random raw refresh token string.
   */
  generateRawRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  /**
   * Issues a short-lived access token JWT with minimal claims.
   * Strict privacy: Only sub, sessionId, and role are included.
   */
  async generateAccessToken(userId: string, sessionId: string, role: UserRole): Promise<string> {
    const config = getApiConfig();
    const payload: JwtAccessTokenPayload = {
      sub: userId,
      sessionId,
      role,
    };

    return this.jwtService.signAsync(payload, {
      secret: config.JWT_ACCESS_SECRET,
      expiresIn: config.JWT_ACCESS_EXPIRES_IN,
    });
  }

  /**
   * Creates a new session record in PostgreSQL and issues access + refresh tokens.
   */
  async createSessionAndIssueTokens(
    userId: string,
    role: UserRole,
    deviceInfo?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<IssuedTokens> {
    const rawRefreshToken = this.generateRawRefreshToken();
    const sessionTokenHash = this.hashRefreshToken(rawRefreshToken);

    // Refresh token expiry: default 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId,
        sessionTokenHash,
        deviceInfo: deviceInfo ?? 'Unknown Device',
        ipAddress: ipAddress ?? '127.0.0.1',
        userAgent: userAgent ?? 'Unknown',
        expiresAt,
        lastUsedAt: new Date(),
      },
    });

    const accessToken = await this.generateAccessToken(userId, session.id, role);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      sessionId: session.id,
      expiresInSeconds: 15 * 60, // 15 minutes
    };
  }

  /**
   * Validates access token and returns payload.
   */
  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const config = getApiConfig();
    try {
      const payload = await this.jwtService.verifyAsync<JwtAccessTokenPayload>(token, {
        secret: config.JWT_ACCESS_SECRET,
      });

      return {
        userId: payload.sub,
        sessionId: payload.sessionId,
        role: payload.role,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }

  /**
   * Rotates a refresh token and issues new tokens.
   * Includes strict token reuse detection:
   * If a previously rotated token is presented, all user sessions are immediately revoked.
   */
  async rotateRefreshToken(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<IssuedTokens> {
    const incomingHash = this.hashRefreshToken(rawRefreshToken);
    const now = new Date();

    // 1. Check if token matches active sessionTokenHash
    const activeSession = await this.prisma.session.findUnique({
      where: { sessionTokenHash: incomingHash },
      include: { user: true },
    });

    if (activeSession) {
      // Validate session is not revoked
      if (activeSession.revokedAt) {
        throw new UnauthorizedException('Session has been revoked. Please log in again.');
      }

      // Validate expiration
      if (now > activeSession.expiresAt) {
        throw new UnauthorizedException('Session has expired. Please log in again.');
      }

      // Validate user is active
      if (activeSession.user.accountStatus !== 'ACTIVE') {
        throw new UnauthorizedException('Account is not active.');
      }

      // Generate NEW refresh token
      const newRawRefreshToken = this.generateRawRefreshToken();
      const newSessionTokenHash = this.hashRefreshToken(newRawRefreshToken);

      // Rotate session record: update active hash, save old hash in previousTokenHash
      await this.prisma.session.update({
        where: { id: activeSession.id },
        data: {
          sessionTokenHash: newSessionTokenHash,
          previousTokenHash: incomingHash,
          lastUsedAt: now,
          ...(ipAddress ? { ipAddress } : {}),
          ...(userAgent ? { userAgent } : {}),
        },
      });

      const newAccessToken = await this.generateAccessToken(
        activeSession.userId,
        activeSession.id,
        activeSession.user.role as UserRole
      );

      return {
        accessToken: newAccessToken,
        refreshToken: newRawRefreshToken,
        sessionId: activeSession.id,
        expiresInSeconds: 15 * 60,
      };
    }

    // 2. TOKEN REUSE DETECTION: Check if incoming token matches previousTokenHash
    const reusedSession = await this.prisma.session.findFirst({
      where: { previousTokenHash: incomingHash },
    });

    if (reusedSession) {
      this.logger.error(
        `CRITICAL SECURITY ALERT: Refresh token reuse detected for userId=${reusedSession.userId}. Revoking all sessions!`
      );

      // Revoke ALL active sessions for this compromised user
      await this.prisma.session.updateMany({
        where: {
          userId: reusedSession.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      // Audit log the security violation
      await this.prisma.auditLog.create({
        data: {
          actorId: reusedSession.userId,
          action: 'TOKEN_REUSE_DETECTED',
          entityType: 'Session',
          entityId: reusedSession.id,
          ipAddress: ipAddress ?? 'unknown',
          userAgent: userAgent ?? 'unknown',
          metadata: {
            reason: 'Compromised refresh token presented after rotation',
            revokedSessionsCount: 'ALL',
          },
        },
      });

      throw new UnauthorizedException(
        'Security violation: Revoked token reuse detected. All active sessions have been terminated for security.'
      );
    }

    // 3. Token not recognized anywhere
    throw new UnauthorizedException('Invalid or unrecognized refresh token.');
  }

  /**
   * Revokes a specific session.
   */
  async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found or does not belong to user.');
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    return true;
  }

  /**
   * Revokes all active sessions for a user (logout all devices).
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count;
  }
}
