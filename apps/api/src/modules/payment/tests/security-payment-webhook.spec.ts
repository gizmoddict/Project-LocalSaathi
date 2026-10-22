// ==============================================================================
// LocalSaathi — Dedicated Security Test Suite: Payment Webhook Defense
// Phase 17: Complete Security Hardening
// ==============================================================================

import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhookService } from '../services/webhook.service';
import { RazorpayProvider } from '../providers/razorpay.provider';
import { PaymentStatus } from '@prisma/client';
import { PaymentStateMachine } from '../payment-state-machine';

describe('Security Test Suite: Payment Webhook Defense (Phase 17)', () => {
  const genuineWebhookSecret = 'genuine_razorpay_webhook_secret_key_123';
  const attackerSecret = 'attacker_forged_webhook_secret_key_456';

  let provider: RazorpayProvider;
  let mockPrisma: any;
  let mockDomainEventService: any;
  let webhookService: WebhookService;

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = genuineWebhookSecret;
    provider = new RazorpayProvider();

    mockPrisma = {
      paymentEvent: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'pevt-1' }),
      },
      payment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      paymentAttempt: {
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
    };

    mockDomainEventService = {
      createEvent: jest.fn().mockResolvedValue('event-uuid'),
      processEvent: jest.fn().mockResolvedValue(undefined),
    };

    webhookService = new WebhookService(mockPrisma, mockDomainEventService, provider);
  });

  describe('1. Webhook Signature Forgery & Timing-Attack Defense', () => {
    it('MUST reject webhooks with forged or invalid HMAC signatures', async () => {
      const payload = {
        event: 'payment.captured',
        id: 'evt_123456789',
        created_at: Math.floor(Date.now() / 1000),
      };
      const rawBody = JSON.stringify(payload);

      // Signed with the wrong key
      const forgedSignature = crypto
        .createHmac('sha256', attackerSecret)
        .update(rawBody)
        .digest('hex');

      await expect(
        webhookService.handleWebhook('razorpay', rawBody, forgedSignature, payload)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('MUST accept authentic webhook signed with genuine secret in constant time', async () => {
      const payload = {
        event: 'payment.captured',
        id: 'evt_valid_123',
        created_at: Math.floor(Date.now() / 1000),
      };
      const rawBody = JSON.stringify(payload);

      const validSignature = crypto
        .createHmac('sha256', genuineWebhookSecret)
        .update(rawBody)
        .digest('hex');

      mockPrisma.paymentEvent.findUnique.mockResolvedValue(null); // Not duplicate

      const result = await webhookService.handleWebhook('razorpay', rawBody, validSignature, payload);
      expect(result.received).toBe(true);
      expect(result.eventId).toBe('evt_valid_123');
    });
  });

  describe('2. Replay Attack & Timestamp Expiry Defense', () => {
    it('MUST ignore and prevent replay of already-processed event IDs', async () => {
      const payload = {
        event: 'payment.captured',
        id: 'evt_already_processed_999',
        created_at: Math.floor(Date.now() / 1000),
      };
      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', genuineWebhookSecret)
        .update(rawBody)
        .digest('hex');

      // Database already has this event
      mockPrisma.paymentEvent.findUnique.mockResolvedValue({
        id: 'local-evt-1',
        eventId: 'evt_already_processed_999',
      });

      const result = await webhookService.handleWebhook('razorpay', rawBody, signature, payload);
      expect(result.duplicate).toBe(true);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('MUST reject stale webhooks with timestamps older than 5 minutes (Clock Drift / Replay)', async () => {
      const staleTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago (over 5 mins)
      const payload = {
        event: 'payment.captured',
        id: 'evt_stale_123',
        created_at: staleTimestamp,
      };
      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', genuineWebhookSecret)
        .update(rawBody)
        .digest('hex');

      await expect(
        webhookService.handleWebhook('razorpay', rawBody, signature, payload)
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('3. Payment State Machine Transition Integrity', () => {
    it('MUST enforce strict FSM transitions: REFUNDED cannot transition to CAPTURED', () => {
      expect(
        PaymentStateMachine.canTransition(PaymentStatus.REFUNDED, PaymentStatus.CAPTURED)
      ).toBe(false);
    });

    it('MUST enforce strict FSM transitions: FAILED cannot transition to CAPTURED', () => {
      expect(
        PaymentStateMachine.canTransition(PaymentStatus.FAILED, PaymentStatus.CAPTURED)
      ).toBe(false);
    });

    it('MUST allow AUTHORIZED to transition to CAPTURED', () => {
      expect(
        PaymentStateMachine.canTransition(PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED)
      ).toBe(true);
    });
  });
});
