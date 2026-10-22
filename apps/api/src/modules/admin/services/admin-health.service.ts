// ==============================================================================
// LocalSaathi — Admin System Health Service (Phase 15 / Phase 21)
// Live Component Diagnostics: Database, Redis, Outbox Backlog & Latency
// ==============================================================================

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/database.module';
import { AdminSystemHealthResponse } from '@localsaathi/types';
import { SystemHealthService } from '../../health/system-health.service';
import { NotificationGateway } from '../../outbox/realtime/notification.gateway';
import * as net from 'net';

@Injectable()
export class AdminHealthService {
  private readonly logger = new Logger(AdminHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly systemHealthService?: SystemHealthService,
    @Optional() private readonly notificationGateway?: NotificationGateway,
  ) {}

  /**
   * Performs real operational health inspections across critical platform infrastructure.
   */
  async getSystemHealth(): Promise<AdminSystemHealthResponse> {
    // If centralized SystemHealthService is available, leverage its unified evaluations
    if (this.systemHealthService) {
      const sys = await this.systemHealthService.evaluateSystemHealth();
      const wsMetrics = this.notificationGateway?.getMetrics();

      return {
        status: sys.overallStatus === 'UNHEALTHY' ? 'UNAVAILABLE' : sys.overallStatus,
        timestamp: sys.timestamp,
        components: {
          api: {
            status: sys.components.API.status === 'UNHEALTHY' ? 'UNAVAILABLE' : sys.components.API.status,
            latencyMs: sys.components.API.latencyMs || 1,
          },
          database: {
            status: sys.components.DATABASE.status === 'UNHEALTHY' ? 'UNAVAILABLE' : sys.components.DATABASE.status,
            latencyMs: sys.components.DATABASE.latencyMs || 0,
          },
          redis: {
            status: sys.components.REDIS.status === 'UNHEALTHY' ? 'UNAVAILABLE' : sys.components.REDIS.status,
            latencyMs: sys.components.REDIS.latencyMs || 0,
          },
          outbox: {
            status: sys.components.OUTBOX.status === 'UNHEALTHY' ? 'UNAVAILABLE' : sys.components.OUTBOX.status,
            pendingCount: (sys.components.OUTBOX.details?.pendingCount as number) || 0,
            deadLetterCount: (sys.components.OUTBOX.details?.deadLetterCount as number) || 0,
          },
          webSocket: {
            status: sys.components.WEBSOCKET.status === 'UNHEALTHY' ? 'UNAVAILABLE' : sys.components.WEBSOCKET.status,
            activeConnections: wsMetrics?.activeSockets || 0,
          },
        },
      };
    }

    // Direct fallback diagnostics
    const timestamp = new Date().toISOString();

    // 1. Database Ping & Latency
    let dbStatus: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let dbLatencyMs = 0;
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - start;
      dbStatus = dbLatencyMs > 500 ? 'DEGRADED' : 'HEALTHY';
    } catch (err) {
      this.logger.error(`Database health check failed: ${err}`);
      dbStatus = 'UNAVAILABLE';
    }

    // 2. Redis Ping via TCP socket on REDIS_HOST:REDIS_PORT
    let redisStatus: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let redisLatencyMs = 0;
    try {
      const host = process.env.REDIS_HOST || 'localhost';
      const port = parseInt(process.env.REDIS_PORT || '6379', 10);
      const start = Date.now();
      const isReachable = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
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
      redisLatencyMs = Date.now() - start;
      redisStatus = isReachable ? (redisLatencyMs > 300 ? 'DEGRADED' : 'HEALTHY') : 'UNAVAILABLE';
    } catch (err) {
      this.logger.warn(`Redis health check failed: ${err}`);
      redisStatus = 'UNAVAILABLE';
    }

    // 3. Outbox Backlog & Dead Letter Count
    let pendingCount = 0;
    let deadLetterCount = 0;
    let outboxStatus: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' = 'HEALTHY';
    try {
      const [pending, deadLetter] = await Promise.all([
        this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
        this.prisma.outboxEvent.count({ where: { status: 'DEAD_LETTER' } }),
      ]);
      pendingCount = pending;
      deadLetterCount = deadLetter;
      if (deadLetterCount > 0) {
        outboxStatus = 'DEGRADED';
      } else if (pendingCount > 1000) {
        outboxStatus = 'DEGRADED';
      }
    } catch {
      outboxStatus = 'UNAVAILABLE';
    }

    // 4. WebSocket Active Connections
    const activeSockets = this.notificationGateway?.getMetrics().activeSockets || 0;

    // 5. Determine Overall System Status
    let overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' = 'HEALTHY';
    if (dbStatus === 'UNAVAILABLE' || redisStatus === 'UNAVAILABLE') {
      overallStatus = 'UNAVAILABLE';
    } else if (dbStatus === 'DEGRADED' || redisStatus === 'DEGRADED' || outboxStatus === 'DEGRADED') {
      overallStatus = 'DEGRADED';
    }

    return {
      status: overallStatus,
      timestamp,
      components: {
        api: {
          status: 'HEALTHY',
          latencyMs: 1,
        },
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        redis: {
          status: redisStatus,
          latencyMs: redisLatencyMs,
        },
        outbox: {
          status: outboxStatus,
          pendingCount,
          deadLetterCount,
        },
        webSocket: {
          status: 'HEALTHY',
          activeConnections: activeSockets,
        },
      },
    };
  }
}
