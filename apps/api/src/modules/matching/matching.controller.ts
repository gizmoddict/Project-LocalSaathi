import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { WorkerJobQueryDto } from './dto/worker-job-query.dto';
import { NearbyJobsQueryDto } from './dto/nearby-jobs-query.dto';
import { WorkerJobRecommendationQueryDto } from './dto/worker-job-recommendation-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  UserRole,
  AuthenticatedUser,
  WorkerJobDiscoveryResponse,
  WorkerJobDetailResponse,
  WorkerJobRecommendationResponse,
} from '@localsaathi/types';

@ApiTags('Worker Job Discovery & Matching')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workers')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get('me/jobs/recommendations')
  @Roles(UserRole.WORKER)
  @ApiOperation({
    summary: 'Retrieve personalized job recommendations for the authenticated worker',
    description:
      'Evaluates multidimensional ranking (skills, proximity, experience, availability, wage compatibility, reliability, freshness) with deduplication of applied jobs and blocked employers.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of personalized recommendations with transparent score breakdown',
  })
  @ApiResponse({
    status: 400,
    description: 'Worker location required or query parameters invalid',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Worker role required' })
  async getRecommendedJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkerJobRecommendationQueryDto
  ): Promise<WorkerJobRecommendationResponse> {
    return this.matchingService.recommendJobsForWorker(user.userId, query);
  }

  @Get('me/jobs')
  @Roles(UserRole.WORKER)
  @ApiOperation({
    summary: 'Discover published jobs matching authenticated worker criteria and location',
    description:
      'Performs PostGIS spatial radius filtering, skill matching, availability checking, and deterministic score ranking.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of matching jobs with explainable match breakdowns',
  })
  @ApiResponse({
    status: 400,
    description: 'Worker location is required or query parameters are invalid',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Worker role required' })
  async discoverJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkerJobQueryDto
  ): Promise<WorkerJobDiscoveryResponse> {
    return this.matchingService.discoverJobsForWorker(user.userId, query);
  }

  @Get('me/jobs/nearby')
  @Roles(UserRole.WORKER)
  @ApiOperation({
    summary: 'Retrieve nearby published jobs ordered strictly by geographic distance',
    description:
      'Convenience endpoint leveraging PostGIS spatial distance calculation centered on worker location.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of nearby jobs sorted by distance ascending',
  })
  @ApiResponse({
    status: 400,
    description: 'Worker location is required or query parameters are invalid',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Worker role required' })
  async getNearbyJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NearbyJobsQueryDto
  ): Promise<WorkerJobDiscoveryResponse> {
    return this.matchingService.getNearbyJobsForWorker(user.userId, query);
  }

  @Get('jobs/:jobId')
  @Roles(UserRole.WORKER)
  @ApiOperation({
    summary: 'Retrieve single job details for an authenticated worker with match breakdown',
    description:
      'Enforces strict visibility (only PUBLISHED jobs). Returns public employer details and comprehensive skill match breakdown.',
  })
  @ApiParam({ name: 'jobId', description: 'Job Post UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Job details with full matching breakdown and skill evaluation',
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found, deleted, or in non-published state (DRAFT/PAUSED/FILLED/CANCELLED)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Worker role required' })
  async getJobDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', ParseUUIDPipe) jobId: string
  ): Promise<WorkerJobDetailResponse> {
    return this.matchingService.getJobDetailForWorker(user.userId, jobId);
  }
}
