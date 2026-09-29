import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { redactSensitiveData } from '../utils/redaction.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const startTime = Date.now();
    const { method, url, id: requestId, query, body } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          const statusCode = response.statusCode;

          this.logger.log(
            JSON.stringify({
              type: 'HTTP_REQUEST_SUCCESS',
              requestId,
              method,
              url,
              statusCode,
              durationMs,
              query: redactSensitiveData(query),
              body: redactSensitiveData(body),
              timestamp: new Date().toISOString(),
            })
          );
        },
        error: (err: unknown) => {
          const durationMs = Date.now() - startTime;
          const statusCode = response.statusCode || 500;

          this.logger.error(
            JSON.stringify({
              type: 'HTTP_REQUEST_FAILURE',
              requestId,
              method,
              url,
              statusCode,
              durationMs,
              error: err instanceof Error ? err.message : String(err),
              timestamp: new Date().toISOString(),
            })
          );
        },
      })
    );
  }
}
