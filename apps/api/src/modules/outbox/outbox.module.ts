import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { OutboxService } from './outbox.service';
import { OutboxProcessor } from './outbox.processor';
import { NotificationHandler } from './handlers/notification.handler';
import { SearchIndexHandler } from './handlers/search-index.handler';
import { AnalyticsHandler } from './handlers/analytics.handler';
import { CacheInvalidationHandler } from './handlers/cache-invalidation.handler';
import { NotificationGateway } from './realtime/notification.gateway';
import { NotificationDispatcherService } from './realtime/notification-dispatcher.service';
import { AdminEventController } from './admin-event.controller';
import { NotificationModule } from '../notification/notification.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    forwardRef(() => NotificationModule),
    forwardRef(() => AnalyticsModule),
  ],
  controllers: [AdminEventController],
  providers: [
    OutboxService,
    OutboxProcessor,
    NotificationHandler,
    SearchIndexHandler,
    AnalyticsHandler,
    CacheInvalidationHandler,
    NotificationGateway,
    NotificationDispatcherService,
  ],
  exports: [
    OutboxService,
    OutboxProcessor,
    NotificationGateway,
    NotificationDispatcherService,
    NotificationHandler,
  ],
})
export class OutboxModule {}
