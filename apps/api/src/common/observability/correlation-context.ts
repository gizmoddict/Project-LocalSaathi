// ==============================================================================
// LocalSaathi — Asynchronous Request & Correlation Context (Phase 21)
// Uses AsyncLocalStorage to Propagate TraceContext & Correlation IDs Across Micro-ticks
// ==============================================================================

import { AsyncLocalStorage } from 'async_hooks';
import { TraceContext } from '@localsaathi/types';
import { randomBytes } from 'crypto';

export interface RequestCorrelationContext {
  requestId: string;
  correlationId: string;
  traceContext: TraceContext;
  userId?: string;
  actorRole?: string;
  startTime: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestCorrelationContext>();

/**
 * Generates a valid W3C TraceContext trace ID (32 hex characters).
 */
export function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Generates a valid W3C TraceContext span ID (16 hex characters).
 */
export function generateSpanId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Parses an incoming W3C `traceparent` header (version-traceid-parentid-traceflags).
 */
export function parseTraceparent(traceparent?: string | null): TraceContext | null {
  if (!traceparent || typeof traceparent !== 'string') return null;
  const match = traceparent.trim().match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/);
  if (!match || !match[1] || !match[2] || !match[3]) return null;
  return {
    traceId: match[1],
    spanId: match[2],
    traceFlags: match[3],
  };
}

/**
 * Formats a W3C `traceparent` header string.
 */
export function formatTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.traceFlags || '01'}`;
}

export class CorrelationContextManager {
  static run<T>(context: RequestCorrelationContext, fn: () => T): T {
    return asyncLocalStorage.run(context, fn);
  }

  static get(): RequestCorrelationContext | undefined {
    return asyncLocalStorage.getStore();
  }

  static getRequestId(): string {
    return asyncLocalStorage.getStore()?.requestId || 'req-untracked';
  }

  static getCorrelationId(): string {
    return asyncLocalStorage.getStore()?.correlationId || 'corr-untracked';
  }

  static getTraceId(): string | undefined {
    return asyncLocalStorage.getStore()?.traceContext.traceId;
  }

  static getSpanId(): string | undefined {
    return asyncLocalStorage.getStore()?.traceContext.spanId;
  }

  static setUser(userId: string, role?: string): void {
    const store = asyncLocalStorage.getStore();
    if (store) {
      store.userId = userId;
      store.actorRole = role;
    }
  }
}
