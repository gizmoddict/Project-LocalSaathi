import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { UserRole, AccountStatus, VerificationStatus } from '@localsaathi/types';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

describe('LocalSaathi Auth API Tests (Phase 3)', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockResponse = () => {
    const res: any = {};
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    const mockAuthService: Partial<jest.Mocked<AuthService>> = {
      requestOtp: jest.fn(),
      verifyOtp: jest.fn(),
      refreshSession: jest.fn(),
      logout: jest.fn(),
      logoutAll: jest.fn(),
      getMe: jest.fn(),
      getSessions: jest.fn(),
      revokeSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  // 1. Request OTP
  it('1. POST /auth/otp/request - returns generic message preventing enumeration', async () => {
    authService.requestOtp.mockResolvedValue({
      success: true,
      message: 'If the phone number is valid, a verification OTP code has been dispatched.',
    });

    const res = await controller.requestOtp({ phone: '9876543210' }, '127.0.0.1', 'Jest');
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/dispatched/i);
    expect(authService.requestOtp).toHaveBeenCalledWith(
      { phone: '9876543210' },
      '127.0.0.1',
      'Jest'
    );
  });

  // 2. Verify Valid OTP
  it('2. POST /auth/otp/verify - issues tokens and sets HttpOnly cookie on valid OTP', async () => {
    const mockAuthResult = {
      accessToken: 'jwt.access.token',
      refreshToken: 'raw.refresh.token',
      user: {
        id: 'usr-1',
        role: UserRole.WORKER,
        accountStatus: AccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.UNVERIFIED,
        createdAt: new Date().toISOString(),
      },
    };
    authService.verifyOtp.mockResolvedValue(mockAuthResult);

    const res = mockResponse();
    const result = await controller.verifyOtp(
      { phone: '9876543210', otp: '123456' },
      '127.0.0.1',
      'Jest',
      res
    );

    expect(result.accessToken).toBe('jwt.access.token');
    expect(res.cookie).toHaveBeenCalledWith(
      expect.any(String),
      'raw.refresh.token',
      expect.objectContaining({ httpOnly: true })
    );
  });

  // 3. Reject Invalid OTP
  it('3. POST /auth/otp/verify - rejects invalid OTP with 400 Bad Request', async () => {
    authService.verifyOtp.mockRejectedValue(new BadRequestException('Incorrect OTP. 2 attempt(s) remaining.'));

    const res = mockResponse();
    await expect(
      controller.verifyOtp({ phone: '9876543210', otp: '000000' }, '127.0.0.1', 'Jest', res)
    ).rejects.toThrow(BadRequestException);
  });

  // 4. Reject Expired OTP
  it('4. POST /auth/otp/verify - rejects expired OTP with 400 Bad Request', async () => {
    authService.verifyOtp.mockRejectedValue(new BadRequestException('OTP has expired. Please request a new code.'));

    const res = mockResponse();
    await expect(
      controller.verifyOtp({ phone: '9876543210', otp: '123456' }, '127.0.0.1', 'Jest', res)
    ).rejects.toThrow(/expired/i);
  });

  // 5. Reject Reused OTP
  it('5. POST /auth/otp/verify - rejects reused OTP challenge', async () => {
    authService.verifyOtp.mockRejectedValue(new BadRequestException('Invalid or expired OTP challenge.'));

    const res = mockResponse();
    await expect(
      controller.verifyOtp({ phone: '9876543210', otp: '123456' }, '127.0.0.1', 'Jest', res)
    ).rejects.toThrow(BadRequestException);
  });

  // 6. Reject Excessive Attempts
  it('6. POST /auth/otp/verify - rejects and locks out on excessive attempts', async () => {
    authService.verifyOtp.mockRejectedValue(
      new BadRequestException('Maximum verification attempts exceeded. Please request a new OTP.')
    );

    const res = mockResponse();
    await expect(
      controller.verifyOtp({ phone: '9876543210', otp: '999999' }, '127.0.0.1', 'Jest', res)
    ).rejects.toThrow(/maximum verification attempts/i);
  });

  // 7. Refresh Valid Session
  it('7. POST /auth/refresh - rotates token and returns updated access token', async () => {
    authService.refreshSession.mockResolvedValue({
      accessToken: 'new.access.token',
      refreshToken: 'new.raw.refresh.token',
    });

    const req: any = { cookies: { localsaathi_refresh_token: 'valid.token' } };
    const res = mockResponse();

    const result = await controller.refresh(req, res, {}, '127.0.0.1', 'Jest');
    expect(result.accessToken).toBe('new.access.token');
    expect(res.cookie).toHaveBeenCalledWith(
      expect.any(String),
      'new.raw.refresh.token',
      expect.objectContaining({ httpOnly: true })
    );
  });

  // 8. Reject Revoked Session
  it('8. POST /auth/refresh - rejects refresh attempt on revoked session with 401', async () => {
    authService.refreshSession.mockRejectedValue(
      new UnauthorizedException('Session has been revoked. Please log in again.')
    );

    const req: any = { cookies: { localsaathi_refresh_token: 'revoked.token' } };
    const res = mockResponse();

    await expect(controller.refresh(req, res, {}, '127.0.0.1', 'Jest')).rejects.toThrow(
      UnauthorizedException
    );
  });

  // 9. Logout
  it('9. POST /auth/logout - revokes current session and clears cookie', async () => {
    authService.logout.mockResolvedValue({ success: true, message: 'Logged out successfully.' });
    const res = mockResponse();

    const result = await controller.logout(
      { userId: 'u-1', sessionId: 's-1', role: UserRole.WORKER },
      res
    );

    expect(result.success).toBe(true);
    expect(res.clearCookie).toHaveBeenCalled();
    expect(authService.logout).toHaveBeenCalledWith('s-1', 'u-1');
  });

  // 10. Logout All Devices
  it('10. POST /auth/logout-all - revokes all active sessions and clears cookie', async () => {
    authService.logoutAll.mockResolvedValue({
      success: true,
      message: 'Logged out from all devices.',
    });
    const res = mockResponse();

    const result = await controller.logoutAll(
      { userId: 'u-1', sessionId: 's-1', role: UserRole.WORKER },
      res
    );

    expect(result.success).toBe(true);
    expect(res.clearCookie).toHaveBeenCalled();
    expect(authService.logoutAll).toHaveBeenCalledWith('u-1');
  });

  // 11. /auth/me
  it('11. GET /auth/me - returns minimal profile without sensitive internal fields', async () => {
    const mockProfile = {
      id: 'u-1',
      role: UserRole.WORKER,
      accountStatus: AccountStatus.ACTIVE,
      verificationStatus: VerificationStatus.VERIFIED,
      createdAt: '2026-09-30T00:00:00.000Z',
    };
    authService.getMe.mockResolvedValue(mockProfile);

    const result = await controller.getMe({
      userId: 'u-1',
      sessionId: 's-1',
      role: UserRole.WORKER,
    });

    expect(result.id).toBe('u-1');
    expect(result.role).toBe(UserRole.WORKER);
    expect((result as any).phone).toBeUndefined(); // Strict minimal exposure
    expect((result as any).password).toBeUndefined();
  });

  // 12. Unauthorized Protected Endpoint
  it('12. Protected endpoint throws UnauthorizedException when JWT is missing or invalid', async () => {
    // When real guard is active without token
    const guard = new JwtAuthGuard(
      { getAllAndOverride: () => false } as any,
      { verifyAccessToken: jest.fn().mockRejectedValue(new UnauthorizedException()) } as any,
      {} as any
    );

    const mockContext: any = {
      getHandler: () => () => {},
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    };

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  // 13. Role-Restricted Endpoint
  it('13. Role-restricted endpoint throws ForbiddenException on role mismatch', () => {
    const rolesGuard = new RolesGuard({
      getAllAndOverride: () => [UserRole.ADMIN],
    } as any);

    const mockContext: any = {
      getHandler: () => () => {},
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.WORKER } }),
      }),
    };

    expect(() => rolesGuard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  // 14. Suspended User
  it('14. Suspended user is rejected with ForbiddenException on authenticated endpoints', async () => {
    authService.getMe.mockRejectedValue(new ForbiddenException('Account is suspended'));

    await expect(
      controller.getMe({ userId: 'suspended-user', sessionId: 's-1', role: UserRole.WORKER })
    ).rejects.toThrow(/suspended/i);
  });
});
