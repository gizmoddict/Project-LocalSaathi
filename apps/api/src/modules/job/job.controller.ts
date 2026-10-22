import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { JobService } from './job.service';
import { CreateJobDto, UpdateJobDto, JobFilterDto } from './dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  UserRole,
  AuthenticatedUser,
  JobResponse,
  JobListResponse,
} from '@localsaathi/types';

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employers/me/jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Post()
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new job post in DRAFT status' })
  @ApiResponse({ status: 201, description: 'Job created in DRAFT status' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - User is not an EMPLOYER' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async createJob(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateJobDto
  ): Promise<JobResponse> {
    return this.jobService.createJob(user.userId, dto);
  }

  @Get()
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'List authenticated employer jobs with pagination and status filter' })
  @ApiResponse({ status: 200, description: 'Paginated job post list' })
  async getJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: JobFilterDto
  ): Promise<JobListResponse> {
    return this.jobService.getJobs(user.userId, query);
  }

  @Get(':jobId')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Retrieve single job post details with IDOR security' })
  @ApiResponse({ status: 200, description: 'Job details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job not found or unauthorized' })
  async getJobById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string
  ): Promise<JobResponse> {
    return this.jobService.getJobById(user.userId, jobId);
  }

  @Patch(':jobId')
  @Roles(UserRole.EMPLOYER)
  @ApiOperation({ summary: 'Update an existing job post (skills, location, requirements, terms)' })
  @ApiResponse({ status: 200, description: 'Job updated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot update terminal job' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async updateJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
    @Body() dto: UpdateJobDto
  ): Promise<JobResponse> {
    return this.jobService.updateJob(user.userId, jobId, dto);
  }

  @Delete(':jobId')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a draft job post' })
  @ApiResponse({ status: 200, description: 'Draft job deleted successfully' })
  @ApiResponse({ status: 400, description: 'Only DRAFT jobs can be deleted' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async deleteJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string
  ): Promise<{ success: boolean }> {
    return this.jobService.deleteJob(user.userId, jobId);
  }

  @Post(':jobId/publish')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a draft or paused job after verifying all required fields' })
  @ApiResponse({ status: 200, description: 'Job published successfully' })
  @ApiResponse({ status: 400, description: 'Invalid transition or already terminal' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 422, description: 'Job is incomplete (missing skills or location)' })
  async publishJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string
  ): Promise<JobResponse> {
    return this.jobService.publishJob(user.userId, jobId);
  }

  @Post(':jobId/pause')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a published job' })
  @ApiResponse({ status: 200, description: 'Job paused successfully' })
  @ApiResponse({ status: 400, description: 'Job is not PUBLISHED' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async pauseJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string
  ): Promise<JobResponse> {
    return this.jobService.pauseJob(user.userId, jobId);
  }

  @Post(':jobId/resume')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused job back to PUBLISHED' })
  @ApiResponse({ status: 200, description: 'Job resumed successfully' })
  @ApiResponse({ status: 400, description: 'Job is not PAUSED' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async resumeJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string
  ): Promise<JobResponse> {
    return this.jobService.resumeJob(user.userId, jobId);
  }

  @Post(':jobId/fill')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a job as FILLED' })
  @ApiResponse({ status: 200, description: 'Job marked as FILLED' })
  @ApiResponse({ status: 400, description: 'Job is not in active state' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async fillJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string
  ): Promise<JobResponse> {
    return this.jobService.fillJob(user.userId, jobId);
  }

  @Post(':jobId/close')
  @Roles(UserRole.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close or cancel an active job' })
  @ApiResponse({ status: 200, description: 'Job closed/cancelled' })
  @ApiResponse({ status: 400, description: 'Job is already completed or cancelled' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async closeJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string
  ): Promise<JobResponse> {
    return this.jobService.closeJob(user.userId, jobId);
  }
}
