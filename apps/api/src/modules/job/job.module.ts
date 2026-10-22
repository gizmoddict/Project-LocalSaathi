import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { DatabaseModule } from '../database/database.module';
import { EmployerModule } from '../employer/employer.module';

@Module({
  imports: [DatabaseModule, EmployerModule],
  controllers: [JobController],
  providers: [JobService],
  exports: [JobService],
})
export class JobModule {}
