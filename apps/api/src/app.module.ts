import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { CorrelationContextMiddleware } from './common/middleware/correlation-context.middleware';
import { ObservabilityModule } from './common/observability/observability.module';
import { ResilienceModule } from './common/resilience/resilience.module';

import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { WorkerModule } from './modules/worker/worker.module';
import { EmployerModule } from './modules/employer/employer.module';
import { JobModule } from './modules/job/job.module';
import { MatchingModule } from './modules/matching/matching.module';
import { ApplicationModule } from './modules/application/application.module';
import { BookingModule } from './modules/booking/booking.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { TrustSafetyModule } from './modules/trust-safety/trust-safety.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CacheModule } from './modules/cache/cache.module';
import { QueueModule } from './modules/queue/queue.module';

@Module({
  imports: [
    ObservabilityModule,
    ResilienceModule,
    QueueModule,
    CacheModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    WorkerModule,
    EmployerModule,
    JobModule,
    MatchingModule,
    ApplicationModule,
    BookingModule,
    NotificationModule,
    OutboxModule,
    MessagingModule,
    TrustSafetyModule,
    PaymentModule,
    AdminModule,
    AnalyticsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationContextMiddleware).forRoutes('*');
  }
}

