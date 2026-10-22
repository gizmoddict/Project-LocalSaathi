// ==============================================================================
// LocalSaathi — Centralized Structured Logger (Phase 21)
// Machine-Readable JSON Logging, W3C Trace Injection & Strict Secret Redaction
// ==============================================================================

import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { LogLevel, StructuredLogEntry } from '@localsaathi/types';
import { CorrelationContextManager } from './correlation-context';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'otp',
  'otpcode',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'secret',
  'keysecret',
  'session',
  'sessionsecret',
  'webhooksecret',
  'razorpaysignature',
  'razorpaykeysecret',
  'authorization',
  'cookie',
  'aadhaar',
  'pan',
  'pancard',
  'creditcard',
  'cardnumber',
  'cvv',
  'vpa',
  'privatekey',
  'documentdata',
  'chatmessage',
  'messagecontent',
]);

/**
 * Deep-scrubs sensitive fields using recursive allowlist / denylist enforcement.
 */
export function sanitizeLogData(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[_\-]/g, '');
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      sanitized[key] = '[REDACTED_SECRET]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeLogData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

@Injectable({ scope: Scope.DEFAULT })
export class StructuredLogger implements LoggerService {
  private readonly serviceName = 'localsaathi-api';
  private readonly environment = process.env.NODE_ENV || 'development';
  private readonly isProduction = process.env.NODE_ENV === 'production';
  private readonly configuredLogLevel: LogLevel =
    (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;

  private isLevelEnabled(level: LogLevel): boolean {
    const priority: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 1,
      [LogLevel.INFO]: 2,
      [LogLevel.WARN]: 3,
      [LogLevel.ERROR]: 4,
      [LogLevel.FATAL]: 5,
    };
    return priority[level] >= (priority[this.configuredLogLevel] || 2);
  }

  private writeLog(
    level: LogLevel,
    message: string,
    context?: string,
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.isLevelEnabled(level)) return;

    const ctx = CorrelationContextManager.get();
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      environment: this.environment,
      message,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      traceId: ctx?.traceContext.traceId,
      spanId: ctx?.traceContext.spanId,
      userId: ctx?.userId,
      actorRole: ctx?.actorRole,
      metadata: metadata ? (sanitizeLogData(metadata) as Record<string, unknown>) : undefined,
    };

    if (context) {
      if (!entry.metadata) entry.metadata = {};
      entry.metadata.context = context;
    }

    if (this.isProduction || process.env.LOG_FORMAT === 'JSON') {
      const output = JSON.stringify(entry);
      if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
        process.stderr.write(output + '\n');
      } else {
        process.stdout.write(output + '\n');
      }
    } else {
      // Formatted development console output
      const timeStr = entry.timestamp.slice(11, 19);
      const traceSuffix = entry.traceId ? ` [trace=${entry.traceId.slice(0, 8)}]` : '';
      const prefix = `[${timeStr}] [${entry.level}] [${context || this.serviceName}]${traceSuffix}:`;
      if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
        // eslint-disable-next-line no-console
        console.error(prefix, message, entry.metadata || '');
      } else if (level === LogLevel.WARN) {
        // eslint-disable-next-line no-console
        console.warn(prefix, message, entry.metadata || '');
      } else {
        // eslint-disable-next-line no-console
        console.log(prefix, message, entry.metadata || '');
      }
    }
  }

  log(message: string, context?: string): void {
    this.writeLog(LogLevel.INFO, message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    const metadata = trace ? { stack: trace } : undefined;
    this.writeLog(LogLevel.ERROR, message, context, metadata);
  }

  warn(message: string, context?: string): void {
    this.writeLog(LogLevel.WARN, message, context);
  }

  debug(message: string, context?: string): void {
    this.writeLog(LogLevel.DEBUG, message, context);
  }

  verbose(message: string, context?: string): void {
    this.writeLog(LogLevel.DEBUG, message, context);
  }

  fatal(message: string, trace?: string, context?: string): void {
    const metadata = trace ? { stack: trace } : undefined;
    this.writeLog(LogLevel.FATAL, message, context, metadata);
  }

  /**
   * Helper to log rich structured events with custom metadata.
   */
  logEvent(level: LogLevel, message: string, metadata: Record<string, unknown>, context?: string): void {
    this.writeLog(level, message, context, metadata);
  }
}
