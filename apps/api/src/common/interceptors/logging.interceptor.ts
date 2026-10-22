// ==============================================================================
// LocalSaathi — HTTP Observability & Telemetry Interceptor (Phase 21)
// Records Prometheus Metrics, Spans & Machine-Readable Structured Logs
// ==============================================================================

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { MetricsService } from '../observability/metrics.service';
import { TracingService } from '../observability/tracing.service';
import { sanitizeLogData } from '../observability/structured-logger.service';
import { CorrelationContextManager } from '../observability/correlation-context';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(
    @Optional() private readonly metricsService?: MetricsService,
    @Optional() private readonly tracingService?: TracingService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const startTime = Date.now();
    const { method, query, body } = request;
    const path = (request.path || request.url?.split('?')[0] || '/') as string;

    // Normalize route to avoid high-cardinality metrics (e.g. replace UUIDs with ':id')
    const normalizedRoute = this.normalizeRoute(path);

    // Distributed Trace Span
    const correlationCtx = CorrelationContextManager.get();
    const span = this.tracingService?.startSpan(`HTTP ${method} ${normalizedRoute}`, {
      parentContext: correlationCtx?.traceContext,
      kind: 'SERVER',
      attributes: {
        'http.method': method,
        'http.route': normalizedRoute,
        'http.url': path,
      },
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          const statusCode = response.statusCode;
          const statusClass = `${Math.floor(statusCode / 100)}xx`;

          // 1. Record Prometheus Metrics
          if (this.metricsService) {
            this.metricsService.incrementCounter('http_requests_total', {
              method,
              route: normalizedRoute,
              status_class: statusClass,
            });
            this.metricsService.recordHistogram('http_request_duration_ms', durationMs, {
              method,
              route: normalizedRoute,
              status_class: statusClass,
            });
            if (statusCode >= 400) {
              this.metricsService.incrementCounter('http_errors_total', {
                method,
                route: normalizedRoute,
                status_class: statusClass,
              });
            }
          }

          // 2. Complete Trace Span
          if (span && this.tracingService) {
            span.attributes['http.status_code'] = statusCode;
            this.tracingService.endSpan(span, statusCode >= 500 ? 'ERROR' : 'OK');
          }

          // 3. Emit Structured JSON Log
          this.logger.log(
            JSON.stringify({
              type: 'HTTP_REQUEST_SUCCESS',
              requestId: correlationCtx?.requestId || request.id,
              correlationId: correlationCtx?.correlationId || request.correlationId,
              traceId: correlationCtx?.traceContext.traceId,
              spanId: correlationCtx?.traceContext.spanId,
              method,
              route: normalizedRoute,
              statusCode,
              durationMs,
              query: sanitizeLogData(query),
              body: sanitizeLogData(body),
              timestamp: new Date().toISOString(),
            }),
          );
        },
        error: (err: unknown) => {
          const durationMs = Date.now() - startTime;
          const statusCode = response.statusCode || 500;
          const statusClass = `${Math.floor(statusCode / 100)}xx`;
          const errorMsg = err instanceof Error ? err.message : String(err);

          // 1. Record Prometheus Metrics
          if (this.metricsService) {
            this.metricsService.incrementCounter('http_requests_total', {
              method,
              route: normalizedRoute,
              status_class: statusClass,
            });
            this.metricsService.recordHistogram('http_request_duration_ms', durationMs, {
              method,
              route: normalizedRoute,
              status_class: statusClass,
            });
            this.metricsService.incrementCounter('http_errors_total', {
              method,
              route: normalizedRoute,
              status_class: statusClass,
            });
          }

          // 2. Complete Trace Span
          if (span && this.tracingService) {
            span.attributes['http.status_code'] = statusCode;
            this.tracingService.endSpan(span, 'ERROR', err instanceof Error ? err : errorMsg);
          }

          // 3. Emit Structured JSON Log
          this.logger.error(
            JSON.stringify({
              type: 'HTTP_REQUEST_FAILURE',
              requestId: correlationCtx?.requestId || request.id,
              correlationId: correlationCtx?.correlationId || request.correlationId,
              traceId: correlationCtx?.traceContext.traceId,
              spanId: correlationCtx?.traceContext.spanId,
              method,
              route: normalizedRoute,
              statusCode,
              durationMs,
              error: errorMsg,
              timestamp: new Date().toISOString(),
            }),
          );
        },
      }),
    );
  }

  private normalizeRoute(path: string): string {
    // Replace standard UUIDs with ':id'
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    let normalized = path.replace(uuidRegex, ':id');
    // Replace raw integer IDs
    normalized = normalized.replace(/\/\d+(\/|$)/g, '/:id$1');
    return normalized;
  }
}
