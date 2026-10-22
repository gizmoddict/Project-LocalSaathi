import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ModerationService } from '../services/moderation.service';
import { VerificationService } from '../services/verification.service';
import { DisputeService } from '../services/dispute.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  UserRole,
  AuthenticatedUser,
  ModerationCaseStatus,
  ModerationCaseType,
  ModerationPriority,
} from '@localsaathi/types';
import {
  resolveCaseSchema,
  escalateCaseSchema,
  reviewVerificationSchema,
  suspendUserSchema,
  reinstateUserSchema,
  applyUserRestrictionSchema,
  resolveDisputeSchema,
} from '@localsaathi/validation';

@ApiTags('Moderation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MODERATOR)
@Controller('moderation')
export class ModerationController {
  constructor(
    private readonly moderationService: ModerationService,
    private readonly verificationService: VerificationService,
    private readonly disputeService: DisputeService,
  ) {}

  // ---------------------------------------------------------------------------
  // CASES
  // ---------------------------------------------------------------------------

  @Get('cases')
  @ApiOperation({ summary: 'List moderation cases with status and priority filters' })
  @ApiQuery({ name: 'status', required: false, enum: ModerationCaseStatus })
  @ApiQuery({ name: 'caseType', required: false, enum: ModerationCaseType })
  @ApiQuery({ name: 'priority', required: false, enum: ModerationPriority })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCases(
    @Query('status') status?: ModerationCaseStatus,
    @Query('caseType') caseType?: ModerationCaseType,
    @Query('priority') priority?: ModerationPriority,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.moderationService.getCases({
      status,
      caseType,
      priority,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('cases/:id')
  @ApiOperation({ summary: 'Get full details and action trail for a moderation case' })
  @ApiParam({ name: 'id', description: 'Case UUID' })
  async getCaseById(@Param('id', ParseUUIDPipe) id: string) {
    return this.moderationService.getCaseById(id);
  }

  @Post('cases/:id/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign case to the current moderator' })
  @ApiParam({ name: 'id', description: 'Case UUID' })
  async claimCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.moderationService.claimCase(id, user.userId);
  }

  @Post('cases/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve case with an action and resolution notes' })
  @ApiParam({ name: 'id', description: 'Case UUID' })
  async resolveCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = resolveCaseSchema.parse(body);
    return this.moderationService.resolveCase(id, user.userId, input);
  }

  @Post('cases/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a frivolous or invalid moderation case' })
  @ApiParam({ name: 'id', description: 'Case UUID' })
  async dismissCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes?: string,
  ) {
    return this.moderationService.dismissCase(id, user.userId, notes);
  }

  @Post('cases/:id/escalate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Escalate case priority to critical' })
  @ApiParam({ name: 'id', description: 'Case UUID' })
  async escalateCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = escalateCaseSchema.parse(body || {});
    return this.moderationService.escalateCase(id, user.userId, input);
  }

  // ---------------------------------------------------------------------------
  // VERIFICATIONS REVIEW
  // ---------------------------------------------------------------------------

  @Get('verifications')
  @ApiOperation({ summary: 'List verification cases in queue' })
  async getVerifications(
    @Query('status') status?: ModerationCaseStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.moderationService.getCases({
      caseType: ModerationCaseType.VERIFICATION,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('verifications/:id')
  @ApiOperation({ summary: 'Get verification request details with user and documents' })
  @ApiParam({ name: 'id', description: 'Verification UUID' })
  async getVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.verificationService.getVerificationById(id, user.userId, user.role);
  }

  @Post('verifications/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve an identity verification request' })
  @ApiParam({ name: 'id', description: 'Verification UUID' })
  async approveVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = reviewVerificationSchema.parse(body || {});
    return this.verificationService.reviewVerification(id, user.userId, 'APPROVE', input);
  }

  @Post('verifications/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an identity verification request with reason' })
  @ApiParam({ name: 'id', description: 'Verification UUID' })
  async rejectVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = reviewVerificationSchema.parse(body || {});
    return this.verificationService.reviewVerification(id, user.userId, 'REJECT', input);
  }

  // ---------------------------------------------------------------------------
  // USER SAFETY: SUSPENSIONS & CAPABILITY RESTRICTIONS
  // ---------------------------------------------------------------------------

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend user account and revoke all active sessions' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async suspendUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = suspendUserSchema.parse(body);
    return this.moderationService.suspendUser(id, user.userId, input);
  }

  @Post('users/:id/reinstate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reinstate suspended user account' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async reinstateUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = reinstateUserSchema.parse(body || {});
    return this.moderationService.reinstateUser(id, user.userId, input);
  }

  @Post('users/:id/restrictions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply specific capability restriction to a user' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async applyRestriction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = applyUserRestrictionSchema.parse(body);
    return this.moderationService.applyRestriction(id, user.userId, input);
  }

  @Delete('users/:id/restrictions/:restrictionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke user capability restriction' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiParam({ name: 'restrictionId', description: 'Restriction UUID' })
  async revokeUserRestriction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restrictionId', ParseUUIDPipe) restrictionId: string,
  ) {
    return this.moderationService.revokeRestriction(restrictionId, user.userId);
  }

  @Delete('restrictions/:restrictionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke capability restriction directly' })
  @ApiParam({ name: 'restrictionId', description: 'Restriction UUID' })
  async revokeRestriction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restrictionId', ParseUUIDPipe) restrictionId: string,
  ) {
    return this.moderationService.revokeRestriction(restrictionId, user.userId);
  }

  @Get('users/:id/restrictions')
  @ApiOperation({ summary: 'List active capability restrictions for user' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async getUserRestrictions(@Param('id', ParseUUIDPipe) id: string) {
    return this.moderationService.getUserRestrictions(id);
  }

  // ---------------------------------------------------------------------------
  // DISPUTES REVIEW
  // ---------------------------------------------------------------------------

  @Get('disputes')
  @ApiOperation({ summary: 'List disputes queue' })
  async getDisputes(
    @Query('status') status?: ModerationCaseStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.moderationService.getCases({
      caseType: ModerationCaseType.DISPUTE,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('disputes/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a booking dispute (operational settlement)' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  async resolveDispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = resolveDisputeSchema.parse(body);
    return this.disputeService.resolveDispute(id, user.userId, input);
  }

  // ---------------------------------------------------------------------------
  // AUDIT LOGS
  // ---------------------------------------------------------------------------

  @Get('audit-logs')
  @ApiOperation({ summary: 'List trust and safety immutable audit records' })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'actorId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getAuditLogs(
    @Query('entityType') entityType?: string,
    @Query('actorId') actorId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.moderationService.getAuditLogs({
      entityType,
      actorId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
