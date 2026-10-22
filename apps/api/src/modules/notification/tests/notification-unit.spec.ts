/**
 * Phase 9 — Notification Unit Tests
 * Tests: DomainEventService, NotificationService (mocked Prisma)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DomainEventService } from '../domain-event.service';
import { NotificationService } from '../notification.service';
import { DomainEventType } from '@localsaathi/types';

// ─── Prisma mock ─────────────────────────────────────────────────────────────
const prismaMock = {
  domainEvent: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  notificationPreference: {
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
  outboxEvent: {
    create: jest.fn(),
  },
};

// ─── DomainEventService ───────────────────────────────────────────────────────
describe('DomainEventService', () => {
  let service: DomainEventService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainEventService,
        { provide: 'PrismaService', useValue: prismaMock },
      ],
    })
      .overrideProvider(DomainEventService)
      .useFactory({
        factory: () => {
          const svc = new DomainEventService(prismaMock as any);
          return svc;
        },
      })
      .compile();

    service = module.get(DomainEventService);
  });

  describe('createEvent', () => {
    it('should create a domain event and return its id', async () => {
      prismaMock.domainEvent.create.mockResolvedValueOnce({ id: 'evt-1' });

      const id = await service.createEvent({
        type: DomainEventType.APPLICATION_CREATED,
        entityType: 'JobApplication',
        entityId: 'app-1',
        payload: { jobTitle: 'Cook', workerId: 'w-1', employerId: 'e-1' },
      });

      expect(id).toBe('evt-1');
      expect(prismaMock.domainEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: DomainEventType.APPLICATION_CREATED,
            entityType: 'JobApplication',
            entityId: 'app-1',
          }),
        })
      );
    });

    it('should use the provided transaction client', async () => {
      const txMock = {
        domainEvent: { create: jest.fn().mockResolvedValueOnce({ id: 'evt-tx' }) },
        outboxEvent: { create: jest.fn().mockResolvedValueOnce({ id: 'out-tx' }) },
      };
      const id = await service.createEvent(
        { type: DomainEventType.BOOKING_CREATED, entityType: 'Booking', entityId: 'b-1', payload: {} },
        txMock as any
      );
      expect(id).toBe('evt-tx');
      expect(txMock.domainEvent.create).toHaveBeenCalled();
    });
  });

  describe('processEvent', () => {
    it('should silently skip if event not found', async () => {
      prismaMock.domainEvent.findUnique.mockResolvedValueOnce(null);
      await expect(service.processEvent('non-existent')).resolves.toBeUndefined();
    });

    it('should skip PROCESSED events', async () => {
      prismaMock.domainEvent.findUnique.mockResolvedValueOnce({ id: 'e', status: 'PROCESSED', type: 'APPLICATION_CREATED' });
      await service.processEvent('e');
      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });

    it('should process APPLICATION_CREATED and create employer notification', async () => {
      prismaMock.domainEvent.findUnique.mockResolvedValueOnce({
        id: 'evt-1',
        type: DomainEventType.APPLICATION_CREATED,
        status: 'PENDING',
        entityType: 'JobApplication',
        entityId: 'app-1',
        payload: { jobTitle: 'Cook', workerId: 'w-user-1', employerId: 'e-user-1' },
      });
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce(null); // default pref = all enabled
      prismaMock.notification.create.mockResolvedValueOnce({ id: 'notif-1' });
      prismaMock.domainEvent.update.mockResolvedValueOnce({});

      await service.processEvent('evt-1');

      expect(prismaMock.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientId: 'e-user-1',
            sourceEventId: 'evt-1',
          }),
        })
      );
      expect(prismaMock.domainEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PROCESSED' }),
        })
      );
    });

    it('should skip notification creation when preference is disabled', async () => {
      prismaMock.domainEvent.findUnique.mockResolvedValueOnce({
        id: 'evt-2',
        type: DomainEventType.APPLICATION_SHORTLISTED,
        status: 'PENDING',
        entityType: 'JobApplication',
        entityId: 'app-2',
        payload: { jobTitle: 'Driver', workerId: 'w-user-2', employerId: 'e-user-2' },
      });
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce({
        applicationUpdates: false,
        bookingUpdates: true,
        jobUpdates: true,
      });
      prismaMock.domainEvent.update.mockResolvedValueOnce({});

      await service.processEvent('evt-2');
      // No notification should be created (preference disabled)
      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });

    it('should handle idempotent P2002 gracefully', async () => {
      const p2002Error = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      // Make it instance of PrismaClientKnownRequestError
      Object.setPrototypeOf(p2002Error, require('@prisma/client').Prisma.PrismaClientKnownRequestError.prototype);

      prismaMock.domainEvent.findUnique.mockResolvedValueOnce({
        id: 'evt-3',
        type: DomainEventType.APPLICATION_CREATED,
        status: 'PENDING',
        entityType: 'JobApplication',
        entityId: 'app-3',
        payload: { jobTitle: 'Guard', workerId: 'w-3', employerId: 'e-3' },
      });
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce(null);
      prismaMock.notification.create.mockRejectedValueOnce(p2002Error);
      prismaMock.domainEvent.update.mockResolvedValueOnce({});

      // Should NOT throw
      await expect(service.processEvent('evt-3')).resolves.toBeUndefined();
    });
  });
});

// ─── NotificationService ──────────────────────────────────────────────────────
describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = new NotificationService(prismaMock as any);
  });

  describe('getNotifications', () => {
    it('should return paginated notifications with counts', async () => {
      const notif = { id: 'n-1', type: 'APPLICATION_RECEIVED', title: 'Test', body: 'Body', priority: 'NORMAL', entityType: null, entityId: null, isRead: false, readAt: null, createdAt: new Date() };
      prismaMock.notification.findMany.mockResolvedValueOnce([notif]);
      prismaMock.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      const result = await service.getNotifications('user-1', { page: 1, limit: 20, unreadOnly: false });

      expect(result.notifications).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.unreadCount).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should filter by unreadOnly', async () => {
      prismaMock.notification.findMany.mockResolvedValueOnce([]);
      prismaMock.notification.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      await service.getNotifications('user-1', { page: 1, limit: 20, unreadOnly: true });

      const call = prismaMock.notification.findMany.mock.calls[0][0];
      expect(call.where.isRead).toBe(false);
    });

    it('should handle cursor-based pagination with deterministic tie-breaker and nextCursor', async () => {
      const now = new Date('2026-10-12T00:00:00.000Z');
      const notif1 = { id: 'n-1', type: 'APPLICATION_RECEIVED', title: 'Test 1', body: 'Body 1', priority: 'NORMAL', entityType: null, entityId: null, isRead: false, readAt: null, createdAt: now };
      const notif2 = { id: 'n-2', type: 'APPLICATION_SHORTLISTED', title: 'Test 2', body: 'Body 2', priority: 'NORMAL', entityType: null, entityId: null, isRead: false, readAt: null, createdAt: now };
      const notif3 = { id: 'n-3', type: 'APPLICATION_ACCEPTED', title: 'Test 3', body: 'Body 3', priority: 'HIGH', entityType: null, entityId: null, isRead: false, readAt: null, createdAt: now };

      // Mock cursor existence verification check
      prismaMock.notification.findUnique.mockResolvedValueOnce({
        id: 'n-0',
        recipientId: 'user-1',
      });
      // Return limit + 1 items (3 items for limit=2) indicating hasMore = true
      prismaMock.notification.findMany.mockResolvedValueOnce([notif1, notif2, notif3]);
      prismaMock.notification.count.mockResolvedValueOnce(10).mockResolvedValueOnce(5);

      const result = await service.getNotifications('user-1', { page: 1, limit: 2, cursor: 'n-0' });

      const call = prismaMock.notification.findMany.mock.calls[0][0];
      expect(call.cursor).toEqual({ id: 'n-0' });
      expect(call.skip).toBe(1);
      expect(call.take).toBe(3);
      expect(call.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);

      expect(result.notifications).toHaveLength(2);
      expect(result.notifications[0]?.id).toBe('n-1');
      expect(result.notifications[1]?.id).toBe('n-2');
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('n-2');
    });

    it('should set nextCursor to null when hasMore is false', async () => {
      const notif1 = { id: 'n-1', type: 'APPLICATION_RECEIVED', title: 'Test 1', body: 'Body 1', priority: 'NORMAL', entityType: null, entityId: null, isRead: false, readAt: null, createdAt: new Date() };

      prismaMock.notification.findMany.mockResolvedValueOnce([notif1]);
      prismaMock.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      const result = await service.getNotifications('user-1', { page: 1, limit: 10 });

      expect(result.notifications).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should throw BadRequestException when cursor record is not found (deleted cursor)', async () => {
      // Mock findUnique returning null (cursor was deleted or invalid)
      prismaMock.notification.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getNotifications('user-1', { page: 1, limit: 10, cursor: 'deleted-cursor-id' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if cursor belongs to another recipient (IDOR protection)', async () => {
      // Mock findUnique returning notification belonging to 'user-2'
      prismaMock.notification.findUnique.mockResolvedValueOnce({
        id: 'foreign-cursor-id',
        recipientId: 'user-2',
      });

      await expect(
        service.getNotifications('user-1', { page: 1, limit: 10, cursor: 'foreign-cursor-id' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      prismaMock.notification.count.mockResolvedValueOnce(5);
      const result = await service.getUnreadCount('user-1');
      expect(result.unreadCount).toBe(5);
    });
  });

  describe('getNotificationById', () => {
    it('should return notification when found and owned', async () => {
      prismaMock.notification.findUnique.mockResolvedValueOnce({
        id: 'n-1', recipientId: 'user-1', type: 'BOOKING_CREATED', title: 'T', body: 'B', priority: 'HIGH', entityType: 'Booking', entityId: 'b-1', isRead: false, readAt: null, createdAt: new Date(),
      });
      const result = await service.getNotificationById('user-1', 'n-1');
      expect(result.id).toBe('n-1');
    });

    it('should throw NotFoundException when not found', async () => {
      prismaMock.notification.findUnique.mockResolvedValueOnce(null);
      await expect(service.getNotificationById('user-1', 'n-999')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when owned by different user', async () => {
      prismaMock.notification.findUnique.mockResolvedValueOnce({
        id: 'n-1', recipientId: 'other-user',
      });
      await expect(service.getNotificationById('user-1', 'n-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      prismaMock.notification.findUnique.mockResolvedValueOnce({ id: 'n-1', recipientId: 'user-1' });
      prismaMock.notification.update.mockResolvedValueOnce({ id: 'n-1', isRead: true, readAt: new Date() });

      const result = await service.markAsRead('user-1', 'n-1');
      expect(result.isRead).toBe(true);
    });
  });

  describe('markAllRead', () => {
    it('should mark all notifications as read', async () => {
      prismaMock.notification.updateMany.mockResolvedValueOnce({ count: 3 });
      const result = await service.markAllRead('user-1');
      expect(result.markedCount).toBe(3);
    });
  });

  describe('getPreferences', () => {
    it('should return existing preferences', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce({
        id: 'p-1', userId: 'user-1', applicationUpdates: true, bookingUpdates: false, jobUpdates: true, messageUpdates: true, systemUpdates: true,
      });
      const result = await service.getPreferences('user-1');
      expect(result.bookingUpdates).toBe(false);
      expect(result.systemUpdates).toBe(true);
    });

    it('should create default preferences if not found', async () => {
      prismaMock.notificationPreference.findUnique.mockResolvedValueOnce(null);
      prismaMock.notificationPreference.create.mockResolvedValueOnce({
        id: 'p-new', userId: 'user-1', applicationUpdates: true, bookingUpdates: true, jobUpdates: true, messageUpdates: true, systemUpdates: true,
      });
      const result = await service.getPreferences('user-1');
      expect(result.applicationUpdates).toBe(true);
      expect(result.systemUpdates).toBe(true);
    });
  });

  describe('updatePreferences', () => {
    it('should upsert preferences and enforce systemUpdates', async () => {
      prismaMock.notificationPreference.upsert.mockResolvedValueOnce({
        id: 'p-1', userId: 'user-1', applicationUpdates: false, bookingUpdates: true, jobUpdates: true, messageUpdates: true, systemUpdates: true,
      });
      const result = await service.updatePreferences('user-1', { applicationUpdates: false });
      expect(result.applicationUpdates).toBe(false);
      expect(result.systemUpdates).toBe(true);
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification if owner matches', async () => {
      prismaMock.notification.findUnique.mockResolvedValueOnce({
        id: 'n-1', recipientId: 'user-1',
      });
      prismaMock.notification.delete = jest.fn().mockResolvedValueOnce({ id: 'n-1' });
      const result = await service.deleteNotification('user-1', 'n-1');
      expect(result.success).toBe(true);
      expect(prismaMock.notification.delete).toHaveBeenCalledWith({ where: { id: 'n-1' } });
    });

    it('should throw ForbiddenException if user is not recipient', async () => {
      prismaMock.notification.findUnique.mockResolvedValueOnce({
        id: 'n-1', recipientId: 'other-user',
      });
      await expect(service.deleteNotification('user-1', 'n-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cleanExpiredNotifications', () => {
    it('should prune expired notifications', async () => {
      prismaMock.notification.deleteMany = jest.fn().mockResolvedValueOnce({ count: 4 });
      const result = await service.cleanExpiredNotifications();
      expect(result.deletedCount).toBe(4);
    });
  });
});
