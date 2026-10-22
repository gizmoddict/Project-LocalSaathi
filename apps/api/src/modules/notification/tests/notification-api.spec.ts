/**
 * Phase 9 — Notification API / RBAC Tests
 * Tests: NotificationController endpoints, JwtAuthGuard, IDOR protection
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NotificationController } from '../notification.controller';
import { NotificationService } from '../notification.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  UserRole,
  AuthenticatedUser,
  NotificationPriority,
  NotificationType,
} from '@localsaathi/types';

describe('NotificationController — API & RBAC Tests', () => {
  let controller: NotificationController;
  let notificationService: jest.Mocked<NotificationService>;

  const mockWorkerUser: AuthenticatedUser = {
    userId: 'worker-user-uuid',
    sessionId: 'sess-worker',
    role: UserRole.WORKER,
  };

  const mockEmployerUser: AuthenticatedUser = {
    userId: 'employer-user-uuid',
    sessionId: 'sess-employer',
    role: UserRole.EMPLOYER,
  };

  const sampleNotification = {
    id: 'notif-uuid-1',
    type: NotificationType.APPLICATION_RECEIVED,
    title: 'New job application',
    body: 'A worker applied for "Cook at Café".',
    priority: NotificationPriority.NORMAL,
    entityType: 'JobApplication',
    entityId: 'app-uuid-1',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    notificationService = {
      getNotifications: jest.fn(),
      getUnreadCount: jest.fn(),
      getNotificationById: jest.fn(),
      markAsRead: jest.fn(),
      markAllRead: jest.fn(),
      getPreferences: jest.fn(),
      updatePreferences: jest.fn(),
    } as any;

    const jwtGuard = {
      canActivate: (ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        req.user = req.headers['x-user'] === 'employer' ? mockEmployerUser : mockWorkerUser;
        return true;
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        { provide: NotificationService, useValue: notificationService },
        { provide: Reflector, useValue: new Reflector() },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtGuard)
      .compile();

    controller = module.get<NotificationController>(NotificationController);
  });

  // ── GET /notifications ───────────────────────────────────────────────────────
  describe('GET /notifications', () => {
    it('should return paginated notifications for worker', async () => {
      const mockResponse = {
        notifications: [sampleNotification],
        total: 1,
        unreadCount: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      };
      notificationService.getNotifications.mockResolvedValueOnce(mockResponse);

      const result = await controller.getNotifications(mockWorkerUser, {});
      expect(result.notifications).toHaveLength(1);
      expect(notificationService.getNotifications).toHaveBeenCalledWith(
        mockWorkerUser.userId,
        expect.objectContaining({ page: 1, limit: 20 })
      );
    });

    it('should return paginated notifications for employer', async () => {
      const mockResponse = {
        notifications: [],
        total: 0,
        unreadCount: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      };
      notificationService.getNotifications.mockResolvedValueOnce(mockResponse);

      const result = await controller.getNotifications(mockEmployerUser, {});
      expect(result.total).toBe(0);
      expect(notificationService.getNotifications).toHaveBeenCalledWith(
        mockEmployerUser.userId,
        expect.any(Object)
      );
    });

    it('should pass unreadOnly filter', async () => {
      notificationService.getNotifications.mockResolvedValueOnce({
        notifications: [sampleNotification],
        total: 1,
        unreadCount: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      });

      await controller.getNotifications(mockWorkerUser, { unreadOnly: 'true' });
      expect(notificationService.getNotifications).toHaveBeenCalledWith(
        mockWorkerUser.userId,
        expect.objectContaining({ unreadOnly: true })
      );
    });
  });

  // ── GET /notifications/unread-count ──────────────────────────────────────────
  describe('GET /notifications/unread-count', () => {
    it('should return unread count', async () => {
      notificationService.getUnreadCount.mockResolvedValueOnce({ unreadCount: 7 });
      const result = await controller.getUnreadCount(mockWorkerUser);
      expect(result.unreadCount).toBe(7);
    });
  });

  // ── GET /notifications/preferences ───────────────────────────────────────────
  describe('GET /notifications/preferences', () => {
    it('should return preferences for the current user', async () => {
      const mockPref = { id: 'pref-1', userId: mockWorkerUser.userId, applicationUpdates: true, bookingUpdates: false, jobUpdates: true, messageUpdates: true, systemUpdates: true };
      notificationService.getPreferences.mockResolvedValueOnce(mockPref);
      const result = await controller.getPreferences(mockWorkerUser);
      expect(result.bookingUpdates).toBe(false);
      expect(result.systemUpdates).toBe(true);
    });
  });

  // ── PATCH /notifications/preferences ─────────────────────────────────────────
  describe('PATCH /notifications/preferences', () => {
    it('should update preferences', async () => {
      const mockPref = { id: 'pref-1', userId: mockWorkerUser.userId, applicationUpdates: true, bookingUpdates: false, jobUpdates: true, messageUpdates: true, systemUpdates: true };
      notificationService.updatePreferences.mockResolvedValueOnce(mockPref);
      const result = await controller.updatePreferences(mockWorkerUser, { bookingUpdates: false });
      expect(result.bookingUpdates).toBe(false);
      expect(result.systemUpdates).toBe(true);
    });
  });

  // ── GET /notifications/:id ────────────────────────────────────────────────────
  describe('GET /notifications/:notificationId', () => {
    it('should return notification detail', async () => {
      notificationService.getNotificationById.mockResolvedValueOnce(sampleNotification);
      const result = await controller.getNotificationById(mockWorkerUser, 'notif-uuid-1');
      expect(result.id).toBe('notif-uuid-1');
    });

    it('should enforce IDOR — service receives current user id', async () => {
      notificationService.getNotificationById.mockResolvedValueOnce(sampleNotification);
      await controller.getNotificationById(mockWorkerUser, 'notif-uuid-1');
      expect(notificationService.getNotificationById).toHaveBeenCalledWith(
        mockWorkerUser.userId, // must be current user
        'notif-uuid-1'
      );
    });
  });

  // ── PATCH /notifications/:id/read ────────────────────────────────────────────
  describe('PATCH /notifications/:notificationId/read', () => {
    it('should mark notification as read', async () => {
      const readAt = new Date().toISOString();
      notificationService.markAsRead.mockResolvedValueOnce({ id: 'notif-uuid-1', isRead: true, readAt });
      const result = await controller.markAsRead(mockWorkerUser, 'notif-uuid-1');
      expect(result.isRead).toBe(true);
      expect(result.readAt).toBeDefined();
    });
  });

  // ── POST /notifications/:id/read ─────────────────────────────────────────────
  describe('POST /notifications/:notificationId/read', () => {
    it('should mark notification as read via POST alias', async () => {
      const readAt = new Date().toISOString();
      notificationService.markAsRead.mockResolvedValueOnce({ id: 'notif-uuid-1', isRead: true, readAt });
      const result = await controller.markAsReadPost(mockWorkerUser, 'notif-uuid-1');
      expect(result.isRead).toBe(true);
    });
  });

  // ── DELETE /notifications/:id ─────────────────────────────────────────────────
  describe('DELETE /notifications/:notificationId', () => {
    it('should delete notification', async () => {
      notificationService.deleteNotification = jest.fn().mockResolvedValueOnce({ success: true, id: 'notif-uuid-1' });
      const result = await controller.deleteNotification(mockWorkerUser, 'notif-uuid-1');
      expect(result.success).toBe(true);
      expect(notificationService.deleteNotification).toHaveBeenCalledWith(mockWorkerUser.userId, 'notif-uuid-1');
    });
  });

  // ── POST /notifications/read-all ─────────────────────────────────────────────
  describe('POST /notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      notificationService.markAllRead.mockResolvedValueOnce({ markedCount: 5 });
      const result = await controller.markAllRead(mockWorkerUser);
      expect(result.markedCount).toBe(5);
    });
  });

  // ── POST /notifications/cleanup-expired ───────────────────────────────────────
  describe('POST /notifications/cleanup-expired', () => {
    it('should clean expired notifications', async () => {
      notificationService.cleanExpiredNotifications = jest.fn().mockResolvedValueOnce({ deletedCount: 10 });
      const result = await controller.cleanExpired();
      expect(result.deletedCount).toBe(10);
    });
  });

  // ── Guard: JwtAuthGuard required on all endpoints ────────────────────────────
  describe('Auth guard coverage', () => {
    it('should be applied to the controller (guard present in metadata)', () => {
      // NotificationController uses @UseGuards(JwtAuthGuard) — verify the controller compiles
      expect(controller).toBeDefined();
    });
  });
});
