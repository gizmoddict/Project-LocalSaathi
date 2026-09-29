import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorEnvelope, ApiErrorCode } from '@localsaathi/types';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = request.id || 'req-unknown';
    const isProduction = process.env.NODE_ENV === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = ApiErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected internal error occurred';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as Record<string, unknown>;
        message = (resObj.message as string) || exception.message;
        if (Array.isArray(resObj.message)) {
          message = resObj.message.join(', ');
          details = resObj.message;
        }
        if (typeof resObj.error === 'string') {
          errorCode = (resObj.error.toUpperCase().replace(/\s+/g, '_') as ApiErrorCode) || errorCode;
        }
      }

      // Map HTTP status to ApiErrorCode if not specifically mapped
      switch (status) {
        case HttpStatus.BAD_REQUEST:
          errorCode = ApiErrorCode.BAD_REQUEST;
          break;
        case HttpStatus.UNAUTHORIZED:
          errorCode = ApiErrorCode.UNAUTHORIZED;
          break;
        case HttpStatus.FORBIDDEN:
          errorCode = ApiErrorCode.FORBIDDEN;
          break;
        case HttpStatus.NOT_FOUND:
          errorCode = ApiErrorCode.NOT_FOUND;
          break;
        case HttpStatus.CONFLICT:
          errorCode = ApiErrorCode.CONFLICT;
          break;
        case HttpStatus.TOO_MANY_REQUESTS:
          errorCode = ApiErrorCode.RATE_LIMIT_EXCEEDED;
          break;
        case HttpStatus.SERVICE_UNAVAILABLE:
          errorCode = ApiErrorCode.SERVICE_UNAVAILABLE;
          break;
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        JSON.stringify({
          level: 'error',
          requestId,
          message: exception.message,
          stack: isProduction ? undefined : exception.stack,
          path: request.url,
          method: request.method,
        })
      );
      if (!isProduction) {
        message = exception.message;
      }
    }

    const errorPayload: ApiErrorEnvelope = {
      success: false,
      error: {
        code: errorCode,
        message,
        ...(details && !isProduction ? { details: details as any } : {}),
      },
      requestId,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(errorPayload);
  }
}
