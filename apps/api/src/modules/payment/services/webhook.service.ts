// ==============================================================================
// LocalSaathi — Payment Webhook Service (Phase 14)
// Signature Verification, Replay Protection & Safe State Machine Transitions
// ==============================================================================

import {
  Injectable,
  Inject,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Prisma, PaymentStatus, PaymentAttemptStatus } from '@prisma/client';
import { PrismaService } from '../../database/database.module';
import { DomainEventService } from '../../notification/domain-event.service';
import {
  PAYMENT_PROVIDER_TOKEN,
  PAYMENT_ERROR_CODES,
} from '../payment.constants';
import { PaymentProvider } from '../interfaces/payment-provider.interface';
import { PaymentStateMachine } from '../payment-state-machine';
import { DomainEventType } from '@localsaathi/types';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventService: DomainEventService,
    @Inject(PAYMENT_PROVIDER_TOKEN)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  /**
   * Secure webhook ingress for payment events.
   * Enforces cryptographic HMAC validation and replay prevention.
   */
  async handleWebhook(
    provider: string,
    rawBody: string | Buffer,
    signature: string,
    payload: Record<string, unknown>,
  ): Promise<{ received: boolean; duplicate?: boolean; eventId?: string }> {
    // 1. Validate Cryptographic HMAC Signature
    const isValid = this.paymentProvider.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      this.logger.warn(`Invalid webhook signature received for provider ${provider}`);
      throw new UnauthorizedException({
        code: PAYMENT_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID,
        message: 'Invalid payment webhook signature',
      });
    }

    // 2. Parse Normalized Event Details
    const event = this.paymentProvider.parseWebhookEvent(payload);

    // 2b. Replay Window & Clock Drift Validation (Max 5 minutes)
    const eventTimestamp = (payload.created_at as number) || (payload.timestamp as number);
    if (eventTimestamp && typeof eventTimestamp === 'number') {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const diff = Math.abs(nowSeconds - eventTimestamp);
      if (diff > 300) {
        this.logger.warn(
          `Stale/expired webhook timestamp detected: eventTime=${eventTimestamp}, now=${nowSeconds}, drift=${diff}s`
        );
        throw new UnauthorizedException({
          code: 'WEBHOOK_TIMESTAMP_EXPIRED',
          message: 'Payment webhook timestamp expired or exceeds allowable clock drift.',
        });
      }
    }

    // 3. Replay Protection via Database Uniqueness
    const existingEvent = await this.prisma.paymentEvent.findUnique({
      where: { eventId: event.eventId },
    });

    if (existingEvent) {
      this.logger.warn(
        `Duplicate webhook event ignored (replay prevention): ${event.eventId}`,
      );
      return { received: true, duplicate: true, eventId: event.eventId };
    }

    // 4. Resolve Matching Payment
    let payment = null;
    if (event.providerPaymentId) {
      payment = await this.prisma.payment.findUnique({
        where: { providerPaymentId: event.providerPaymentId },
        include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
      });
    }

    if (!payment && event.providerOrderId) {
      payment = await this.prisma.payment.findFirst({
        where: { providerOrderId: event.providerOrderId },
        include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
      });
    }

    // 5. Atomic State Machine Update & PaymentEvent Logging
    let createdEventId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      // Record raw webhook event first
      await tx.paymentEvent.create({
        data: {
          paymentId: payment ? payment.id : null,
          provider: provider.toUpperCase(),
          eventId: event.eventId,
          eventType: event.eventType,
          payload: payload as unknown as Prisma.InputJsonValue,
          isProcessed: true,
          processedAt: new Date(),
        },
      });

      if (!payment) {
        this.logger.warn(
          `No local payment found matching provider order/payment id: order=${event.providerOrderId}, payment=${event.providerPaymentId}`,
        );
        return;
      }

      // Handle Transitions based on eventType
      if (
        event.eventType === 'payment.captured' ||
        event.eventType === 'order.paid' ||
        event.eventType === 'PAYMENT_CAPTURED'
      ) {
        if (PaymentStateMachine.canTransition(payment.status, PaymentStatus.CAPTURED)) {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.CAPTURED,
              providerPaymentId: event.providerPaymentId || payment.providerPaymentId,
              capturedAt: new Date(),
            },
          });

          // Update latest attempt
          const latestAttempt = payment.attempts?.[0];
          if (latestAttempt) {
            await tx.paymentAttempt.update({
              where: { id: latestAttempt.id },
              data: {
                status: PaymentAttemptStatus.SUCCESS,
                responsePayload: payload as unknown as Prisma.InputJsonValue,
              },
            });
          }

          // Domain & Outbox Event
          createdEventId = await this.domainEventService.createEvent(
            {
              type: DomainEventType.PAYMENT_CAPTURED,
              actorId: payment.payerId,
              entityType: 'Payment',
              entityId: payment.id,
              payload: {
                paymentId: payment.id,
                bookingId: payment.bookingId || undefined,
                amount: Number(payment.amount),
                currency: payment.currency,
                payerId: payment.payerId,
                payeeId: payment.payeeId || undefined,
              },
            },
            tx,
          );
        }
      } else if (
        event.eventType === 'payment.failed' ||
        event.eventType === 'PAYMENT_FAILED'
      ) {
        if (PaymentStateMachine.canTransition(payment.status, PaymentStatus.FAILED)) {
          const failureReason = event.errorDescription || 'Transaction declined';
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.FAILED,
              failureReason,
            },
          });

          const latestAttempt = payment.attempts?.[0];
          if (latestAttempt) {
            await tx.paymentAttempt.update({
              where: { id: latestAttempt.id },
              data: {
                status: PaymentAttemptStatus.FAILED,
                failureReason,
                responsePayload: payload as unknown as Prisma.InputJsonValue,
              },
            });
          }

          createdEventId = await this.domainEventService.createEvent(
            {
              type: DomainEventType.PAYMENT_FAILED,
              actorId: payment.payerId,
              entityType: 'Payment',
              entityId: payment.id,
              payload: {
                paymentId: payment.id,
                bookingId: payment.bookingId || undefined,
                amount: Number(payment.amount),
                currency: payment.currency,
                payerId: payment.payerId,
                reason: failureReason,
              },
            },
            tx,
          );
        }
      }
    });

    if (createdEventId) {
      this.domainEventService
        .processEvent(createdEventId)
        .catch((err: unknown) =>
          this.logger.error(`Domain event dispatch failed from webhook: ${err}`),
        );
    }

    return { received: true, eventId: event.eventId };
  }
}
