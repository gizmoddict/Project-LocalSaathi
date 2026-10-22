// ==============================================================================
// LocalSaathi — Payment Reconciliation Queue Worker Handler (Phase 20)
// Audits Financial Integrity, Detects Discrepancies & Preserves Authoritative State
// ==============================================================================

import Redis from 'ioredis';
import { PrismaClient } from '@localsaathi/database';
import {
  JobContract,
  PaymentReconciliationJobPayload,
  QueueName,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class PaymentReconciliationWorkerHandler extends BaseJobHandler<PaymentReconciliationJobPayload> {
  readonly queueName = QueueName.PAYMENT_RECONCILIATION;
  readonly defaultTimeoutMs = 45000;

  constructor(
    redis: Redis,
    dlqService: DeadLetterQueueService,
    private readonly prisma: PrismaClient,
  ) {
    super(redis, dlqService);
  }

  protected async process(job: JobContract<PaymentReconciliationJobPayload>): Promise<void> {
    const { targetPaymentId, mode } = job.payload;

    // eslint-disable-next-line no-console
    console.info(
      `[PaymentReconciliationWorker] Starting ${mode} reconciliation (targetId=${targetPaymentId || 'BATCH'})...`,
    );

    let paymentsToCheck: any[] = [];

    if (targetPaymentId) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: targetPaymentId },
        include: { events: true, refunds: true },
      });
      if (payment) paymentsToCheck = [payment];
    } else {
      // Query recent payments (bounded batch of up to 100)
      paymentsToCheck = await this.prisma.payment.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: { events: true, refunds: true },
      });
    }

    let discrepanciesFound = 0;

    for (const payment of paymentsToCheck) {
      // Check 1: Event log says paid/captured but status is still INITIATED
      const hasCapturedEvent = payment.events.some(
        (e: any) =>
          e.eventType === 'payment.captured' ||
          e.eventType === 'order.paid' ||
          e.eventType === 'PAYMENT_CAPTURED',
      );

      if (hasCapturedEvent && payment.status === 'INITIATED') {
        discrepanciesFound++;
        // eslint-disable-next-line no-console
        console.warn(
          `[PaymentReconciliationWorker] Discrepancy detected for payment ${payment.id}: Event logged as captured but DB status is INITIATED. Requires attention.`,
        );
      }

      // Check 2: Refund discrepancy
      const totalRefunded = payment.refunds.reduce(
        (acc: number, r: any) => (r.status === 'PROCESSED' ? acc + Number(r.amount) : acc),
        0,
      );

      if (totalRefunded > Number(payment.amount)) {
        discrepanciesFound++;
        // eslint-disable-next-line no-console
        console.error(
          `[PaymentReconciliationWorker] CRITICAL: Total refunded (INR ${totalRefunded}) exceeds payment amount (INR ${payment.amount}) for payment ${payment.id}!`,
        );
      }
    }

    // eslint-disable-next-line no-console
    console.info(
      `[PaymentReconciliationWorker] Completed reconciliation of ${paymentsToCheck.length} payment(s). Discrepancies flagged: ${discrepanciesFound}`,
    );
  }
}
