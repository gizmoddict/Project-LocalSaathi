import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export type PrismaQueryTelemetryHandler = (event: {
  model?: string;
  action: string;
  durationMs: number;
  isSlow: boolean;
  error?: Error;
}) => void;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private static telemetryHandler?: PrismaQueryTelemetryHandler;

  static setTelemetryHandler(handler: PrismaQueryTelemetryHandler): void {
    PrismaService.telemetryHandler = handler;
  }

  async onModuleInit(): Promise<void> {
    const slowThreshold = parseInt(process.env.DB_SLOW_QUERY_MS || '200', 10);

    // Instrument Prisma queries for latency, slow-query tracking, and error metrics
    (this as any).$use(async (params: any, next: (params: any) => Promise<any>) => {
      const start = Date.now();
      try {
        const result = await next(params);
        const duration = Date.now() - start;
        const isSlow = duration >= slowThreshold;

        if (PrismaService.telemetryHandler) {
          try {
            PrismaService.telemetryHandler({
              model: params.model,
              action: params.action,
              durationMs: duration,
              isSlow,
            });
          } catch {
            // Non-blocking telemetry
          }
        }

        if (isSlow) {
          this.logger.warn(
            `[SLOW QUERY] ${params.model || 'Raw'}.${params.action} took ${duration}ms (threshold: ${slowThreshold}ms)`,
          );
        }

        return result;
      } catch (err: unknown) {
        const duration = Date.now() - start;
        if (PrismaService.telemetryHandler) {
          try {
            PrismaService.telemetryHandler({
              model: params.model,
              action: params.action,
              durationMs: duration,
              isSlow: false,
              error: err instanceof Error ? err : new Error(String(err)),
            });
          } catch {
            // Non-blocking telemetry
          }
        }
        throw err;
      }
    });

    try {
      await this.$connect();
      this.logger.log('Successfully connected to PostgreSQL database');
    } catch (error) {
      this.logger.warn(
        `Database connection could not be established on startup: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL database');
  }

  /**
   * Performs an actual PostgreSQL connection check without faking health.
   * Runs a SELECT 1 query with a 1.5s timeout.
   */
  async checkConnection(): Promise<{ isHealthy: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.$queryRawUnsafe('SELECT 1;');
      const latencyMs = Date.now() - start;
      return { isHealthy: true, latencyMs };
    } catch (err: unknown) {
      return {
        isHealthy: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
