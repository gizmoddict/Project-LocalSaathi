import { Module } from '@nestjs/common';
import { EmployerController } from './employer.controller';
import { EmployerService } from './employer.service';
import { EmployerCompletionService } from './services/employer-completion.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [EmployerController],
  providers: [EmployerService, EmployerCompletionService],
  exports: [EmployerService, EmployerCompletionService],
})
export class EmployerModule {}
