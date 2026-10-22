import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { VerificationService } from './services/verification.service';
import { ReportingService } from './services/reporting.service';
import { DisputeService } from './services/dispute.service';
import { ModerationService } from './services/moderation.service';
import { VerificationController } from './controllers/verification.controller';
import {
  UserReportController,
  JobReportController,
  MessageReportController,
  ReportListController,
} from './controllers/reporting.controller';
import {
  BookingDisputeController,
  DisputeController,
} from './controllers/dispute.controller';
import { ModerationController } from './controllers/moderation.controller';
import { DocumentController } from './controllers/document.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    VerificationController,
    DocumentController,
    UserReportController,
    JobReportController,
    MessageReportController,
    ReportListController,
    BookingDisputeController,
    DisputeController,
    ModerationController,
  ],
  providers: [
    VerificationService,
    ReportingService,
    DisputeService,
    ModerationService,
  ],
  exports: [
    VerificationService,
    ReportingService,
    DisputeService,
    ModerationService,
  ],
})
export class TrustSafetyModule {}
