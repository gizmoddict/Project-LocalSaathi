import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  Ip,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from '@localsaathi/types';
import { getApiConfig } from '../../config/env.config';

@ApiTags('Authentication & Identity')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setRefreshTokenCookie(res: Response, refreshToken: string): void {
    const config = getApiConfig();
    res.cookie(config.AUTH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  private clearRefreshTokenCookie(res: Response): void {
    const config = getApiConfig();
    res.clearCookie(config.AUTH_COOKIE_NAME, {
      path: '/api/v1/auth',
    });
  }

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP verification code for mobile authentication' })
  @ApiResponse({ status: 200, description: 'Generic confirmation to prevent user enumeration' })
  async requestOtp(
    @Body() dto: RequestOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent = 'unknown'
  ) {
    return this.authService.requestOtp(dto, ip, userAgent);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP challenge and issue access + refresh tokens' })
  @ApiResponse({ status: 200, description: 'Tokens issued and user authenticated' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent = 'unknown',
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.verifyOtp(dto, ip, userAgent);
    this.setRefreshTokenCookie(res, result.refreshToken);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  @ApiResponse({ status: 200, description: 'Tokens rotated successfully' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent = 'unknown'
  ) {
    const config = getApiConfig();
    // Retrieve token from HttpOnly cookie or request body fallback
    const rawRefreshToken = req.cookies?.[config.AUTH_COOKIE_NAME] || body.refreshToken;

    const tokens = await this.authService.refreshSession(rawRefreshToken, ip, userAgent);
    this.setRefreshTokenCookie(res, tokens.refreshToken);
    return tokens;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current active session' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response
  ) {
    this.clearRefreshTokenCookie(res);
    return this.authService.logout(user.sessionId, user.userId);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all active sessions across all devices' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response
  ) {
    this.clearRefreshTokenCookie(res);
    return this.authService.logoutAll(user.userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retrieve authenticated user minimal profile' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.userId);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all active sessions for current user' })
  async getSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getSessions(user.userId, user.sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific active session' })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionIdToRevoke: string
  ) {
    return this.authService.revokeSession(user.userId, sessionIdToRevoke);
  }
}
