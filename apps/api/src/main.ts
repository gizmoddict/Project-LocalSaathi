import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import * as express from 'express';
import cookieParser from 'cookie-parser';
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

  // Security Headers via Helmet & Strict Permissions Policy
  const allowedOrigins = config.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", ...allowedOrigins],
          frameAncestors: ["'none'"],
        },
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
    })
  );

  // Additional Security Header: Permissions Policy
  app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Response Compression (gzip / deflate for responses > 1KB)
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
    })
  );

  // Request Body Payload Limits & Raw Buffer Capture for HMAC Signature Validation
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: any, _res: any, buf: Buffer) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(
    express.urlencoded({
      extended: true,
      limit: '2mb',
      verify: (req: any, _res: any, buf: Buffer) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(cookieParser());

  // CORS Configuration: Strict Origin Allowlist Enforcement
  const isDevOrigin = (origin: string): boolean => {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  };

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser server-to-server requests without Origin header
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (config.NODE_ENV !== 'production' && isDevOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not permitted by CORS policy`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Correlation-Id', 'traceparent', 'X-Razorpay-Signature', 'X-Webhook-Signature'],
  });

  // Global Prefix & API Versioning
  app.setGlobalPrefix('api/v1');

  // Centralized Error Handling & Response Transformers
  const { MetricsService } = await import('./common/observability/metrics.service');
  const { TracingService } = await import('./common/observability/tracing.service');
  const metricsService = app.get(MetricsService, { strict: false });
  const tracingService = app.get(TracingService, { strict: false });

  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(metricsService, tracingService),
    new TransformInterceptor(),
  );

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

  const shutdownTimeoutMs = parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || '10000', 10);
  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.log(`Received ${signal}. Initiating graceful shutdown (timeout: ${shutdownTimeoutMs}ms)...`);
    if (metricsService) {
      try {
        metricsService.incrementCounter('graceful_shutdown_total', { service: 'api' });
      } catch {
        // Bounded metric protection
      }
    }
    const timer = setTimeout(() => {
      logger.error(`Graceful shutdown timed out after ${shutdownTimeoutMs}ms. Forcing process exit.`);
      process.exit(1);
    }, shutdownTimeoutMs);
    if (timer.unref) timer.unref();

    try {
      await app.close();
      clearTimeout(timer);
      logger.log('API application closed gracefully.');
      process.exit(0);
    } catch (err) {
      clearTimeout(timer);
      logger.error('Error during graceful shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during API bootstrap:', err);
  process.exit(1);
});
