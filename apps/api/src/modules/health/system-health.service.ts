// ==============================================================================
// LocalSaathi — Centralized System Health Engine (Phase 21)
// Comprehensive 10-Subsystem Runtime Health Diagnostics & Explicit Degradation Taxonomy
// ==============================================================================

import { Injectable, Optional } from '@nestjs/common';
import {
  SubsystemName,
  SubsystemHealthStatus,
  ComponentHealthDetail,
  CentralizedSystemHealth,
} from '@localsaathi/types';
import { PrismaService } from '../database/database.module';
import { QueueService } from '../queue/queue.service';
import { CacheMetrics } from '../cache/cache.metrics';
import { NotificationGateway } from '../outbox/realtime/notification.gateway';
import * as net from 'net';

@Injectable()
export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly queueService?: QueueService,
    @Optional() private readonly cacheMetrics?: CacheMetrics,
    @Optional() private readonly notificationGateway?: NotificationGateway,
  ) {}

  /**
   * Performs an authoritative, live inspection across all 10 LocalSaathi subsystems.
   */
  async evaluateSystemHealth(): Promise<CentralizedSystemHealth> {
    const timestamp = new Date().toISOString();

    const [
      apiHealth,
      dbHealth,
      redisHealth,
      wsHealth,
      queueHealth,
      workerHealth,
      outboxHealth,
      notifHealth,
      paymentHealth,
      cacheHealth,
    ] = await Promise.all([
      this.checkApiHealth(timestamp),
      this.checkDatabaseHealth(timestamp),
      this.checkRedisHealth(timestamp),
      this.checkWebSocketHealth(timestamp),
      this.checkQueuesHealth(timestamp),
      this.checkWorkerHealth(timestamp),
      this.checkOutboxHealth(timestamp),
      this.checkNotificationHealth(timestamp),
      this.checkPaymentHealth(timestamp),
      this.checkCacheHealth(timestamp),
    ]);

    const components: Record<SubsystemName, ComponentHealthDetail> = {
      [SubsystemName.API]: apiHealth,
      [SubsystemName.DATABASE]: dbHealth,
      [SubsystemName.REDIS]: redisHealth,
      [SubsystemName.WEBSOCKET]: wsHealth,
      [SubsystemName.QUEUES]: queueHealth,
      [SubsystemName.WORKERS]: workerHealth,
      [SubsystemName.OUTBOX]: outboxHealth,
      [SubsystemName.NOTIFICATIONS]: notifHealth,
      [SubsystemName.PAYMENTS]: paymentHealth,
      [SubsystemName.CACHE]: cacheHealth,
    };

    const summaryReasons: string[] = [];
    let hasUnhealthy = false;
    let hasDegraded = false;
    let incidentCount = 0;

    for (const comp of Object.values(components)) {
      if (comp.status === 'UNHEALTHY') {
        hasUnhealthy = true;
        incidentCount++;
        summaryReasons.push(`${comp.subsystem}: ${comp.unhealthyReason || 'Fatal component failure'}`);
      } else if (comp.status === 'DEGRADED') {
        hasDegraded = true;
        incidentCount++;
        summaryReasons.push(`${comp.subsystem}: ${comp.degradedReason || 'Component operating with degraded capacity'}`);
      }
    }

    const overallStatus: SubsystemHealthStatus = hasUnhealthy
      ? 'UNHEALTHY'
      : hasDegraded
      ? 'DEGRADED'
      : 'HEALTHY';

    return {
      overallStatus,
      timestamp,
      activeIncidentsCount: incidentCount,
      components,
      summaryReasons,
    };
  }

  // ----------------------------------------------------------------------------
  // Subsystem Checkers
  // ----------------------------------------------------------------------------

  private async checkApiHealth(now: string): Promise<ComponentHealthDetail> {
    const memUsage = process.memoryUsage();
    const rssMb = Math.round(memUsage.rss / (1024 * 1024));
    const isDegraded = rssMb > 1024; // Warning if RSS memory exceeds 1GB

    return {
      subsystem: SubsystemName.API,
      status: isDegraded ? 'DEGRADED' : 'HEALTHY',
      latencyMs: 0,
      lastChecked: now,
      degradedReason: isDegraded ? `API process RSS memory consumption elevated (${rssMb}MB)` : undefined,
      details: {
        uptimeSeconds: Math.floor(process.uptime()),
        rssMb,
        nodeVersion: process.version,
      },
    };
  }

  private async checkDatabaseHealth(now: string): Promise<ComponentHealthDetail> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;
      const isSlow = latencyMs > 300;

      return {
        subsystem: SubsystemName.DATABASE,
        status: isSlow ? 'DEGRADED' : 'HEALTHY',
        latencyMs,
        lastChecked: now,
        degradedReason: isSlow ? `PostgreSQL ping response latency high (${latencyMs}ms > 300ms)` : undefined,
        details: { engine: 'PostgreSQL 16 + PostGIS 3.4' },
      };
    } catch (err: any) {
      return {
        subsystem: SubsystemName.DATABASE,
        status: 'UNHEALTHY',
        latencyMs: Date.now() - start,
        lastChecked: now,
        unhealthyReason: `PostgreSQL connection failed: ${err?.message || 'Unreachable'}`,
      };
    }
  }

  private async checkRedisHealth(now: string): Promise<ComponentHealthDetail> {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const start = Date.now();

    try {
      const isReachable = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1500);
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => {
          socket.destroy();
          resolve(false);
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        socket.connect(port, host);
      });

      const latencyMs = Date.now() - start;
      if (!isReachable) {
        return {
          subsystem: SubsystemName.REDIS,
          status: 'UNHEALTHY',
          latencyMs,
          lastChecked: now,
          unhealthyReason: `Redis port ${port} on ${host} is unreachable via TCP`,
        };
      }

      const isSlow = latencyMs > 150;
      return {
        subsystem: SubsystemName.REDIS,
        status: isSlow ? 'DEGRADED' : 'HEALTHY',
        latencyMs,
        lastChecked: now,
        degradedReason: isSlow ? `Redis connection latency high (${latencyMs}ms)` : undefined,
      };
    } catch (err: any) {
      return {
        subsystem: SubsystemName.REDIS,
        status: 'UNHEALTHY',
        latencyMs: Date.now() - start,
        lastChecked: now,
        unhealthyReason: `Redis inspection error: ${err?.message}`,
      };
    }
  }

  private async checkWebSocketHealth(now: string): Promise<ComponentHealthDetail> {
    if (!this.notificationGateway) {
      return {
        subsystem: SubsystemName.WEBSOCKET,
        status: 'HEALTHY',
        lastChecked: now,
        details: { activeSockets: 0, activeUsers: 0 },
      };
    }

    const metrics = this.notificationGateway.getMetrics();
    return {
      subsystem: SubsystemName.WEBSOCKET,
      status: 'HEALTHY',
      lastChecked: now,
      details: metrics,
    };
  }

  private async checkQueuesHealth(now: string): Promise<ComponentHealthDetail> {
    if (!this.queueService) {
      return {
        subsystem: SubsystemName.QUEUES,
        status: 'HEALTHY',
        lastChecked: now,
        details: { totalWaiting: 0, totalActive: 0 },
      };
    }

    try {
      const stats = await this.queueService.getQueueStats();
      let totalWaiting = 0;
      let totalFailed = 0;
      let totalActive = 0;

      for (const q of Object.values(stats)) {
        totalWaiting += q.waitingCount;
        totalFailed += q.failedCount;
        totalActive += q.activeCount;
      }

      const isBacklogged = totalWaiting > 500;
      return {
        subsystem: SubsystemName.QUEUES,
        status: isBacklogged ? 'DEGRADED' : 'HEALTHY',
        lastChecked: now,
        degradedReason: isBacklogged ? `BullMQ queue backlog high (${totalWaiting} waiting jobs)` : undefined,
        details: { totalWaiting, totalActive, totalFailed, queuesMonitored: Object.keys(stats).length },
      };
    } catch (err: any) {
      return {
        subsystem: SubsystemName.QUEUES,
        status: 'DEGRADED',
        lastChecked: now,
        degradedReason: `Unable to inspect BullMQ queues: ${err?.message}`,
      };
    }
  }

  private async checkWorkerHealth(now: string): Promise<ComponentHealthDetail> {
    try {
      if (this.queueService) {
        const stats = await this.queueService.getQueueStats().catch(() => ({}));
        let failed = 0;
        for (const q of Object.values(stats)) {
          failed += (q as any).failedCount || 0;
        }
        const isDegraded = failed > 10;
        return {
          subsystem: SubsystemName.WORKERS,
          status: isDegraded ? 'DEGRADED' : 'HEALTHY',
          lastChecked: now,
          degradedReason: isDegraded ? `Worker processing failures detected across background queues (${failed} failed jobs)` : undefined,
          details: { architecture: 'At-Least-Once Delivery + Idempotent Handlers', failedJobCount: failed },
        };
      }
      return {
        subsystem: SubsystemName.WORKERS,
        status: 'HEALTHY',
        lastChecked: now,
        details: { architecture: 'At-Least-Once Delivery + Idempotent Handlers' },
      };
    } catch (err: any) {
      return {
        subsystem: SubsystemName.WORKERS,
        status: 'DEGRADED',
        lastChecked: now,
        degradedReason: `Unable to inspect worker processes: ${err?.message || 'Queue unavailable'}`,
      };
    }
  }

  private async checkOutboxHealth(now: string): Promise<ComponentHealthDetail> {
    try {
      const [pendingCount, deadLetterCount, failedCount] = await Promise.all([
        this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
        this.prisma.outboxEvent.count({ where: { status: 'DEAD_LETTER' } }),
        this.prisma.outboxEvent.count({ where: { status: 'FAILED' } }),
      ]);

      const isDeadLetter = deadLetterCount > 0;
      const isPendingHigh = pendingCount > 500;

      const status: SubsystemHealthStatus = isDeadLetter
        ? 'DEGRADED'
        : isPendingHigh
        ? 'DEGRADED'
        : 'HEALTHY';

      let reason: string | undefined = undefined;
      if (isDeadLetter) {
        reason = `Transactional outbox contains ${deadLetterCount} dead-letter events`;
      } else if (isPendingHigh) {
        reason = `Transactional outbox backlog elevated (${pendingCount} pending events)`;
      }

      return {
        subsystem: SubsystemName.OUTBOX,
        status,
        lastChecked: now,
        degradedReason: reason,
        details: { pendingCount, deadLetterCount, failedCount },
      };
    } catch (err: any) {
      return {
        subsystem: SubsystemName.OUTBOX,
        status: 'UNHEALTHY',
        lastChecked: now,
        unhealthyReason: `Failed to query outbox_events table: ${err?.message}`,
      };
    }
  }

  private async checkNotificationHealth(now: string): Promise<ComponentHealthDetail> {
    try {
      const oneHourAgo = new Date(Date.now() - 3600 * 1000);
      const failedCount = await this.prisma.domainEvent.count({
        where: {
          status: 'FAILED',
          createdAt: { gte: oneHourAgo },
        },
      });

      const isHighFailures = failedCount > 50;
      return {
        subsystem: SubsystemName.NOTIFICATIONS,
        status: isHighFailures ? 'DEGRADED' : 'HEALTHY',
        lastChecked: now,
        degradedReason: isHighFailures ? `Elevated notification delivery failures in past hour (${failedCount})` : undefined,
        details: { recentFailuresCount: failedCount },
      };
    } catch (err: any) {
      return {
        subsystem: SubsystemName.NOTIFICATIONS,
        status: 'DEGRADED',
        lastChecked: now,
        degradedReason: `Notification health verification failed: ${err?.message || 'Database error'}`,
      };
    }
  }

  private async checkPaymentHealth(now: string): Promise<ComponentHealthDetail> {
    try {
      const past24h = new Date(Date.now() - 24 * 3600 * 1000);
      const [successfulCount, failedCount] = await Promise.all([
        this.prisma.payment.count({
          where: { status: 'CAPTURED', createdAt: { gte: past24h } },
        }),
        this.prisma.payment.count({
          where: { status: 'FAILED', createdAt: { gte: past24h } },
        }),
      ]);

      const total = successfulCount + failedCount;
      const failRate = total > 20 ? (failedCount / total) * 100 : 0;
      const isHighFailureRate = failRate > 20;

      return {
        subsystem: SubsystemName.PAYMENTS,
        status: isHighFailureRate ? 'DEGRADED' : 'HEALTHY',
        lastChecked: now,
        degradedReason: isHighFailureRate ? `Payment failure rate in past 24h exceeds 20% (${failRate.toFixed(1)}%)` : undefined,
        details: { successfulPast24h: successfulCount, failedPast24h: failedCount, failureRatePercentage: failRate },
      };
    } catch (err: any) {
      return {
        subsystem: SubsystemName.PAYMENTS,
        status: 'DEGRADED',
        lastChecked: now,
        degradedReason: `Payment health verification failed: ${err?.message || 'Database error'}`,
      };
    }
  }

  private async checkCacheHealth(now: string): Promise<ComponentHealthDetail> {
    if (!this.cacheMetrics) {
      return {
        subsystem: SubsystemName.CACHE,
        status: 'HEALTHY',
        lastChecked: now,
      };
    }

    try {
      const snapshot = this.cacheMetrics.getSnapshot();
      const isDegraded = snapshot.hitRatio < 0.3 && (snapshot.hits + snapshot.misses > 100);

      return {
        subsystem: SubsystemName.CACHE,
        status: isDegraded ? 'DEGRADED' : 'HEALTHY',
        lastChecked: now,
        degradedReason: isDegraded ? `Cache hit ratio below 30% (${(snapshot.hitRatio * 100).toFixed(1)}%)` : undefined,
        details: {
          hits: snapshot.hits,
          misses: snapshot.misses,
          hitRatio: snapshot.hitRatio,
          stampedeLocks: snapshot.stampedeLocks,
        },
      };
    } catch (err: any) {
      return {
        subsystem: SubsystemName.CACHE,
        status: 'DEGRADED',
        lastChecked: now,
        degradedReason: `Cache health check failed: ${err?.message || 'Internal telemetry error'}`,
      };
    }
  }
}
