import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from '../payment.controller';
import { PaymentService } from '../services/payment.service';
import { RefundService } from '../services/refund.service';
import { PayoutService } from '../services/payout.service';
import { WebhookService } from '../services/webhook.service';
import { ReconciliationService } from '../services/reconciliation.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

describe('Payment API Controller & RBAC Tests (Phase 14)', () => {
  let controller: PaymentController;
  let mockPaymentService: any;
  let mockRefundService: any;
  let mockPayoutService: any;
  let mockWebhookService: any;
  let mockReconciliationService: any;

  beforeEach(async () => {
    mockPaymentService = {
      initiatePayment: jest.fn(),
      listUserPayments: jest.fn(),
      getPaymentById: jest.fn(),
      getPaymentEvents: jest.fn(),
    };
    mockRefundService = {
      processRefund: jest.fn(),
    };
    mockPayoutService = {
      createPayout: jest.fn(),
      listWorkerPayouts: jest.fn(),
    };
    mockWebhookService = {
      handleWebhook: jest.fn(),
    };
    mockReconciliationService = {
      runReconciliation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: RefundService, useValue: mockRefundService },
        { provide: PayoutService, useValue: mockPayoutService },
        { provide: WebhookService, useValue: mockWebhookService },
        { provide: ReconciliationService, useValue: mockReconciliationService },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PaymentController>(PaymentController);
  });

  describe('Payment Initiation Controller Endpoint', () => {
    it('initiates payment when payload is valid', async () => {
      const validPayload = {
        bookingId: '00000000-0000-0000-0000-000000000001',
        amount: 1500,
        currency: 'INR',
        idempotencyKey: 'idemp_key_valid_123',
      };

      mockPaymentService.initiatePayment.mockResolvedValue({
        id: 'pay_123',
        amount: 1500,
        status: 'INITIATED',
      });

      const res = await controller.initiatePayment(
        { user: { id: 'employer_1', role: 'EMPLOYER' } },
        validPayload,
      );

      expect(res.id).toBe('pay_123');
      expect(mockPaymentService.initiatePayment).toHaveBeenCalledWith(
        { id: 'employer_1', role: 'EMPLOYER' },
        validPayload,
      );
    });

    it('rejects invalid payload schema with BadRequestException', async () => {
      const invalidPayload = {
        bookingId: 'not-a-uuid',
        amount: -50, // invalid negative amount
        idempotencyKey: 'short', // less than 8 chars
      };

      await expect(
        controller.initiatePayment(
          { user: { id: 'employer_1', role: 'EMPLOYER' } },
          invalidPayload,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Refund Controller Endpoint', () => {
    it('processes valid refund request', async () => {
      const refundPayload = {
        amount: 500,
        reason: 'Job completed early',
        idempotencyKey: 'idemp_rfnd_123',
      };

      mockRefundService.processRefund.mockResolvedValue({
        id: 'rfnd_1',
        amount: 500,
        status: 'SUCCEEDED',
      });

      const res = await controller.requestRefund(
        { user: { id: 'employer_1', role: 'EMPLOYER' } },
        'pay_123',
        refundPayload,
      );

      expect(res.id).toBe('rfnd_1');
      expect(mockRefundService.processRefund).toHaveBeenCalledWith(
        { id: 'employer_1', role: 'EMPLOYER' },
        'pay_123',
        refundPayload,
      );
    });

    it('rejects invalid refund schema with BadRequestException', async () => {
      await expect(
        controller.requestRefund(
          { user: { id: 'employer_1', role: 'EMPLOYER' } },
          'pay_123',
          { amount: -100, idempotencyKey: 'short' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Worker Payout Controller Endpoint', () => {
    it('processes valid payout for admin', async () => {
      const payoutPayload = {
        workerId: '00000000-0000-0000-0000-000000000002',
        amount: 2500,
        currency: 'INR',
        idempotencyKey: 'payout_idemp_key_1',
      };

      mockPayoutService.createPayout.mockResolvedValue({
        id: 'pout_1',
        amount: 2500,
        status: 'PAID',
      });

      const res = await controller.createPayout(
        { user: { id: 'admin_1', role: 'ADMIN' } },
        payoutPayload,
      );

      expect(res.id).toBe('pout_1');
      expect(mockPayoutService.createPayout).toHaveBeenCalledWith(
        { id: 'admin_1', role: 'ADMIN' },
        payoutPayload,
      );
    });

    it('retrieves worker payout history', async () => {
      mockPayoutService.listWorkerPayouts.mockResolvedValue([
        { id: 'pout_1', amount: 1500, status: 'PAID' },
      ]);

      const res = await controller.listWorkerPayouts(
        { user: { id: 'worker_1', role: 'WORKER' } },
      );

      expect(res).toHaveLength(1);
      expect(mockPayoutService.listWorkerPayouts).toHaveBeenCalledWith(
        { id: 'worker_1', role: 'WORKER' },
        undefined,
      );
    });
  });

  describe('Webhook Ingress Endpoint', () => {
    it('processes webhook with valid signature successfully', async () => {
      mockWebhookService.handleWebhook.mockResolvedValue({
        received: true,
        eventId: 'evt_123',
      });

      const res = await controller.handleWebhook(
        'razorpay',
        'valid_signature',
        undefined,
        {},
        { id: 'evt_123', event: 'payment.captured' },
      );

      expect(res.received).toBe(true);
      expect(mockWebhookService.handleWebhook).toHaveBeenCalled();
    });

    it('rejects webhook when signature service rejects it', async () => {
      mockWebhookService.handleWebhook.mockRejectedValue(
        new UnauthorizedException('Invalid payment webhook signature'),
      );

      await expect(
        controller.handleWebhook(
          'razorpay',
          'bad_sig',
          undefined,
          {},
          { id: 'evt_123' },
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Reconciliation Endpoint', () => {
    it('executes reconciliation report generation', async () => {
      mockReconciliationService.runReconciliation.mockResolvedValue({
        timestamp: new Date().toISOString(),
        totalChecked: 10,
        matched: 10,
        discrepancies: [],
      });

      const res = await controller.getReconciliation();
      expect(res.matched).toBe(10);
      expect(res.discrepancies).toHaveLength(0);
    });
  });
});
