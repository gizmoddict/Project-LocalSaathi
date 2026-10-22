import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../database/database.module';
import { NotificationGateway } from './notification.gateway';
import { getApiConfig } from '../../../config/env.config';
import { OUTBOX_CONSTANTS } from '../outbox.constants';
import { NotificationDeliveryStatus, WebSocketNotificationEvent } from '@localsaathi/types';

export interface DispatchNotificationPayload {
  recipientId: string;
  notificationId?: string;
  eventType: 'notification.created' | 'notification.read' | 'notification.count_updated';
  notification?: any;
  unreadCount?: number;
}

@Injectable()
export class NotificationDispatcherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private redisPublisher: Redis | null = null;
  private redisSubscriber: Redis | null = null;
  private isRedisConnected = false;

  constructor(
    private readonly gateway: NotificationGateway,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.initRedis();
  }

  async onModuleDestroy() {
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit().catch(() => undefined);
    }
    if (this.redisPublisher) {
      await this.redisPublisher.quit().catch(() => undefined);
    }
  }

  private async initRedis(): Promise<void> {
    const config = getApiConfig();
    const redisOptions = {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
      maxRetriesPerRequest: null,
    };

    try {
      this.redisPublisher = new Redis(redisOptions);
      this.redisSubscriber = new Redis(redisOptions);

      this.redisPublisher.on('error', (err) => {
        this.logger.warn(`Redis publisher error: ${err.message}`);
        this.isRedisConnected = false;
      });

      this.redisSubscriber.on('error', (err) => {
        this.logger.warn(`Redis subscriber error: ${err.message}`);
        this.isRedisConnected = false;
      });

      await Promise.all([
        this.redisPublisher.connect(),
        this.redisSubscriber.connect(),
      ]);

      await this.redisSubscriber.subscribe(
        OUTBOX_CONSTANTS.REDIS_NOTIFICATION_CHANNEL,
      );

      this.redisSubscriber.on('message', (channel, message) => {
        if (channel === OUTBOX_CONSTANTS.REDIS_NOTIFICATION_CHANNEL) {
          this.handleInboundBroadcast(message);
        }
      });

      this.isRedisConnected = true;
      this.logger.log(
        `Redis Pub/Sub connected on channel: ${OUTBOX_CONSTANTS.REDIS_NOTIFICATION_CHANNEL}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Redis Pub/Sub initialization failed (${msg}). Falling back to local in-memory dispatch.`,
      );
      this.isRedisConnected = false;
    }
  }

  /**
   * Dispatches a real-time notification to the recipient.
   * If Redis is healthy, broadcasts via Redis Pub/Sub so all API nodes can reach connected sockets.
   * Also delivers directly locally.
   */
  async dispatch(payload: DispatchNotificationPayload): Promise<void> {
    const envelope: WebSocketNotificationEvent = {
      event: payload.eventType,
      notification: payload.notification,
      unreadCount: payload.unreadCount,
      notificationId: payload.notificationId,
      timestamp: new Date().toISOString(),
    };

    // 1. Multi-instance fan-out via Redis Pub/Sub
    if (this.isRedisConnected && this.redisPublisher) {
      try {
        const serialized = JSON.stringify({
          recipientId: payload.recipientId,
          notificationId: payload.notificationId,
          envelope,
        });

        await this.redisPublisher.publish(
          OUTBOX_CONSTANTS.REDIS_NOTIFICATION_CHANNEL,
          serialized,
        );
      } catch (err: unknown) {
        this.logger.warn(`Redis publish failed, using direct local dispatch: ${err}`);
        this.deliverLocally(payload.recipientId, payload.notificationId, envelope);
      }
    } else {
      // Direct local dispatch fallback
      this.deliverLocally(payload.recipientId, payload.notificationId, envelope);
    }
  }

  /**
   * Handles inbound Redis message broadcasted by this or another worker node.
   */
  private handleInboundBroadcast(message: string): void {
    try {
      const parsed = JSON.parse(message);
      const { recipientId, notificationId, envelope } = parsed;
      this.deliverLocally(recipientId, notificationId, envelope);
    } catch (err) {
      this.logger.error(`Failed to parse inbound Redis notification broadcast: ${err}`);
    }
  }

  /**
   * Delivers to locally connected client via WebSocket and marks delivery status.
   */
  private deliverLocally(
    recipientId: string,
    notificationId?: string,
    envelope?: WebSocketNotificationEvent,
  ): void {
    if (!envelope) return;

    const delivered = this.gateway.sendToUser(
      recipientId,
      envelope.event,
      envelope,
    );

    // Also emit friendly colon-separated event names for frontend compatibility
    if (envelope.event === 'notification.created') {
      this.gateway.sendToUser(recipientId, 'notification:new', envelope);
    } else if (envelope.event === 'notification.read') {
      this.gateway.sendToUser(recipientId, 'notification:read', envelope);
    } else if (envelope.event === 'notification.count_updated') {
      this.gateway.sendToUser(recipientId, 'notifications:all_read', envelope);
    }

    // If delivered to active socket and notificationId provided, update delivery status
    if (delivered && notificationId) {
      this.prisma.notification
        .update({
          where: { id: notificationId },
          data: {
            deliveryStatus: NotificationDeliveryStatus.DELIVERED,
            deliveredAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  }
}
