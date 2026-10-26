import { WorkerBootstrap } from '../src/worker.bootstrap';
import { getRedisConnectionOptions } from '../src/config/redis.config';

describe('WorkerBootstrap', () => {
  it('should initialize and shut down cleanly', async () => {
    const worker = new WorkerBootstrap();
    expect(worker.getStatus().isRunning).toBe(false);

    await worker.start();
    expect(worker.getStatus().isRunning).toBe(true);

    await worker.stop();
    expect(worker.getStatus().isRunning).toBe(false);
  });

  it('should honor Redis URL database index and TLS mode when parsing connection options', () => {
    const previousUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = 'rediss://:secret-pass@cache.internal:6380/3';

    try {
      const options = getRedisConnectionOptions();
      expect(options.host).toBe('cache.internal');
      expect(options.port).toBe(6380);
      expect(options.password).toBe('secret-pass');
      expect(options.db).toBe(3);
      expect(options.tls).toEqual({});
    } finally {
      if (previousUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previousUrl;
      }
    }
  });
});
