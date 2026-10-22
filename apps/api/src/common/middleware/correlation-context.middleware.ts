// ==============================================================================
// LocalSaathi — Inbound Request Correlation & Trace Context Middleware (Phase 21)
// Binds RequestId, CorrelationId & W3C Traceparent to AsyncLocalStorage
// ==============================================================================

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import {
  CorrelationContextManager,
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  formatTraceparent,
} from '../observability/correlation-context';
import { TraceContext } from '@localsaathi/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
      correlationId?: string;
      traceContext?: TraceContext;
    }
  }
}

@Injectable()
export class CorrelationContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawReqId = req.headers['x-request-id'];
    const requestId =
      typeof rawReqId === 'string' && rawReqId.trim().length > 0
        ? rawReqId.trim()
        : `req-${randomUUID()}`;

    const rawCorrId = req.headers['x-correlation-id'];
    const correlationId =
      typeof rawCorrId === 'string' && rawCorrId.trim().length > 0
        ? rawCorrId.trim()
        : requestId;

    // Parse or initialize W3C TraceContext
    const rawTraceparent = req.headers['traceparent'];
    let traceContext: TraceContext | null = null;
    if (typeof rawTraceparent === 'string') {
      traceContext = parseTraceparent(rawTraceparent);
    }

    if (!traceContext) {
      traceContext = {
        traceId: generateTraceId(),
        spanId: generateSpanId(),
        traceFlags: '01',
      };
    }

    // Attach identifiers to Request object
    req.id = requestId;
    req.correlationId = correlationId;
    req.traceContext = traceContext;

    // Set standard response headers
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Correlation-Id', correlationId);
    res.setHeader('traceparent', formatTraceparent(traceContext));

    // Bind to AsyncLocalStorage for end-to-end propagation without parameter passing
    CorrelationContextManager.run(
      {
        requestId,
        correlationId,
        traceContext,
        startTime: Date.now(),
      },
      () => {
        next();
      },
    );
  }
}
