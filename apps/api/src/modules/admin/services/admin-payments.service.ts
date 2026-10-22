// ==============================================================================
// LocalSaathi — Admin Payments Service (Phase 15)
// Read-Only Financial Ledger Ingress, Safe Projections & Settlement Visibility
// ==============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import {
  AdminPaymentItem,
  AdminPaymentQuery,
  PaymentStatus,
} from '@localsaathi/types';
import { Prisma } from '@prisma/client';
import { ADMIN_PAGINATION_LIMITS } from '../admin.constants';

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists financial payment transactions with sanitized projections.
   * Strictly excludes raw card numbers, CVVs, webhook signatures, and gateway credentials.
   */
  async listPayments(
    query: AdminPaymentQuery,
  ): Promise<{ data: AdminPaymentItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(query.page || ADMIN_PAGINATION_LIMITS.DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(query.limit || ADMIN_PAGINATION_LIMITS.DEFAULT_LIMIT, 1),
      ADMIN_PAGINATION_LIMITS.MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};

    if (query.status) {
      where.status = query.status as any;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          refunds: {
            where: { status: 'SUCCEEDED' },
            select: { amount: true },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    const data: AdminPaymentItem[] = payments.map((p) => {
      const refundedAmount = p.refunds.reduce((sum, r) => sum + Number(r.amount), 0);

      return {
        id: p.id,
        bookingId: p.bookingId,
        payerId: p.payerId,
        payeeId: p.payeeId || null,
        amount: Number(p.amount),
        currency: p.currency,
        provider: p.provider,
        providerOrderId: p.providerOrderId,
        status: p.status as PaymentStatus,
        refundedAmount,
        capturedAt: p.capturedAt?.toISOString() || null,
        createdAt: p.createdAt.toISOString(),
      };
    });

    return { data, total, page, limit };
  }
}
