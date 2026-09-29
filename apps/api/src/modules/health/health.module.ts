import { Module } from '@nestjs/common';
import { PrismaService } from '@localsaathi/database';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, PrismaService],
  exports: [HealthService, PrismaService],
})
export class HealthModule {}
