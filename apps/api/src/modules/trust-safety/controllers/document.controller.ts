// ==============================================================================
// LocalSaathi — Secure Document Access Controller (Phase 17)
// IDOR Protection, Audit Trail on Retrieval & Short-Lived Access Tokens
// ==============================================================================

import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser, UserRole } from '@localsaathi/types';
import { PrismaService } from '../../database/database.module';
import { getApiConfig } from '../../../config/env.config';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Secure, IDOR-protected document metadata and signed access resolution.
   * Only the document owner or users with ADMIN/MODERATOR role can access.
   * Access is durably recorded in the immutable audit log.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get document access details (IDOR & Role Protected)' })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiResponse({ status: 200, description: 'Authorized document metadata and access token' })
  async getDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            role: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document record not found',
      });
    }

    const isOwner = document.ownerId === user.userId;
    const isPrivileged = user.role === UserRole.ADMIN || user.role === UserRole.MODERATOR;

    if (!isOwner && !isPrivileged) {
      this.logger.warn(
        `UNAUTHORIZED DOCUMENT ACCESS ATTEMPT: user=${user.userId} attempted to access doc=${id} owned by=${document.ownerId}`
      );
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'You are not authorized to access this sensitive document.',
      });
    }

    // Record immutable audit event for sensitive document inspection
    await this.prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: 'DOCUMENT_ACCESSED',
        entityType: 'Document',
        entityId: id,
        metadata: {
          documentType: document.type,
          isOwner,
          accessingRole: user.role,
        },
      },
    });

    // Generate short-lived (15-minute) signed access token for secure media streaming
    const config = getApiConfig();
    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60; // 15 mins
    const tokenPayload = `${document.id}:${expiresAt}`;
    const tokenSignature = crypto
      .createHmac('sha256', config.JWT_ACCESS_SECRET)
      .update(tokenPayload)
      .digest('hex');
    const signedAccessToken = `${tokenPayload}:${tokenSignature}`;

    return {
      success: true,
      data: {
        id: document.id,
        type: document.type,
        mimeType: document.mimeType,
        fileSizeBytes: document.fileSizeBytes,
        verificationStatus: document.verificationStatus,
        createdAt: document.createdAt.toISOString(),
        signedAccessToken,
        expiresInSeconds: 15 * 60,
      },
    };
  }
}
