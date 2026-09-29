import { Injectable } from '@nestjs/common';
import * as net from 'net';
import * as http from 'http';
import * as https from 'https';
import {
  HealthSummaryResponse,
  LivenessResponse,
  ReadinessResponse,
  DependencyHealth,
} from '@localsaathi/types';
import { getApiConfig } from '../../config/env.config';

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  getHealthSummary(): HealthSummaryResponse {
    const config = getApiConfig();
    return {
      status: 'ok',
      service: 'localsaathi-api',
      environment: config.NODE_ENV,
      version: '0.1.0',
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  getLiveness(): LivenessResponse {
    return {
      status: 'alive',
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<{ isReady: boolean; response: ReadinessResponse }> {
    const config = getApiConfig();

    const [dbHealth, redisHealth, opensearchHealth] = await Promise.all([
      this.checkDatabase(config.DB_HOST, config.DB_PORT),
      this.checkRedis(config.REDIS_HOST, config.REDIS_PORT),
      this.checkOpenSearch(config.OPENSEARCH_URL),
    ]);

    // System is ready if configured dependencies are UP or if running in dev without external services
    const anyConfiguredDown =
      dbHealth.status === 'down' ||
      redisHealth.status === 'down' ||
      opensearchHealth.status === 'down';

    const isReady = !anyConfiguredDown;

    return {
      isReady,
      response: {
        status: isReady ? 'ready' : 'not_ready',
        dependencies: {
          database: dbHealth,
          redis: redisHealth,
          opensearch: opensearchHealth,
        },
        timestamp: new Date().toISOString(),
      },
    };
  }

  private async checkTcpSocket(host: string, port: number, timeoutMs = 1500): Promise<DependencyHealth> {
    const start = Date.now();
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        const latencyMs = Date.now() - start;
        socket.destroy();
        resolve({ status: 'ok', latencyMs });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ status: 'down', message: `Connection timed out after ${timeoutMs}ms` });
      });

      socket.on('error', (err: Error) => {
        socket.destroy();
        resolve({ status: 'down', message: err.message });
      });

      try {
        socket.connect(port, host);
      } catch (err: unknown) {
        socket.destroy();
        resolve({ status: 'down', message: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  private async checkDatabase(host: string, port: number): Promise<DependencyHealth> {
    const config = getApiConfig();
    if (!config.DATABASE_URL && (!host || !port)) {
      return { status: 'not_configured' };
    }
    return this.checkTcpSocket(host, port);
  }

  private async checkRedis(host: string, port: number): Promise<DependencyHealth> {
    const config = getApiConfig();
    if (!config.REDIS_URL && (!host || !port)) {
      return { status: 'not_configured' };
    }
    return this.checkTcpSocket(host, port);
  }

  private async checkOpenSearch(urlStr?: string): Promise<DependencyHealth> {
    if (!urlStr) {
      return { status: 'not_configured' };
    }

    try {
      const url = new URL(urlStr);
      const start = Date.now();
      const client = url.protocol === 'https:' ? https : http;

      return await new Promise((resolve) => {
        const req = client.get(urlStr, { timeout: 1500 }, (res) => {
          const latencyMs = Date.now() - start;
          if (res.statusCode && res.statusCode < 500) {
            resolve({ status: 'ok', latencyMs });
          } else {
            resolve({ status: 'down', message: `HTTP status code ${res.statusCode}` });
          }
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ status: 'down', message: 'OpenSearch check timed out' });
        });

        req.on('error', (err) => {
          resolve({ status: 'down', message: err.message });
        });
      });
    } catch (err: unknown) {
      return { status: 'down', message: err instanceof Error ? err.message : String(err) };
    }
  }
}
