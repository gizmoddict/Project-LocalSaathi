import { z } from 'zod';

/**
 * Backend API Environment Variables Schema.
 */
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  API_URL: z.string().url().default('http://localhost:4000'),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ENABLE_REQUEST_LOGGING: z.string().transform((v) => v === 'true').default('true'),

  // Database
  DATABASE_URL: z.string().url().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('localsaathi_admin'),
  DB_PASSWORD: z.string().default('localsaathi_dev_password'),
  DB_NAME: z.string().default('localsaathi_db'),

  // Redis
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // OpenSearch
  OPENSEARCH_URL: z.string().optional(),
  OPENSEARCH_USERNAME: z.string().optional(),
  OPENSEARCH_PASSWORD: z.string().optional(),

  // JWT & Security
  JWT_ACCESS_SECRET: z.string().min(16).default('development_jwt_access_secret_only_for_dev_32char'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16).default('development_jwt_refresh_secret_only_for_dev_32char'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
});

/**
 * Web Frontend Environment Variables Schema.
 */
export const webEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000/api/v1'),
});

/**
 * Worker Environment Variables Schema.
 */
export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WORKER_PORT: z.coerce.number().default(4001),
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
});

export type ApiEnvConfig = z.infer<typeof apiEnvSchema>;
export type WebEnvConfig = z.infer<typeof webEnvSchema>;
export type WorkerEnvConfig = z.infer<typeof workerEnvSchema>;
