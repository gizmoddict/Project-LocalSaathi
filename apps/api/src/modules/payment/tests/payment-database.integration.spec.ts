/**
 * Phase 14 — Payment Infrastructure
 * Real PostgreSQL Database Integration Tests (Docker PostgreSQL 16)
 * Skips gracefully if DB is not reachable.
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

import * as net from 'net';
import { PrismaClient, PaymentStatus, RefundStatus, PayoutStatus } from '@prisma/client';
import { PaymentService } from '../services/payment.service';
import { RefundService } from '../services/refund.service';
import { PayoutService } from '../services/payout.service';
import { WebhookService } from '../services/webhook.service';
import { MockPaymentProvider } from '../providers/mock.provider';
import { DomainEventService } from '../../notification/domain-event.service';
import { PrismaService } from '../../database/database.module';
import { UserRole } from '@localsaathi/types';

describe('Payment Domain — Real PostgreSQL Integration Tests (Phase 14)', () => {
  let prisma: PrismaClient;
  let paymentService: PaymentService;
  let refundService: RefundService;
  let payoutService: PayoutService;
  let webhookService: WebhookService;
  let domainEventService: DomainEventService;
  let mockProvider: MockPaymentProvider;
  let isDatabaseAvailable = false;

  const phoneWorker = `+9199701${Math.floor(10000 + Math.random() * 90000)}`;
  const phoneEmployer = `+9199702${Math.floor(10000 + Math.random() * 90000)}`;
  const phoneAdmin = `+9199703${Math.floor(10000 + Math.random() * 90000)}`;

  let workerUserId: string;
  let employerUserId: string;
  let adminUserId: string;
  let workerProfileId: string;
  let employerProfileId: string;
  let jobId: string;
  let applicationId: string;
  let bookingId: string;

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return;

    const portMatch = dbUrl.match(/:(\d+)\//);
    const hostMatch = dbUrl.match(/@([^:/]+)/);
    const host: string = hostMatch && hostMatch[1] ? hostMatch[1] : 'localhost';
    const port: number = portMatch && portMatch[1] ? parseInt(portMatch[1], 10) : 5432;

    await new Promise<void>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.on('connect', () => {
        isDatabaseAvailable = true;
        socket.destroy();
        resolve();
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        resolve();
      });
      socket.connect(port, host);
    });

    if (!isDatabaseAvailable) {
      console.warn('PostgreSQL is not reachable — skipping Payment DB Integration tests');
      return;
    }

    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    const prismaService = prisma as unknown as PrismaService;
    domainEventService = new DomainEventService(prismaService);
    mockProvider = new MockPaymentProvider();
    paymentService = new PaymentService(prismaService, domainEventService, mockProvider);
    refundService = new RefundService(prismaService, domainEventService, mockProvider);
    payoutService = new PayoutService(prismaService, domainEventService, mockProvider);
    webhookService = new WebhookService(prismaService, domainEventService, mockProvider);

    // Setup Test Fixtures: Worker, Employer, Admin, Job, Booking
    const worker = await prisma.user.create({
      data: {
        phone: phoneWorker,
        role: UserRole.WORKER,
      },
    });
    workerUserId = worker.id;

    const wp = await prisma.workerProfile.create({
      data: {
        userId: workerUserId,
        displayName: 'Payment Test Worker',
        experienceYears: 3,
        expectedWage: 600,
        wageType: 'DAILY',
        isAvailable: true,
      },
    });
    workerProfileId = wp.id;

    const employer = await prisma.user.create({
      data: {
        phone: phoneEmployer,
        role: UserRole.EMPLOYER,
      },
    });
    employerUserId = employer.id;

    const ep = await prisma.employerProfile.create({
      data: {
        userId: employerUserId,
        businessName: 'Payment Test Employer LLC',
        businessType: 'CONTRACTOR',
      },
    });
    employerProfileId = ep.id;

    const admin = await prisma.user.create({
      data: {
        phone: phoneAdmin,
        role: UserRole.ADMIN,
      },
    });
    adminUserId = admin.id;

    const job = await prisma.jobPost.create({
      data: {
        employerProfileId: ep.id,
        title: 'Payment Integration Test Job',
        description: 'Test job description',
        status: 'PUBLISHED',
        category: 'ELECTRICAL',
        wageType: 'DAILY',
        wageAmount: 600,
        workerCount: 1,
        startDate: new Date(),
      },
    });
    jobId = job.id;

    const application = await prisma.jobApplication.create({
      data: {
        jobPostId: job.id,
        workerProfileId: wp.id,
        status: 'ACCEPTED',
      },
    });
    applicationId = application.id;

    const booking = await prisma.booking.create({
      data: {
        jobPostId: job.id,
        applicationId: application.id,
        employerProfileId: ep.id,
        workerProfileId: wp.id,
        status: 'CONFIRMED',
        startDate: new Date(),
        totalAmount: 3500,
      },
    });
    bookingId = booking.id;
  });

  afterAll(async () => {
    if (!isDatabaseAvailable || !prisma) return;

    try {
      await prisma.refund.deleteMany({ where: { payment: { bookingId } } });
      await prisma.paymentAttempt.deleteMany({ where: { payment: { bookingId } } });
      await prisma.paymentEvent.deleteMany({ where: { payment: { bookingId } } });
      await prisma.payment.deleteMany({ where: { bookingId } });
      await prisma.payout.deleteMany({ where: { bookingId } });
      await prisma.booking.deleteMany({ where: { id: bookingId } });
      await prisma.jobApplication.deleteMany({ where: { id: applicationId } });
      await prisma.jobPost.deleteMany({ where: { id: jobId } });
      await prisma.workerProfile.deleteMany({ where: { id: workerProfileId } });
      await prisma.employerProfile.deleteMany({ where: { id: employerProfileId } });
      await prisma.user.deleteMany({ where: { id: { in: [workerUserId, employerUserId, adminUserId] } } });
    } catch (e) {
      // Ignore teardown errors
    } finally {
      await prisma.$disconnect();
    }
  });

  it('1. initiates payment and persists Payment & PaymentAttempt in PostgreSQL', async () => {
    if (!isDatabaseAvailable) return;

    const idempotencyKey = `idemp_test_${Date.now()}`;
    const payment = await paymentService.initiatePayment(
      { id: employerUserId, role: 'EMPLOYER' },
      {
        bookingId,
        amount: 3500,
        currency: 'INR',
        idempotencyKey,
      },
    );

    expect(payment.id).toBeDefined();
    expect(payment.status).toBe(PaymentStatus.INITIATED);
    expect(payment.amount).toBe(3500);
    expect(payment.providerOrderId).toBeDefined();

    // Verify in database
    const dbPayment = await prisma.payment.findUnique({
      where: { id: payment.id },
      include: { attempts: true },
    });

    expect(dbPayment).not.toBeNull();
    expect(dbPayment!.attempts).toHaveLength(1);
    expect(dbPayment!.attempts[0]?.status).toBe('INITIATED');
  });

  it('2. enforces database-level idempotency key uniqueness', async () => {
    if (!isDatabaseAvailable) return;

    const idempotencyKey = `idemp_unique_${Date.now()}`;
    const payment1 = await paymentService.initiatePayment(
      { id: employerUserId, role: 'EMPLOYER' },
      {
        bookingId,
        amount: 2000,
        currency: 'INR',
        idempotencyKey,
      },
    );

    // Exact replay returns identical payment record
    const payment2 = await paymentService.initiatePayment(
      { id: employerUserId, role: 'EMPLOYER' },
      {
        bookingId,
        amount: 2000,
        currency: 'INR',
        idempotencyKey,
      },
    );

    expect(payment1.id).toBe(payment2.id);

    // Conflicting replay throws error
    await expect(
      paymentService.initiatePayment(
        { id: employerUserId, role: 'EMPLOYER' },
        {
          bookingId,
          amount: 5000,
          currency: 'INR',
          idempotencyKey,
        },
      ),
    ).rejects.toThrow();
  });

  it('3. processes webhook to transition payment to CAPTURED and logs PaymentEvent', async () => {
    if (!isDatabaseAvailable) return;

    const idempotencyKey = `idemp_cap_${Date.now()}`;
    const payment = await paymentService.initiatePayment(
      { id: employerUserId, role: 'EMPLOYER' },
      {
        bookingId,
        amount: 4000,
        currency: 'INR',
        idempotencyKey,
      },
    );

    const webhookEventId = `evt_cap_${Date.now()}`;
    const webhookRes = await webhookService.handleWebhook(
      'MOCK',
      'mock_raw_body',
      'valid_mock_signature',
      {
        id: webhookEventId,
        event: 'payment.captured',
        payload: {
          payment: {
            id: `pay_prov_${Date.now()}`,
            order_id: payment.providerOrderId,
            amount: 4000,
            currency: 'INR',
          },
        },
      },
    );

    expect(webhookRes.received).toBe(true);

    // Check DB updated
    const updatedPayment = await prisma.payment.findUnique({
      where: { id: payment.id },
      include: { attempts: true },
    });

    expect(updatedPayment!.status).toBe(PaymentStatus.CAPTURED);
    expect(updatedPayment!.capturedAt).not.toBeNull();
    expect(updatedPayment!.attempts[0]?.status).toBe('SUCCESS');

    // Check PaymentEvent logged
    const loggedEvent = await prisma.paymentEvent.findUnique({
      where: { eventId: webhookEventId },
    });
    expect(loggedEvent).not.toBeNull();
    expect(loggedEvent!.isProcessed).toBe(true);
  });

  it('4. processes partial and full refunds against captured payment in PostgreSQL', async () => {
    if (!isDatabaseAvailable) return;

    // Create and capture payment
    const idempotencyKey = `idemp_rfnd_flow_${Date.now()}`;
    const payment = await paymentService.initiatePayment(
      { id: employerUserId, role: 'EMPLOYER' },
      {
        bookingId,
        amount: 1000,
        currency: 'INR',
        idempotencyKey,
      },
    );

    // Capture payment via direct update for test
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.CAPTURED, capturedAt: new Date() },
    });

    // Partial refund of 400
    const partialRefund = await refundService.processRefund(
      { id: employerUserId, role: 'EMPLOYER' },
      payment.id,
      {
        amount: 400,
        reason: 'Partial cancellation',
        idempotencyKey: `rfnd_part_${Date.now()}`,
      },
    );

    expect(partialRefund.amount).toBe(400);
    expect(partialRefund.status).toBe(RefundStatus.SUCCEEDED);

    const paymentAfterPartial = await prisma.payment.findUnique({
      where: { id: payment.id },
    });
    expect(paymentAfterPartial!.status).toBe(PaymentStatus.CAPTURED); // Still CAPTURED

    // Exceeding refund rejected
    await expect(
      refundService.processRefund(
        { id: employerUserId, role: 'EMPLOYER' },
        payment.id,
        {
          amount: 700, // 400 + 700 = 1100 > 1000
          idempotencyKey: `rfnd_exceed_${Date.now()}`,
        },
      ),
    ).rejects.toThrow();

    // Remaining refund of 600
    const finalRefund = await refundService.processRefund(
      { id: employerUserId, role: 'EMPLOYER' },
      payment.id,
      {
        amount: 600,
        reason: 'Remaining refund',
        idempotencyKey: `rfnd_final_${Date.now()}`,
      },
    );

    expect(finalRefund.amount).toBe(600);

    const paymentAfterFinal = await prisma.payment.findUnique({
      where: { id: payment.id },
    });
    expect(paymentAfterFinal!.status).toBe(PaymentStatus.REFUNDED); // Now fully REFUNDED
  });

  it('5. creates worker payout and verifies Payout record in PostgreSQL', async () => {
    if (!isDatabaseAvailable) return;

    const payoutIdemp = `pout_test_${Date.now()}`;
    const payout = await payoutService.createPayout(
      { id: adminUserId, role: 'ADMIN' },
      {
        bookingId,
        workerId: workerUserId,
        amount: 3000,
        currency: 'INR',
        idempotencyKey: payoutIdemp,
      },
    );

    expect(payout.id).toBeDefined();
    expect(payout.status).toBe(PayoutStatus.PAID);
    expect(payout.amount).toBe(3000);

    const dbPayout = await prisma.payout.findUnique({
      where: { id: payout.id },
    });
    expect(dbPayout).not.toBeNull();
    expect(dbPayout!.workerId).toBe(workerUserId);
  });

  it('6. safely ignores duplicate webhook events (replay prevention)', async () => {
    if (!isDatabaseAvailable) return;

    const eventId = `evt_dup_${Date.now()}`;
    const res1 = await webhookService.handleWebhook(
      'MOCK',
      'mock_raw_body',
      'valid_mock_signature',
      {
        id: eventId,
        event: 'payment.captured',
        payload: {},
      },
    );
    expect(res1.received).toBe(true);
    expect(res1.duplicate).toBeUndefined();

    // Second call with same eventId
    const res2 = await webhookService.handleWebhook(
      'MOCK',
      'mock_raw_body',
      'valid_mock_signature',
      {
        id: eventId,
        event: 'payment.captured',
        payload: {},
      },
    );
    expect(res2.received).toBe(true);
    expect(res2.duplicate).toBe(true);
  });
});
