// ==============================================================================
// LocalSaathi — Metrics Prometheus Exposition Controller (Phase 21)
// Serves Standard Prometheus Format Text & JSON Snapshots
// ==============================================================================

import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { MetricsService } from '../../common/observability/metrics.service';

@ApiTags('Health & Observability')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Prometheus metrics exposition endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Returns Prometheus metrics in standard exposition text or JSON format.',
  })
  getMetrics(
    @Query('format') format: string,
    @Res() res: Response,
  ): void {
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.json(this.metricsService.getSnapshotJson());
      return;
    }

    // Standard Prometheus text format
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(this.metricsService.exportPrometheusText());
  }
}
