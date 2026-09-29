import { apiEnvSchema, ApiEnvConfig } from '@localsaathi/validation';
import { Logger } from '@nestjs/common';

let cachedConfig: ApiEnvConfig | null = null;

export function getApiConfig(): ApiEnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const result = apiEnvSchema.safeParse(process.env);
  if (!result.success) {
    const logger = new Logger('EnvironmentConfig');
    logger.error('Invalid environment configuration:');
    logger.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Invalid environment configuration');
  }

  cachedConfig = result.data;
  return cachedConfig;
}
