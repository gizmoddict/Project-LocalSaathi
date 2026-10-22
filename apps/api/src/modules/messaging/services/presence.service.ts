import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../database/database.module';
import { getApiConfig } from '../../../config/env.config';
import { MESSAGING_CONSTANTS } from '../messaging.constants';
import { PresenceStatus } from '@localsaathi/types';

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private redis: Redis | null = null;
  private isRedisConnected = false;

  // In-memory fallback map (userId -> Set<socketId>)
  private readonly memorySockets = new Map<string, Set<string>>();

  constructor(private readonly prisma: PrismaService) {}

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
      this.redis.on('error', (err) => {
        this.logger.warn(`Redis presence error: ${err.message}`);
        this.isRedisConnected = false;
      });
      this.redis.on('connect', () => {
        this.isRedisConnected = true;
      });

      await this.redis.connect();
      this.isRedisConnected = true;
      this.logger.log('Redis PresenceService initialized successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Redis connection failed for presence (${msg}). Falling back to memory tracking.`,
      );
      this.isRedisConnected = false;
    }
  }

  /**
   * Registers a connected socket for a user.
   * Returns true if user transitioned from OFFLINE -> ONLINE.
   */
  async userOnline(userId: string, socketId: string): Promise<boolean> {
    let becameOnline = false;

    // 1. In-memory tracking
    if (!this.memorySockets.has(userId)) {
      this.memorySockets.set(userId, new Set());
    }
    const memSet = this.memorySockets.get(userId)!;
    const initialMemCount = memSet.size;
    memSet.add(socketId);

    // 2. Redis tracking
    if (this.isRedisConnected && this.redis) {
      try {
        const socketKey = `${MESSAGING_CONSTANTS.REDIS_USER_SOCKETS_PREFIX}${userId}`;
        const presenceKey = `${MESSAGING_CONSTANTS.REDIS_PRESENCE_KEY_PREFIX}${userId}`;

        const wasMember = await this.redis.sismember(socketKey, socketId);
        if (!wasMember) {
          await this.redis.sadd(socketKey, socketId);
          await this.redis.expire(socketKey, MESSAGING_CONSTANTS.PRESENCE_TTL_SECONDS * 2);
        }

        const count = await this.redis.scard(socketKey);
        await this.redis.set(
          presenceKey,
          'ONLINE',
          'EX',
          MESSAGING_CONSTANTS.PRESENCE_TTL_SECONDS,
        );

        becameOnline = count === 1;
      } catch (err) {
        this.logger.warn(`Redis userOnline error: ${err}`);
        becameOnline = initialMemCount === 0;
      }
    } else {
      becameOnline = initialMemCount === 0;
    }

    // Persist snapshot in DB asynchronously (ephemeral update, no crash if fails)
    if (becameOnline) {
      this.prisma.userPresence
        .upsert({
          where: { userId },
          create: { userId, status: 'ONLINE', lastSeenAt: new Date() },
          update: { status: 'ONLINE', lastSeenAt: new Date() },
        })
        .catch((err) => this.logger.debug(`UserPresence DB update skipped: ${err}`));
    }

    return becameOnline;
  }

  /**
   * Deregisters a socket for a user.
   * Returns true if user transitioned from ONLINE -> OFFLINE (no active sockets remain).
   */
  async userOffline(userId: string, socketId: string): Promise<boolean> {
    let becameOffline = false;

    // 1. In-memory tracking
    if (this.memorySockets.has(userId)) {
      const memSet = this.memorySockets.get(userId)!;
      memSet.delete(socketId);
      if (memSet.size === 0) {
        this.memorySockets.delete(userId);
        becameOffline = true;
      }
    }

    // 2. Redis tracking
    if (this.isRedisConnected && this.redis) {
      try {
        const socketKey = `${MESSAGING_CONSTANTS.REDIS_USER_SOCKETS_PREFIX}${userId}`;
        const presenceKey = `${MESSAGING_CONSTANTS.REDIS_PRESENCE_KEY_PREFIX}${userId}`;

        await this.redis.srem(socketKey, socketId);
        const count = await this.redis.scard(socketKey);

        if (count === 0) {
          await this.redis.del(presenceKey);
          await this.redis.del(socketKey);
          becameOffline = true;
        } else {
          becameOffline = false;
        }
      } catch (err) {
        this.logger.warn(`Redis userOffline error: ${err}`);
      }
    }

    if (becameOffline) {
      this.prisma.userPresence
        .upsert({
          where: { userId },
          create: { userId, status: 'OFFLINE', lastSeenAt: new Date() },
          update: { status: 'OFFLINE', lastSeenAt: new Date() },
        })
        .catch((err) => this.logger.debug(`UserPresence DB update skipped: ${err}`));
    }

    return becameOffline;
  }

  /**
   * Heartbeat to keep Redis presence key refreshed.
   */
  async heartbeat(userId: string): Promise<void> {
    if (this.isRedisConnected && this.redis) {
      try {
        const presenceKey = `${MESSAGING_CONSTANTS.REDIS_PRESENCE_KEY_PREFIX}${userId}`;
        await this.redis.set(
          presenceKey,
          'ONLINE',
          'EX',
          MESSAGING_CONSTANTS.PRESENCE_TTL_SECONDS,
        );
      } catch (err) {
        this.logger.debug(`Heartbeat refresh error: ${err}`);
      }
    }
  }

  /**
   * Gets current presence for a user.
   */
  async getUserPresence(userId: string): Promise<PresenceStatus> {
    if (this.isRedisConnected && this.redis) {
      try {
        const status = await this.redis.get(
          `${MESSAGING_CONSTANTS.REDIS_PRESENCE_KEY_PREFIX}${userId}`,
        );
        if (status === 'ONLINE') return 'ONLINE';
      } catch (err) {
        this.logger.debug(`Redis getUserPresence error: ${err}`);
      }
    }

    if (this.memorySockets.has(userId) && this.memorySockets.get(userId)!.size > 0) {
      return 'ONLINE';
    }

    return 'OFFLINE';
  }

  /**
   * Bulk query presences.
   */
  async getUserPresences(
    userIds: string[],
  ): Promise<Record<string, PresenceStatus>> {
    const result: Record<string, PresenceStatus> = {};
    if (!userIds || userIds.length === 0) return result;

    if (this.isRedisConnected && this.redis) {
      try {
        const keys = userIds.map(
          (id) => `${MESSAGING_CONSTANTS.REDIS_PRESENCE_KEY_PREFIX}${id}`
        );
        const redisStatuses = await this.redis.mget(...keys);
        userIds.forEach((id, index) => {
          if (redisStatuses[index] === 'ONLINE') {
            result[id] = 'ONLINE';
          }
        });
      } catch (err) {
        this.logger.debug(`Redis bulk getUserPresences error: ${err}`);
      }
    }

    // Fast-path memory sockets check for remainder or offline fallback
    for (const id of userIds) {
      if (!result[id]) {
        if (this.memorySockets.has(id) && this.memorySockets.get(id)!.size > 0) {
          result[id] = 'ONLINE';
        } else {
          result[id] = 'OFFLINE';
        }
      }
    }

    return result;
  }
}
