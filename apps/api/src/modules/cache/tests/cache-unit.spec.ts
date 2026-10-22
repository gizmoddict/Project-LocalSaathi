// ==============================================================================
// LocalSaathi — Cache Subsystem Unit Test Suite (Phase 19)
// Tests: Key Generation, Normalization, Stampede Protection, Fallback, Metrics
// ==============================================================================

import { CacheKeys, encodeGeohash, hashFilterObject, sanitizeKeyFragment } from '../cache-keys';
import { CacheMetrics } from '../cache.metrics';
import { CacheService } from '../cache.service';

describe('Cache Subsystem Unit Tests', () => {
  describe('1. CacheKeys & Parameter Normalization', () => {
    it('should generate deterministic, lowercase versioned keys for skills catalog', () => {
      const key1 = CacheKeys.skillsCatalog('Electrical', 'wireman');
      const key2 = CacheKeys.skillsCatalog('electrical', 'wireman');
      const key3 = CacheKeys.skillsCatalog('  ELECTRICAL  ', ' wireman ');

      expect(key1).toBe(key2);
      expect(key1).toBe(key3);
      expect(key1.startsWith('local_saathi:v1:skills:catalog:electrical:')).toBe(true);
    });

    it('should prevent key injection and delimiter overriding in sanitizeKeyFragment', () => {
      const dirty = 'admin:*:{injection}!!@@##$$';
      const clean = sanitizeKeyFragment(dirty);
      expect(clean).toBe('admin____injection_________');
      expect(clean.includes('*')).toBe(false);
      expect(clean.includes(':')).toBe(false);
    });

    it('should compute deterministic 12-char hash for filter objects regardless of key order', () => {
      const hash1 = hashFilterObject({ wageType: 'DAILY', category: 'carpentry', minWage: 500 });
      const hash2 = hashFilterObject({ minWage: 500, category: 'CARPENTRY', wageType: 'daily' });

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(12);
    });

    it('should encode geohashes deterministically', () => {
      // Lucknow Hazratganj coordinates
      const gh1 = encodeGeohash(26.85, 80.948, 5);
      const gh2 = encodeGeohash(26.85, 80.948, 5);
      expect(gh1).toBe('tuc8d');
      expect(gh1).toBe(gh2);
    });

    it('should generate bounded spatial candidate cache keys', () => {
      const key = CacheKeys.jobGeoCandidates(26.85, 80.948, 15, { category: 'Plumbing' });
      expect(key.startsWith('local_saathi:v1:geo:candidates:tuc8d:15:')).toBe(true);
    });

    it('should generate lock keys using :lock suffix', () => {
      const baseKey = CacheKeys.jobDetail('job-123');
      expect(CacheKeys.lock(baseKey)).toBe('local_saathi:v1:jobs:detail:job-123:lock');
    });
  });

  describe('2. CacheMetrics Observability', () => {
    let metrics: CacheMetrics;

    beforeEach(() => {
      metrics = new CacheMetrics();
    });

    it('should accurately calculate hit ratio and per-namespace aggregations', () => {
      metrics.recordHit('jobs');
      metrics.recordHit('jobs');
      metrics.recordHit('skills');
      metrics.recordMiss('jobs');
      metrics.recordMiss('skills');

      const snapshot = metrics.getSnapshot();
      expect(snapshot.hits).toBe(3);
      expect(snapshot.misses).toBe(2);
      expect(snapshot.hitRatio).toBe(0.6); // 3 / 5 = 0.6000

      expect(snapshot.namespaceStats['jobs']?.hits).toBe(2);
      expect(snapshot.namespaceStats['jobs']?.misses).toBe(1);
      expect(snapshot.namespaceStats['jobs']?.hitRatio).toBe(0.6667);

      expect(snapshot.namespaceStats['skills']?.hits).toBe(1);
      expect(snapshot.namespaceStats['skills']?.misses).toBe(1);
      expect(snapshot.namespaceStats['skills']?.hitRatio).toBe(0.5);
    });

    it('should record stampede events and invalidations', () => {
      metrics.recordStampedeLock();
      metrics.recordStampedeWait();
      metrics.recordInvalidation(5);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.stampedeLocks).toBe(1);
      expect(snapshot.stampedeWaits).toBe(1);
      expect(snapshot.invalidations).toBe(5);
    });
  });

  describe('3. CacheService Fallback & Stampede Unit Logic', () => {
    let metrics: CacheMetrics;
    let service: CacheService;

    beforeEach(() => {
      metrics = new CacheMetrics();
      service = new CacheService(metrics);
    });

    it('should gracefully execute fetchFn directly when Redis is offline', async () => {
      // Redis is not connected in this unit test mock environment
      expect(service.isAvailable()).toBe(false);

      const fetchFn = jest.fn().mockResolvedValue({ id: '123', name: 'Test Entity' });
      const result = await service.wrap('local_saathi:v1:skills:item:123', fetchFn, {
        ttl: 60,
      });

      expect(result).toEqual({ id: '123', name: 'Test Entity' });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('should return null without error when getting from offline Redis', async () => {
      const val = await service.get('any-key');
      expect(val).toBeNull();
      expect(metrics.getSnapshot().misses).toBe(1);
    });

    it('should return false without error when setting to offline Redis', async () => {
      const ok = await service.set('any-key', { foo: 'bar' }, 60);
      expect(ok).toBe(false);
    });

    it('should deduplicate concurrent in-flight requests in the same Node process', async () => {
      let callCount = 0;
      const slowFetchFn = jest.fn().mockImplementation(async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 50));
        return { count: callCount };
      });

      // When Redis is available, wrap() uses inFlightPromises to deduplicate concurrent calls
      // Even if offline, if we mock isAvailable() to true, single-flight handles it:
      jest.spyOn(service, 'isAvailable').mockReturnValue(true);
      jest.spyOn(service, 'get').mockResolvedValue(null);
      jest.spyOn(service, 'set').mockResolvedValue(true);

      const [res1, res2, res3] = await Promise.all([
        service.wrap('local_saathi:v1:test:dedup', slowFetchFn, { ttl: 60 }),
        service.wrap('local_saathi:v1:test:dedup', slowFetchFn, { ttl: 60 }),
        service.wrap('local_saathi:v1:test:dedup', slowFetchFn, { ttl: 60 }),
      ]);

      expect(res1).toEqual({ count: 1 });
      expect(res2).toEqual({ count: 1 });
      expect(res3).toEqual({ count: 1 });
      expect(slowFetchFn).toHaveBeenCalledTimes(1);
    });
  });
});
