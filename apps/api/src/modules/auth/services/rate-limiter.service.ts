import { Injectable, Logger, HttpException, HttpStatus, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { getApiConfig } from '../../../config/env.config';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthRateLimiterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthRateLimiterService.name);
  private readonly inMemoryStore = new Map<string, RateLimitRecord>();
  private redis: Redis | null = null;
  private isRedisConnected = false;

  async onModuleInit(): Promise<void> {
    await this.initRedis();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  private async initRedis(): Promise<void> {
    try {
      const config = getApiConfig();
      const redisOptions = {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD || undefined,
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
        lazyConnect: true,
      };

      this.redis = new Redis(redisOptions);
      this.redis.on('error', (err) => {
        this.logger.debug(`Redis rate limiter connection error: ${err.message}`);
        this.isRedisConnected = false;
      });

      await this.redis.connect();
      this.isRedisConnected = true;
      this.logger.log('AuthRateLimiterService: Connected to distributed Redis store');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis connection failed (${msg}). Falling back to in-memory rate limiting.`);
      this.isRedisConnected = false;
    }
  }

  /**
   * Enforces sliding window rate limit for an action keyed by identifier (e.g. IP, phone).
   * Backed by distributed Redis with atomic operations, falling back to local memory.
   * Throws 429 Too Many Requests if limit is exceeded.
   */
  async checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<void> {
    // 1. Primary path: Distributed Redis token bucket / counter
    if (this.isRedisConnected && this.redis) {
      try {
        const redisKey = `ratelimit:${key}`;
        const current = await this.redis.incr(redisKey);

        if (current === 1) {
          await this.redis.expire(redisKey, windowSeconds);
        }

        if (current > maxRequests) {
          let ttl = await this.redis.ttl(redisKey);
          if (ttl <= 0) {
            ttl = windowSeconds;
          }
          this.logger.warn(
            `Rate limit exceeded (Redis) for key=${key}. Limit=${maxRequests}/${windowSeconds}s. RetryAfter=${ttl}s`
          );

          throw new HttpException(
            {
              success: false,
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: `Too many requests. Please try again in ${ttl} seconds.`,
                retryAfterSeconds: ttl,
              },
            },
            HttpStatus.TOO_MANY_REQUESTS
          );
        }
        return;
      } catch (err) {
        if (err instanceof HttpException) {
          throw err;
        }
        this.logger.debug(`Redis rate limiter error (${err}), falling back to memory store`);
      }
    }

    // 2. Secondary fallback path: Local in-memory store
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const existing = this.inMemoryStore.get(key);

    if (!existing || now > existing.resetAt) {
      this.inMemoryStore.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    if (existing.count >= maxRequests) {
      const waitSeconds = Math.ceil((existing.resetAt - now) / 1000);
      this.logger.warn(
        `Rate limit exceeded (Memory) for key=${key}. Limit=${maxRequests}/${windowSeconds}s. Wait=${waitSeconds}s`
      );

      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests. Please try again in ${waitSeconds} seconds.`,
            retryAfterSeconds: waitSeconds,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    existing.count += 1;
  }

  /**
   * Helper for OTP request endpoint: checks both phone rate limit and client IP rate limit.
   */
  async checkOtpRequestRateLimit(phone: string, ip: string): Promise<void> {
    const config = getApiConfig();
    const maxReq = config.RATE_LIMIT_OTP_REQUESTS;
    const windowSeconds = 15 * 60; // 15-minute sliding window

    await this.checkRateLimit(`otp_req_phone:${phone}`, maxReq, windowSeconds);
    if (ip && ip !== 'unknown') {
      await this.checkRateLimit(`otp_req_ip:${ip}`, maxReq * 3, windowSeconds);
    }
  }

  /**
   * Helper for OTP verification endpoint: checks verification attempts per phone and IP.
   */
  async checkOtpVerifyRateLimit(phone: string, ip: string): Promise<void> {
    const config = getApiConfig();
    const maxReq = config.RATE_LIMIT_OTP_VERIFY;
    const windowSeconds = 15 * 60; // 15-minute sliding window

    await this.checkRateLimit(`otp_verify_phone:${phone}`, maxReq, windowSeconds);
    if (ip && ip !== 'unknown') {
      await this.checkRateLimit(`otp_verify_ip:${ip}`, maxReq * 3, windowSeconds);
    }
  }

  /**
   * Helper for session refresh endpoint.
   */
  async checkRefreshRateLimit(sessionId: string, ip: string): Promise<void> {
    await this.checkRateLimit(`refresh_session:${sessionId}`, 30, 60); // Max 30 refreshes per min
    if (ip && ip !== 'unknown') {
      await this.checkRateLimit(`refresh_ip:${ip}`, 60, 60);
    }
  }

  /**
   * Resets rate limit record for a key (e.g. upon successful verification).
   */
  resetRateLimit(key: string): void {
    this.inMemoryStore.delete(key);
    if (this.isRedisConnected && this.redis) {
      this.redis.del(`ratelimit:${key}`).catch(() => undefined);
    }
  }
}
