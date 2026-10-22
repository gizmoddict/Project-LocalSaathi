import { WorkerBootstrap } from './worker.bootstrap';

const bootstrap = new WorkerBootstrap();

async function main() {
  await bootstrap.start();

  const shutdownTimeoutMs = parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || '10000', 10);
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    // eslint-disable-next-line no-console
    console.info(`[LocalSaathi Worker] Received ${signal}. Starting shutdown (timeout: ${shutdownTimeoutMs}ms).`);
    const timer = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error(`[LocalSaathi Worker] Graceful shutdown timed out after ${shutdownTimeoutMs}ms. Forcing exit.`);
      process.exit(1);
    }, shutdownTimeoutMs);
    if (timer.unref) timer.unref();

    try {
      await bootstrap.stop();
      clearTimeout(timer);
      process.exit(0);
    } catch (err) {
      clearTimeout(timer);
      // eslint-disable-next-line no-console
      console.error('[LocalSaathi Worker] Error during worker stop:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[LocalSaathi Worker] Fatal error in worker bootstrap:', err);
  process.exit(1);
});
