// ==============================================================================
// LocalSaathi — Mock Payment Provider (Phase 14)
// Deterministic Sandbox & Testing Adapter
// ==============================================================================

import { Injectable } from '@nestjs/common';
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

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly providerName = 'MOCK';

  private orders: Map<string, ProviderOrderResult> = new Map();
  private payments: Map<string, ProviderPaymentResult> = new Map();
  private refunds: Map<string, ProviderRefundResult> = new Map();
  private payouts: Map<string, ProviderPayoutResult> = new Map();

  async createOrder(params: CreateOrderParams): Promise<ProviderOrderResult> {
    if (params.amount <= 0) {
      throw new Error('Order amount must be positive');
    }

    const orderId = `order_mock_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const result: ProviderOrderResult = {
      orderId,
      amount: params.amount,
      currency: params.currency,
      status: 'created',
      rawResponse: {
        id: orderId,
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
        created_at: Math.floor(Date.now() / 1000),
      },
    };

    this.orders.set(orderId, result);
    return result;
  }

  async fetchPayment(paymentId: string): Promise<ProviderPaymentResult> {
    const existing = this.payments.get(paymentId);
    if (existing) {
      return existing;
    }

    return {
      paymentId,
      amount: 1000,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
      rawResponse: { id: paymentId, status: 'captured' },
    };
  }

  async capturePayment(params: CapturePaymentParams): Promise<ProviderCaptureResult> {
    const paymentId = params.paymentId || `pay_mock_${Date.now()}`;
    const result: ProviderCaptureResult = {
      paymentId,
      status: 'captured',
      amount: params.amount,
      currency: params.currency,
      rawResponse: {
        id: paymentId,
        amount: params.amount,
        currency: params.currency,
        status: 'captured',
      },
    };

    this.payments.set(paymentId, {
      paymentId,
      amount: params.amount,
      currency: params.currency,
      status: 'captured',
    });

    return result;
  }

  async processRefund(params: ProcessRefundParams): Promise<ProviderRefundResult> {
    const refundId = `rfnd_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const result: ProviderRefundResult = {
      refundId,
      paymentId: params.paymentId,
      amount: params.amount,
      status: 'processed',
      rawResponse: {
        id: refundId,
        payment_id: params.paymentId,
        amount: params.amount,
        status: 'processed',
      },
    };

    this.refunds.set(refundId, result);
    return result;
  }

  async createPayout(params: CreatePayoutParams): Promise<ProviderPayoutResult> {
    const payoutId = `pout_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const result: ProviderPayoutResult = {
      payoutId,
      amount: params.amount,
      currency: params.currency,
      status: 'processed',
      rawResponse: {
        id: payoutId,
        worker_id: params.workerId,
        amount: params.amount,
        status: 'processed',
      },
    };

    this.payouts.set(payoutId, result);
    return result;
  }

  verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    secret = 'mock_secret_key',
  ): boolean {
    if (!signature || typeof signature !== 'string') return false;
    if (signature === 'valid_mock_signature') return true;

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
    const paymentObj = (payload.payment as Record<string, unknown>) || payload;
    const orderObj = (payload.order as Record<string, unknown>) || {};
    const refundObj = (payload.refund as Record<string, unknown>) || {};

    return {
      eventId: (body.id as string) || (body.event_id as string) || `evt_mock_${Date.now()}`,
      eventType,
      providerPaymentId: (paymentObj.id as string) || undefined,
      providerOrderId: (orderObj.id as string) || (paymentObj.order_id as string) || undefined,
      providerRefundId: (refundObj.id as string) || undefined,
      amount: (paymentObj.amount as number) || (refundObj.amount as number) || undefined,
      currency: (paymentObj.currency as string) || 'INR',
      errorDescription: (paymentObj.error_description as string) || undefined,
      payload: body,
    };
  }
}
