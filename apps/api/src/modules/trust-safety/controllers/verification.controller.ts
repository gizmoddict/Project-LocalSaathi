import {
  Controller,
  Post,
  Get,
  Param,
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
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { VerificationService } from '../services/verification.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@localsaathi/types';
import { submitVerificationSchema } from '@localsaathi/validation';

@ApiTags('Verification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('verifications')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit identity verification request with documents metadata' })
  @ApiResponse({ status: 201, description: 'Verification submitted successfully' })
  async submitVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const input = submitVerificationSchema.parse(body);
    return this.verificationService.submitVerification(user.userId, input);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit identity verification request (alias)' })
  @ApiResponse({ status: 201, description: 'Verification submitted successfully' })
  async submitVerificationAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const input = submitVerificationSchema.parse(body);
    return this.verificationService.submitVerification(user.userId, input);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get current user verification status and documents history' })
  @ApiResponse({ status: 200, description: 'User verification status' })
  async getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.verificationService.getVerificationStatus(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific verification details (IDOR protected)' })
  @ApiParam({ name: 'id', description: 'Verification UUID' })
  @ApiResponse({ status: 200, description: 'Verification details' })
  async getVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.verificationService.getVerificationById(id, user.userId, user.role);
  }
}
