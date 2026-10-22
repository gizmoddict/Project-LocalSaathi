/**
 * Phase 10 — Transactional Outbox Database Integration Tests
 * Tests against REAL PostgreSQL 16 + PostGIS database in Docker.
 * Validates:
 *  - Atomic transactions with rollback & commit
 *  - PostgreSQL FOR UPDATE SKIP LOCKED batch claiming concurrency
 *  - EventProcessing unique idempotency constraint
 *  - Dead-Letter Queue lifecycle and admin retry/discard operations
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

import * as net from 'net';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { OutboxService } from '../outbox.service';
import { OutboxStatus } from '@localsaathi/types';

describe('Transactional Outbox — Database Integration Tests', () => {
  let prisma: PrismaClient;
  let outboxService: OutboxService;
  let isDatabaseAvailable = false;

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
      socket.once('connect', () => {
        isDatabaseAvailable = true;
        socket.destroy();
        resolve();
      });
      socket.once('error', () => { socket.destroy(); resolve(); });
      socket.once('timeout', () => { socket.destroy(); resolve(); });
      socket.connect(port, host);
    });

    if (!isDatabaseAvailable) {
      console.warn('PostgreSQL database not available — skipping integration tests');
      return;
    }

    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();
    outboxService = new OutboxService(prisma as any);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('guarantees atomic rollback when business transaction fails', async () => {
    if (!isDatabaseAvailable) return;

    const testAggregateId = randomUUID();

    await expect(
      prisma.$transaction(async (tx) => {
        // Create an outbox event inside transaction
        await outboxService.createEvent(
          {
            eventType: 'APPLICATION_CREATED',
            aggregateType: 'JobApplication',
            aggregateId: testAggregateId,
            payload: { reason: 'Rollback test' },
          },
          tx as any,
        );

        // Simulate a business validation or constraint crash
        throw new Error('Simulated business transaction failure');
      }),
    ).rejects.toThrow('Simulated business transaction failure');

    // Verify the outbox event was rolled back and does NOT exist in the database
    const persisted = await prisma.outboxEvent.findFirst({
      where: { aggregateId: testAggregateId },
    });
    expect(persisted).toBeNull();
  });

  it('atomically commits outbox event within successful transaction', async () => {
    if (!isDatabaseAvailable) return;

    const testAggregateId = randomUUID();

    const createdEventId = await prisma.$transaction(async (tx) => {
      return outboxService.createEvent(
        {
          eventType: 'BOOKING_CREATED',
          aggregateType: 'Booking',
          aggregateId: testAggregateId,
          payload: { test: true },
        },
        tx as any,
      );
    });

    expect(createdEventId).toBeDefined();

    // Verify it is immediately visible in PostgreSQL
    const persisted = await prisma.outboxEvent.findUnique({
      where: { id: createdEventId },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe(OutboxStatus.PENDING);
    expect(persisted?.aggregateId).toBe(testAggregateId);
  });

  it('claims batches using FOR UPDATE SKIP LOCKED without worker collisions', async () => {
    if (!isDatabaseAvailable) return;

    // Seed 4 pending events
    const eventIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const evtId = await outboxService.createEvent({
        eventType: 'TEST_CONCURRENT_CLAIM',
        aggregateType: 'TestAggregate',
        aggregateId: randomUUID(),
        payload: { index: i },
      });
      eventIds.push(evtId);
    }

    // Two worker nodes claiming simultaneously
    const [batchWorker1, batchWorker2] = await Promise.all([
      outboxService.claimBatch('worker-node-1', 2),
      outboxService.claimBatch('worker-node-2', 2),
    ]);

    const idsWorker1 = batchWorker1.map((e) => e.id);
    const idsWorker2 = batchWorker2.map((e) => e.id);

    // Assert disjoint sets: no overlap between workers
    const intersection = idsWorker1.filter((id) => idsWorker2.includes(id));
    expect(intersection).toHaveLength(0);

    // Verify that claimed events have status PROCESSING and lockedBy populated
    for (const item of batchWorker1) {
      expect(item.status).toBe(OutboxStatus.PROCESSING);
      expect(item.lockedBy).toBe('worker-node-1');
    }
    for (const item of batchWorker2) {
      expect(item.status).toBe(OutboxStatus.PROCESSING);
      expect(item.lockedBy).toBe('worker-node-2');
    }
  });

  it('enforces idempotency via unique (eventId, handlerName) constraint in event_processings', async () => {
    if (!isDatabaseAvailable) return;

    const eventId = await outboxService.createEvent({
      eventType: 'IDEMPOTENCY_TEST',
      aggregateType: 'TestAggregate',
      aggregateId: randomUUID(),
      payload: {},
    });

    // First handler execution
    await outboxService.recordProcessing(eventId, 'NotificationHandler', 'PROCESSED');
    const isProcessedFirst = await outboxService.isAlreadyProcessed(eventId, 'NotificationHandler');
    expect(isProcessedFirst).toBe(true);

    // Second execution with same handlerName: recordProcessing handles duplicate gracefully via upsert
    await outboxService.recordProcessing(eventId, 'NotificationHandler', 'PROCESSED');

    // Count records in DB for this event and handler
    const records = await prisma.eventProcessing.findMany({
      where: { eventId, handlerName: 'NotificationHandler' },
    });
    expect(records.length).toBe(1);
  });

  it('correctly transitions failed events to DEAD_LETTER and supports admin retry and discard', async () => {
    if (!isDatabaseAvailable) return;

    const eventId = await outboxService.createEvent({
      eventType: 'DLQ_TEST',
      aggregateType: 'TestAggregate',
      aggregateId: randomUUID(),
      payload: {},
    });

    // Simulate exhausting max attempts or fatal error
    await outboxService.markFailed(eventId, 'Permanent database connection error', false);

    // Confirm it is now in DEAD_LETTER
    const dlqEvent = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
    expect(dlqEvent?.status).toBe(OutboxStatus.DEAD_LETTER);

    // Admin query
    const dlqList = await outboxService.getDeadLetterEvents(1, 10);
    const foundInDlq = dlqList.events.some((e) => e.id === eventId);
    expect(foundInDlq).toBe(true);

    // Admin Retry: resets to PENDING
    const retryResult = await outboxService.retryDeadLetter(eventId);
    expect(retryResult.success).toBe(true);

    const retriedEvent = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
    expect(retriedEvent?.status).toBe(OutboxStatus.PENDING);
    expect(retriedEvent?.attemptCount).toBe(0);

    // Re-fail to DEAD_LETTER and test discard
    await outboxService.markFailed(eventId, 'Discard test error', false);
    const discardResult = await outboxService.discardDeadLetter(eventId);
    expect(discardResult.success).toBe(true);

    const discardedEvent = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
    expect(discardedEvent?.status).toBe(OutboxStatus.PROCESSED);
  });
});
