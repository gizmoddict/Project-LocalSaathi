// ==============================================================================
// LocalSaathi — Distributed Tracing Service (Phase 21)
// Standards-Compliant W3C TraceContext Engine & Bounded In-Memory Span Exporter
// ==============================================================================

import { Injectable, Logger } from '@nestjs/common';
import {
  TraceContext,
  TraceSpan,
  SpanAttributes,
} from '@localsaathi/types';
import {
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  formatTraceparent,
} from './correlation-context';

export interface StartSpanOptions {
  parentContext?: TraceContext;
  kind?: 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER' | 'INTERNAL';
  attributes?: SpanAttributes;
}

@Injectable()
export class TracingService {
  private readonly logger = new Logger(TracingService.name);
  private readonly isEnabled: boolean;
  private readonly serviceName: string;
  private readonly otlpEndpoint?: string;
  private readonly sampleRate: number;

  // Bounded circular buffer for local diagnostics (retains latest 1,000 spans)
  private readonly spanBuffer: TraceSpan[] = [];
  private readonly maxBufferSize = 1000;

  constructor() {
    this.isEnabled = process.env.TRACING_ENABLED !== 'false';
    this.serviceName = process.env.OTEL_SERVICE_NAME || 'localsaathi-api';
    this.otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    this.sampleRate = parseFloat(process.env.TRACE_SAMPLE_RATE || '1.0');
  }

  /**
   * Starts a new distributed trace span.
   */
  startSpan(name: string, options: StartSpanOptions = {}): TraceSpan {
    const parent = options.parentContext;
    const isSampled = Math.random() <= this.sampleRate;

    const traceId = parent?.traceId || generateTraceId();
    const spanId = generateSpanId();
    const parentSpanId = parent?.spanId;
    const kind = options.kind || 'INTERNAL';

    const span: TraceSpan = {
      traceId,
      spanId,
      parentSpanId,
      name,
      kind,
      startTimeMs: Date.now(),
      attributes: {
        'service.name': this.serviceName,
        'span.sampled': isSampled,
        ...(options.attributes || {}),
      },
      status: 'UNSET',
    };

    return span;
  }

  /**
   * Ends an active trace span and appends it to the in-memory telemetry buffer.
   */
  endSpan(span: TraceSpan, status: 'OK' | 'ERROR' = 'OK', error?: Error | string): void {
    if (!this.isEnabled) return;

    span.endTimeMs = Date.now();
    span.durationMs = span.endTimeMs - span.startTimeMs;
    span.status = status;

    if (error) {
      span.statusMessage = error instanceof Error ? error.message : String(error);
      span.attributes['error'] = true;
      span.attributes['error.message'] = span.statusMessage;
    }

    this.recordSpan(span);
  }

  /**
   * Helper to execute an async block within a named span.
   */
  async withSpan<T>(
    name: string,
    options: StartSpanOptions,
    fn: (span: TraceSpan) => Promise<T>,
  ): Promise<T> {
    const span = this.startSpan(name, options);
    try {
      const result = await fn(span);
      this.endSpan(span, 'OK');
      return result;
    } catch (err: any) {
      this.endSpan(span, 'ERROR', err);
      throw err;
    }
  }

  /**
   * Extracts W3C TraceContext from carrier headers.
   */
  extractContext(headers: Record<string, string | string[] | undefined>): TraceContext | null {
    const rawTraceparent = headers['traceparent'];
    if (typeof rawTraceparent === 'string') {
      return parseTraceparent(rawTraceparent);
    }
    if (Array.isArray(rawTraceparent) && rawTraceparent[0]) {
      return parseTraceparent(rawTraceparent[0]);
    }
    return null;
  }

  /**
   * Injects W3C TraceContext into carrier headers (e.g. for external HTTP or outbox metadata).
   */
  injectContext(carrier: Record<string, string>, context: TraceContext): void {
    carrier['traceparent'] = formatTraceparent(context);
  }

  private recordSpan(span: TraceSpan): void {
    if (this.spanBuffer.length >= this.maxBufferSize) {
      this.spanBuffer.shift(); // Evict oldest
    }
    this.spanBuffer.push(span);

    // Optional non-blocking background export to OTLP collector if configured
    if (process.env.OTEL_ENABLED === 'true' && this.otlpEndpoint) {
      this.exportSpanToOtlp(span).catch((err) => {
        this.logger.debug(`OTLP export failed (silently suppressed): ${err.message}`);
      });
    }
  }

  private async exportSpanToOtlp(span: TraceSpan): Promise<void> {
    // Simulated OTLP HTTP/protobuf payload envelope
    if (!this.otlpEndpoint) return;
    try {
      await fetch(this.otlpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: [span] }] }] }),
        signal: AbortSignal.timeout(1000), // Strict 1s non-blocking timeout
      });
    } catch {
      // Degrades gracefully without throwing or blocking application threads
    }
  }

  /**
   * Returns recent recorded spans for diagnostics or inspection.
   */
  getRecentSpans(limit = 100): TraceSpan[] {
    return this.spanBuffer.slice(-limit).reverse();
  }

  /**
   * Finds spans by traceId.
   */
  getSpansByTraceId(traceId: string): TraceSpan[] {
    return this.spanBuffer.filter((s) => s.traceId === traceId);
  }
}
