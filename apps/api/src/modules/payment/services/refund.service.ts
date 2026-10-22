// ==============================================================================
// LocalSaathi — Refund Service (Phase 14)
// Partial/Full Refunds, Idempotency & Over-Refund Guard
// ==============================================================================

import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma, PaymentStatus, RefundStatus } from '@prisma/client';
import { PrismaService } from '../../database/database.module';
import { DomainEventService } from '../../notification/domain-event.service';
import {
  PAYMENT_PROVIDER_TOKEN,
  PAYMENT_ERROR_CODES,
} from '../payment.constants';
import { PaymentProvider } from '../interfaces/payment-provider.interface';
import { CreateRefundDto, RefundResponse, DomainEventType } from '@localsaathi/types';
import { AuthUser, getUserId } from './payment.service';

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventService: DomainEventService,
    @Inject(PAYMENT_PROVIDER_TOKEN)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  /**
   * Processes a full or partial refund for a captured payment.
   * Enforces that refund amount does not exceed remaining captured balance.
   */
  async processRefund(
    user: AuthUser,
    paymentId: string,
    dto: CreateRefundDto,
  ): Promise<RefundResponse> {
    const userId = getUserId(user);

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        refunds: true,
      },
    });

    if (!payment) {
      throw new NotFoundException({
        code: PAYMENT_ERROR_CODES.PAYMENT_NOT_FOUND,
        message: `Payment with ID ${paymentId} not found`,
      });
    }

    // IDOR / Authorization: only payer or ADMIN can trigger refunds
    if (user.role !== 'ADMIN' && payment.payerId !== userId) {
      throw new ForbiddenException({
        code: PAYMENT_ERROR_CODES.UNAUTHORIZED_ACCESS,
        message: 'Only the payer or an administrator can request a refund',
      });
    }

    // State machine guard: only CAPTURED or DISPUTED can be refunded
    if (payment.status !== PaymentStatus.CAPTURED && payment.status !== PaymentStatus.DISPUTED) {
      throw new BadRequestException({
        code: PAYMENT_ERROR_CODES.REFUND_NOT_ALLOWED,
        message: `Payments in status '${payment.status}' cannot be refunded. Only CAPTURED or DISPUTED payments are eligible.`,
      });
    }

    // Idempotency Check for Refund
    const existingRefund = await this.prisma.refund.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (existingRefund) {
      if (
        existingRefund.paymentId === paymentId &&
        Number(existingRefund.amount) === Number(dto.amount)
      ) {
        this.logger.log(
          `Idempotent replay for refund key ${dto.idempotencyKey}: returning existing refund ${existingRefund.id}`,
        );
        return this.mapRefundResponse(existingRefund);
      }

      throw new ConflictException({
        code: PAYMENT_ERROR_CODES.IDEMPOTENCY_CONFLICT,
        message: 'Idempotency key has already been used with conflicting refund parameters',
      });
    }

    // Sum all prior non-failed refunds
    const priorRefundedSum = payment.refunds
      .filter((r) => r.status === RefundStatus.SUCCEEDED || r.status === RefundStatus.PENDING)
      .reduce((acc, curr) => acc + Number(curr.amount), 0);

    const remainingCaptured = Number(payment.amount) - priorRefundedSum;

    if (dto.amount > remainingCaptured + 0.0001) {
      throw new BadRequestException({
        code: PAYMENT_ERROR_CODES.REFUND_EXCEEDS_CAPTURED_AMOUNT,
        message: `Requested refund amount (${dto.amount}) exceeds remaining captured payment balance (${remainingCaptured.toFixed(2)})`,
      });
    }

    // Call Provider for refund
    let providerRefundId: string | null = null;
    try {
      const providerResult = await this.paymentProvider.processRefund({
        paymentId: payment.providerPaymentId || payment.id,
        amount: dto.amount,
        notes: {
          reason: dto.reason || 'Requested refund',
          paymentId: payment.id,
        },
      });
      providerRefundId = providerResult.refundId;
    } catch (error) {
      this.logger.error(`Provider refund execution failed: ${(error as Error).message}`);
      throw new BadRequestException({
        code: PAYMENT_ERROR_CODES.PROVIDER_ERROR,
        message: `Provider failed to execute refund: ${(error as Error).message}`,
      });
    }

    // Transactionally write Refund, update Payment status if fully refunded, and emit domain event
    let createdEventId: string | null = null;

    const refund = await this.prisma.$transaction(async (tx) => {
      const newRefund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          amount: new Prisma.Decimal(dto.amount),
          currency: payment.currency,
          reason: dto.reason || 'User requested refund',
          status: RefundStatus.SUCCEEDED,
          providerRefundId,
          idempotencyKey: dto.idempotencyKey,
        },
      });

      // If cumulative refund matches or exceeds total payment, transition payment to REFUNDED
      const newTotalRefunded = priorRefundedSum + dto.amount;
      if (newTotalRefunded >= Number(payment.amount) - 0.0001) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }

      // Outbox and Domain Event
      createdEventId = await this.domainEventService.createEvent(
        {
          type: DomainEventType.PAYMENT_REFUNDED,
          actorId: userId,
          entityType: 'Payment',
          entityId: payment.id,
          payload: {
            paymentId: payment.id,
            refundId: newRefund.id,
            amount: dto.amount,
            currency: payment.currency,
            payerId: payment.payerId,
            payeeId: payment.payeeId || undefined,
            bookingId: payment.bookingId || undefined,
          },
        },
        tx,
      );

      return newRefund;
    });

    if (createdEventId) {
      this.domainEventService
        .processEvent(createdEventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event processing failed for PAYMENT_REFUNDED: ${err}`),
        );
    }

    return this.mapRefundResponse(refund);
  }

  mapRefundResponse(refund: Prisma.RefundGetPayload<Record<string, never>>): RefundResponse {
    return {
      id: refund.id,
      paymentId: refund.paymentId,
      amount: Number(refund.amount),
      currency: refund.currency,
      reason: refund.reason,
      status: refund.status as any,
      providerRefundId: refund.providerRefundId,
      idempotencyKey: refund.idempotencyKey,
      failureReason: refund.failureReason,
      createdAt: refund.createdAt.toISOString(),
      updatedAt: refund.updatedAt.toISOString(),
    };
  }
}
