// ==============================================================================
// LocalSaathi — Payment Reconciliation Service (Phase 14)
// Automated Discrepancy Detection & Financial Integrity
// ==============================================================================

import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import { PAYMENT_PROVIDER_TOKEN } from '../payment.constants';
import { PaymentProvider } from '../interfaces/payment-provider.interface';
import {
  ReconciliationReport,
  ReconciliationDiscrepancy,
} from '@localsaathi/types';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER_TOKEN)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  /**
   * Runs financial reconciliation comparing PostgreSQL records with
   * PaymentEvents audit logs and external provider status.
   */
  async runReconciliation(): Promise<ReconciliationReport> {
    const discrepancies: ReconciliationDiscrepancy[] = [];
    let totalChecked = 0;
    let matched = 0;

    // 1. Check all payments in the last 7 days
    const recentPayments = await this.prisma.payment.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        events: true,
        refunds: true,
      },
    });

    for (const payment of recentPayments) {
      totalChecked++;
      let hasDiscrepancy = false;

      // Check A: Database status vs PaymentEvents captured events
      const hasCapturedEvent = payment.events.some(
        (e) =>
          e.eventType === 'payment.captured' ||
          e.eventType === 'order.paid' ||
          e.eventType === 'PAYMENT_CAPTURED',
      );

      if (hasCapturedEvent && payment.status === 'INITIATED') {
        hasDiscrepancy = true;
        discrepancies.push({
          type: 'PAYMENT',
          id: payment.id,
          issue: 'Payment has a captured event in payment_events but is still INITIATED in database',
          dbStatus: payment.status,
          providerStatus: 'captured',
          detectedAt: new Date().toISOString(),
        });
      }

      // Check B: Refund math check
      const totalRefunds = payment.refunds
        .filter((r) => r.status === 'SUCCEEDED')
        .reduce((sum, r) => sum + Number(r.amount), 0);

      if (totalRefunds > Number(payment.amount)) {
        hasDiscrepancy = true;
        discrepancies.push({
          type: 'REFUND',
          id: payment.id,
          issue: `Sum of succeeded refunds (${totalRefunds}) exceeds original payment amount (${payment.amount})`,
          dbStatus: payment.status,
          providerStatus: null,
          detectedAt: new Date().toISOString(),
        });
      }

      // Check C: Provider live status for captured payments
      if (payment.providerPaymentId && payment.status === 'CAPTURED') {
        try {
          const providerRecord = await this.paymentProvider.fetchPayment(
            payment.providerPaymentId,
          );
          if (providerRecord.status !== 'captured') {
            hasDiscrepancy = true;
            discrepancies.push({
              type: 'PAYMENT',
              id: payment.id,
              issue: `DB status is CAPTURED but provider status is ${providerRecord.status}`,
              dbStatus: payment.status,
              providerStatus: providerRecord.status,
              detectedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          this.logger.warn(
            `Unable to fetch provider record for reconciliation check ${payment.id}: ${(err as Error).message}`,
          );
        }
      }

      if (!hasDiscrepancy) {
        matched++;
      }
    }

    return {
      timestamp: new Date().toISOString(),
      totalChecked,
      matched,
      discrepancies,
    };
  }
}
