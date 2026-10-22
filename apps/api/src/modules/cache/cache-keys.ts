// ==============================================================================
// LocalSaathi — Centralized Typed Cache Key Generator (Phase 19)
// Deterministic, Normalized, Collisions-Prevented, Versioned Keys
// ==============================================================================

import * as crypto from 'crypto';
import { CACHE_CONSTANTS } from './cache.constants';
import { CacheNamespace } from '@localsaathi/types';

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Standard base32 geohash encoding for deterministic spatial cell quantization.
 */
export function encodeGeohash(
  latitude: number,
  longitude: number,
  precision: number = 5,
): string {
  // Clamp boundaries
  const lat = Math.max(-90, Math.min(90, latitude));
  const lon = Math.max(-180, Math.min(180, longitude));

  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let isEven = true;

  while (hash.length < precision) {
    if (isEven) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) {
        ch |= 1 << (4 - bit);
        lonMin = mid;
      } else {
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch |= 1 << (4 - bit);
        latMin = mid;
      } else {
        latMax = mid;
      }
    }
    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/**
 * Normalizes an arbitrary query/filter object into a deterministic 12-char SHA256 hex fragment.
 * Prevents user-controlled string injection and bounded key length.
 */
export function hashFilterObject(obj?: Record<string, unknown> | null): string {
  if (!obj || Object.keys(obj).length === 0) {
    return 'default';
  }
  const pairs = Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
    .map((k) => `${k.toLowerCase().trim()}:${String(obj[k]).toLowerCase().trim()}`);

  if (pairs.length === 0) {
    return 'default';
  }
  return crypto.createHash('sha256').update(pairs.join('|')).digest('hex').slice(0, 12);
}

/**
 * Strips whitespace, lowercases, and replaces unsafe delimiters.
 */
export function sanitizeKeyFragment(value: string): string {
  if (!value) return 'none';
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 64);
}

export class CacheKeys {
  private static readonly ROOT = `${CACHE_CONSTANTS.PREFIX}:${CACHE_CONSTANTS.VERSION}`;

  // ----------------------------------------------------------------------------
  // 1. Skill Metadata Keys
  // ----------------------------------------------------------------------------
  static skillsCatalog(category?: string, query?: string): string {
    const cat = category ? sanitizeKeyFragment(category) : 'all';
    const qHash = query ? hashFilterObject({ q: query }) : 'none';
    return `${this.ROOT}:${CacheNamespace.SKILLS}:catalog:${cat}:${qHash}`;
  }

  static skillItem(skillId: string): string {
    return `${this.ROOT}:${CacheNamespace.SKILLS}:item:${sanitizeKeyFragment(skillId)}`;
  }

  static skillsWildcard(): string {
    return `${this.ROOT}:${CacheNamespace.SKILLS}:*`;
  }

  // ----------------------------------------------------------------------------
  // 2. Public Employer Information Keys
  // ----------------------------------------------------------------------------
  static employerPublic(employerId: string): string {
    return `${this.ROOT}:${CacheNamespace.EMPLOYER}:public:${sanitizeKeyFragment(employerId)}`;
  }

  static employerWildcard(employerId?: string): string {
    if (employerId) {
      return `${this.ROOT}:${CacheNamespace.EMPLOYER}:*:${sanitizeKeyFragment(employerId)}`;
    }
    return `${this.ROOT}:${CacheNamespace.EMPLOYER}:*`;
  }

  // ----------------------------------------------------------------------------
  // 3. Job Detail & Spatial Candidate Keys
  // ----------------------------------------------------------------------------
  static jobDetail(jobId: string): string {
    return `${this.ROOT}:${CacheNamespace.JOBS}:detail:${sanitizeKeyFragment(jobId)}`;
  }

  static jobGeoCandidates(
    lat: number,
    lng: number,
    radiusKm: number,
    filters?: Record<string, unknown>,
  ): string {
    const geohash = encodeGeohash(lat, lng, 5); // ~4.9km grid cell
    const safeRadius = Math.min(100, Math.max(1, Math.round(radiusKm)));
    const filterHash = hashFilterObject(filters);
    return `${this.ROOT}:${CacheNamespace.GEO}:candidates:${geohash}:${safeRadius}:${filterHash}`;
  }

  static jobWildcard(jobId: string): string {
    return `${this.ROOT}:${CacheNamespace.JOBS}:*:${sanitizeKeyFragment(jobId)}`;
  }

  static allJobsWildcard(): string {
    return `${this.ROOT}:${CacheNamespace.JOBS}:*`;
  }

  static allGeoWildcard(): string {
    return `${this.ROOT}:${CacheNamespace.GEO}:*`;
  }

  // ----------------------------------------------------------------------------
  // 4. Admin Reference & Metric Keys
  // ----------------------------------------------------------------------------
  static adminOverviewMetrics(): string {
    return `${this.ROOT}:${CacheNamespace.ADMIN}:metrics:overview`;
  }

  static adminWildcard(): string {
    return `${this.ROOT}:${CacheNamespace.ADMIN}:*`;
  }

  // ----------------------------------------------------------------------------
  // 5. Distributed Stampede Lock Key Helper
  // ----------------------------------------------------------------------------
  static lock(key: string): string {
    return `${key}:lock`;
  }
}
