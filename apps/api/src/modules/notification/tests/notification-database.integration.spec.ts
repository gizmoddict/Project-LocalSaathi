/**
 * Phase 9 — Notification Database Integration Tests
 * Tests against REAL PostgreSQL database (Docker).
 * Skips gracefully if DB is not reachable.
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../../../.env') });

import * as net from 'net';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NotificationService } from '../notification.service';
import { DomainEventService } from '../domain-event.service';
import { PrismaService } from '../../database/database.module';
import { ForbiddenException } from '@nestjs/common';
import { DomainEventType, NotificationType } from '@localsaathi/types';

describe('Notification Domain — Real PostgreSQL Integration Tests', () => {
  let prisma: PrismaClient;
  let notificationService: NotificationService;
  let domainEventService: DomainEventService;
  let isDatabaseAvailable = false;

  // Unique phones to avoid test data collision
  const phone1 = `+9199501${Math.floor(10000 + Math.random() * 90000)}`;
  const phone2 = `+9199502${Math.floor(10000 + Math.random() * 90000)}`;

  let user1Id: string;
  let user2Id: string;
  let notif1Id: string;

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

    if (!isDatabaseAvailable) return;

    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    notificationService = new NotificationService(prisma as unknown as PrismaService);
    domainEventService = new DomainEventService(prisma as unknown as PrismaService);

    // Create two test users
    const u1 = await prisma.user.create({
      data: { phone: phone1, role: 'WORKER' },
    });
    const u2 = await prisma.user.create({
      data: { phone: phone2, role: 'EMPLOYER' },
    });
    user1Id = u1.id;
    user2Id = u2.id;
  });

  afterAll(async () => {
    if (!isDatabaseAvailable || !prisma) return;
    // Clean up — delete notifications, domain events, preferences, users
    await prisma.notification.deleteMany({ where: { recipientId: { in: [user1Id, user2Id] } } });
    await prisma.domainEvent.deleteMany({ where: { actorId: { in: [user1Id, user2Id] } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: [user1Id, user2Id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1Id, user2Id] } } });
    await prisma.$disconnect();
  });

  function skipIfNoDb() {
    if (!isDatabaseAvailable) {
      console.log('  ⚠ Database not available — skipping');
    }
    return !isDatabaseAvailable;
  }

  // ── 1: Create DomainEvent ────────────────────────────────────────────────────
  it('1. createEvent — creates a domain event in DB', async () => {
    if (skipIfNoDb()) return;

    const appId = randomUUID();
    const eventId = await domainEventService.createEvent({
      type: DomainEventType.APPLICATION_CREATED,
      actorId: user1Id,
      entityType: 'JobApplication',
      entityId: appId,
      payload: {
        jobTitle: 'Cook',
        jobId: randomUUID(),
        applicationId: appId,
        workerId: user1Id,
        employerId: user2Id,
      },
    });

    expect(eventId).toBeTruthy();
    const stored = await prisma.domainEvent.findUnique({ where: { id: eventId } });
    expect(stored).not.toBeNull();
    expect(stored!.type).toBe(DomainEventType.APPLICATION_CREATED);
    expect(stored!.status).toBe('PENDING');
  });

  // ── 2: processEvent → create Notification ───────────────────────────────────
  it('2. processEvent — creates notification for employer (APPLICATION_CREATED)', async () => {
    if (skipIfNoDb()) return;

    // Create a fresh event
    const appId = randomUUID();
    const eventId = await domainEventService.createEvent({
      type: DomainEventType.APPLICATION_CREATED,
      actorId: user1Id,
      entityType: 'JobApplication',
      entityId: appId,
      payload: {
        jobTitle: 'Driver',
        jobId: randomUUID(),
        applicationId: appId,
        workerId: user1Id,
        employerId: user2Id,
      },
    });

    await domainEventService.processEvent(eventId);

    const notifs = await prisma.notification.findMany({
      where: { recipientId: user2Id, sourceEventId: eventId },
    });
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs[0]!.title).toContain('application');
    notif1Id = notifs[0]!.id;

    // Event should be marked PROCESSED
    const event = await prisma.domainEvent.findUnique({ where: { id: eventId } });
    expect(event!.status).toBe('PROCESSED');
  });

  // ── 3: Idempotency — processEvent twice must not duplicate ───────────────────
  it('3. processEvent — idempotent: processing same event twice creates only 1 notification', async () => {
    if (skipIfNoDb()) return;

    const bId = randomUUID();
    const eventId = await domainEventService.createEvent({
      type: DomainEventType.BOOKING_CREATED,
      actorId: user2Id,
      entityType: 'Booking',
      entityId: bId,
      payload: {
        jobTitle: 'Guard',
        bookingId: bId,
        workerId: user1Id,
        employerId: user2Id,
        startDate: '2026-12-01',
      },
    });

    await domainEventService.processEvent(eventId);
    await domainEventService.processEvent(eventId); // second call should be no-op

    const notifs = await prisma.notification.findMany({
      where: { recipientId: user1Id, sourceEventId: eventId },
    });
    expect(notifs.length).toBe(1); // exactly one, not two
  });

  // ── 4: getNotifications ──────────────────────────────────────────────────────
  it('4. getNotifications — returns paginated list for user2 (employer)', async () => {
    if (skipIfNoDb()) return;

    const result = await notificationService.getNotifications(user2Id, { page: 1, limit: 20, unreadOnly: false });

    expect(Array.isArray(result.notifications)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(typeof result.unreadCount).toBe('number');
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  // ── 5: getUnreadCount ────────────────────────────────────────────────────────
  it('5. getUnreadCount — returns count of unread notifications', async () => {
    if (skipIfNoDb()) return;

    const result = await notificationService.getUnreadCount(user2Id);
    expect(typeof result.unreadCount).toBe('number');
    expect(result.unreadCount).toBeGreaterThanOrEqual(1);
  });

  // ── 6: getNotificationById — success ────────────────────────────────────────
  it('6. getNotificationById — returns notification for owner', async () => {
    if (skipIfNoDb() || !notif1Id) return;

    const result = await notificationService.getNotificationById(user2Id, notif1Id);
    expect(result.id).toBe(notif1Id);
    expect(result.isRead).toBe(false);
  });

  // ── 7: IDOR — getNotificationById by wrong user ──────────────────────────────
  it('7. getNotificationById — ForbiddenException for wrong user (IDOR)', async () => {
    if (skipIfNoDb() || !notif1Id) return;

    // notif1Id belongs to user2, accessing as user1 must throw
    await expect(
      notificationService.getNotificationById(user1Id, notif1Id)
    ).rejects.toThrow(ForbiddenException);
  });

  // ── 8: markAsRead ────────────────────────────────────────────────────────────
  it('8. markAsRead — marks notification as read', async () => {
    if (skipIfNoDb() || !notif1Id) return;

    const result = await notificationService.markAsRead(user2Id, notif1Id);
    expect(result.isRead).toBe(true);
    expect(result.readAt).not.toBeNull();
  });

  // ── 9: markAllRead ───────────────────────────────────────────────────────────
  it('9. markAllRead — marks all notifications as read for user', async () => {
    if (skipIfNoDb()) return;

    // Create one more unread notification directly
    await prisma.notification.create({
      data: {
        recipientId: user2Id,
        type: NotificationType.BOOKING_CREATED,
        title: 'Another notif',
        body: 'Body text',
        isRead: false,
        priority: 'NORMAL',
      },
    });

    const result = await notificationService.markAllRead(user2Id);
    expect(result.markedCount).toBeGreaterThanOrEqual(1);

    const unread = await prisma.notification.count({
      where: { recipientId: user2Id, isRead: false },
    });
    expect(unread).toBe(0);
  });

  // ── 10: getPreferences — creates defaults if not found ───────────────────────
  it('10. getPreferences — creates default preferences on first call', async () => {
    if (skipIfNoDb()) return;

    // Ensure no preference exists
    await prisma.notificationPreference.deleteMany({ where: { userId: user1Id } });

    const result = await notificationService.getPreferences(user1Id);
    expect(result.applicationUpdates).toBe(true);
    expect(result.bookingUpdates).toBe(true);
    expect(result.jobUpdates).toBe(true);
  });

  // ── 11: updatePreferences ────────────────────────────────────────────────────
  it('11. updatePreferences — persists preference changes', async () => {
    if (skipIfNoDb()) return;

    const result = await notificationService.updatePreferences(user1Id, {
      bookingUpdates: false,
    });
    expect(result.bookingUpdates).toBe(false);
    expect(result.applicationUpdates).toBe(true); // unchanged

    // Verify in DB
    const stored = await prisma.notificationPreference.findUnique({
      where: { userId: user1Id },
    });
    expect(stored!.bookingUpdates).toBe(false);
  });

  // ── 12: Preference check — disabled preference skips notification ─────────────
  it('12. processEvent — skips notification when preference disabled', async () => {
    if (skipIfNoDb()) return;

    // user1 has bookingUpdates=false from test 11
    const countBefore = await prisma.notification.count({ where: { recipientId: user1Id } });

    const bPrefId = randomUUID();
    const eventId = await domainEventService.createEvent({
      type: DomainEventType.BOOKING_CONFIRMED,
      actorId: user2Id,
      entityType: 'Booking',
      entityId: bPrefId,
      payload: {
        jobTitle: 'Test',
        bookingId: bPrefId,
        workerId: user1Id,
        employerId: user2Id,
      },
    });

    await domainEventService.processEvent(eventId);

    const countAfter = await prisma.notification.count({ where: { recipientId: user1Id } });
    // worker (user1) should receive BOOKING_CONFIRMED but bookingUpdates=false — so count unchanged
    expect(countAfter).toBe(countBefore);
  });

  // ── 13: deleteNotification ───────────────────────────────────────────────────
  it('13. deleteNotification — deletes notification and enforces IDOR', async () => {
    if (skipIfNoDb()) return;

    // Create a notification for user1
    const n = await prisma.notification.create({
      data: {
        recipientId: user1Id,
        type: NotificationType.APPLICATION_RECEIVED,
        title: 'To be deleted',
        body: 'Delete me',
      },
    });

    // Attempt delete by user2 should fail (Forbidden)
    await expect(notificationService.deleteNotification(user2Id, n.id)).rejects.toThrow(ForbiddenException);

    // Delete by user1 should succeed
    const res = await notificationService.deleteNotification(user1Id, n.id);
    expect(res.success).toBe(true);

    const exists = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(exists).toBeNull();
  });

  // ── 14: cleanExpiredNotifications ────────────────────────────────────────────
  it('14. cleanExpiredNotifications — deletes past expiresAt notifications', async () => {
    if (skipIfNoDb()) return;

    // Create expired notification
    const expired = await prisma.notification.create({
      data: {
        recipientId: user1Id,
        type: NotificationType.APPLICATION_RECEIVED,
        title: 'Expired Notification',
        body: 'Expired body',
        expiresAt: new Date(Date.now() - 60000), // 1 minute in past
      },
    });

    // Create active notification
    const active = await prisma.notification.create({
      data: {
        recipientId: user1Id,
        type: NotificationType.APPLICATION_RECEIVED,
        title: 'Active Notification',
        body: 'Active body',
        expiresAt: new Date(Date.now() + 60000), // 1 minute in future
      },
    });

    const cleanResult = await notificationService.cleanExpiredNotifications();
    expect(cleanResult.deletedCount).toBeGreaterThanOrEqual(1);

    const expiredCheck = await prisma.notification.findUnique({ where: { id: expired.id } });
    expect(expiredCheck).toBeNull();

    const activeCheck = await prisma.notification.findUnique({ where: { id: active.id } });
    expect(activeCheck).not.toBeNull();

    await prisma.notification.delete({ where: { id: active.id } });
  });

  // ── 15: Mandatory systemUpdates cannot be disabled ───────────────────────────
  it('15. updatePreferences — mandatory systemUpdates remains true', async () => {
    if (skipIfNoDb()) return;

    const res = await notificationService.updatePreferences(user1Id, {
      systemUpdates: false,
    });
    expect(res.systemUpdates).toBe(true);

    const stored = await prisma.notificationPreference.findUnique({
      where: { userId: user1Id },
    });
    expect(stored!.systemUpdates).toBe(true);
  });
});
