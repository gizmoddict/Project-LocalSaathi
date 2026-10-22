// ==============================================================================
// LocalSaathi — Distributed Redis Cache Subsystem Integration Tests (Phase 19)
// Validates:
//  - Cache-Aside lifecycle (Miss -> Store -> Hit)
//  - Single-flight & Distributed Mutex stampede suppression under concurrency
//  - Negative caching sentinel (__LOCALSAATHI_NIL__)
//  - Non-blocking SCAN-based pattern invalidation
//  - Outbox domain event invalidation handler
//  - Graceful degradation when Redis encounters connectivity failures
// ==============================================================================

import * as net from 'net';
import { EventEmitter } from 'events';
import { CacheService } from '../cache.service';
import { CacheMetrics } from '../cache.metrics';
import { CacheKeys } from '../cache-keys';
import { CACHE_CONSTANTS } from '../cache.constants';
import { CacheInvalidationHandler } from '../../outbox/handlers/cache-invalidation.handler';
import { DomainEventEnvelope } from '@localsaathi/types';

describe('Distributed Cache Subsystem Integration Tests (Phase 19)', () => {
  let isLiveRedisAvailable = false;
  let metrics: CacheMetrics;

  beforeAll(async () => {
    // Check if live Redis server is running on localhost:6379
    await new Promise<void>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.once('connect', () => {
        isLiveRedisAvailable = true;
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        resolve();
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve();
      });
      socket.connect(6379, 'localhost');
    });
  });

  beforeEach(() => {
    metrics = new CacheMetrics();
  });

  describe('1. Live Redis Server Integration (Conditional if Redis 7.2 is online)', () => {
    let liveCacheService: CacheService;

    beforeAll(async () => {
      if (isLiveRedisAvailable) {
        liveCacheService = new CacheService(metrics);
        await liveCacheService.onModuleInit();
      }
    });

    afterAll(async () => {
      if (liveCacheService) {
        await liveCacheService.onModuleDestroy();
      }
    });

    it('should complete cache-aside write, read, and invalidation on real Redis server', async () => {
      if (!isLiveRedisAvailable) {
        console.warn('Live Redis on port 6379 unavailable — skipping live network test');
        return;
      }

      const testKey = 'local_saathi:v1:test:live:item1';
      let fetchCount = 0;
      const fetchFn = async () => {
        fetchCount++;
        return { message: 'hello from live redis', timestamp: Date.now() };
      };

      // 1. Cold miss -> fetches
      const val1 = await liveCacheService.wrap(testKey, fetchFn, { ttl: 60 });
      expect(fetchCount).toBe(1);
      expect(val1.message).toBe('hello from live redis');

      // 2. Warm hit -> does not fetch
      const val2 = await liveCacheService.wrap(testKey, fetchFn, { ttl: 60 });
      expect(fetchCount).toBe(1);
      expect(val2.message).toBe('hello from live redis');

      // 3. Delete key
      await liveCacheService.del(testKey);

      // 4. Next read is a miss -> fetches again
      const val3 = await liveCacheService.wrap(testKey, fetchFn, { ttl: 60 });
      expect(fetchCount).toBe(2);
      expect(val3.message).toBe('hello from live redis');

      // Cleanup
      await liveCacheService.del(testKey);
    });
  });

  describe('2. Comprehensive Redis Protocol & Cache-Aside Simulation', () => {
    let mockRedisStore: Map<string, { value: string; expiresAt?: number }>;
    let mockRedis: any;
    let cacheService: CacheService;

    beforeEach(() => {
      mockRedisStore = new Map();

      mockRedis = new EventEmitter();
      mockRedis.status = 'ready';

      // Implement Redis commands matching ioredis API
      mockRedis.get = jest.fn(async (key: string) => {
        const item = mockRedisStore.get(key);
        if (!item) return null;
        if (item.expiresAt && Date.now() > item.expiresAt) {
          mockRedisStore.delete(key);
          return null;
        }
        return item.value;
      });

      mockRedis.set = jest.fn(async (key: string, value: string, ...args: any[]) => {
        let ttlMs: number | undefined;
        let nx = false;

        for (let i = 0; i < args.length; i++) {
          if (args[i] === 'EX') {
            ttlMs = Number(args[i + 1]) * 1000;
            i++;
          } else if (args[i] === 'PX') {
            ttlMs = Number(args[i + 1]);
            i++;
          } else if (args[i] === 'NX') {
            nx = true;
          }
        }

        if (nx) {
          const existing = mockRedisStore.get(key);
          if (existing && (!existing.expiresAt || Date.now() <= existing.expiresAt)) {
            return null; // Key already exists
          }
        }

        mockRedisStore.set(key, {
          value,
          expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
        });
        return 'OK';
      });

      mockRedis.del = jest.fn(async (...keys: string[]) => {
        let deleted = 0;
        for (const k of keys) {
          if (mockRedisStore.delete(k)) deleted++;
        }
        return deleted;
      });

      mockRedis.eval = jest.fn(async (_script: string, _numKeys: number, key: string, expectedVal: string) => {
        const item = mockRedisStore.get(key);
        if (item && item.value === expectedVal) {
          mockRedisStore.delete(key);
          return 1;
        }
        return 0;
      });

      mockRedis.scan = jest.fn(async (_cursor: string, _matchKeyword: string, pattern: string, _countKeyword: string, _count: number) => {
        const regexStr = '^' + pattern.replace(/\*/g, '.*') + '$';
        const regex = new RegExp(regexStr);
        const matchingKeys: string[] = [];

        for (const k of mockRedisStore.keys()) {
          if (regex.test(k)) {
            matchingKeys.push(k);
          }
        }

        // Return all in cursor '0' for single-iteration mock
        return ['0', matchingKeys];
      });

      mockRedis.quit = jest.fn(async () => 'OK');
      mockRedis.disconnect = jest.fn();

      cacheService = new CacheService(metrics);
      // Inject simulated Redis client
      (cacheService as any).redis = mockRedis;
      (cacheService as any).isConnected = true;
    });

    afterEach(async () => {
      await cacheService.onModuleDestroy();
    });

    it('2.1 Cache Miss -> Store -> Hit with accurate metrics reporting', async () => {
      const testKey = 'local_saathi:v1:test:entity:1';
      let fetchCount = 0;
      const fetchFn = async () => {
        fetchCount++;
        return { id: '1', title: 'Test Electrician', rate: 450 };
      };

      // 1st request: Cold miss
      const res1 = await cacheService.wrap(testKey, fetchFn, { ttl: 60 });
      expect(fetchCount).toBe(1);
      expect(res1).toEqual({ id: '1', title: 'Test Electrician', rate: 450 });

      // 2nd request: Warm hit
      const res2 = await cacheService.wrap(testKey, fetchFn, { ttl: 60 });
      expect(fetchCount).toBe(1); // Not called again
      expect(res2).toEqual({ id: '1', title: 'Test Electrician', rate: 450 });

      // Verify metrics
      const stats = cacheService.getMetrics().getSnapshot();
      expect(stats.hits + stats.misses).toBe(2);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRatio).toBe(0.5);
    });

    it('2.2 Negative Caching: Sentinel stored and returned as null without hitting DB', async () => {
      const missingKey = 'local_saathi:v1:test:missing:999';
      let fetchCount = 0;
      const fetchFn = async () => {
        fetchCount++;
        return null; // DB found nothing
      };

      // 1st request with negative caching enabled
      const res1 = await cacheService.wrap(missingKey, fetchFn, {
        ttl: 60,
        negativeCache: true,
        negativeTtl: 15,
      });
      expect(res1).toBeNull();
      expect(fetchCount).toBe(1);

      // Verify sentinel was stored in Redis
      const storedItem = mockRedisStore.get(missingKey);
      expect(storedItem).toBeDefined();
      expect(storedItem?.value).toBe(CACHE_CONSTANTS.NEGATIVE_SENTINEL);

      // 2nd request should return null without calling fetchFn
      const res2 = await cacheService.wrap(missingKey, fetchFn, {
        ttl: 60,
        negativeCache: true,
      });
      expect(res2).toBeNull();
      expect(fetchCount).toBe(1); // fetchFn NOT invoked
    });

    it('2.3 SCAN-based Pattern Invalidation (delPattern)', async () => {
      // Seed several keys
      await cacheService.set('local_saathi:v1:jobs:detail:job-1', { id: 'job-1' }, 60);
      await cacheService.set('local_saathi:v1:jobs:detail:job-2', { id: 'job-2' }, 60);
      await cacheService.set('local_saathi:v1:jobs:candidates:delhi', { list: [] }, 60);
      await cacheService.set('local_saathi:v1:employers:public:emp-1', { name: 'Acme' }, 60);

      expect(mockRedisStore.size).toBe(4);

      // Purge all jobs
      const deletedCount = await cacheService.delPattern('local_saathi:v1:jobs:*');
      expect(deletedCount).toBe(3);

      // Verify remaining
      expect(mockRedisStore.has('local_saathi:v1:jobs:detail:job-1')).toBe(false);
      expect(mockRedisStore.has('local_saathi:v1:jobs:detail:job-2')).toBe(false);
      expect(mockRedisStore.has('local_saathi:v1:jobs:candidates:delhi')).toBe(false);
      expect(mockRedisStore.has('local_saathi:v1:employers:public:emp-1')).toBe(true);
    });

    it('2.4 Distributed Stampede Concurrency: 50 simultaneous requests execute fetchFn only ONCE', async () => {
      const hotKey = 'local_saathi:v1:test:stampede:catalog';
      let fetchInvocations = 0;

      const expensiveFetch = async () => {
        fetchInvocations++;
        // Simulate 40ms database query latency
        await new Promise((r) => setTimeout(r, 40));
        return { catalogId: 'cat-main', items: ['Plumbing', 'Carpentry', 'Welding'] };
      };

      // Launch 50 concurrent requests simultaneously on a cold key
      const concurrency = 50;
      const promises = Array.from({ length: concurrency }).map(() =>
        cacheService.wrap(hotKey, expensiveFetch, {
          ttl: 120,
          stampedeProtect: true,
        }),
      );

      const results = await Promise.all(promises);

      // All 50 requests must return the exact same result
      expect(results.length).toBe(concurrency);
      for (const res of results) {
        expect(res.catalogId).toBe('cat-main');
        expect(res.items.length).toBe(3);
      }

      // CRITICAL: fetch must have occurred exactly once!
      expect(fetchInvocations).toBe(1);
    });

    it('2.5 Transparent Degradation: Fallback to DB when Redis is disconnected', async () => {
      // Disconnect Redis
      (cacheService as any).isConnected = false;
      mockRedis.status = 'end';

      let fetchCount = 0;
      const fetchFn = async () => {
        fetchCount++;
        return { status: 'fallback_ok' };
      };

      // wrap must execute fetchFn safely without throwing
      const result = await cacheService.wrap('local_saathi:v1:test:fallback', fetchFn, { ttl: 60 });
      expect(result).toEqual({ status: 'fallback_ok' });
      expect(fetchCount).toBe(1);

      // del & set must fail gracefully without throwing
      await expect(cacheService.set('key', 'val', 60)).resolves.toBe(false);
      await expect(cacheService.get('key')).resolves.toBeNull();
      await expect(cacheService.del('key')).resolves.toBe(0);
      await expect(cacheService.delPattern('*')).resolves.toBe(0);
    });
  });

  describe('3. Event-Driven Cache Invalidation Handler Integration', () => {
    let mockCacheService: any;
    let handler: CacheInvalidationHandler;

    beforeEach(() => {
      mockCacheService = {
        del: jest.fn().mockResolvedValue(true),
        delPattern: jest.fn().mockResolvedValue(2),
      };
      handler = new CacheInvalidationHandler(mockCacheService as unknown as CacheService);
    });

    it('should match and invalidate job detail, candidate spatial cache, and admin metrics on JOB_PUBLISHED', async () => {
      const event: DomainEventEnvelope = {
        eventId: 'evt-101',
        eventType: 'JOB_PUBLISHED',
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        aggregateType: 'JOB',
        aggregateId: 'job-xyz-789',
        payload: { title: 'Electrician' },
      };

      expect(handler.canHandle(event.eventType)).toBe(true);
      await handler.handle(event);

      expect(mockCacheService.del).toHaveBeenCalledWith(CacheKeys.jobDetail('job-xyz-789'));
      expect(mockCacheService.del).toHaveBeenCalledWith(CacheKeys.adminOverviewMetrics());
      expect(mockCacheService.delPattern).toHaveBeenCalledWith(CacheKeys.allGeoWildcard());
    });

    it('should invalidate public employer profile on EMPLOYER_PROFILE_UPDATED', async () => {
      const event: DomainEventEnvelope = {
        eventId: 'evt-102',
        eventType: 'EMPLOYER_PROFILE_UPDATED',
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        aggregateType: 'EMPLOYER',
        aggregateId: 'emp-456',
        payload: { businessName: 'Updated Ltd' },
      };

      expect(handler.canHandle(event.eventType)).toBe(true);
      await handler.handle(event);

      expect(mockCacheService.delPattern).toHaveBeenCalledWith(CacheKeys.employerWildcard('emp-456'));
    });

    it('should invalidate skills catalog on SKILL_CREATED', async () => {
      const event: DomainEventEnvelope = {
        eventId: 'evt-103',
        eventType: 'SKILL_CREATED',
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        aggregateType: 'SKILL',
        aggregateId: 'sk-999',
        payload: { name: 'Solar Technician' },
      };

      expect(handler.canHandle(event.eventType)).toBe(true);
      await handler.handle(event);

      expect(mockCacheService.delPattern).toHaveBeenCalledWith(CacheKeys.skillsWildcard());
    });

    it('should ignore non-cacheable domain events like PAYMENT_SUCCESS or CHAT_MESSAGE', async () => {
      expect(handler.canHandle('PAYMENT_CAPTURED')).toBe(false);
      expect(handler.canHandle('CHAT_MESSAGE_SENT')).toBe(false);
      expect(handler.canHandle('USER_AUTHENTICATED')).toBe(false);
    });
  });
});
