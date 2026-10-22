import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '@localsaathi/database';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenService } from '../services/token.service';
import { AuthenticatedUser } from '@localsaathi/types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Check if route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // 2. Extract Bearer token from Authorization header
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication token missing or invalid');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token provided');
    }

    // 3. Verify JWT signature & structure
    const payload = await this.tokenService.verifyAccessToken(token);

    // 4. Validate database session state (revocation & expiration check)
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.revokedAt || new Date() > session.expiresAt) {
      throw new UnauthorizedException('Session is invalid, expired, or has been revoked');
    }

    // 5. Validate user account state
    if (session.user.accountStatus === 'SUSPENDED') {
      throw new ForbiddenException('Account has been suspended. Please contact support.');
    }

    if (session.user.accountStatus === 'DELETED') {
      throw new ForbiddenException('Account has been deactivated.');
    }

    // 6. Attach authenticated user to request
    const authUser: AuthenticatedUser = {
      userId: session.user.id,
      sessionId: session.id,
      role: session.user.role as any,
    };

    (request as Request & { user: AuthenticatedUser }).user = authUser;

    return true;
  }
}
