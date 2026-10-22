import { PaymentStatus } from '@prisma/client';
import { PaymentStateMachine } from '../payment-state-machine';
import { MockPaymentProvider } from '../providers/mock.provider';
import { PaymentService } from '../services/payment.service';
import { RefundService } from '../services/refund.service';
import { ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('Payment Unit Tests (Phase 14)', () => {
  describe('PaymentStateMachine', () => {
    it('allows valid forward transitions', () => {
      expect(PaymentStateMachine.canTransition(PaymentStatus.INITIATED, PaymentStatus.AUTHORIZED)).toBe(true);
      expect(PaymentStateMachine.canTransition(PaymentStatus.INITIATED, PaymentStatus.CAPTURED)).toBe(true);
      expect(PaymentStateMachine.canTransition(PaymentStatus.INITIATED, PaymentStatus.FAILED)).toBe(true);
      expect(PaymentStateMachine.canTransition(PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED)).toBe(true);
      expect(PaymentStateMachine.canTransition(PaymentStatus.AUTHORIZED, PaymentStatus.FAILED)).toBe(true);
      expect(PaymentStateMachine.canTransition(PaymentStatus.CAPTURED, PaymentStatus.REFUNDED)).toBe(true);
      expect(PaymentStateMachine.canTransition(PaymentStatus.CAPTURED, PaymentStatus.DISPUTED)).toBe(true);
      expect(PaymentStateMachine.canTransition(PaymentStatus.DISPUTED, PaymentStatus.REFUNDED)).toBe(true);
      expect(PaymentStateMachine.canTransition(PaymentStatus.DISPUTED, PaymentStatus.CAPTURED)).toBe(true);
    });

    it('allows self-transition (idempotent)', () => {
      expect(PaymentStateMachine.canTransition(PaymentStatus.INITIATED, PaymentStatus.INITIATED)).toBe(true);
      expect(PaymentStateMachine.canTransition(PaymentStatus.CAPTURED, PaymentStatus.CAPTURED)).toBe(true);
    });

    it('rejects invalid transitions and illegal jumps', () => {
      expect(PaymentStateMachine.canTransition(PaymentStatus.INITIATED, PaymentStatus.REFUNDED)).toBe(false);
      expect(PaymentStateMachine.canTransition(PaymentStatus.INITIATED, PaymentStatus.DISPUTED)).toBe(false);
      expect(PaymentStateMachine.canTransition(PaymentStatus.FAILED, PaymentStatus.CAPTURED)).toBe(false);
      expect(PaymentStateMachine.canTransition(PaymentStatus.FAILED, PaymentStatus.INITIATED)).toBe(false);
      expect(PaymentStateMachine.canTransition(PaymentStatus.REFUNDED, PaymentStatus.CAPTURED)).toBe(false);
    });

    it('correctly reports terminal states', () => {
      expect(PaymentStateMachine.isTerminal(PaymentStatus.FAILED)).toBe(true);
      expect(PaymentStateMachine.isTerminal(PaymentStatus.REFUNDED)).toBe(true);
      expect(PaymentStateMachine.isTerminal(PaymentStatus.INITIATED)).toBe(false);
      expect(PaymentStateMachine.isTerminal(PaymentStatus.CAPTURED)).toBe(false);
    });

    it('assertCanTransition throws on illegal transitions', () => {
      expect(() =>
        PaymentStateMachine.assertCanTransition(PaymentStatus.FAILED, PaymentStatus.CAPTURED),
      ).toThrow();
    });
  });

  describe('MockPaymentProvider', () => {
    let provider: MockPaymentProvider;

    beforeEach(() => {
      provider = new MockPaymentProvider();
    });

    it('creates order with valid parameters', async () => {
      const order = await provider.createOrder({
        amount: 2500,
        currency: 'INR',
        receipt: 'rec_123',
      });

      expect(order.orderId).toBeDefined();
      expect(order.amount).toBe(2500);
      expect(order.status).toBe('created');
    });

    it('captures payment successfully', async () => {
      const capture = await provider.capturePayment({
        paymentId: 'pay_test_1',
        amount: 1500,
        currency: 'INR',
      });

      expect(capture.paymentId).toBe('pay_test_1');
      expect(capture.status).toBe('captured');
      expect(capture.amount).toBe(1500);
    });

    it('processes refund successfully', async () => {
      const refund = await provider.processRefund({
        paymentId: 'pay_test_1',
        amount: 500,
      });

      expect(refund.refundId).toBeDefined();
      expect(refund.status).toBe('processed');
      expect(refund.amount).toBe(500);
    });

    it('creates payout successfully', async () => {
      const payout = await provider.createPayout({
        workerId: 'worker_1',
        amount: 2000,
        currency: 'INR',
      });

      expect(payout.payoutId).toBeDefined();
      expect(payout.status).toBe('processed');
    });

    it('verifies webhook HMAC signatures correctly', () => {
      expect(provider.verifyWebhookSignature('payload_string', 'valid_mock_signature')).toBe(true);
      expect(provider.verifyWebhookSignature('payload_string', 'invalid_signature', 'key')).toBe(false);
    });

    it('parses webhook events uniformly', () => {
      const parsed = provider.parseWebhookEvent({
        id: 'evt_test_123',
        event: 'payment.captured',
        payload: {
          payment: { id: 'pay_123', amount: 3000, currency: 'INR' },
        },
      });

      expect(parsed.eventId).toBe('evt_test_123');
      expect(parsed.eventType).toBe('payment.captured');
      expect(parsed.providerPaymentId).toBe('pay_123');
      expect(parsed.amount).toBe(3000);
    });
  });

  describe('PaymentService Idempotency & Auth Guards', () => {
    let service: PaymentService;
    let mockPrisma: any;
    let mockDomainEvents: any;
    let mockProvider: MockPaymentProvider;

    beforeEach(() => {
      mockPrisma = {
        booking: { findUnique: jest.fn() },
        payment: { findUnique: jest.fn(), create: jest.fn(), $transaction: jest.fn() },
        paymentAttempt: { create: jest.fn() },
      };
      mockDomainEvents = {
        createEvent: jest.fn().mockResolvedValue('evt_id_1'),
        processEvent: jest.fn().mockResolvedValue(undefined),
      };
      mockProvider = new MockPaymentProvider();

      service = new PaymentService(mockPrisma, mockDomainEvents, mockProvider);
    });

    it('throws NotFoundException when booking does not exist', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(null);

      await expect(
        service.initiatePayment(
          { id: 'user_1', role: 'EMPLOYER' },
          { bookingId: '00000000-0000-0000-0000-000000000000', amount: 1000, idempotencyKey: 'idemp_key_123' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-employer attempts to initiate payment', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'booking_1',
        status: 'CONFIRMED',
        employerProfile: { userId: 'different_user' },
        workerProfile: { userId: 'worker_1' },
      });

      await expect(
        service.initiatePayment(
          { id: 'user_1', role: 'EMPLOYER' },
          { bookingId: 'booking_1', amount: 1000, idempotencyKey: 'idemp_key_123' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns existing payment when idempotency key matches identical parameters', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'booking_1',
        status: 'CONFIRMED',
        employerProfile: { userId: 'user_1' },
        workerProfile: { userId: 'worker_1' },
      });

      mockPrisma.payment.findUnique.mockResolvedValue({
        id: 'pay_existing_1',
        payerId: 'user_1',
        payeeId: 'worker_1',
        bookingId: 'booking_1',
        provider: 'MOCK',
        amount: 1000,
        currency: 'INR',
        status: 'INITIATED',
        idempotencyKey: 'idemp_key_123',
        createdAt: new Date(),
        updatedAt: new Date(),
        attempts: [],
        refunds: [],
      });

      const res = await service.initiatePayment(
        { id: 'user_1', role: 'EMPLOYER' },
        { bookingId: 'booking_1', amount: 1000, idempotencyKey: 'idemp_key_123' },
      );

      expect(res.id).toBe('pay_existing_1');
      expect(res.amount).toBe(1000);
    });

    it('throws ConflictException when idempotency key is reused with conflicting amount', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'booking_1',
        status: 'CONFIRMED',
        employerProfile: { userId: 'user_1' },
        workerProfile: { userId: 'worker_1' },
      });

      mockPrisma.payment.findUnique.mockResolvedValue({
        id: 'pay_existing_1',
        bookingId: 'booking_1',
        amount: 1000, // original was 1000
        idempotencyKey: 'idemp_key_123',
      });

      await expect(
        service.initiatePayment(
          { id: 'user_1', role: 'EMPLOYER' },
          { bookingId: 'booking_1', amount: 5000, idempotencyKey: 'idemp_key_123' }, // requesting with 5000
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('RefundService Guard Checks', () => {
    let refundService: RefundService;
    let mockPrisma: any;
    let mockDomainEvents: any;
    let mockProvider: MockPaymentProvider;

    beforeEach(() => {
      mockPrisma = {
        payment: { findUnique: jest.fn(), update: jest.fn() },
        refund: { findUnique: jest.fn(), create: jest.fn() },
      };
      mockDomainEvents = {
        createEvent: jest.fn().mockResolvedValue('evt_id_1'),
        processEvent: jest.fn().mockResolvedValue(undefined),
      };
      mockProvider = new MockPaymentProvider();

      refundService = new RefundService(mockPrisma, mockDomainEvents, mockProvider);
    });

    it('rejects refund when payment is not CAPTURED', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: 'pay_1',
        payerId: 'user_1',
        status: PaymentStatus.INITIATED, // Not captured yet
        amount: 2000,
        refunds: [],
      });

      await expect(
        refundService.processRefund(
          { id: 'user_1', role: 'EMPLOYER' },
          'pay_1',
          { amount: 500, idempotencyKey: 'rfnd_key_1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects refund when requested amount exceeds captured balance', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: 'pay_1',
        payerId: 'user_1',
        status: PaymentStatus.CAPTURED,
        amount: 2000,
        refunds: [
          { status: 'SUCCEEDED', amount: 1500 }, // 1500 already refunded, only 500 remains
        ],
      });
      mockPrisma.refund.findUnique.mockResolvedValue(null);

      await expect(
        refundService.processRefund(
          { id: 'user_1', role: 'EMPLOYER' },
          'pay_1',
          { amount: 600, idempotencyKey: 'rfnd_key_1' }, // 600 > 500
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
