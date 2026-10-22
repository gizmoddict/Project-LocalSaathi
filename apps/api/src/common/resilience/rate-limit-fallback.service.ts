// ==============================================================================
// LocalSaathi — Resilient Rate Limiter with In-Memory Safe Fallback (Phase 22)
// Protects Sensitive Endpoints (OTP, Auth, Payments, Messaging, Admin)
// When Redis is Unavailable, Seamlessly Degrades to Sliding Memory Windows (Section 22)
// ==============================================================================

import { Injectable, Logger, Optional, HttpException, HttpStatus } from '@nestjs/common';
import Redis from 'ioredis';
import { MetricsService } from '../observability/metrics.service';

interface MemoryRateLimitRecord {
  count: number;
  resetAt: number;
}

@Injectable()
export class ResilienceRateLimiter {
  private readonly logger = new Logger(ResilienceRateLimiter.name);
  private readonly memoryStore = new Map<string, MemoryRateLimitRecord>();

  constructor(@Optional() private readonly metricsService?: MetricsService) {}

  /**
   * Enforces sliding window rate limit with distributed Redis when connected,
   * falling back automatically to in-memory sliding window when Redis is degraded.
   */
  async checkRateLimit(
    redisClient: Redis | null,
    key: string,
    maxRequests: number,
    windowSeconds: number,
    endpointName: string = 'generic',
  ): Promise<void> {
    const isRedisReady = redisClient !== null && redisClient.status === 'ready';

    if (isRedisReady) {
      try {
        const redisKey = `ratelimit:${key}`;
        const current = await redisClient.incr(redisKey);

        if (current === 1) {
          await redisClient.expire(redisKey, windowSeconds);
        }

        if (current > maxRequests) {
          let ttl = await redisClient.ttl(redisKey);
          if (ttl <= 0) ttl = windowSeconds;

          if (this.metricsService) {
            try {
              this.metricsService.incrementCounter('rate_limit_exceeded_total', {
                endpoint: endpointName,
                backend: 'redis',
              });
            } catch {
              // Bounded metric protection
            }
          }

          throw new HttpException(
            {
              success: false,
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: `Too many requests. Please try again in ${ttl} seconds.`,
                retryAfterSeconds: ttl,
              },
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        return;
      } catch (err) {
        if (err instanceof HttpException) {
          throw err;
        }
        this.logger.warn(
          `Redis rate limiting failed for key '${key}'. Falling back to in-memory window. Reason: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );

        if (this.metricsService) {
          try {
            this.metricsService.incrementCounter('fallback_total', {
              subsystem: 'RATE_LIMITER',
              operation: endpointName,
            });
          } catch {
            // Bounded metric protection
          }
        }
      }
    }

    // Secondary fallback path: Local in-memory store
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const existing = this.memoryStore.get(key);

    if (!existing || now > existing.resetAt) {
      this.memoryStore.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    if (existing.count >= maxRequests) {
      const waitSeconds = Math.ceil((existing.resetAt - now) / 1000);

      if (this.metricsService) {
        try {
          this.metricsService.incrementCounter('rate_limit_exceeded_total', {
            endpoint: endpointName,
            backend: 'memory_fallback',
          });
        } catch {
          // Bounded metric protection
        }
      }

      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests. Please try again in ${waitSeconds} seconds.`,
            retryAfterSeconds: waitSeconds,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
  }
}
