// ==============================================================================
// LocalSaathi — Dedicated Security Test Suite: Authentication & Token Defense
// Phase 17: Complete Security Hardening
// ==============================================================================

import { UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { TokenService } from '../services/token.service';
import { AuthRateLimiterService } from '../services/rate-limiter.service';
import { UserRole } from '@localsaathi/types';

describe('Security Test Suite: Authentication & Token Defense (Phase 17)', () => {
  const genuineSecret = 'authentic_jwt_access_secret_32char_minimum!';
  const attackerSecret = 'attacker_forged_secret_key_32char_minimum!';

  let jwtService: JwtService;
  let mockPrisma: any;
  let tokenService: TokenService;
  let rateLimiter: AuthRateLimiterService;

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = genuineSecret;
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';

    jwtService = new JwtService({
      secret: genuineSecret,
      signOptions: { expiresIn: '15m' },
    });

    mockPrisma = {
      session: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    tokenService = new TokenService(jwtService, mockPrisma);
    rateLimiter = new AuthRateLimiterService();
  });

  describe('1. JWT Forgery & Cryptographic Integrity', () => {
    it('MUST reject tokens signed with an unauthorized external secret (Signature Forgery)', async () => {
      const forgedToken = jwt.sign(
        {
          userId: '00000000-0000-0000-0000-000000000001',
          role: UserRole.ADMIN,
          sessionId: '00000000-0000-0000-0000-000000000002',
        },
        attackerSecret,
        { expiresIn: '1h' }
      );

      await expect(tokenService.verifyAccessToken(forgedToken)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('MUST reject tokens with "none" algorithm or missing signatures', async () => {
      // Unsigned token
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          userId: '00000000-0000-0000-0000-000000000001',
          role: UserRole.ADMIN,
        })
      ).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      await expect(tokenService.verifyAccessToken(noneToken)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('MUST reject expired access tokens', async () => {
      const expiredToken = jwt.sign(
        {
          userId: '00000000-0000-0000-0000-000000000001',
          role: UserRole.WORKER,
          sessionId: '00000000-0000-0000-0000-000000000002',
        },
        genuineSecret,
        { expiresIn: '-10s' } // Expired 10 seconds ago
      );

      await expect(tokenService.verifyAccessToken(expiredToken)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('MUST reject tampered payload in otherwise validly signed token', async () => {
      const validToken = jwt.sign(
        {
          userId: '00000000-0000-0000-0000-000000000001',
          role: UserRole.WORKER,
          sessionId: '00000000-0000-0000-0000-000000000002',
        },
        genuineSecret,
        { expiresIn: '15m' }
      );

      const parts = validToken.split('.');
      // Tamper with payload (change role from WORKER to ADMIN)
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          userId: '00000000-0000-0000-0000-000000000001',
          role: UserRole.ADMIN,
          sessionId: '00000000-0000-0000-0000-000000000002',
        })
      ).toString('base64url');

      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      await expect(tokenService.verifyAccessToken(tamperedToken)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('2. Refresh Token Rotation & Session Revocation Defense', () => {
    it('MUST reject refresh attempt on a revoked session', async () => {
      const session = {
        id: 'sess-123',
        userId: 'usr-123',
        sessionTokenHash: tokenService.hashRefreshToken('revoked-token'),
        revokedAt: new Date(), // Already revoked
        expiresAt: new Date(Date.now() + 100000),
        user: { accountStatus: 'ACTIVE' },
      };

      mockPrisma.session.findUnique.mockResolvedValue(session);

      await expect(
        tokenService.rotateRefreshToken('revoked-token', '127.0.0.1', 'Mozilla/5.0')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('MUST trigger reuse detection and revoke session family if a reused previous token is presented', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);
      mockPrisma.session.findFirst.mockResolvedValue({
        id: 'sess-123',
        userId: 'usr-123',
      });
      mockPrisma.session.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.auditLog = { create: jest.fn().mockResolvedValue({ id: 'aud-1' }) };

      // Attacker attempts to use an outdated/compromised token that was previously rotated
      await expect(
        tokenService.rotateRefreshToken('stolen-previous-token', '127.0.0.1', 'Mozilla/5.0')
      ).rejects.toThrow(UnauthorizedException);

      // Verify all active sessions were revoked to neutralize compromise
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'usr-123', revokedAt: null }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        })
      );
    });
  });

  describe('3. Rate Limiter Brute-Force & Denial-of-Service Defense', () => {
    it('MUST enforce rate limits and return 429 when threshold is exceeded', async () => {
      const testKey = 'otp_test_burst';
      const limit = 3;
      const windowSec = 60;

      // First 3 requests must succeed
      await expect(rateLimiter.checkRateLimit(testKey, limit, windowSec)).resolves.not.toThrow();
      await expect(rateLimiter.checkRateLimit(testKey, limit, windowSec)).resolves.not.toThrow();
      await expect(rateLimiter.checkRateLimit(testKey, limit, windowSec)).resolves.not.toThrow();

      // 4th request must throw 429 Too Many Requests
      try {
        await rateLimiter.checkRateLimit(testKey, limit, windowSec);
        fail('Expected 429 HttpException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const res = err.getResponse();
        expect(res.error.code).toBe('RATE_LIMIT_EXCEEDED');
      }
    });

    it('MUST allow resetting rate limit on successful verification', async () => {
      const testKey = 'otp_test_reset';
      await rateLimiter.checkRateLimit(testKey, 1, 60);

      // Next call would fail
      await expect(rateLimiter.checkRateLimit(testKey, 1, 60)).rejects.toThrow(HttpException);

      // Reset
      rateLimiter.resetRateLimit(testKey);

      // Now call succeeds again
      await expect(rateLimiter.checkRateLimit(testKey, 1, 60)).resolves.not.toThrow();
    });
  });
});
