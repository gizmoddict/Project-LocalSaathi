// ==============================================================================
// LocalSaathi — Configurable Observability Alerting Engine (Phase 21)
// Automated Metric Threshold Evaluations, Alert Severity Classification & Safe Logging
// ==============================================================================

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import {
  ActiveAlert,
  AlertEvaluationSummary,
  AlertNotifier,
  AlertRule,
  AlertSeverity,
} from '@localsaathi/types';
import { MetricsService } from '../../common/observability/metrics.service';
import { SystemHealthService } from './system-health.service';
import { LogAlertNotifier } from './notifiers/log-alert-notifier';

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);
  private readonly defaultNotifier: AlertNotifier = new LogAlertNotifier();

  // Configurable thresholds via environment variables
  private readonly apiErrorRateThreshold = parseFloat(process.env.ALERT_API_ERROR_RATE_PERCENT || '5.0');
  private readonly apiP95LatencyThreshold = parseFloat(process.env.ALERT_API_P95_MS || '1000.0');
  private readonly queueBacklogThreshold = parseInt(process.env.ALERT_QUEUE_BACKLOG || '500', 10);
  private readonly dlqCountThreshold = parseInt(process.env.ALERT_DLQ_COUNT || '10', 10);
  private readonly outboxBacklogThreshold = parseInt(process.env.ALERT_OUTBOX_BACKLOG || '500', 10);
  private readonly paymentFailureRateThreshold = parseFloat(process.env.ALERT_PAYMENT_FAILURE_RATE || '5.0');
  private readonly cacheHitRatioThreshold = parseFloat(process.env.ALERT_CACHE_HIT_RATIO_MIN || '50.0');

  constructor(
    @Optional() private readonly metricsService?: MetricsService,
    @Optional() private readonly systemHealthService?: SystemHealthService,
    @Optional() @Inject('ALERT_NOTIFIER') private readonly alertNotifier?: AlertNotifier,
  ) {}

  /**
   * Evaluates all registered alert rules against current system telemetry.
   */
  async evaluateAlerts(): Promise<AlertEvaluationSummary> {
    const timestamp = new Date().toISOString();
    const rules = await this.getRulesWithCurrentValues();

    const activeAlerts: ActiveAlert[] = [];

    for (const rule of rules) {
      if (rule.isTriggered) {
        const alert: ActiveAlert = {
          alertId: `alert-${rule.id}-${Date.now()}`,
          ruleName: rule.name,
          severity: rule.severity,
          message: `${rule.name}: Current value ${rule.currentValue} exceeded threshold ${rule.threshold} (${rule.description})`,
          currentValue: rule.currentValue || 0,
          threshold: rule.threshold,
          triggeredAt: timestamp,
        };
        activeAlerts.push(alert);

        // Dispatch alert via safe local AlertNotifier protocol
        const notifier = this.alertNotifier || this.defaultNotifier;
        await notifier.notify(alert).catch((err) => {
          this.logger.error(`Alert notification dispatch failed: ${err?.message}`);
        });
      }
    }

    return {
      status: activeAlerts.length > 0 ? 'ALERTS_ACTIVE' : 'CLEAR',
      totalEvaluated: rules.length,
      activeCount: activeAlerts.length,
      alerts: activeAlerts,
      timestamp,
    };
  }

  private async getRulesWithCurrentValues(): Promise<AlertRule[]> {
    const rules: AlertRule[] = [];
    const now = new Date().toISOString();

    // 1. API Error Rate
    if (this.metricsService) {
      const totalRequests = this.metricsService.getCounterValue('http_requests_total');
      const totalErrors = this.metricsService.getCounterValue('http_errors_total');
      const errorRate = totalRequests > 10 ? (totalErrors / totalRequests) * 100 : 0;
      rules.push({
        id: 'rule-api-error-rate',
        name: 'API Error Rate Too High',
        description: 'Percentage of HTTP requests returning error status codes',
        severity: AlertSeverity.CRITICAL,
        metricName: 'http_errors_total',
        condition: 'GT',
        threshold: this.apiErrorRateThreshold,
        currentValue: Number(errorRate.toFixed(2)),
        isTriggered: errorRate > this.apiErrorRateThreshold,
        evaluatedAt: now,
      });

      // 2. API p95 Latency
      const quantiles = this.metricsService.getHistogramQuantiles('http_request_duration_ms');
      rules.push({
        id: 'rule-api-p95-latency',
        name: 'API p95 Latency High',
        description: '95th percentile HTTP response latency in milliseconds',
        severity: AlertSeverity.WARNING,
        metricName: 'http_request_duration_ms_p95',
        condition: 'GT',
        threshold: this.apiP95LatencyThreshold,
        currentValue: quantiles.p95,
        isTriggered: quantiles.count > 10 && quantiles.p95 > this.apiP95LatencyThreshold,
        evaluatedAt: now,
      });
    }

    // 3. Infrastructure & Backlogs from SystemHealthService
    if (this.systemHealthService) {
      const health = await this.systemHealthService.evaluateSystemHealth();

      // Database
      const dbStatus = health.components.DATABASE.status;
      rules.push({
        id: 'rule-database-health',
        name: 'PostgreSQL Database Degraded or Unhealthy',
        description: 'PostgreSQL ping query failed or response latency high',
        severity: dbStatus === 'UNHEALTHY' ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
        metricName: 'database_status',
        condition: 'EQ',
        threshold: 0,
        currentValue: dbStatus === 'HEALTHY' ? 0 : 1,
        isTriggered: dbStatus !== 'HEALTHY',
        evaluatedAt: now,
      });

      // Redis
      const redisStatus = health.components.REDIS.status;
      rules.push({
        id: 'rule-redis-health',
        name: 'Redis Ephemeral Cache/Queue Degraded',
        description: 'Redis socket ping check failed or unresponsive',
        severity: redisStatus === 'UNHEALTHY' ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
        metricName: 'redis_status',
        condition: 'EQ',
        threshold: 0,
        currentValue: redisStatus === 'HEALTHY' ? 0 : 1,
        isTriggered: redisStatus !== 'HEALTHY',
        evaluatedAt: now,
      });

      // Queue Backlog
      const waitingJobs = (health.components.QUEUES.details?.totalWaiting as number) || 0;
      rules.push({
        id: 'rule-queue-backlog',
        name: 'BullMQ Queue Backlog Elevated',
        description: 'Total jobs waiting across all 12 worker queues',
        severity: AlertSeverity.WARNING,
        metricName: 'queue_jobs_waiting',
        condition: 'GT',
        threshold: this.queueBacklogThreshold,
        currentValue: waitingJobs,
        isTriggered: waitingJobs > this.queueBacklogThreshold,
        evaluatedAt: now,
      });

      // Outbox Backlog
      const outboxPending = (health.components.OUTBOX.details?.pendingCount as number) || 0;
      rules.push({
        id: 'rule-outbox-backlog',
        name: 'Transactional Outbox Backlog Elevated',
        description: 'Pending events awaiting dispatch in outbox_events table',
        severity: AlertSeverity.WARNING,
        metricName: 'outbox_backlog_count',
        condition: 'GT',
        threshold: this.outboxBacklogThreshold,
        currentValue: outboxPending,
        isTriggered: outboxPending > this.outboxBacklogThreshold,
        evaluatedAt: now,
      });

      // Dead Letter Queue / Failed Worker Jobs
      const totalFailedJobs = (health.components.QUEUES.details?.totalFailed as number) || 0;
      rules.push({
        id: 'rule-dlq-count',
        name: 'Failed Worker Jobs / DLQ Elevated',
        description: 'Cumulative failed jobs across all BullMQ queues',
        severity: AlertSeverity.CRITICAL,
        metricName: 'queue_jobs_failed',
        condition: 'GT',
        threshold: this.dlqCountThreshold,
        currentValue: totalFailedJobs,
        isTriggered: totalFailedJobs > this.dlqCountThreshold,
        evaluatedAt: now,
      });

      // Payment Failure Rate Alert
      const paymentStatus = health.components.PAYMENTS.status;
      rules.push({
        id: 'rule-payment-failures',
        name: 'Payment Failure Rate High',
        description: 'Payment failure rate in past 24h exceeds threshold',
        severity: paymentStatus === 'UNHEALTHY' ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
        metricName: 'payment_failure_rate',
        condition: 'GT',
        threshold: this.paymentFailureRateThreshold,
        currentValue: paymentStatus === 'HEALTHY' ? 0 : 100,
        isTriggered: paymentStatus !== 'HEALTHY',
        evaluatedAt: now,
      });
    }

    // Cache Hit Ratio Alert
    if (this.metricsService) {
      const hits = this.metricsService.getCounterValue('cache_hits_total');
      const misses = this.metricsService.getCounterValue('cache_misses_total');
      const totalReads = hits + misses;
      const hitRatio = totalReads > 20 ? (hits / totalReads) * 100 : 100;
      rules.push({
        id: 'rule-cache-hit-ratio',
        name: 'Cache Hit Ratio Low',
        description: 'Distributed cache hit ratio below target percentage',
        severity: AlertSeverity.INFO,
        metricName: 'cache_hit_ratio_percent',
        condition: 'LT',
        threshold: this.cacheHitRatioThreshold,
        currentValue: Number(hitRatio.toFixed(2)),
        isTriggered: totalReads > 20 && hitRatio < this.cacheHitRatioThreshold,
        evaluatedAt: now,
      });
    }

    return rules;
  }
}
