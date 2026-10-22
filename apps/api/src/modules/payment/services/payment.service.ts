// ==============================================================================
// LocalSaathi — Payment Service (Phase 14)
// Business Logic, Idempotency, IDOR Protection, & Domain Events
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
import { Prisma, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../database/database.module';
import { DomainEventService } from '../../notification/domain-event.service';
import {
  PAYMENT_PROVIDER_TOKEN,
  PAYMENT_ERROR_CODES,
} from '../payment.constants';
import { PaymentProvider } from '../interfaces/payment-provider.interface';
import {
  InitiatePaymentDto,
  PaymentResponse,
  PaymentAttemptResponse,
  RefundResponse,
  PaymentEventResponse,
  DomainEventType,
} from '@localsaathi/types';

export interface AuthUser {
  id?: string;
  userId?: string;
  role: string;
  phone?: string;
}

export function getUserId(user: AuthUser): string {
  return user.userId || user.id || '';
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventService: DomainEventService,
    @Inject(PAYMENT_PROVIDER_TOKEN)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  /**
   * Initiates payment for a confirmed, in-progress, or completed booking.
   * Enforces DB-level idempotency and validates caller authorization.
   */
  async initiatePayment(user: AuthUser, dto: InitiatePaymentDto): Promise<PaymentResponse> {
    const userId = getUserId(user);

    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: {
        employerProfile: true,
        workerProfile: true,
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: PAYMENT_ERROR_CODES.BOOKING_NOT_FOUND,
        message: `Booking with ID ${dto.bookingId} not found`,
      });
    }

    // IDOR / RBAC: only the employer on the booking (or ADMIN) can initiate payment
    if (user.role !== 'ADMIN' && booking.employerProfile.userId !== userId) {
      throw new ForbiddenException({
        code: PAYMENT_ERROR_CODES.UNAUTHORIZED_ACCESS,
        message: 'Only the employer of this booking may initiate payment',
      });
    }

    // Allowed booking states for payment
    const allowedStatuses = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];
    if (!allowedStatuses.includes(booking.status)) {
      throw new BadRequestException({
        code: PAYMENT_ERROR_CODES.UNAUTHORIZED_BOOKING_STATUS,
        message: `Payments cannot be initiated for bookings with status '${booking.status}'`,
      });
    }

    // 1. Strict Idempotency Check
    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: {
        attempts: { orderBy: { attemptNumber: 'asc' } },
        refunds: true,
      },
    });

    if (existingPayment) {
      // If exact same parameters, return existing payment
      const isSameBooking = existingPayment.bookingId === dto.bookingId;
      const isSameAmount = Number(existingPayment.amount) === Number(dto.amount);

      if (isSameBooking && isSameAmount) {
        this.logger.log(
          `Idempotent replay for key ${dto.idempotencyKey}: returning existing payment ${existingPayment.id}`,
        );
        return this.mapPaymentResponse(existingPayment);
      }

      // Conflicting payload with existing idempotency key
      throw new ConflictException({
        code: PAYMENT_ERROR_CODES.IDEMPOTENCY_CONFLICT,
        message: 'Idempotency key has already been used with conflicting payment parameters',
      });
    }

    // 2. Invoke Provider to Create Order
    let providerOrderId: string;
    let providerRawResponse: Record<string, unknown> = {};

    try {
      const orderResult = await this.paymentProvider.createOrder({
        amount: dto.amount,
        currency: dto.currency || 'INR',
        receipt: `bkg_${booking.id.substring(0, 8)}`,
        notes: {
          bookingId: booking.id,
          payerId: userId,
        },
      });
      providerOrderId = orderResult.orderId;
      providerRawResponse = orderResult.rawResponse || {};
    } catch (error) {
      if ((error as any)?.errorCode || (error as any)?.getStatus) {
        throw error;
      }
      this.logger.error(`Failed to create order on payment provider: ${(error as Error).message}`);
      throw new BadRequestException({
        code: PAYMENT_ERROR_CODES.PROVIDER_ERROR,
        message: `Provider failed to initiate order: ${(error as Error).message}`,
      });
    }

    // 3. Atomically persist Payment, Attempt, and Domain/Outbox Event in DB
    let createdEventId: string | null = null;

    const payment = await this.prisma.$transaction(async (tx) => {
      const newPayment = await tx.payment.create({
        data: {
          payerId: userId,
          payeeId: booking.workerProfile.userId,
          bookingId: booking.id,
          provider: this.paymentProvider.providerName,
          providerOrderId,
          amount: new Prisma.Decimal(dto.amount),
          currency: dto.currency || 'INR',
          status: PaymentStatus.INITIATED,
          idempotencyKey: dto.idempotencyKey,
          metadata: (dto.metadata || {}) as Prisma.InputJsonValue,
        },
      });

      await tx.paymentAttempt.create({
        data: {
          paymentId: newPayment.id,
          attemptNumber: 1,
          status: 'INITIATED',
          providerReference: providerOrderId,
          requestPayload: dto as unknown as Prisma.InputJsonValue,
          responsePayload: providerRawResponse as Prisma.InputJsonValue,
        },
      });

      // Transactional Outbox + Domain Event
      createdEventId = await this.domainEventService.createEvent(
        {
          type: DomainEventType.PAYMENT_INITIATED,
          actorId: userId,
          entityType: 'Payment',
          entityId: newPayment.id,
          payload: {
            paymentId: newPayment.id,
            bookingId: booking.id,
            amount: dto.amount,
            currency: dto.currency || 'INR',
            payerId: userId,
            payeeId: booking.workerProfile.userId,
            employerId: booking.employerProfile.userId,
            workerId: booking.workerProfile.userId,
          },
        },
        tx,
      );

      return newPayment;
    });

    // Fire-and-forget domain event processing
    if (createdEventId) {
      this.domainEventService
        .processEvent(createdEventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event processing failed for PAYMENT_INITIATED: ${err}`),
        );
    }

    // Re-fetch with relations
    const fullPayment = await this.prisma.payment.findUnique({
      where: { id: payment.id },
      include: {
        attempts: true,
        refunds: true,
      },
    });

    return this.mapPaymentResponse(fullPayment!);
  }

  /**
   * Retrieves payment details by ID with IDOR protection.
   */
  async getPaymentById(user: AuthUser, paymentId: string): Promise<PaymentResponse> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        attempts: { orderBy: { attemptNumber: 'asc' } },
        refunds: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!payment) {
      throw new NotFoundException({
        code: PAYMENT_ERROR_CODES.PAYMENT_NOT_FOUND,
        message: `Payment with ID ${paymentId} not found`,
      });
    }

    // IDOR check: caller must be payer, payee, or ADMIN/MODERATOR
    const userId = getUserId(user);
    const isPayer = payment.payerId === userId;
    const isPayee = payment.payeeId === userId;
    const isStaff = user.role === 'ADMIN' || user.role === 'MODERATOR';

    if (!isPayer && !isPayee && !isStaff) {
      throw new ForbiddenException({
        code: PAYMENT_ERROR_CODES.UNAUTHORIZED_ACCESS,
        message: 'You are not authorized to view this payment',
      });
    }

    return this.mapPaymentResponse(payment);
  }

  /**
   * Lists payments relevant to current user (payer or payee) or all for ADMIN.
   */
  async listUserPayments(
    user: AuthUser,
    options: { page?: number; limit?: number; status?: PaymentStatus; bookingId?: string },
  ): Promise<{ data: PaymentResponse[]; total: number; page: number; limit: number }> {
    const userId = getUserId(user);
    const page = Math.max(options.page || 1, 1);
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};

    if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') {
      where.OR = [{ payerId: userId }, { payeeId: userId }];
    }

    if (options.status) {
      where.status = options.status;
    }

    if (options.bookingId) {
      where.bookingId = options.bookingId;
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          attempts: true,
          refunds: true,
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments.map((p) => this.mapPaymentResponse(p)),
      total,
      page,
      limit,
    };
  }

  /**
   * Returns payment event audit trail.
   */
  async getPaymentEvents(user: AuthUser, paymentId: string): Promise<PaymentEventResponse[]> {
    // Assert user can access this payment
    await this.getPaymentById(user, paymentId);

    const events = await this.prisma.paymentEvent.findMany({
      where: { paymentId },
      orderBy: { receivedAt: 'desc' },
    });

    return events.map((e) => ({
      id: e.id,
      paymentId: e.paymentId,
      provider: e.provider,
      eventId: e.eventId,
      eventType: e.eventType,
      payload: e.payload as Record<string, unknown>,
      isProcessed: e.isProcessed,
      processedAt: e.processedAt ? e.processedAt.toISOString() : null,
      receivedAt: e.receivedAt.toISOString(),
    }));
  }

  /**
   * Helper to map Prisma Payment entity to PaymentResponse DTO.
   */
  mapPaymentResponse(
    payment: Prisma.PaymentGetPayload<{
      include: {
        attempts?: true;
        refunds?: true;
      };
    }>,
  ): PaymentResponse {
    const attempts: PaymentAttemptResponse[] | undefined = payment.attempts?.map((a) => ({
      id: a.id,
      paymentId: a.paymentId,
      attemptNumber: a.attemptNumber,
      status: a.status as any,
      providerReference: a.providerReference,
      requestPayload: a.requestPayload as Record<string, unknown> | null,
      responsePayload: a.responsePayload as Record<string, unknown> | null,
      failureReason: a.failureReason,
      createdAt: a.createdAt.toISOString(),
    }));

    const refunds: RefundResponse[] | undefined = payment.refunds?.map((r) => ({
      id: r.id,
      paymentId: r.paymentId,
      amount: Number(r.amount),
      currency: r.currency,
      reason: r.reason,
      status: r.status as any,
      providerRefundId: r.providerRefundId,
      idempotencyKey: r.idempotencyKey,
      failureReason: r.failureReason,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return {
      id: payment.id,
      payerId: payment.payerId,
      payeeId: payment.payeeId,
      bookingId: payment.bookingId,
      provider: payment.provider,
      providerOrderId: payment.providerOrderId,
      providerPaymentId: payment.providerPaymentId,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status as any,
      idempotencyKey: payment.idempotencyKey,
      metadata: payment.metadata as Record<string, unknown> | null,
      failureCode: payment.failureCode,
      failureReason: payment.failureReason,
      capturedAt: payment.capturedAt ? payment.capturedAt.toISOString() : null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      attempts,
      refunds,
    };
  }
}
