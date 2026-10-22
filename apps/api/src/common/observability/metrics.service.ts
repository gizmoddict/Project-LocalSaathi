// ==============================================================================
// LocalSaathi — Prometheus-Compatible Metrics Registry Service (Phase 21)
// Bounded Cardinality Counters, Gauges & Latency Histograms with Quantile Estimation
// ==============================================================================

import { Injectable } from '@nestjs/common';
import { HistogramQuantiles } from '@localsaathi/types';

interface MetricValue {
  labels: Record<string, string>;
  value: number;
}

interface CounterMetric {
  name: string;
  help: string;
  values: Map<string, MetricValue>;
}

interface GaugeMetric {
  name: string;
  help: string;
  values: Map<string, MetricValue>;
}

interface HistogramMetric {
  name: string;
  help: string;
  buckets: number[];
  observations: Map<string, { bucketCounts: Map<number, number>; sum: number; count: number; rawValues: number[] }>;
}

export const FORBIDDEN_HIGH_CARDINALITY_LABELS = new Set([
  'userid',
  'workerid',
  'employerid',
  'jobid',
  'applicationid',
  'bookingid',
  'paymentid',
  'notificationid',
  'messageid',
  'requestid',
  'correlationid',
  'traceid',
  'spanid',
  'socketid',
  'cachekey',
  'rawcachekey',
  'raw_cache_key',
]);

export function validateMetricLabels(labels: Record<string, string>): void {
  for (const labelKey of Object.keys(labels)) {
    const normalized = labelKey.toLowerCase().replace(/[_\-]/g, '');
    if (FORBIDDEN_HIGH_CARDINALITY_LABELS.has(normalized)) {
      throw new Error(
        `Forbidden high-cardinality metric label rejected: '${labelKey}'. High-cardinality dimensions must not be used as Prometheus labels.`,
      );
    }
  }
}

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, CounterMetric>();
  private readonly gauges = new Map<string, GaugeMetric>();
  private readonly histograms = new Map<string, HistogramMetric>();

  // Default latency buckets in milliseconds
  private readonly defaultBuckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

  constructor() {
    this.registerStandardMetrics();
  }

  private registerStandardMetrics(): void {
    // 1. HTTP Metrics
    this.registerCounter('http_requests_total', 'Total HTTP requests processed');
    this.registerHistogram('http_request_duration_ms', 'HTTP request latency in milliseconds', this.defaultBuckets);
    this.registerCounter('http_errors_total', 'Total HTTP requests resulting in error');

    // 2. Database Metrics
    this.registerGauge('db_pool_active', 'Active PostgreSQL client connections');
    this.registerGauge('db_pool_idle', 'Idle PostgreSQL connections');
    this.registerHistogram('db_query_duration_ms', 'Database query execution time in milliseconds', [1, 5, 10, 25, 50, 100, 200, 500, 1000]);
    this.registerCounter('db_query_errors_total', 'Total database query errors');
    this.registerCounter('db_slow_queries_total', 'Total queries exceeding slow-query threshold');

    // 3. Redis & Cache Metrics
    this.registerCounter('redis_commands_total', 'Total Redis commands dispatched');
    this.registerHistogram('redis_command_duration_ms', 'Redis command latency in milliseconds', [0.5, 1, 2, 5, 10, 25, 50, 100]);
    this.registerCounter('redis_errors_total', 'Total Redis command errors');
    this.registerCounter('redis_lock_contention_total', 'Total distributed lock acquisition contentions');
    this.registerCounter('cache_hits_total', 'Total cache hits by category');
    this.registerCounter('cache_misses_total', 'Total cache misses by category');
    this.registerGauge('cache_hit_ratio', 'Overall cache hit ratio percentage');

    // 4. BullMQ & Queue Metrics
    this.registerGauge('queue_jobs_waiting', 'Number of jobs waiting in queue');
    this.registerGauge('queue_jobs_active', 'Number of jobs currently being processed');
    this.registerCounter('queue_jobs_completed_total', 'Total queue jobs completed successfully');
    this.registerCounter('queue_jobs_failed_total', 'Total queue jobs that failed execution');
    this.registerCounter('queue_jobs_retried_total', 'Total queue jobs retried');
    this.registerHistogram('queue_job_duration_ms', 'Job processing duration in milliseconds', [50, 100, 250, 500, 1000, 2500, 5000, 15000, 30000]);
    this.registerGauge('queue_dlq_jobs', 'Total terminally failed jobs captured in DLQ');

    // 5. Outbox Metrics
    this.registerCounter('outbox_events_created_total', 'Total domain events written to outbox table');
    this.registerCounter('outbox_events_published_total', 'Total outbox events published to consumers');
    this.registerCounter('outbox_events_failed_total', 'Total outbox event publishing failures');
    this.registerGauge('outbox_backlog_count', 'Current count of pending outbox events');

    // 6. Notification Metrics
    this.registerCounter('notifications_created_total', 'Total in-app and push notifications created');
    this.registerCounter('notifications_delivered_total', 'Total notifications successfully delivered');
    this.registerCounter('notifications_failed_total', 'Total notification delivery failures');

    // 7. Payment Metrics
    this.registerCounter('payment_attempts_total', 'Total payment initiation attempts');
    this.registerCounter('payment_success_total', 'Total successful payments');
    this.registerCounter('payment_failures_total', 'Total payment initiation or execution failures');
    this.registerCounter('payment_webhook_received_total', 'Total provider payment webhooks received');
    this.registerCounter('payment_webhook_rejected_total', 'Total payment webhooks rejected (signature/replay)');

    // 8. WebSocket Metrics
    this.registerGauge('websocket_connections_active', 'Current active Socket.IO connections');
    this.registerCounter('websocket_connects_total', 'Total WebSocket connections established');
    this.registerCounter('websocket_disconnects_total', 'Total WebSocket disconnects');
    this.registerCounter('websocket_auth_failures_total', 'Total WebSocket authentication failures');
    this.registerCounter('websocket_messages_total', 'Total real-time WebSocket messages dispatched');

    // 9. Reliability & Resilience Metrics (Phase 22)
    this.registerCounter('retry_attempts_total', 'Total retry attempts executed by centralized retry policy');
    this.registerCounter('retry_exhausted_total', 'Total retry operations that exhausted maximum allowed attempts');
    this.registerHistogram('retry_delay_ms', 'Backoff delay intervals applied during retry attempts in milliseconds', [10, 50, 100, 250, 500, 1000, 2500, 5000]);
    this.registerCounter('timeout_total', 'Total operations that timed out exceeding bounded thresholds');
    this.registerCounter('circuit_breaker_open_total', 'Total circuit breaker transitions to OPEN state');
    this.registerCounter('circuit_breaker_half_open_total', 'Total circuit breaker transitions to HALF_OPEN state');
    this.registerCounter('circuit_breaker_rejected_total', 'Total requests rejected fast by OPEN circuit breakers');
    this.registerCounter('dependency_failures_total', 'Total downstream dependency failures');
    this.registerCounter('fallback_total', 'Total graceful fallback executions triggered');
    this.registerCounter('worker_recovery_total', 'Total worker recoveries or restarts');
    this.registerCounter('reconnect_attempts_total', 'Total infrastructure client reconnection attempts');
    this.registerCounter('graceful_shutdown_total', 'Total graceful shutdown invocations');
    this.registerCounter('transaction_retries_total', 'Total database transactions retried due to transient conflicts');
    this.registerCounter('deadlocks_total', 'Total PostgreSQL deadlocks detected and retried');
    this.registerCounter('serialization_failures_total', 'Total PostgreSQL serialization failures detected and retried');
    this.registerCounter('pool_exhaustion_total', 'Total database connection pool acquisition timeouts');
    this.registerCounter('rate_limit_exceeded_total', 'Total rate limit exceeded events across primary or fallback store');

    // 10. Disaster Recovery & Data Integrity Metrics (Phase 23)
    this.registerCounter('backup_created_total', 'Total database backups created successfully');
    this.registerCounter('backup_failed_total', 'Total database backup creation failures');
    this.registerCounter('backup_verification_failed_total', 'Total backup verification failures or corruptions detected');
    this.registerHistogram('backup_verification_duration_ms', 'Duration of backup integrity verification in milliseconds', [5, 10, 25, 50, 100, 250, 500, 1000]);
    this.registerCounter('restore_started_total', 'Total database restore procedures initiated');
    this.registerCounter('restore_success_total', 'Total database restores completed successfully');
    this.registerCounter('restore_failed_total', 'Total database restore procedures failed');
    this.registerHistogram('restore_duration_ms', 'Duration of database restoration in milliseconds', [50, 100, 250, 500, 1000, 2500, 5000, 15000]);
    this.registerCounter('integrity_check_pass_total', 'Total data integrity checks passing with zero failures');
    this.registerCounter('integrity_check_fail_total', 'Total data integrity checks failing with critical anomalies');
    this.registerCounter('integrity_anomaly_total', 'Total data integrity anomalies detected across all checks');
    this.registerCounter('reconciliation_required_total', 'Total payments requiring external provider reconciliation');
    this.registerCounter('reconciliation_completed_total', 'Total payments successfully reconciled with provider');
    this.registerCounter('migration_safety_block_total', 'Total schema migrations blocked due to missing verified backup');
    this.registerCounter('redis_rebuild_total', 'Total Redis cache rebuilds initiated from PostgreSQL');
    this.registerCounter('search_rebuild_total', 'Total derived search index rebuilds from PostgreSQL');
  }

  // ----------------------------------------------------------------------------
  // Internal Metric Helpers
  // ----------------------------------------------------------------------------

  private serializeLabels(labels: Record<string, string>): string {
    const sortedKeys = Object.keys(labels).sort();
    return sortedKeys.map((k) => `${k}="${labels[k]}"`).join(',');
  }

  registerCounter(name: string, help: string): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, { name, help, values: new Map() });
    }
  }

  registerGauge(name: string, help: string): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, { name, help, values: new Map() });
    }
  }

  registerHistogram(name: string, help: string, buckets: number[]): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, {
        name,
        help,
        buckets: [...buckets].sort((a, b) => a - b),
        observations: new Map(),
      });
    }
  }

  // ----------------------------------------------------------------------------
  // Recording API
  // ----------------------------------------------------------------------------

  incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    validateMetricLabels(labels);
    const counter = this.counters.get(name);
    if (!counter) return;

    const key = this.serializeLabels(labels);
    const existing = counter.values.get(key);
    if (existing) {
      existing.value += value;
    } else {
      counter.values.set(key, { labels, value });
    }
  }

  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    validateMetricLabels(labels);
    const gauge = this.gauges.get(name);
    if (!gauge) return;

    const key = this.serializeLabels(labels);
    gauge.values.set(key, { labels, value });
  }

  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    validateMetricLabels(labels);
    const histogram = this.histograms.get(name);
    if (!histogram) return;

    const key = this.serializeLabels(labels);
    let obs = histogram.observations.get(key);
    if (!obs) {
      const bucketCounts = new Map<number, number>();
      for (const b of histogram.buckets) {
        bucketCounts.set(b, 0);
      }
      obs = { bucketCounts, sum: 0, count: 0, rawValues: [] };
      histogram.observations.set(key, obs);
    }

    obs.count += 1;
    obs.sum += value;

    // Retain bounded sample of raw values for exact quantile calculation (max 1000 items)
    if (obs.rawValues.length >= 1000) {
      obs.rawValues.shift();
    }
    obs.rawValues.push(value);

    for (const b of histogram.buckets) {
      if (value <= b) {
        obs.bucketCounts.set(b, (obs.bucketCounts.get(b) || 0) + 1);
      }
    }
  }

  // ----------------------------------------------------------------------------
  // Metric Queries & Quantiles
  // ----------------------------------------------------------------------------

  getHistogramQuantiles(name: string, labels: Record<string, string> = {}): HistogramQuantiles {
    const histogram = this.histograms.get(name);
    if (!histogram) {
      return { p50: 0, p90: 0, p95: 0, p99: 0, count: 0, sum: 0 };
    }

    const key = this.serializeLabels(labels);
    const obs = histogram.observations.get(key);
    if (!obs || obs.rawValues.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0, count: 0, sum: 0 };
    }

    const sorted = [...obs.rawValues].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.50)] ?? 0;
    const p90 = sorted[Math.floor(sorted.length * 0.90)] ?? 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;

    return {
      p50: Number(p50.toFixed(2)),
      p90: Number(p90.toFixed(2)),
      p95: Number(p95.toFixed(2)),
      p99: Number(p99.toFixed(2)),
      count: obs.count,
      sum: Number(obs.sum.toFixed(2)),
    };
  }

  getCounterValue(name: string, labels?: Record<string, string>): number {
    const counter = this.counters.get(name);
    if (!counter) return 0;
    if (!labels || Object.keys(labels).length === 0) {
      let sum = 0;
      for (const item of counter.values.values()) {
        sum += item.value;
      }
      return sum;
    }
    const key = this.serializeLabels(labels);
    return counter.values.get(key)?.value || 0;
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    return this.getCounterValue(name, labels);
  }

  getGaugeValue(name: string, labels?: Record<string, string>): number {
    const gauge = this.gauges.get(name);
    if (!gauge) return 0;
    if (!labels || Object.keys(labels).length === 0) {
      let sum = 0;
      for (const item of gauge.values.values()) {
        sum += item.value;
      }
      return sum;
    }
    const key = this.serializeLabels(labels);
    return gauge.values.get(key)?.value || 0;
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    return this.getGaugeValue(name, labels);
  }

  // ----------------------------------------------------------------------------
  // Prometheus Exposition Generator
  // ----------------------------------------------------------------------------

  exportPrometheusText(): string {
    const lines: string[] = [];

    // Counters
    for (const counter of this.counters.values()) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);
      for (const item of counter.values.values()) {
        const labelStr = Object.keys(item.labels).length > 0 ? `{${this.serializeLabels(item.labels)}}` : '';
        lines.push(`${counter.name}${labelStr} ${item.value}`);
      }
    }

    // Gauges
    for (const gauge of this.gauges.values()) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      for (const item of gauge.values.values()) {
        const labelStr = Object.keys(item.labels).length > 0 ? `{${this.serializeLabels(item.labels)}}` : '';
        lines.push(`${gauge.name}${labelStr} ${item.value}`);
      }
    }

    // Histograms
    for (const hist of this.histograms.values()) {
      lines.push(`# HELP ${hist.name} ${hist.help}`);
      lines.push(`# TYPE ${hist.name} histogram`);
      for (const [key, obs] of hist.observations.entries()) {
        const baseLabels = key ? `${key},` : '';
        for (const bucket of hist.buckets) {
          const count = obs.bucketCounts.get(bucket) || 0;
          lines.push(`${hist.name}_bucket{${baseLabels}le="${bucket}"} ${count}`);
        }
        lines.push(`${hist.name}_bucket{${baseLabels}le="+Inf"} ${obs.count}`);
        lines.push(`${hist.name}_sum{${key ? `${key}` : ''}} ${obs.sum.toFixed(2)}`);
        lines.push(`${hist.name}_count{${key ? `${key}` : ''}} ${obs.count}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Returns a JSON snapshot of current metrics for administrative APIs and tests.
   */
  getSnapshotJson(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      http: {
        totalRequests: Array.from(this.counters.get('http_requests_total')?.values.values() || []).reduce((acc, v) => acc + v.value, 0),
        totalErrors: Array.from(this.counters.get('http_errors_total')?.values.values() || []).reduce((acc, v) => acc + v.value, 0),
        latency: this.getHistogramQuantiles('http_request_duration_ms'),
      },
      database: {
        activePool: this.getGaugeValue('db_pool_active'),
        idlePool: this.getGaugeValue('db_pool_idle'),
        queryErrors: Array.from(this.counters.get('db_query_errors_total')?.values.values() || []).reduce((acc, v) => acc + v.value, 0),
        slowQueries: Array.from(this.counters.get('db_slow_queries_total')?.values.values() || []).reduce((acc, v) => acc + v.value, 0),
      },
      redis: {
        commandsTotal: Array.from(this.counters.get('redis_commands_total')?.values.values() || []).reduce((acc, v) => acc + v.value, 0),
        errorsTotal: Array.from(this.counters.get('redis_errors_total')?.values.values() || []).reduce((acc, v) => acc + v.value, 0),
        lockContentionTotal: Array.from(this.counters.get('redis_lock_contention_total')?.values.values() || []).reduce((acc, v) => acc + v.value, 0),
        cacheHitRatio: this.getGaugeValue('cache_hit_ratio'),
      },
      websocket: {
        activeConnections: this.getGaugeValue('websocket_connections_active'),
        totalMessages: Array.from(this.counters.get('websocket_messages_total')?.values.values() || []).reduce((acc, v) => acc + v.value, 0),
      },
    };
    return result;
  }
}
