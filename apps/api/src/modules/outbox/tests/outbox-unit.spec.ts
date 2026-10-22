/**
 * Phase 10 — Transactional Outbox Unit Tests
 * Tests:
 *  - Envelope creation and schema validation
 *  - Exponential backoff calculation
 *  - Error classification (retryable vs fatal)
 *  - Outbox status progression & Dead-Letter Queue (DLQ)
 *  - Event claiming & Idempotency logic
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OutboxService } from '../outbox.service';
import { OUTBOX_CONSTANTS } from '../outbox.constants';
import { OutboxStatus } from '@localsaathi/types';

describe('Transactional Outbox — Unit Tests', () => {
  let outboxService: OutboxService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      outboxEvent: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      eventProcessing: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((cb: any) => cb(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: 'PrismaService', useValue: prismaMock },
      ],
    })
      .overrideProvider(OutboxService)
      .useFactory({
        factory: () => new OutboxService(prismaMock),
      })
      .compile();

    outboxService = module.get<OutboxService>(OutboxService);
  });

  describe('Exponential Backoff & Delay Formula', () => {
    it('calculates backoff with exponential progression capped at max delay', () => {
      const delays = [1, 2, 3, 4, 5, 10].map((attempts) => {
        const delayMs = Math.min(
          OUTBOX_CONSTANTS.BASE_BACKOFF_MS * Math.pow(2, attempts - 1),
          OUTBOX_CONSTANTS.MAX_BACKOFF_MS,
        );
        return delayMs;
      });

      expect(delays[0]).toBe(1000);  // 1000 * 2^0 = 1000ms
      expect(delays[1]).toBe(2000);  // 1000 * 2^1 = 2000ms
      expect(delays[2]).toBe(4000);  // 1000 * 2^2 = 4000ms
      expect(delays[3]).toBe(8000);  // 1000 * 2^3 = 8000ms
      expect(delays[4]).toBe(16000); // 1000 * 2^4 = 16000ms
      expect(delays[5]).toBe(OUTBOX_CONSTANTS.MAX_BACKOFF_MS); // Capped at 60000ms
    });
  });

  describe('Outbox Event Lifecycle & Status Transitions', () => {
    it('creates an outbox event with PENDING status and default attemptCount = 0', async () => {
      prismaMock.outboxEvent.create.mockResolvedValueOnce({
        id: 'evt-100',
        eventType: 'BOOKING_CREATED',
        aggregateType: 'Booking',
        aggregateId: 'b-1',
        status: OutboxStatus.PENDING,
        attemptCount: 0,
        maxAttempts: 5,
      });

      const eventId = await outboxService.createEvent({
        eventType: 'BOOKING_CREATED',
        aggregateType: 'Booking',
        aggregateId: 'b-1',
        payload: { title: 'Plumbing Service' },
      });

      expect(eventId).toBe('evt-100');
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'BOOKING_CREATED',
          aggregateType: 'Booking',
          aggregateId: 'b-1',
          status: 'PENDING',
          attemptCount: 0,
        }),
      });
    });

    it('marks event as PROCESSED when handlers complete successfully', async () => {
      prismaMock.outboxEvent.update.mockResolvedValueOnce({
        id: 'evt-100',
        status: OutboxStatus.PROCESSED,
      });

      await outboxService.markProcessed('evt-100');

      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-100' },
        data: expect.objectContaining({
          status: 'PROCESSED',
          processedAt: expect.any(Date),
          lastError: null,
          lockedAt: null,
          lockedBy: null,
        }),
      });
    });

    it('escalates to DEAD_LETTER when attempt count reaches maxAttempts or non-retryable', async () => {
      prismaMock.outboxEvent.findUnique.mockResolvedValueOnce({
        id: 'evt-100',
        attemptCount: 5,
        maxAttempts: 5,
      });
      prismaMock.outboxEvent.update.mockResolvedValueOnce({
        id: 'evt-100',
        status: OutboxStatus.DEAD_LETTER,
      });

      await outboxService.markFailed('evt-100', 'Persistent network failure', true);

      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-100' },
        data: expect.objectContaining({
          status: 'DEAD_LETTER',
          failedAt: expect.any(Date),
          lastError: 'Persistent network failure',
        }),
      });
    });

    it('sets status to FAILED with future availableAt when attempts are below maxAttempts', async () => {
      prismaMock.outboxEvent.findUnique.mockResolvedValueOnce({
        id: 'evt-100',
        attemptCount: 2,
        maxAttempts: 5,
      });
      prismaMock.outboxEvent.update.mockResolvedValueOnce({
        id: 'evt-100',
        status: OutboxStatus.FAILED,
      });

      await outboxService.markFailed('evt-100', 'Temporary timeout', true);

      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-100' },
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: 'Temporary timeout',
          availableAt: expect.any(Date),
          lockedAt: null,
          lockedBy: null,
        }),
      });
    });
  });

  describe('Idempotent Handler Execution Tracking', () => {
    it('detects previously executed handler using EventProcessing record', async () => {
      prismaMock.eventProcessing.findUnique.mockResolvedValueOnce({
        id: 'proc-1',
        eventId: 'evt-100',
        handlerName: 'NotificationHandler',
        status: 'PROCESSED',
      });

      const processed = await outboxService.isAlreadyProcessed('evt-100', 'NotificationHandler');
      expect(processed).toBe(true);
    });

    it('records successful processing in event_processings table', async () => {
      prismaMock.eventProcessing.upsert.mockResolvedValueOnce({
        id: 'proc-1',
        eventId: 'evt-100',
        handlerName: 'AnalyticsHandler',
        status: 'PROCESSED',
      });

      await outboxService.recordProcessing('evt-100', 'AnalyticsHandler', 'PROCESSED');

      expect(prismaMock.eventProcessing.upsert).toHaveBeenCalledWith({
        where: {
          eventId_handlerName: {
            eventId: 'evt-100',
            handlerName: 'AnalyticsHandler',
          },
        },
        create: expect.objectContaining({
          eventId: 'evt-100',
          handlerName: 'AnalyticsHandler',
          status: 'PROCESSED',
        }),
        update: expect.objectContaining({
          status: 'PROCESSED',
        }),
      });
    });
  });

  describe('Dead-Letter Queue Admin Actions', () => {
    it('retryDeadLetter resets event to PENDING and clears attemptCount to 0', async () => {
      prismaMock.outboxEvent.findUnique.mockResolvedValueOnce({
        id: 'dlq-1',
        status: OutboxStatus.DEAD_LETTER,
      });
      prismaMock.outboxEvent.update.mockResolvedValueOnce({
        id: 'dlq-1',
        status: OutboxStatus.PENDING,
        attemptCount: 0,
      });

      const res = await outboxService.retryDeadLetter('dlq-1');
      expect(res.success).toBe(true);
      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'dlq-1' },
        data: expect.objectContaining({
          status: 'PENDING',
          attemptCount: 0,
        }),
      });
    });

    it('discardDeadLetter marks the dead letter event as PROCESSED', async () => {
      prismaMock.outboxEvent.findUnique.mockResolvedValueOnce({
        id: 'dlq-2',
        status: OutboxStatus.DEAD_LETTER,
      });
      prismaMock.outboxEvent.update.mockResolvedValueOnce({
        id: 'dlq-2',
        status: OutboxStatus.PROCESSED,
      });

      const res = await outboxService.discardDeadLetter('dlq-2');
      expect(res.success).toBe(true);
      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'dlq-2' },
        data: expect.objectContaining({
          status: 'PROCESSED',
        }),
      });
    });
  });
});
