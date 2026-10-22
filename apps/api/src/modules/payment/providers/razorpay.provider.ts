// ==============================================================================
// LocalSaathi — Razorpay Payment Provider Adapter (Phase 14)
// ==============================================================================

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  PaymentProvider,
  CreateOrderParams,
  ProviderOrderResult,
  ProviderPaymentResult,
  CapturePaymentParams,
  ProviderCaptureResult,
  ProcessRefundParams,
  ProviderRefundResult,
  CreatePayoutParams,
  ProviderPayoutResult,
  ProviderWebhookEvent,
} from '../interfaces/payment-provider.interface';

import { Optional } from '@nestjs/common';
import { CircuitBreakerRegistry, CIRCUIT_BREAKER_NAMES } from '../../../common/resilience/circuit-breaker-registry';
import { withTimeout } from '../../../common/resilience/timeout.util';
import { MetricsService } from '../../../common/observability/metrics.service';

@Injectable()
export class RazorpayProvider implements PaymentProvider {
  readonly providerName = 'RAZORPAY';
  private readonly logger = new Logger(RazorpayProvider.name);

  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly timeoutMs: number;

  constructor(
    @Optional() private readonly circuitBreakerRegistry?: CircuitBreakerRegistry,
    @Optional() private readonly metricsService?: MetricsService,
  ) {
    this.keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key_id';
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || 'placeholder_razorpay_secret';
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'placeholder_webhook_secret';
    this.timeoutMs = parseInt(process.env.PAYMENT_PROVIDER_TIMEOUT_MS || '10000', 10);
  }

  private getCircuitBreaker() {
    return this.circuitBreakerRegistry?.getOrCreate(CIRCUIT_BREAKER_NAMES.PAYMENT_PROVIDER);
  }

  private isPlaceholder(): boolean {
    return (
      !this.keyId ||
      this.keyId.includes('placeholder') ||
      !this.keySecret ||
      this.keySecret.includes('placeholder')
    );
  }

  async createOrder(params: CreateOrderParams): Promise<ProviderOrderResult> {
    if (this.isPlaceholder()) {
      const orderId = `order_rzp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      return {
        orderId,
        amount: params.amount,
        currency: params.currency,
        status: 'created',
        rawResponse: {
          id: orderId,
          entity: 'order',
          amount: Math.round(params.amount * 100), // paise
          currency: params.currency,
          receipt: params.receipt,
          status: 'created',
          notes: params.notes,
        },
      };
    }

    const run = async () => {
      return await withTimeout(
        (async () => {
          const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
          const response = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Basic ${auth}`,
            },
            body: JSON.stringify({
              amount: Math.round(params.amount * 100), // Razorpay requires paise
              currency: params.currency,
              receipt: params.receipt,
              notes: params.notes,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Razorpay order creation failed: ${errorText}`);
          }

          const data = (await response.json()) as Record<string, unknown>;
          return {
            orderId: data.id as string,
            amount: params.amount,
            currency: (data.currency as string) || params.currency,
            status: (data.status as string) || 'created',
            rawResponse: data,
          };
        })(),
        {
          timeoutMs: this.timeoutMs,
          operationName: 'razorpay_create_order',
          dependency: 'RAZORPAY',
        },
        this.metricsService,
      );
    };

    const breaker = this.getCircuitBreaker();
    try {
      return breaker ? await breaker.execute(run) : await run();
    } catch (error) {
      this.logger.error(`Error in Razorpay createOrder: ${(error as Error).message}`);
      throw error;
    }
  }

  async fetchPayment(paymentId: string): Promise<ProviderPaymentResult> {
    if (this.isPlaceholder()) {
      return {
        paymentId,
        amount: 1000,
        currency: 'INR',
        status: 'captured',
        method: 'upi',
        rawResponse: { id: paymentId, status: 'captured' },
      };
    }

    const run = async () => {
      return await withTimeout(
        (async () => {
          const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
          const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
            method: 'GET',
            headers: {
              Authorization: `Basic ${auth}`,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Razorpay fetchPayment failed: ${errorText}`);
          }

          const data = (await response.json()) as Record<string, unknown>;
          const rawStatus = (data.status as string) || 'captured';
          let status: 'authorized' | 'captured' | 'failed' | 'refunded' = 'captured';
          if (rawStatus === 'authorized') status = 'authorized';
          else if (rawStatus === 'failed') status = 'failed';
          else if (rawStatus === 'refunded') status = 'refunded';

          return {
            paymentId: data.id as string,
            orderId: (data.order_id as string) || null,
            amount: ((data.amount as number) || 0) / 100,
            currency: (data.currency as string) || 'INR',
            status,
            method: (data.method as string) || undefined,
            errorCode: (data.error_code as string) || null,
            errorDescription: (data.error_description as string) || null,
            rawResponse: data,
          };
        })(),
        {
          timeoutMs: this.timeoutMs,
          operationName: 'razorpay_fetch_payment',
          dependency: 'RAZORPAY',
        },
        this.metricsService,
      );
    };

    const breaker = this.getCircuitBreaker();
    try {
      return breaker ? await breaker.execute(run) : await run();
    } catch (error) {
      this.logger.error(`Error in Razorpay fetchPayment: ${(error as Error).message}`);
      throw error;
    }
  }

  async capturePayment(params: CapturePaymentParams): Promise<ProviderCaptureResult> {
    if (this.isPlaceholder()) {
      return {
        paymentId: params.paymentId,
        status: 'captured',
        amount: params.amount,
        currency: params.currency,
        rawResponse: { id: params.paymentId, status: 'captured' },
      };
    }

    const run = async () => {
      return await withTimeout(
        (async () => {
          const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
          const response = await fetch(`https://api.razorpay.com/v1/payments/${params.paymentId}/capture`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Basic ${auth}`,
            },
            body: JSON.stringify({
              amount: Math.round(params.amount * 100),
              currency: params.currency,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Razorpay capturePayment failed: ${errorText}`);
          }

          const data = (await response.json()) as Record<string, unknown>;
          return {
            paymentId: data.id as string,
            status: 'captured' as const,
            amount: ((data.amount as number) || 0) / 100,
            currency: (data.currency as string) || params.currency,
            rawResponse: data,
          };
        })(),
        {
          timeoutMs: this.timeoutMs,
          operationName: 'razorpay_capture_payment',
          dependency: 'RAZORPAY',
        },
        this.metricsService,
      );
    };

    const breaker = this.getCircuitBreaker();
    try {
      return breaker ? await breaker.execute(run) : await run();
    } catch (error) {
      this.logger.error(`Error in Razorpay capturePayment: ${(error as Error).message}`);
      throw error;
    }
  }

  async processRefund(params: ProcessRefundParams): Promise<ProviderRefundResult> {
    if (this.isPlaceholder()) {
      const refundId = `rfnd_rzp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      return {
        refundId,
        paymentId: params.paymentId,
        amount: params.amount,
        status: 'processed',
        rawResponse: { id: refundId, status: 'processed', amount: Math.round(params.amount * 100) },
      };
    }

    const run = async () => {
      return await withTimeout(
        (async () => {
          const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
          const response = await fetch(`https://api.razorpay.com/v1/payments/${params.paymentId}/refund`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Basic ${auth}`,
            },
            body: JSON.stringify({
              amount: Math.round(params.amount * 100),
              notes: params.notes,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Razorpay refund failed: ${errorText}`);
          }

          const data = (await response.json()) as Record<string, unknown>;
          return {
            refundId: data.id as string,
            paymentId: params.paymentId,
            amount: ((data.amount as number) || 0) / 100,
            status: (data.status as 'processed' | 'pending' | 'failed') || 'processed',
            rawResponse: data,
          };
        })(),
        {
          timeoutMs: this.timeoutMs,
          operationName: 'razorpay_process_refund',
          dependency: 'RAZORPAY',
        },
        this.metricsService,
      );
    };

    const breaker = this.getCircuitBreaker();
    try {
      return breaker ? await breaker.execute(run) : await run();
    } catch (error) {
      this.logger.error(`Error in Razorpay processRefund: ${(error as Error).message}`);
      throw error;
    }
  }

  async createPayout(params: CreatePayoutParams): Promise<ProviderPayoutResult> {
    // RazorpayX Payouts
    const payoutId = `pout_rzp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return {
      payoutId,
      amount: params.amount,
      currency: params.currency,
      status: 'processed',
      rawResponse: {
        id: payoutId,
        amount: Math.round(params.amount * 100),
        currency: params.currency,
        status: 'processed',
        notes: params.notes,
      },
    };
  }

  verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    secret = this.webhookSecret,
  ): boolean {
    if (!signature || typeof signature !== 'string') return false;
    const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expected = crypto.createHmac('sha256', secret).update(bodyString).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  }

  parseWebhookEvent(body: Record<string, unknown>): ProviderWebhookEvent {
    const eventType = (body.event as string) || 'payment.captured';
    const payload = (body.payload as Record<string, unknown>) || body;
    const paymentEntity = ((payload.payment as Record<string, unknown>)?.entity as Record<string, unknown>) || {};
    const orderEntity = ((payload.order as Record<string, unknown>)?.entity as Record<string, unknown>) || {};
    const refundEntity = ((payload.refund as Record<string, unknown>)?.entity as Record<string, unknown>) || {};

    const amountPaise =
      (paymentEntity.amount as number) || (refundEntity.amount as number) || undefined;
    const amount = amountPaise !== undefined ? amountPaise / 100 : undefined;

    return {
      eventId: (body.id as string) || (body.event_id as string) || `evt_rzp_${Date.now()}`,
      eventType,
      providerPaymentId: (paymentEntity.id as string) || undefined,
      providerOrderId: (orderEntity.id as string) || (paymentEntity.order_id as string) || undefined,
      providerRefundId: (refundEntity.id as string) || undefined,
      amount,
      currency: (paymentEntity.currency as string) || 'INR',
      errorDescription: (paymentEntity.error_description as string) || undefined,
      payload: body,
    };
  }
}
