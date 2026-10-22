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
  AUTH_PEPPER: z.string().min(16).default('development_auth_pepper_for_local_hashing_32c'),
  AUTH_COOKIE_NAME: z.string().default('localsaathi_refresh_token'),

  // OTP Configuration
  OTP_LENGTH: z.coerce.number().default(6),
  OTP_TTL_SECONDS: z.coerce.number().default(300), // 5 minutes
  OTP_MAX_ATTEMPTS: z.coerce.number().default(3),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().default(60), // 60 seconds
  RATE_LIMIT_OTP_REQUESTS: z.coerce.number().default(5),
  RATE_LIMIT_OTP_VERIFY: z.coerce.number().default(5),
  SMS_PROVIDER: z.enum(['development', 'mock', 'twilio', 'msg91']).default('development'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),

  // Reliability & Resilience (Phase 22)
  RETRY_MAX_ATTEMPTS: z.coerce.number().default(3),
  RETRY_INITIAL_DELAY_MS: z.coerce.number().default(250),
  RETRY_MAX_DELAY_MS: z.coerce.number().default(5000),
  RETRY_JITTER_PERCENT: z.coerce.number().default(0.2),
  DB_OPERATION_TIMEOUT_MS: z.coerce.number().default(5000),
  REDIS_OPERATION_TIMEOUT_MS: z.coerce.number().default(1500),
  EXTERNAL_HTTP_TIMEOUT_MS: z.coerce.number().default(10000),
  PAYMENT_PROVIDER_TIMEOUT_MS: z.coerce.number().default(10000),
  NOTIFICATION_PROVIDER_TIMEOUT_MS: z.coerce.number().default(8000),
  CB_FAILURE_THRESHOLD: z.coerce.number().default(5),
  CB_ROLLING_WINDOW_MS: z.coerce.number().default(10000),
  CB_OPEN_DURATION_MS: z.coerce.number().default(15000),
  CB_HALF_OPEN_PROBES: z.coerce.number().default(3),
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(10000),
  // Phase 23 — Disaster Recovery & Data Integrity
  BACKUP_STORAGE_DIR: z.string().default('./backups'),
  BACKUP_RETENTION_DAYS: z.coerce.number().default(30),
  BACKUP_ENCRYPTION_KEY: z.string().optional(),
  ISOLATED_RESTORE_DB_URL: z.string().optional(),

  // Phase 24 — Environment & Deployment (Section 2, 3, 4, 5)
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  JWT_PREVIOUS_ACCESS_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_PREVIOUS_WEBHOOK_SECRET: z.string().optional(),
  STORAGE_PROVIDER: z.enum(['local', 's3', 'gcs', 'minio']).default('local'),
  STORAGE_BUCKET: z.string().default('localsaathi-media'),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_REGION: z.string().default('ap-south-1'),
  STORAGE_ENDPOINT: z.string().optional(),
});

/**
 * Web Frontend Environment Variables Schema.
 */
export const webEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000/api/v1'),
});

/**
 * Worker Environment Variables Schema.
 */
export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  WORKER_PORT: z.coerce.number().default(4001),
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
});

export type ApiEnvConfig = z.infer<typeof apiEnvSchema>;
export type WebEnvConfig = z.infer<typeof webEnvSchema>;
export type WorkerEnvConfig = z.infer<typeof workerEnvSchema>;

export interface EnvironmentValidationResult {
  isValid: boolean;
  environment: 'development' | 'test' | 'staging' | 'production';
  errors: string[];
  warnings: string[];
}

/**
 * Centralized Production Environment Validator (Phase 24 Section 3).
 * Strictly guards against default secrets, unencrypted backups, wildcard CORS,
 * and test gateway keys entering staging or production environments.
 * NEVER logs actual secret values.
 */
export function validateEnvironmentConfig(
  rawEnv: Record<string, any>,
  targetEnv?: 'development' | 'test' | 'staging' | 'production'
): EnvironmentValidationResult {
  const envType = targetEnv || (rawEnv.APP_ENV as any) || (rawEnv.NODE_ENV === 'production' ? 'production' : 'development');
  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse baseline schema
  const parsed = apiEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`Field '${issue.path.join('.')}': ${issue.message}`);
    }
    return { isValid: false, environment: envType, errors, warnings };
  }

  const cfg = parsed.data;

  // Strict Production Enforcement
  if (envType === 'production') {
    // 1. Database URL must be non-local and not using default password
    if (!cfg.DATABASE_URL) {
      errors.push("Production requires explicit 'DATABASE_URL'");
    } else if (cfg.DATABASE_URL.includes('localhost') || cfg.DATABASE_URL.includes('127.0.0.1')) {
      errors.push("Production 'DATABASE_URL' must not target localhost");
    } else if (cfg.DATABASE_URL.includes('localsaathi_dev_password')) {
      errors.push("Production 'DATABASE_URL' cannot use default development password");
    }

    // 2. JWT Secrets must not be development placeholders and must be >= 32 chars
    if (cfg.JWT_ACCESS_SECRET.includes('development') || cfg.JWT_ACCESS_SECRET.includes('placeholder')) {
      errors.push("Production 'JWT_ACCESS_SECRET' cannot use development placeholder string");
    } else if (cfg.JWT_ACCESS_SECRET.length < 32) {
      errors.push("Production 'JWT_ACCESS_SECRET' must have at least 32 characters of entropy");
    }

    if (cfg.JWT_REFRESH_SECRET.includes('development') || cfg.JWT_REFRESH_SECRET.includes('placeholder')) {
      errors.push("Production 'JWT_REFRESH_SECRET' cannot use development placeholder string");
    } else if (cfg.JWT_REFRESH_SECRET.length < 32) {
      errors.push("Production 'JWT_REFRESH_SECRET' must have at least 32 characters of entropy");
    }

    if (cfg.AUTH_PEPPER.includes('development') || cfg.AUTH_PEPPER.includes('placeholder')) {
      errors.push("Production 'AUTH_PEPPER' cannot use development placeholder string");
    }

    // 3. CORS cannot allow wildcard or localhost in production
    if (cfg.CORS_ALLOWED_ORIGINS.includes('*')) {
      errors.push("Production 'CORS_ALLOWED_ORIGINS' cannot contain wildcard '*'");
    } else if (cfg.CORS_ALLOWED_ORIGINS.includes('localhost') || cfg.CORS_ALLOWED_ORIGINS.includes('127.0.0.1')) {
      errors.push("Production 'CORS_ALLOWED_ORIGINS' cannot allow localhost origins");
    }

    // 4. Backup encryption key is mandatory in production
    if (!cfg.BACKUP_ENCRYPTION_KEY || cfg.BACKUP_ENCRYPTION_KEY.length < 16) {
      errors.push("Production 'BACKUP_ENCRYPTION_KEY' is mandatory and must be at least 16 characters");
    }

    // 5. Payment gateway must not use test key in production
    if (cfg.RAZORPAY_KEY_ID && cfg.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
      errors.push("Production 'RAZORPAY_KEY_ID' cannot use sandbox 'rzp_test_' credential");
    }

    // 6. SMS provider cannot be mock in production
    if (cfg.SMS_PROVIDER === 'development' || cfg.SMS_PROVIDER === 'mock') {
      errors.push("Production 'SMS_PROVIDER' cannot use 'development' or 'mock'");
    }
  }

  // Staging Warnings / Checks
  if (envType === 'staging') {
    if (cfg.CORS_ALLOWED_ORIGINS.includes('*')) {
      warnings.push("Staging 'CORS_ALLOWED_ORIGINS' should not use wildcard '*'");
    }
    if (!cfg.BACKUP_ENCRYPTION_KEY) {
      warnings.push("Staging backup encryption is recommended but optional");
    }
  }

  return {
    isValid: errors.length === 0,
    environment: envType,
    errors,
    warnings,
  };
}
