// ==============================================================================
// LocalSaathi — Payout Service (Phase 14)
// Worker Earnings Disbursement & Account Balances
// ==============================================================================

import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../../database/database.module';
import { DomainEventService } from '../../notification/domain-event.service';
import {
  PAYMENT_PROVIDER_TOKEN,
  PAYMENT_ERROR_CODES,
} from '../payment.constants';
import { PaymentProvider } from '../interfaces/payment-provider.interface';
import { CreatePayoutDto, PayoutResponse, DomainEventType } from '@localsaathi/types';
import { AuthUser, getUserId } from './payment.service';

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventService: DomainEventService,
    @Inject(PAYMENT_PROVIDER_TOKEN)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  /**
   * Initiates a payout to a worker.
   * Only ADMIN or platform settlement engine can trigger payouts directly.
   */
  async createPayout(user: AuthUser, dto: CreatePayoutDto): Promise<PayoutResponse> {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: PAYMENT_ERROR_CODES.UNAUTHORIZED_ACCESS,
        message: 'Only platform administrators can manually trigger worker payouts',
      });
    }

    const workerUser = await this.prisma.user.findUnique({
      where: { id: dto.workerId },
      include: { workerProfile: true },
    });

    if (!workerUser) {
      throw new NotFoundException({
        code: PAYMENT_ERROR_CODES.UNAUTHORIZED_ACCESS,
        message: `Worker with user ID ${dto.workerId} not found`,
      });
    }

    // Idempotency verification
    const existingPayout = await this.prisma.payout.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (existingPayout) {
      const isSameWorker = existingPayout.workerId === dto.workerId;
      const isSameAmount = Number(existingPayout.amount) === Number(dto.amount);

      if (isSameWorker && isSameAmount) {
        this.logger.log(
          `Idempotent replay for payout key ${dto.idempotencyKey}: returning existing payout ${existingPayout.id}`,
        );
        return this.mapPayoutResponse(existingPayout);
      }

      throw new ConflictException({
        code: PAYMENT_ERROR_CODES.IDEMPOTENCY_CONFLICT,
        message: 'Idempotency key has already been used with conflicting payout parameters',
      });
    }

    // Call Provider to disburse payout
    const providerResult = await this.paymentProvider.createPayout({
      workerId: dto.workerId,
      amount: dto.amount,
      currency: dto.currency || 'INR',
    });

    let createdEventId: string | null = null;

    const payout = await this.prisma.$transaction(async (tx) => {
      const newPayout = await tx.payout.create({
        data: {
          bookingId: dto.bookingId,
          workerId: dto.workerId,
          amount: new Prisma.Decimal(dto.amount),
          currency: dto.currency || 'INR',
          status: PayoutStatus.PAID,
          provider: this.paymentProvider.providerName,
          providerPayoutId: providerResult.payoutId,
          idempotencyKey: dto.idempotencyKey,
          processedAt: new Date(),
        },
      });

      createdEventId = await this.domainEventService.createEvent(
        {
          type: DomainEventType.PAYOUT_PROCESSED,
          actorId: getUserId(user),
          entityType: 'Payout',
          entityId: newPayout.id,
          payload: {
            payoutId: newPayout.id,
            bookingId: dto.bookingId,
            workerId: dto.workerId,
            amount: dto.amount,
            currency: dto.currency || 'INR',
          },
        },
        tx,
      );

      return newPayout;
    });

    if (createdEventId) {
      this.domainEventService
        .processEvent(createdEventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event processing failed for PAYOUT_PROCESSED: ${err}`),
        );
    }

    return this.mapPayoutResponse(payout);
  }

  /**
   * Retrieves list of payouts for worker or all payouts for admin.
   */
  async listWorkerPayouts(user: AuthUser, workerId?: string): Promise<PayoutResponse[]> {
    const userId = getUserId(user);
    const targetWorkerId = user.role === 'ADMIN' && workerId ? workerId : userId;

    if (user.role !== 'ADMIN' && userId !== targetWorkerId) {
      throw new ForbiddenException({
        code: PAYMENT_ERROR_CODES.UNAUTHORIZED_ACCESS,
        message: 'You can only view your own payouts',
      });
    }

    const payouts = await this.prisma.payout.findMany({
      where: { workerId: targetWorkerId },
      orderBy: { createdAt: 'desc' },
    });

    return payouts.map((p) => this.mapPayoutResponse(p));
  }

  mapPayoutResponse(payout: Prisma.PayoutGetPayload<Record<string, never>>): PayoutResponse {
    return {
      id: payout.id,
      bookingId: payout.bookingId,
      workerId: payout.workerId,
      amount: Number(payout.amount),
      currency: payout.currency,
      status: payout.status as any,
      provider: payout.provider,
      providerPayoutId: payout.providerPayoutId,
      idempotencyKey: payout.idempotencyKey,
      failureReason: payout.failureReason,
      processedAt: payout.processedAt ? payout.processedAt.toISOString() : null,
      createdAt: payout.createdAt.toISOString(),
      updatedAt: payout.updatedAt.toISOString(),
    };
  }
}
