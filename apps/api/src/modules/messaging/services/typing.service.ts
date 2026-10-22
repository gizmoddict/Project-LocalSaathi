import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { getApiConfig } from '../../../config/env.config';
import { MESSAGING_CONSTANTS } from '../messaging.constants';

@Injectable()
export class TypingService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private isRedisConnected = false;
  private readonly memoryTyping = new Map<string, number>(); // key -> expiry timestamp

  async onModuleInit() {
    await this.initRedis();
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
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
      this.redis = new Redis(redisOptions);
      this.redis.on('error', () => {
        this.isRedisConnected = false;
      });
      await this.redis.connect();
      this.isRedisConnected = true;
    } catch {
      this.isRedisConnected = false;
    }
  }

  /**
   * Sets typing state. Returns true if state should be broadcasted (i.e. debounced).
   */
  async setTyping(
    conversationId: string,
    userId: string,
    isTyping: boolean,
  ): Promise<boolean> {
    const key = `${MESSAGING_CONSTANTS.REDIS_TYPING_KEY_PREFIX}${conversationId}:${userId}`;

    if (!isTyping) {
      if (this.isRedisConnected && this.redis) {
        await this.redis.del(key).catch(() => undefined);
      }
      this.memoryTyping.delete(key);
      return true; // Broadcast typing stopped
    }

    // When starting typing, check if already marked active recently (debouncing)
    const now = Date.now();
    if (this.isRedisConnected && this.redis) {
      try {
        const wasSet = await this.redis.set(
          key,
          '1',
          'EX',
          MESSAGING_CONSTANTS.TYPING_TTL_SECONDS,
          'NX',
        );
        return wasSet === 'OK';
      } catch {
        // Fallback to memory
      }
    }

    const lastTime = this.memoryTyping.get(key);
    if (!lastTime || now - lastTime > MESSAGING_CONSTANTS.TYPING_TTL_SECONDS * 1000) {
      this.memoryTyping.set(key, now);
      return true;
    }

    return false;
  }
}
