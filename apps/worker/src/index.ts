import { WorkerBootstrap } from './worker.bootstrap';

const bootstrap = new WorkerBootstrap();

async function main() {
  await bootstrap.start();

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.info(`[LocalSaathi Worker] Received ${signal}. Starting shutdown.`);
    await bootstrap.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[LocalSaathi Worker] Fatal error in worker bootstrap:', err);
  process.exit(1);
});
