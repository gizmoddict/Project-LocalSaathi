import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { MessagingGateway } from './messaging.gateway';
import { getApiConfig } from '../../../config/env.config';
import { MESSAGING_CONSTANTS } from '../messaging.constants';
import { WebSocketMessagingEvent } from '@localsaathi/types';

export interface DispatchMessageBroadcastPayload {
  conversationId?: string;
  recipientId?: string;
  envelope: WebSocketMessagingEvent;
}

@Injectable()
export class MessagingDispatcherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MessagingDispatcherService.name);
  private redisPublisher: Redis | null = null;
  private redisSubscriber: Redis | null = null;
  private isRedisConnected = false;

  constructor(private readonly gateway: MessagingGateway) {}

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
        this.logger.warn(`Redis messaging publisher error: ${err.message}`);
        this.isRedisConnected = false;
      });

      this.redisSubscriber.on('error', (err) => {
        this.logger.warn(`Redis messaging subscriber error: ${err.message}`);
        this.isRedisConnected = false;
      });

      await Promise.all([
        this.redisPublisher.connect(),
        this.redisSubscriber.connect(),
      ]);

      await this.redisSubscriber.subscribe(
        MESSAGING_CONSTANTS.REDIS_MESSAGING_CHANNEL,
      );

      this.redisSubscriber.on('message', (channel, message) => {
        if (channel === MESSAGING_CONSTANTS.REDIS_MESSAGING_CHANNEL) {
          this.handleInboundBroadcast(message);
        }
      });

      this.isRedisConnected = true;
      this.logger.log(
        `Redis messaging Pub/Sub connected on channel: ${MESSAGING_CONSTANTS.REDIS_MESSAGING_CHANNEL}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Redis messaging Pub/Sub init failed (${msg}). Falling back to local in-memory dispatch.`,
      );
      this.isRedisConnected = false;
    }
  }

  private readonly instanceId = Math.random().toString(36).substring(2, 9);

  /**
   * Broadcasts a real-time messaging event across all cluster nodes via Redis Pub/Sub,
   * while also delivering locally immediately.
   */
  async broadcast(payload: DispatchMessageBroadcastPayload): Promise<void> {
    // Immediate local delivery
    this.deliverLocally(payload);

    // Cluster fan-out via Redis Pub/Sub
    if (this.isRedisConnected && this.redisPublisher) {
      try {
        const messageEnvelope = {
          ...payload,
          originInstanceId: this.instanceId,
        };
        await this.redisPublisher.publish(
          MESSAGING_CONSTANTS.REDIS_MESSAGING_CHANNEL,
          JSON.stringify(messageEnvelope),
        );
      } catch (err) {
        this.logger.warn(`Redis messaging publish failed: ${err}`);
      }
    }
  }

  private handleInboundBroadcast(raw: string): void {
    try {
      const payload: DispatchMessageBroadcastPayload & { originInstanceId?: string } = JSON.parse(raw);
      // Skip if this message originated from the current instance
      if (payload.originInstanceId === this.instanceId) {
        return;
      }
      this.deliverLocally(payload);
    } catch (err) {
      this.logger.error(`Failed to parse inbound Redis messaging broadcast: ${err}`);
    }
  }

  private deliverLocally(payload: DispatchMessageBroadcastPayload): void {
    const { conversationId, recipientId, envelope } = payload;
    if (!envelope) return;

    if (conversationId) {
      this.gateway.sendToConversation(conversationId, envelope.event, envelope);
    }

    if (recipientId) {
      this.gateway.sendToUser(recipientId, envelope.event, envelope);
    }
  }
}
