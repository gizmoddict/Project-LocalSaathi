// ==============================================================================
// LocalSaathi — Health & Observability Module (Phase 21)
// Health Probes, Centralized Diagnostics, Metrics Controller & Alerting
// ==============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { HealthService } from './health.service';
import { SystemHealthService } from './system-health.service';
import { AlertingService } from './alerting.service';
import { OutboxModule } from '../outbox/outbox.module';
import { CacheModule } from '../cache/cache.module';

import { LogAlertNotifier } from './notifiers/log-alert-notifier';

@Module({
  imports: [
    forwardRef(() => OutboxModule),
    forwardRef(() => CacheModule),
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    HealthService,
    SystemHealthService,
    AlertingService,
    LogAlertNotifier,
    { provide: 'ALERT_NOTIFIER', useClass: LogAlertNotifier },
  ],
  exports: [HealthService, SystemHealthService, AlertingService],
})
export class HealthModule {}
