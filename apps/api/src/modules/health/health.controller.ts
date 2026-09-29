import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthService } from './health.service';
import {
  HealthSummaryResponse,
  LivenessResponse,
  ReadinessResponse,
} from '@localsaathi/types';

@ApiTags('Health & Observability')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Application health summary' })
  @SwaggerResponse({
    status: 200,
    description: 'Returns application health summary including uptime, version, and environment.',
  })
  getHealth(): HealthSummaryResponse {
    return this.healthService.getHealthSummary();
  }

  @Get('live')
  @ApiOperation({ summary: 'Process liveness probe' })
  @SwaggerResponse({
    status: 200,
    description: 'Returns 200 if the NestJS node process is currently alive.',
  })
  getLiveness(): LivenessResponse {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Infrastructure readiness probe' })
  @SwaggerResponse({
    status: 200,
    description: 'All configured infrastructure dependencies (Database, Redis, OpenSearch) are operational.',
  })
  @SwaggerResponse({
    status: 503,
    description: 'One or more required infrastructure dependencies are degraded or unreachable.',
  })
  async getReadiness(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const { isReady, response } = await this.healthService.getReadiness();
    if (!isReady) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return response;
  }
}
