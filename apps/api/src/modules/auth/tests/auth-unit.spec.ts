import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole, AccountStatus } from '@localsaathi/types';
import { phoneNumberSchema } from '@localsaathi/validation';
import { OtpService } from '../services/otp.service';
import { TokenService } from '../services/token.service';
import { RolesGuard } from '../guards/roles.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

describe('LocalSaathi Authentication Unit Tests (Phase 3)', () => {
  const mockJwtSecret = 'development_jwt_access_secret_only_for_dev_32char';

  // --------------------------------------------------------------------------
  // 1. Phone Normalization
  // --------------------------------------------------------------------------
  describe('1. Phone Normalization', () => {
    it('normalizes 10-digit Indian numbers starting with 6, 7, 8, 9', () => {
      expect(phoneNumberSchema.parse('9876543210')).toBe('9876543210');
      expect(phoneNumberSchema.parse('+919876543210')).toBe('9876543210');
      expect(phoneNumberSchema.parse('+91 98765-43210')).toBe('9876543210');
      expect(phoneNumberSchema.parse('919876543210')).toBe('9876543210');
      expect(phoneNumberSchema.parse('9191234567')).toBe('9191234567');
    });

    it('rejects invalid or non-Indian phone formats', () => {
      expect(() => phoneNumberSchema.parse('1234567890')).toThrow(); // starts with 1
      expect(() => phoneNumberSchema.parse('98765')).toThrow(); // too short
      expect(() => phoneNumberSchema.parse('abcd987654')).toThrow(); // alphanumeric
    });
  });

  // --------------------------------------------------------------------------
  // 2. OTP Generation
  // --------------------------------------------------------------------------
  describe('2. OTP Generation', () => {
    it('generates a cryptographically secure 6-digit numeric OTP', () => {
      const otpService = new OtpService({} as any);
      for (let i = 0; i < 20; i++) {
        const otp = otpService.generateSecureOtp(6);
        expect(otp).toHaveLength(6);
        expect(/^\d{6}$/.test(otp)).toBe(true);
        expect(Number(otp)).toBeGreaterThanOrEqual(100000);
        expect(Number(otp)).toBeLessThanOrEqual(999999);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. OTP Hashing
  // --------------------------------------------------------------------------
  describe('3. OTP Hashing', () => {
    it('produces deterministic HMAC-SHA256 hash using auth pepper', () => {
      const otpService = new OtpService({} as any);
      const hash1 = otpService.hashOtp('9876543210', '123456');
      const hash2 = otpService.hashOtp('9876543210', '123456');
      const hashOther = otpService.hashOtp('9876543210', '654321');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hashOther);
      expect(hash1).toHaveLength(64); // 256-bit hex
    });
  });

  // --------------------------------------------------------------------------
  // 4. OTP Verification (Timing Safe)
  // --------------------------------------------------------------------------
  describe('4. OTP Verification', () => {
    it('verifies matching hash in constant time and rejects non-matching', () => {
      const otpService = new OtpService({} as any);
      const targetHash = otpService.hashOtp('9876543210', '789123');
      const candidateHash = otpService.hashOtp('9876543210', '789123');
      const badHash = otpService.hashOtp('9876543210', '000000');

      expect(otpService.verifyHashTimingSafe(candidateHash, targetHash)).toBe(true);
      expect(otpService.verifyHashTimingSafe(badHash, targetHash)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 5. OTP Expiration
  // --------------------------------------------------------------------------
  describe('5. OTP Expiration', () => {
    it('rejects an expired OTP challenge', async () => {
      const mockPrisma: any = {
        otpChallenge: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'chal-1',
            phone: '9876543210',
            otpHash: 'dummy-hash',
            expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
            attempts: 0,
            maxAttempts: 3,
            consumedAt: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      };

      const otpService = new OtpService(mockPrisma);
      await expect(otpService.verifyChallenge('9876543210', '123456')).rejects.toThrow(
        /expired/i
      );
    });
  });

  // --------------------------------------------------------------------------
  // 6. OTP Attempt Limiting
  // --------------------------------------------------------------------------
  describe('6. OTP Attempt Limiting', () => {
    it('rejects and locks out challenge after reaching max attempts', async () => {
      const mockPrisma: any = {
        otpChallenge: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'chal-2',
            phone: '9876543210',
            otpHash: 'target-hash',
            expiresAt: new Date(Date.now() + 60000),
            attempts: 3, // Already at max attempts
            maxAttempts: 3,
            consumedAt: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      };

      const otpService = new OtpService(mockPrisma);
      await expect(otpService.verifyChallenge('9876543210', '123456')).rejects.toThrow(
        /maximum verification attempts exceeded/i
      );
    });
  });

  // --------------------------------------------------------------------------
  // 7. OTP Reuse Prevention
  // --------------------------------------------------------------------------
  describe('7. OTP Reuse Prevention', () => {
    it('marks OTP challenge as consumed upon verification and rejects reuse', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({});
      const otpService = new OtpService({
        otpChallenge: {
          findFirst: jest.fn()
            .mockResolvedValueOnce({
              id: 'chal-3',
              phone: '9876543210',
              otpHash: new OtpService({} as any).hashOtp('9876543210', '654321'),
              expiresAt: new Date(Date.now() + 60000),
              attempts: 0,
              maxAttempts: 3,
              consumedAt: null,
            })
            // Second call: no unconsumed challenge exists
            .mockResolvedValueOnce(null),
          update: mockUpdate,
        },
      } as any);

      // First verification succeeds
      const result = await otpService.verifyChallenge('9876543210', '654321');
      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        })
      );

      // Reused attempt is rejected
      await expect(otpService.verifyChallenge('9876543210', '654321')).rejects.toThrow(
        /invalid or expired/i
      );
    });
  });

  // --------------------------------------------------------------------------
  // 8. Resend Cooldown
  // --------------------------------------------------------------------------
  describe('8. Resend Cooldown', () => {
    it('enforces cooldown if last challenge was created recently', async () => {
      const mockPrisma: any = {
        otpChallenge: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'chal-recent',
            phone: '9876543210',
            createdAt: new Date(Date.now() - 15000), // Created 15s ago (cooldown is 60s)
          }),
        },
      };

      const otpService = new OtpService(mockPrisma);
      await expect(otpService.createChallenge('9876543210')).rejects.toThrow(
        /wait/i
      );
    });
  });

  // --------------------------------------------------------------------------
  // 9. JWT Creation (Minimal Claims)
  // --------------------------------------------------------------------------
  describe('9. JWT Creation', () => {
    it('creates access token with minimal claims (sub, sessionId, role) and no PII', async () => {
      const jwtService = new JwtService({ secret: mockJwtSecret });
      const tokenService = new TokenService(jwtService, {} as any);

      const token = await tokenService.generateAccessToken(
        'user-uuid-1',
        'session-uuid-1',
        UserRole.WORKER
      );

      expect(typeof token).toBe('string');
      const decoded: any = jwtService.decode(token);
      expect(decoded.sub).toBe('user-uuid-1');
      expect(decoded.sessionId).toBe('session-uuid-1');
      expect(decoded.role).toBe(UserRole.WORKER);
      expect(decoded.phone).toBeUndefined(); // Strict privacy
      expect(decoded.email).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 10. JWT Validation
  // --------------------------------------------------------------------------
  describe('10. JWT Validation', () => {
    it('validates a properly signed JWT and rejects an altered token', async () => {
      const jwtService = new JwtService({ secret: mockJwtSecret });
      const tokenService = new TokenService(jwtService, {} as any);

      const token = await tokenService.generateAccessToken('u-1', 's-1', UserRole.EMPLOYER);
      const verified = await tokenService.verifyAccessToken(token);

      expect(verified.userId).toBe('u-1');
      expect(verified.sessionId).toBe('s-1');
      expect(verified.role).toBe(UserRole.EMPLOYER);

      // Altered token fails
      await expect(tokenService.verifyAccessToken(`${token}invalid`)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  // --------------------------------------------------------------------------
  // 11. Refresh Rotation
  // --------------------------------------------------------------------------
  describe('11. Refresh Token Rotation', () => {
    it('rotates active refresh token and stores old hash in previousTokenHash', async () => {
      const jwtService = new JwtService({ secret: mockJwtSecret });
      const oldRaw = 'old-raw-token-321321321321321321321';
      const tokenService = new TokenService(jwtService, {} as any);
      const oldHash = tokenService.hashRefreshToken(oldRaw);

      const mockUpdate = jest.fn().mockResolvedValue({});
      const mockPrisma: any = {
        session: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'sess-1',
            userId: 'user-1',
            sessionTokenHash: oldHash,
            expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
            revokedAt: null,
            user: { role: UserRole.WORKER, accountStatus: 'ACTIVE' },
          }),
          update: mockUpdate,
        },
      };

      const customTokenService = new TokenService(jwtService, mockPrisma);
      const result = await customTokenService.rotateRefreshToken(oldRaw);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(oldRaw); // Rotated to new token

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sess-1' },
          data: expect.objectContaining({
            previousTokenHash: oldHash,
          }),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // 12. Refresh Reuse Detection
  // --------------------------------------------------------------------------
  describe('12. Refresh Reuse Detection', () => {
    it('revokes all user sessions when an already-rotated token is presented', async () => {
      const jwtService = new JwtService({ secret: mockJwtSecret });
      const compromisedToken = 'compromised-reused-token-abc';
      const tokenService = new TokenService(jwtService, {} as any);
      const compromisedHash = tokenService.hashRefreshToken(compromisedToken);

      const mockUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
      const mockCreateAudit = jest.fn().mockResolvedValue({});

      const mockPrisma: any = {
        session: {
          findUnique: jest.fn().mockResolvedValue(null), // Not active
          findFirst: jest.fn().mockResolvedValue({
            id: 'sess-compromised',
            userId: 'victim-user-id',
            previousTokenHash: compromisedHash, // Found as previously rotated!
          }),
          updateMany: mockUpdateMany,
        },
        auditLog: {
          create: mockCreateAudit,
        },
      };

      const customTokenService = new TokenService(jwtService, mockPrisma);
      await expect(customTokenService.rotateRefreshToken(compromisedToken)).rejects.toThrow(
        /token reuse detected/i
      );

      // Verify all sessions were revoked for that user
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          userId: 'victim-user-id',
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });

      // Verify security audit log was written
      expect(mockCreateAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'TOKEN_REUSE_DETECTED',
            actorId: 'victim-user-id',
          }),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // 13. Session Revocation
  // --------------------------------------------------------------------------
  describe('13. Session Revocation', () => {
    it('revokes single session and prevents further access', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({});
      const mockPrisma: any = {
        session: {
          findFirst: jest.fn().mockResolvedValue({ id: 's-123', userId: 'u-123' }),
          update: mockUpdate,
        },
      };
      const tokenService = new TokenService({} as any, mockPrisma);

      const res = await tokenService.revokeSession('s-123', 'u-123');
      expect(res).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 's-123' },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  // --------------------------------------------------------------------------
  // 14. Role Authorization (RolesGuard)
  // --------------------------------------------------------------------------
  describe('14. Role Authorization', () => {
    it('allows access when user has required role and denies when role is unauthorized', () => {
      const reflector = new Reflector();
      const rolesGuard = new RolesGuard(reflector);

      // Test handler requiring ADMIN
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

      // Context with WORKER user
      const workerContext: any = {
        getHandler: () => () => {},
        getClass: () => class {},
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: UserRole.WORKER } }),
        }),
      };

      expect(() => rolesGuard.canActivate(workerContext)).toThrow(
        ForbiddenException
      );

      // Context with ADMIN user
      const adminContext: any = {
        getHandler: () => () => {},
        getClass: () => class {},
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: UserRole.ADMIN } }),
        }),
      };

      expect(rolesGuard.canActivate(adminContext)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 15. Suspended User Rejection
  // --------------------------------------------------------------------------
  describe('15. Suspended User Rejection', () => {
    it('rejects authentication in JwtAuthGuard when user accountStatus is SUSPENDED', async () => {
      const reflector = new Reflector();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false); // not public

      const mockTokenService: any = {
        verifyAccessToken: jest.fn().mockResolvedValue({
          userId: 'suspended-user-id',
          sessionId: 'session-id',
          role: UserRole.WORKER,
        }),
      };

      const mockPrisma: any = {
        session: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-id',
            expiresAt: new Date(Date.now() + 3600000),
            revokedAt: null,
            user: {
              id: 'suspended-user-id',
              accountStatus: AccountStatus.SUSPENDED,
            },
          }),
        },
      };

      const guard = new JwtAuthGuard(reflector, mockTokenService, mockPrisma);
      const context: any = {
        getHandler: () => () => {},
        getClass: () => class {},
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer valid.jwt.token' },
          }),
        }),
      };

      await expect(guard.canActivate(context)).rejects.toThrow(
        /suspended/i
      );
    });
  });
});
