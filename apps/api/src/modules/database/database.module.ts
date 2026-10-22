import { Global, Module, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '@localsaathi/database';
import { MetricsService } from '../../common/observability/metrics.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule implements OnModuleInit {
  constructor(@Optional() private readonly metricsService?: MetricsService) {}

  onModuleInit(): void {
    if (this.metricsService) {
      PrismaService.setTelemetryHandler((event) => {
        const labels = {
          model: event.model || 'raw',
          operation: event.action,
        };
        this.metricsService?.recordHistogram('db_query_duration_ms', event.durationMs, labels);
        if (event.isSlow) {
          this.metricsService?.incrementCounter('db_slow_queries_total', labels);
        }
        if (event.error) {
          this.metricsService?.incrementCounter('db_query_errors_total', labels);
        }
      });
    }
  }
}
export { PrismaService } from '@localsaathi/database';
