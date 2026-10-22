import {
  Controller,
  Get,
  Post,
  Param,
  Query,
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
import { ApplicationService } from './application.service';
import { EmployerApplicationsQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  UserRole,
  AuthenticatedUser,
  EmployerApplicationListResponse,
  EmployerApplicationItem,
} from '@localsaathi/types';

@ApiTags('Employer Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employers')
export class EmployerApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Get('me/jobs/:jobId/applications')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({
    summary: 'List applications for an employer job post',
    description:
      'Returns applicant profiles, deterministic match evaluations, and application metrics. Enforces strict employer job ownership.',
  })
  @ApiParam({ name: 'jobId', description: 'Job Post UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of applicants with matching breakdown',
  })
  @ApiResponse({
    status: 404,
    description: 'Job post not found or owned by another employer',
  })
  async getJobApplications(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: EmployerApplicationsQueryDto
  ): Promise<EmployerApplicationListResponse> {
    return this.applicationService.getEmployerJobApplications(user.userId, jobId, query);
  }

  @Get('me/applications/:applicationId')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({
    summary: 'View applicant details and match breakdown',
    description:
      'Returns applicant profile and deterministic match score. Enforces that the job belongs to the authenticated employer.',
  })
  @ApiParam({ name: 'applicationId', description: 'Application UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Applicant details',
  })
  @ApiResponse({
    status: 404,
    description: 'Application not found or unauthorized',
  })
  async getApplicationDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string
  ): Promise<EmployerApplicationItem> {
    return this.applicationService.getEmployerApplicationDetail(user.userId, applicationId);
  }

  @Post('me/applications/:applicationId/shortlist')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Shortlist an applicant (APPLIED -> SHORTLISTED)',
    description:
      'Moves an application from APPLIED to SHORTLISTED. Enforces employer ownership.',
  })
  @ApiParam({ name: 'applicationId', description: 'Application UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Application successfully shortlisted',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid transition: application is not in APPLIED status',
  })
  @ApiResponse({
    status: 404,
    description: 'Application not found',
  })
  async shortlistApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string
  ): Promise<EmployerApplicationItem> {
    return this.applicationService.shortlistApplication(user.userId, applicationId);
  }

  @Post('me/applications/:applicationId/reject')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject an applicant (APPLIED / SHORTLISTED -> REJECTED)',
    description:
      'Rejects an application from APPLIED or SHORTLISTED. Terminal state.',
  })
  @ApiParam({ name: 'applicationId', description: 'Application UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Application successfully rejected',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid transition: application is already in a terminal state',
  })
  @ApiResponse({
    status: 404,
    description: 'Application not found',
  })
  async rejectApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string
  ): Promise<EmployerApplicationItem> {
    return this.applicationService.rejectApplication(user.userId, applicationId);
  }

  @Post('me/applications/:applicationId/accept')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept an applicant (SHORTLISTED -> ACCEPTED)',
    description:
      'Accepts an applicant for the job post. Application must be SHORTLISTED first. Terminal state.',
  })
  @ApiParam({ name: 'applicationId', description: 'Application UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Application successfully accepted',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid transition: application is not in SHORTLISTED status',
  })
  @ApiResponse({
    status: 404,
    description: 'Application not found',
  })
  async acceptApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string
  ): Promise<EmployerApplicationItem> {
    return this.applicationService.acceptApplication(user.userId, applicationId);
  }
}
