import { RedisOptions } from 'ioredis';
import { workerEnvSchema, WorkerEnvConfig } from '@localsaathi/validation';

export function getWorkerConfig(): WorkerEnvConfig {
  const result = workerEnvSchema.safeParse(process.env);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid Worker Environment Config:', result.error.format());
    throw new Error('Worker environment validation failed');
  }
  return result.data;
}

export function getRedisConnectionOptions(): RedisOptions {
  const config = getWorkerConfig();

  if (config.REDIS_URL) {
    try {
      const parsed = new URL(config.REDIS_URL);
      return {
        host: parsed.hostname || '127.0.0.1',
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };
    } catch {
      // Fallback if URL parsing fails
    }
  }

  return {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
