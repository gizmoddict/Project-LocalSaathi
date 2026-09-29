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
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  return {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
