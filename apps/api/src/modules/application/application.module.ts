import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ApplicationService } from './application.service';
import { WorkerApplicationController } from './worker-application.controller';
import { EmployerApplicationController } from './employer-application.controller';
import { NotificationModule } from '../notification/notification.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [DatabaseModule, AuthModule, NotificationModule, OutboxModule],
  controllers: [WorkerApplicationController, EmployerApplicationController],
  providers: [ApplicationService],
  exports: [ApplicationService],
})
export class ApplicationModule {}
