// ==============================================================================
// LocalSaathi — Distributed Redis Cache Service (Phase 19)
// Cache-Aside, Distributed Stampede Protection, Safe Fallback & Metric Observability
// ==============================================================================

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { getApiConfig } from '../../config/env.config';
import { CACHE_CONSTANTS } from './cache.constants';
import { CacheKeys } from './cache-keys';
import { CacheMetrics } from './cache.metrics';
import { CacheWrapOptions } from '@localsaathi/types';
import { Optional } from '@nestjs/common';
import { MetricsService } from '../../common/observability/metrics.service';
import { withTimeout } from '../../common/resilience/timeout.util';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private isConnected = false;
  private isShuttingDown = false;

  // In-memory single-flight promise map for intra-process deduplication
  private readonly inFlightPromises = new Map<string, Promise<any>>();

  // Lua script to safely release distributed mutex lock only if value matches
  private static readonly RELEASE_LOCK_LUA = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  constructor(
    private readonly metrics: CacheMetrics,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initRedisClient();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
      this.redis = null;
    }
  }

  private async initRedisClient(): Promise<void> {
    if (this.redis) return;

    try {
      const config = getApiConfig();
      const host = config.REDIS_HOST || 'localhost';
      const port = config.REDIS_PORT || 6379;
      const password = config.REDIS_PASSWORD || undefined;

      this.redis = new Redis({
        host,
        port,
        password,
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        retryStrategy: (times) => {
          if (this.isShuttingDown) return null;
          if (this.metricsService) {
            try {
              this.metricsService.incrementCounter('reconnect_attempts_total', {
                subsystem: 'REDIS_CACHE',
              });
            } catch {
              // Bounded metric protection
            }
          }
          // Exponential backoff capped at 2000ms
          return Math.min(times * 100, 2000);
        },
        lazyConnect: false,
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Redis Cache Client connected successfully on ${host}:${port}`);
      });

      this.redis.on('ready', () => {
        this.isConnected = true;
      });

      this.redis.on('error', (err) => {
        if (!this.isConnected) {
          this.logger.warn(`Redis Cache connection error (running in degraded fallback mode): ${err.message}`);
        }
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        this.isConnected = false;
      });
    } catch (err: any) {
      this.logger.warn(`Failed to initialize Redis client. Falling back to direct database execution: ${err.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Helper to extract namespace from standard key for metric tracking.
   */
  private getNamespace(key: string): string {
    const parts = key.split(':');
    return (parts.length >= 3 && parts[2]) ? parts[2] : 'unknown';
  }

  /**
   * Check whether Redis connection is alive and healthy.
   */
  isAvailable(): boolean {
    return this.isConnected && this.redis !== null && this.redis.status === 'ready';
  }

  /**
   * Retrieve cached value. Returns null on miss or Redis unavailability.
   */
  async get<T>(key: string): Promise<T | null> {
    const ns = this.getNamespace(key);
    if (!this.isAvailable()) {
      this.metrics.recordMiss(ns);
      return null;
    }

    const timeoutMs = parseInt(process.env.REDIS_OPERATION_TIMEOUT_MS || '1500', 10);
    try {
      const raw = await withTimeout(
        this.redis!.get(key),
        { timeoutMs, operationName: 'cache_get', dependency: 'REDIS' },
        this.metricsService,
      );

      if (raw === null) {
        this.metrics.recordMiss(ns);
        return null;
      }

      this.metrics.recordHit(ns);
      if (raw === CACHE_CONSTANTS.NEGATIVE_SENTINEL) {
        return CACHE_CONSTANTS.NEGATIVE_SENTINEL as unknown as T;
      }

      return JSON.parse(raw) as T;
    } catch (err: any) {
      this.metrics.recordGetFailure();
      if (this.metricsService) {
        try {
          this.metricsService.incrementCounter('fallback_total', {
            subsystem: 'CACHE',
            operation: 'get',
          });
        } catch {
          // Bounded metric protection
        }
      }
      this.logger.warn(`Cache get failed for key "${key}": ${err.message}`);
      return null;
    }
  }

  /**
   * Set cached value with explicit TTL. Gracefully ignores failures if Redis is down.
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    if (!this.isAvailable()) return false;

    const timeoutMs = parseInt(process.env.REDIS_OPERATION_TIMEOUT_MS || '1500', 10);
    try {
      const serialized =
        value === CACHE_CONSTANTS.NEGATIVE_SENTINEL
          ? CACHE_CONSTANTS.NEGATIVE_SENTINEL
          : JSON.stringify(value);

      // Value size boundary check
      if (Buffer.byteLength(serialized, 'utf8') > CACHE_CONSTANTS.LIMITS.MAX_PAYLOAD_BYTES) {
        this.logger.warn(
          `Cache set skipped: payload size for key "${key}" exceeds limit (${CACHE_CONSTANTS.LIMITS.MAX_PAYLOAD_BYTES} bytes)`,
        );
        return false;
      }

      await withTimeout(
        this.redis!.set(key, serialized, 'EX', Math.max(1, ttlSeconds)),
        { timeoutMs, operationName: 'cache_set', dependency: 'REDIS' },
        this.metricsService,
      );
      return true;
    } catch (err: any) {
      this.metrics.recordSetFailure();
      this.logger.warn(`Cache set failed for key "${key}": ${err.message}`);
      return false;
    }
  }

  /**
   * Explicitly invalidate a single key or array of keys.
   */
  async del(key: string | string[]): Promise<number> {
    if (!this.isAvailable()) return 0;

    const keys = Array.isArray(key) ? key : [key];
    if (keys.length === 0) return 0;

    try {
      const count = await this.redis!.del(...keys);
      this.metrics.recordInvalidation(count);
      return count;
    } catch (err: any) {
      this.logger.warn(`Cache del failed for keys: ${err.message}`);
      return 0;
    }
  }

  /**
   * Safe pattern-based deletion using non-blocking SCAN.
   * NEVER uses KEYS * to avoid blocking the Redis event loop.
   */
  async delPattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) return 0;

    let cursor = '0';
    let totalDeleted = 0;

    try {
      do {
        const [nextCursor, matchingKeys] = await this.redis!.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        if (matchingKeys.length > 0) {
          const deleted = await this.redis!.del(...matchingKeys);
          totalDeleted += deleted;
        }
      } while (cursor !== '0');

      this.metrics.recordInvalidation(totalDeleted);
      return totalDeleted;
    } catch (err: any) {
      this.logger.warn(`Cache delPattern failed for pattern "${pattern}": ${err.message}`);
      return 0;
    }
  }

  /**
   * Acquire a short-lived distributed mutex lock for stampede protection.
   */
  async acquireLock(lockKey: string, lockValue: string, ttlMs: number): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const timeoutMs = parseInt(process.env.REDIS_OPERATION_TIMEOUT_MS || '1500', 10);
    try {
      const res = await withTimeout(
        this.redis!.set(lockKey, lockValue, 'PX', ttlMs, 'NX'),
        { timeoutMs, operationName: 'cache_acquire_lock', dependency: 'REDIS' },
        this.metricsService,
      );
      return res === 'OK';
    } catch {
      return false;
    }
  }

  /**
   * Release the distributed mutex lock only if the lockValue matches.
   */
  async releaseLock(lockKey: string, lockValue: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const timeoutMs = parseInt(process.env.REDIS_OPERATION_TIMEOUT_MS || '1500', 10);
    try {
      const res = await withTimeout(
        this.redis!.eval(
          CacheService.RELEASE_LOCK_LUA,
          1,
          lockKey,
          lockValue,
        ),
        { timeoutMs, operationName: 'cache_release_lock', dependency: 'REDIS' },
        this.metricsService,
      );
      return res === 1;
    } catch {
      return false;
    }
  }

  /**
   * Cache-Aside Pattern with Single-Flight & Distributed Stampede Protection.
   */
  async wrap<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheWrapOptions,
  ): Promise<T> {
    // 1. Try reading from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      if (cached === (CACHE_CONSTANTS.NEGATIVE_SENTINEL as unknown as T)) {
        return null as unknown as T;
      }
      return cached;
    }

    // 2. If Redis is unavailable, bypass caching and fetch directly from source
    if (!this.isAvailable()) {
      return fetchFn();
    }

    // 3. Intra-process single-flight deduplication
    if (this.inFlightPromises.has(key)) {
      this.metrics.recordStampedeWait();
      return this.inFlightPromises.get(key);
    }

    // 4. If stampede protection is not requested, fetch and store
    if (!options.stampedeProtect) {
      const promise = fetchFn()
        .then(async (result) => {
          if (result !== null && result !== undefined) {
            await this.set(key, result, options.ttl);
          } else if (options.negativeCache) {
            await this.set(
              key,
              CACHE_CONSTANTS.NEGATIVE_SENTINEL,
              options.negativeTtl || CACHE_CONSTANTS.TTL.NEGATIVE_CACHE,
            );
          }
          return result;
        })
        .finally(() => {
          this.inFlightPromises.delete(key);
        });

      this.inFlightPromises.set(key, promise);
      return promise;
    }

    // 5. Distributed stampede protection with Redis mutex lock
    const lockKey = CacheKeys.lock(key);
    const lockValue = crypto.randomUUID();
    const lockTtlMs = options.lockTtlMs || CACHE_CONSTANTS.LOCK.LEASE_MS;
    const waitTimeoutMs = options.lockWaitTimeoutMs || CACHE_CONSTANTS.LOCK.WAIT_TIMEOUT_MS;

    const acquired = await this.acquireLock(lockKey, lockValue, lockTtlMs);

    if (acquired) {
      this.metrics.recordStampedeLock();
      const promise = (async () => {
        try {
          const result = await fetchFn();
          if (result !== null && result !== undefined) {
            await this.set(key, result, options.ttl);
          } else if (options.negativeCache) {
            await this.set(
              key,
              CACHE_CONSTANTS.NEGATIVE_SENTINEL,
              options.negativeTtl || CACHE_CONSTANTS.TTL.NEGATIVE_CACHE,
            );
          }
          return result;
        } finally {
          await this.releaseLock(lockKey, lockValue);
          this.inFlightPromises.delete(key);
        }
      })();

      this.inFlightPromises.set(key, promise);
      return promise;
    }

    // Another worker holds the lock: wait for cache population with bounded polling
    this.metrics.recordStampedeWait();
    const startTime = Date.now();
    const pollInterval = CACHE_CONSTANTS.LOCK.POLL_INTERVAL_MS;

    while (Date.now() - startTime < waitTimeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      const retryCached = await this.get<T>(key);
      if (retryCached !== null) {
        if (retryCached === (CACHE_CONSTANTS.NEGATIVE_SENTINEL as unknown as T)) {
          return null as unknown as T;
        }
        return retryCached;
      }
    }

    // Bounded timeout reached: fallback to direct execution to avoid hanging
    return fetchFn();
  }

  /**
   * Diagnostic health check for Redis cache subsystem.
   */
  async checkHealth(): Promise<{
    status: 'HEALTHY' | 'DEGRADED';
    latencyMs: number;
    metrics: ReturnType<CacheMetrics['getSnapshot']>;
  }> {
    const startTime = Date.now();
    if (!this.isAvailable()) {
      return {
        status: 'DEGRADED',
        latencyMs: -1,
        metrics: this.metrics.getSnapshot(),
      };
    }

    try {
      const pong = await this.redis!.ping();
      const latencyMs = Date.now() - startTime;
      return {
        status: pong === 'PONG' ? 'HEALTHY' : 'DEGRADED',
        latencyMs,
        metrics: this.metrics.getSnapshot(),
      };
    } catch {
      return {
        status: 'DEGRADED',
        latencyMs: -1,
        metrics: this.metrics.getSnapshot(),
      };
    }
  }

  getMetrics(): CacheMetrics {
    return this.metrics;
  }
}
