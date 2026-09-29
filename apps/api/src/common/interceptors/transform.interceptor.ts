import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { ApiResponse } from '@localsaathi/types';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Observable<ApiResponse<T> | T> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = request.id || 'req-unknown';

    return next.handle().pipe(
      map((data) => {
        // If data is already an envelope or null/undefined, handle appropriately
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        const response: ApiResponse<T> = {
          success: true,
          data,
          requestId,
          timestamp: new Date().toISOString(),
        };

        return response;
      })
    );
  }
}
