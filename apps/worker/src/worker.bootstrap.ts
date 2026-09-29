import { getRedisConnectionOptions } from './config/redis.config';

export class WorkerBootstrap {
  private isRunning = false;

  async start(): Promise<void> {
    const redisOptions = getRedisConnectionOptions();
    // eslint-disable-next-line no-console
    console.info(
      `[LocalSaathi Worker] Initializing worker bootstrap with Redis host: ${redisOptions.host || 'URL'}`
    );

    this.isRunning = true;
    // eslint-disable-next-line no-console
    console.info('[LocalSaathi Worker] Bootstrap lifecycle active. Ready for queue registration.');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    // eslint-disable-next-line no-console
    console.info('[LocalSaathi Worker] Gracefully shutting down worker processes...');
    this.isRunning = false;
    // eslint-disable-next-line no-console
    console.info('[LocalSaathi Worker] Shutdown completed.');
  }

  getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}
