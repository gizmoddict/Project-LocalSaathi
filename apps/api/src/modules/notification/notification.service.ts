import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../database/database.module';
import {
  NotificationItem,
  NotificationListResponse,
  UnreadCountResponse,
  NotificationPreferenceResponse,
  MarkReadResponse,
  MarkAllReadResponse,
  NotificationType,
  NotificationPriority,
  NotificationDeliveryStatus,
} from '@localsaathi/types';
import {
  NotificationQueryInput,
  UpdateNotificationPreferenceInput,
} from '@localsaathi/validation';
import { NOTIFICATION_ERROR_CODES } from './notification.constants';
import { NotificationDispatcherService } from '../outbox/realtime/notification-dispatcher.service';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => NotificationDispatcherService))
    private readonly dispatcher?: NotificationDispatcherService,
  ) {}

  async getNotifications(
    userId: string,
    query: NotificationQueryInput,
  ): Promise<NotificationListResponse & { nextCursor?: string | null }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = query.cursor ? 0 : (page - 1) * limit;
    const now = new Date();

    const where: any = {
      recipientId: userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };

    if (query.unreadOnly) {
      where.isRead = false;
    }

    if (query.type) {
      where.type = query.type;
    }

    let cursorObj: { id: string } | undefined = undefined;
    if (query.cursor) {
      // Keyset cursor validation:
      // The cursor must be a valid, existing record belonging to the authenticated recipient.
      // If the cursor record was deleted or belongs to another user, fail fast with 400 Bad Request
      // to prevent silent fallback to offset page 1, which causes duplicates and skips.
      const cursorRecord = await this.prisma.notification.findUnique({
        where: { id: query.cursor },
        select: { id: true, recipientId: true },
      });

      if (!cursorRecord || cursorRecord.recipientId !== userId) {
        throw new BadRequestException({
          code: NOTIFICATION_ERROR_CODES.INVALID_CURSOR,
          message: 'Invalid pagination cursor. The specified cursor record does not exist or does not belong to the authenticated user.',
        });
      }

      cursorObj = { id: query.cursor };
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: cursorObj ? 1 : skip,
        cursor: cursorObj,
        take: limit + 1,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          priority: true,
          entityType: true,
          entityId: true,
          payload: true,
          sourceEventId: true,
          deliveryStatus: true,
          isRead: true,
          readAt: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          recipientId: userId,
          isRead: false,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
    ]);

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]?.id : null;

    return {
      notifications: items.map(this.mapNotification),
      total,
      unreadCount,
      page,
      limit,
      hasMore,
      nextCursor,
    };
  }

  async getUnreadCount(userId: string): Promise<UnreadCountResponse> {
    const now = new Date();
    const unreadCount = await this.prisma.notification.count({
      where: {
        recipientId: userId,
        isRead: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    return { unreadCount };
  }

  async getNotificationById(
    userId: string,
    notificationId: string,
  ): Promise<NotificationItem> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException(NOTIFICATION_ERROR_CODES.NOT_FOUND);
    }

    if (notification.recipientId !== userId) {
      throw new ForbiddenException(NOTIFICATION_ERROR_CODES.FORBIDDEN);
    }

    return this.mapNotification(notification);
  }

  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<MarkReadResponse> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException(NOTIFICATION_ERROR_CODES.NOT_FOUND);
    }

    if (notification.recipientId !== userId) {
      throw new ForbiddenException(NOTIFICATION_ERROR_CODES.FORBIDDEN);
    }

    const now = new Date();
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: now,
        deliveryStatus: NotificationDeliveryStatus.READ,
      },
    });

    const unreadCount = await this.prisma.notification.count({
      where: {
        recipientId: userId,
        isRead: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    if (this.dispatcher) {
      await this.dispatcher
        .dispatch({
          recipientId: userId,
          notificationId,
          eventType: 'notification.read',
          unreadCount,
        })
        .catch(() => undefined);
    }

    return {
      id: updated.id,
      isRead: updated.isRead,
      readAt: updated.readAt!.toISOString(),
    };
  }

  async markAllRead(userId: string): Promise<MarkAllReadResponse> {
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: {
        isRead: true,
        readAt: now,
        deliveryStatus: NotificationDeliveryStatus.READ,
      },
    });

    if (this.dispatcher) {
      await this.dispatcher
        .dispatch({
          recipientId: userId,
          eventType: 'notification.count_updated',
          unreadCount: 0,
        })
        .catch(() => undefined);
    }

    return { markedCount: result.count };
  }

  async deleteNotification(
    userId: string,
    notificationId: string,
  ): Promise<{ success: boolean; id: string }> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException(NOTIFICATION_ERROR_CODES.NOT_FOUND);
    }

    if (notification.recipientId !== userId) {
      throw new ForbiddenException(NOTIFICATION_ERROR_CODES.FORBIDDEN);
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    return { success: true, id: notificationId };
  }

  async cleanExpiredNotifications(): Promise<{ deletedCount: number }> {
    const now = new Date();
    const result = await this.prisma.notification.deleteMany({
      where: {
        expiresAt: {
          not: null,
          lte: now,
        },
      },
    });

    return { deletedCount: result.count };
  }

  async getPreferences(userId: string): Promise<NotificationPreferenceResponse> {
    let pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!pref) {
      // Auto-create default preferences on first access
      pref = await this.prisma.notificationPreference.create({
        data: { userId },
      });
    }

    return {
      id: pref.id,
      userId: pref.userId,
      applicationUpdates: pref.applicationUpdates,
      bookingUpdates: pref.bookingUpdates,
      jobUpdates: pref.jobUpdates,
      messageUpdates: pref.messageUpdates,
      systemUpdates: pref.systemUpdates,
    };
  }

  async updatePreferences(
    userId: string,
    input: UpdateNotificationPreferenceInput,
  ): Promise<NotificationPreferenceResponse> {
    // Note: systemUpdates cannot be disabled by users (mandatory security/system notifications remain true)
    const pref = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        applicationUpdates: input.applicationUpdates ?? true,
        bookingUpdates: input.bookingUpdates ?? true,
        jobUpdates: input.jobUpdates ?? true,
        messageUpdates: input.messageUpdates ?? true,
        systemUpdates: true, // Always mandatory
      },
      update: {
        ...(input.applicationUpdates !== undefined && {
          applicationUpdates: input.applicationUpdates,
        }),
        ...(input.bookingUpdates !== undefined && {
          bookingUpdates: input.bookingUpdates,
        }),
        ...(input.jobUpdates !== undefined && {
          jobUpdates: input.jobUpdates,
        }),
        ...(input.messageUpdates !== undefined && {
          messageUpdates: input.messageUpdates,
        }),
        systemUpdates: true, // Server-enforced: cannot be turned off
      },
    });

    return {
      id: pref.id,
      userId: pref.userId,
      applicationUpdates: pref.applicationUpdates,
      bookingUpdates: pref.bookingUpdates,
      jobUpdates: pref.jobUpdates,
      messageUpdates: pref.messageUpdates,
      systemUpdates: pref.systemUpdates,
    };
  }

  private mapNotification(n: {
    id: string;
    type: string;
    title: string;
    body: string;
    priority: string;
    entityType: string | null;
    entityId: string | null;
    payload?: any;
    sourceEventId?: string | null;
    deliveryStatus?: string;
    isRead: boolean;
    readAt: Date | null;
    expiresAt?: Date | null;
    createdAt: Date;
  }): NotificationItem {
    return {
      id: n.id,
      type: n.type as NotificationType,
      title: n.title,
      body: n.body,
      priority: n.priority as NotificationPriority,
      entityType: n.entityType,
      entityId: n.entityId,
      payload: n.payload ?? null,
      sourceEventId: n.sourceEventId ?? null,
      deliveryStatus: n.deliveryStatus,
      isRead: n.isRead,
      readAt: n.readAt?.toISOString() ?? null,
      expiresAt: n.expiresAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
