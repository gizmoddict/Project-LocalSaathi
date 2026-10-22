import {
  Controller,
  Get,
  Post,
  Body,
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
import { CreateApplicationDto, WorkerApplicationsQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  UserRole,
  AuthenticatedUser,
  WorkerApplicationListResponse,
  WorkerApplicationDetail,
  ApplicationStatus,
} from '@localsaathi/types';

@ApiTags('Worker Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workers')
export class WorkerApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post('me/jobs/:jobId/applications')
  @Roles(UserRole.WORKER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Apply to a published job post',
    description:
      'Submits a formal job application. Enforces that the job is currently PUBLISHED and prevents duplicate applications.',
  })
  @ApiParam({ name: 'jobId', description: 'Job Post UUID', type: 'string' })
  @ApiResponse({
    status: 201,
    description: 'Application successfully created',
  })
  @ApiResponse({
    status: 400,
    description: 'Job is not PUBLISHED or validation failed',
  })
  @ApiResponse({
    status: 404,
    description: 'Job post not found or worker profile missing',
  })
  @ApiResponse({
    status: 409,
    description: 'Duplicate application: worker has already applied for this job',
  })
  async applyToJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CreateApplicationDto
  ): Promise<{
    id: string;
    jobId: string;
    status: ApplicationStatus;
    appliedAt: string;
  }> {
    return this.applicationService.applyToJob(user.userId, jobId, dto);
  }

  @Get('me/applications')
  @Roles(UserRole.WORKER)
  @ApiOperation({
    summary: 'List applications submitted by authenticated worker',
    description:
      'Returns a paginated list of applications with job info, employer name, and current status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of applications',
  })
  async getMyApplications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkerApplicationsQueryDto
  ): Promise<WorkerApplicationListResponse> {
    return this.applicationService.getWorkerApplications(user.userId, query);
  }

  @Get('me/jobs/:jobId/application')
  @Roles(UserRole.WORKER)
  @ApiOperation({
    summary: 'Check existing application for a specific job post',
    description:
      'Returns the application details if the worker has already applied, or 404 if not applied.',
  })
  @ApiParam({ name: 'jobId', description: 'Job Post UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Existing application detail',
  })
  @ApiResponse({
    status: 404,
    description: 'No application found for this job post',
  })
  async getMyApplicationForJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', ParseUUIDPipe) jobId: string
  ): Promise<WorkerApplicationDetail> {
    return this.applicationService.getWorkerApplicationForJob(user.userId, jobId);
  }

  @Get('me/applications/:applicationId')
  @Roles(UserRole.WORKER)
  @ApiOperation({
    summary: 'Get application detail by ID',
    description:
      'Returns complete application information with full match breakdown and job location.',
  })
  @ApiParam({ name: 'applicationId', description: 'Application UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Application detail',
  })
  @ApiResponse({
    status: 404,
    description: 'Application not found or owned by another worker',
  })
  async getMyApplicationDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string
  ): Promise<WorkerApplicationDetail> {
    return this.applicationService.getWorkerApplicationDetail(user.userId, applicationId);
  }

  @Post('me/applications/:applicationId/withdraw')
  @Roles(UserRole.WORKER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw an application',
    description:
      'Permitted only for applications in APPLIED or SHORTLISTED status.',
  })
  @ApiParam({ name: 'applicationId', description: 'Application UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Application successfully withdrawn',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid transition: application is already in a terminal state',
  })
  @ApiResponse({
    status: 404,
    description: 'Application not found',
  })
  async withdrawApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string
  ): Promise<WorkerApplicationDetail> {
    return this.applicationService.withdrawApplication(user.userId, applicationId);
  }
}
