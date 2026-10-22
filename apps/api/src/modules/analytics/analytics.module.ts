// ==============================================================================
// LocalSaathi — Product Analytics Module (Phase 16)
// ==============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsService } from './services/analytics.service';
import { AnalyticsMetricsService } from './services/analytics-metrics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsMetricsService,
  ],
  exports: [
    AnalyticsService,
    AnalyticsMetricsService,
  ],
})
export class AnalyticsModule {}
