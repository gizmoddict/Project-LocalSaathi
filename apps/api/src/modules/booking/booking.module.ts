import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { BookingService } from './booking.service';
import { WorkerBookingController } from './worker-booking.controller';
import { EmployerBookingController } from './employer-booking.controller';
import { NotificationModule } from '../notification/notification.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [DatabaseModule, AuthModule, NotificationModule, OutboxModule],
  controllers: [WorkerBookingController, EmployerBookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
