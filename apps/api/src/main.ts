import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { getApiConfig } from './config/env.config';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('LocalSaathiAPI');
  const config = getApiConfig();

  const app = await NestFactory.create(AppModule, {
    cors: false, // Managed manually below with strict origin checks
    logger: ['error', 'warn', 'log'],
  });

  // Enable graceful shutdown lifecycle hooks
  app.enableShutdownHooks();

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // Request Body Payload Limits
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // CORS Configuration
  const allowedOrigins = config.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());
  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser requests (Postman, curl, server-to-server) where origin is undefined
      if (!origin || allowedOrigins.includes(origin) || config.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not permitted by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  // Global Prefix & API Versioning
  app.setGlobalPrefix('api/v1');

  // Centralized Error Handling & Response Transformers
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // Swagger / OpenAPI Specification
  if (config.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('LocalSaathi Core API')
      .setDescription(
        'Production-grade REST API specification for LocalSaathi Hyperlocal Employment Platform.'
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addTag('Health & Observability', 'Probes for container orchestration and uptime monitoring')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`OpenAPI documentation available at http://localhost:${config.API_PORT}/api/docs`);
  }

  await app.listen(config.API_PORT);
  logger.log(`LocalSaathi API v1 listening on port ${config.API_PORT} in ${config.NODE_ENV} mode`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during API bootstrap:', err);
  process.exit(1);
});
