import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { DomainEventService } from './domain-event.service';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    forwardRef(() => OutboxModule),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, DomainEventService],
  exports: [NotificationService, DomainEventService],
})
export class NotificationModule {}
