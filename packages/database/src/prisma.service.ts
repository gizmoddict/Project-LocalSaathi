import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
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
