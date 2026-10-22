// ==============================================================================
// LocalSaathi — Observability Module (Phase 21)
// Global Provider for Structured Logging, Tracing & Prometheus Metrics
// ==============================================================================

import { Global, Module } from '@nestjs/common';
import { StructuredLogger } from './structured-logger.service';
import { MetricsService } from './metrics.service';
import { TracingService } from './tracing.service';

@Global()
@Module({
  providers: [StructuredLogger, MetricsService, TracingService],
  exports: [StructuredLogger, MetricsService, TracingService],
})
export class ObservabilityModule {}
