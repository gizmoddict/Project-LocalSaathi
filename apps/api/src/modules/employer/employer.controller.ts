import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { EmployerService } from './employer.service';
import { UpdateEmployerProfileDto } from './dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  UserRole,
  AuthenticatedUser,
  EmployerProfileResponse,
  EmployerCompletionResponse,
  EmployerDashboardResponse,
} from '@localsaathi/types';

@ApiTags('Employers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employers')
export class EmployerController {
  constructor(private readonly employerService: EmployerService) {}

  @Get('me')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Retrieve authenticated employer profile and onboarding state' })
  @ApiResponse({ status: 200, description: 'Employer profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - User is not an EMPLOYER' })
  async getProfile(@CurrentUser() user: AuthenticatedUser): Promise<EmployerProfileResponse> {
    return this.employerService.getProfile(user.userId);
  }

  @Patch('me')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Update employer profile fields (company name, details, address)' })
  @ApiResponse({ status: 200, description: 'Employer profile updated successfully' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateEmployerProfileDto
  ): Promise<EmployerProfileResponse> {
    return this.employerService.updateProfile(user.userId, dto);
  }

  @Get('me/completion')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Get employer profile completion percentage and remaining steps' })
  @ApiResponse({ status: 200, description: 'Completion status calculated' })
  async getCompletion(@CurrentUser() user: AuthenticatedUser): Promise<EmployerCompletionResponse> {
    return this.employerService.getCompletion(user.userId);
  }

  @Post('me/onboarding/complete')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finalize employer onboarding (verifies all steps server-side)' })
  @ApiResponse({ status: 200, description: 'Onboarding finalized successfully' })
  @ApiResponse({ status: 422, description: 'Profile incomplete, missing required steps' })
  async completeOnboarding(@CurrentUser() user: AuthenticatedUser): Promise<{
    success: boolean;
    onboardingStatus: string;
    completionPercentage: number;
  }> {
    return this.employerService.completeOnboarding(user.userId);
  }

  @Get('me/dashboard')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Retrieve employer dashboard aggregate summary' })
  @ApiResponse({ status: 200, description: 'Employer dashboard data' })
  async getDashboard(@CurrentUser() user: AuthenticatedUser): Promise<EmployerDashboardResponse> {
    return this.employerService.getDashboard(user.userId);
  }
}
