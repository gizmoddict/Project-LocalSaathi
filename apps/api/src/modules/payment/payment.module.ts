// ==============================================================================
// LocalSaathi — Payment Module (Phase 14)
// ==============================================================================

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './services/payment.service';
import { RefundService } from './services/refund.service';
import { PayoutService } from './services/payout.service';
import { WebhookService } from './services/webhook.service';
import { ReconciliationService } from './services/reconciliation.service';
import { RazorpayProvider } from './providers/razorpay.provider';
import { MockPaymentProvider } from './providers/mock.provider';
import { PAYMENT_PROVIDER_TOKEN } from './payment.constants';

@Module({
  imports: [DatabaseModule, AuthModule, NotificationModule, OutboxModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    RefundService,
    PayoutService,
    WebhookService,
    ReconciliationService,
    RazorpayProvider,
    MockPaymentProvider,
    {
      provide: PAYMENT_PROVIDER_TOKEN,
      useFactory: (
        razorpayProvider: RazorpayProvider,
        mockProvider: MockPaymentProvider,
      ) => {
        const providerName = (process.env.PAYMENT_PROVIDER || 'MOCK').toUpperCase();
        if (providerName === 'RAZORPAY') {
          return razorpayProvider;
        }
        return mockProvider;
      },
      inject: [RazorpayProvider, MockPaymentProvider],
    },
  ],
  exports: [
    PaymentService,
    RefundService,
    PayoutService,
    WebhookService,
    ReconciliationService,
    PAYMENT_PROVIDER_TOKEN,
  ],
})
export class PaymentModule {}
