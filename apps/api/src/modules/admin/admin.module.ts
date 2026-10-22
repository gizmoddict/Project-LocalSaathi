// ==============================================================================
// LocalSaathi — Admin Operations Module (Phase 15)
// ==============================================================================

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdminController } from './admin.controller';
import { AdminMetricsService } from './services/admin-metrics.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminJobsService } from './services/admin-jobs.service';
import { AdminOperationsService } from './services/admin-operations.service';
import { AdminPaymentsService } from './services/admin-payments.service';
import { AdminAuditService } from './services/admin-audit.service';
import { AdminHealthService } from './services/admin-health.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
  providers: [
    AdminMetricsService,
    AdminUsersService,
    AdminJobsService,
    AdminOperationsService,
    AdminPaymentsService,
    AdminAuditService,
    AdminHealthService,
  ],
  exports: [
    AdminMetricsService,
    AdminUsersService,
    AdminJobsService,
    AdminOperationsService,
    AdminPaymentsService,
    AdminAuditService,
    AdminHealthService,
  ],
})
export class AdminModule {}
