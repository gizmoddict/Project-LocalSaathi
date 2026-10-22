// ==============================================================================
// LocalSaathi — Cache Observability & Performance Metrics (Phase 19)
// In-Memory Counter Aggregations by Namespace (No PII / No Value Logging)
// ==============================================================================

import { Injectable, Optional } from '@nestjs/common';
import { CacheStats } from '@localsaathi/types';
import { MetricsService } from '../../common/observability/metrics.service';

@Injectable()
export class CacheMetrics {
  private hits = 0;
  private misses = 0;
  private setFailures = 0;
  private getFailures = 0;
  private invalidations = 0;
  private stampedeLocks = 0;
  private stampedeWaits = 0;

  private namespaceHits: Record<string, number> = {};
  private namespaceMisses: Record<string, number> = {};

  constructor(@Optional() private readonly metricsService?: MetricsService) {}

  recordHit(namespace: string): void {
    this.hits++;
    this.namespaceHits[namespace] = (this.namespaceHits[namespace] || 0) + 1;
    this.metricsService?.incrementCounter('cache_hits_total', { category: namespace });
    this.updateRatio();
  }

  recordMiss(namespace: string): void {
    this.misses++;
    this.namespaceMisses[namespace] = (this.namespaceMisses[namespace] || 0) + 1;
    this.metricsService?.incrementCounter('cache_misses_total', { category: namespace });
    this.updateRatio();
  }

  private updateRatio(): void {
    const total = this.hits + this.misses;
    if (total > 0 && this.metricsService) {
      this.metricsService.setGauge('cache_hit_ratio', Number(((this.hits / total) * 100).toFixed(2)));
    }
  }

  recordSetFailure(): void {
    this.setFailures++;
  }

  recordGetFailure(): void {
    this.getFailures++;
  }

  recordInvalidation(count: number = 1): void {
    this.invalidations += count;
  }

  recordStampedeLock(): void {
    this.stampedeLocks++;
  }

  recordStampedeWait(): void {
    this.stampedeWaits++;
  }

  getSnapshot(): CacheStats & {
    namespaceStats: Record<string, { hits: number; misses: number; hitRatio: number }>;
  } {
    const totalOps = this.hits + this.misses;
    const hitRatio = totalOps > 0 ? Number((this.hits / totalOps).toFixed(4)) : 0;

    const allNamespaces = Array.from(
      new Set([...Object.keys(this.namespaceHits), ...Object.keys(this.namespaceMisses)]),
    );

    const namespaceStats: Record<string, { hits: number; misses: number; hitRatio: number }> = {};
    for (const ns of allNamespaces) {
      const h = this.namespaceHits[ns] || 0;
      const m = this.namespaceMisses[ns] || 0;
      const total = h + m;
      namespaceStats[ns] = {
        hits: h,
        misses: m,
        hitRatio: total > 0 ? Number((h / total).toFixed(4)) : 0,
      };
    }

    return {
      hits: this.hits,
      misses: this.misses,
      hitRatio,
      setFailures: this.setFailures,
      getFailures: this.getFailures,
      invalidations: this.invalidations,
      stampedeLocks: this.stampedeLocks,
      stampedeWaits: this.stampedeWaits,
      namespaceStats,
    };
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.setFailures = 0;
    this.getFailures = 0;
    this.invalidations = 0;
    this.stampedeLocks = 0;
    this.stampedeWaits = 0;
    this.namespaceHits = {};
    this.namespaceMisses = {};
  }
}
