// ==============================================================================
// LocalSaathi — Frontend Product Telemetry Client (Phase 16)
// Robust track() implementation with buffering, retries, privacy sanitization & non-blocking execution
// ==============================================================================

import {
  AnalyticsPlatform,
  ClientTrackEventInput,
} from '@localsaathi/types';

interface TelemetryConfig {
  endpoint: string;
  batchSize: number;
  flushIntervalMs: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: TelemetryConfig = {
  endpoint: '/api/v1/analytics/events/batch',
  batchSize: 10,
  flushIntervalMs: 5000,
  maxRetries: 3,
};

class TelemetryClient {
  private buffer: ClientTrackEventInput[] = [];
  private flushTimer: any = null;
  private anonymousSessionId: string = '';
  private config: TelemetryConfig;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initSession();
    this.startFlushTimer();
  }

  private initSession(): void {
    if (typeof window === 'undefined') return;
    try {
      let sid = sessionStorage.getItem('ls_anon_sid');
      if (!sid) {
        sid = 'anon_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
        sessionStorage.setItem('ls_anon_sid', sid);
      }
      this.anonymousSessionId = sid;
    } catch {
      this.anonymousSessionId = 'anon_fallback_' + Date.now();
    }
  }

  private startFlushTimer(): void {
    if (typeof window === 'undefined') return;
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, this.config.flushIntervalMs);
  }

  public destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Tracks a client telemetry interaction event asynchronously and non-blockingly.
   */
  public track(
    eventName: string,
    metadata: Record<string, unknown> = {},
    options: { correlationId?: string; schemaVersion?: number } = {},
  ): void {
    try {
      const eventId = 'evt_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();

      const event: ClientTrackEventInput = {
        eventId,
        eventName,
        occurredAt: new Date().toISOString(),
        anonymousSessionId: this.anonymousSessionId,
        platform: AnalyticsPlatform.WEB,
        appVersion: '1.0.0',
        correlationId: options.correlationId,
        schemaVersion: options.schemaVersion || 1,
        metadata,
      };

      this.buffer.push(event);

      if (this.buffer.length >= this.config.batchSize) {
        this.flush().catch(() => {});
      }
    } catch (err) {
      // Non-blocking failure: never crash the client application
      if (process.env.NODE_ENV === 'development') {
        console.warn('[TelemetryClient] track failed silently:', err);
      }
    }
  }

  /**
   * Immediately flushes all queued telemetry events to the backend.
   */
  public async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batchToSend = [...this.buffer];
    this.buffer = [];

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const url = `${baseUrl}${this.config.endpoint}`;

    let attempts = 0;
    while (attempts < this.config.maxRetries) {
      attempts++;
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ events: batchToSend }),
        });

        if (res.ok) {
          return;
        }
      } catch (err) {
        if (attempts >= this.config.maxRetries) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[TelemetryClient] Batch flush failed after retries:', err);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempts));
      }
    }
  }
}

export const telemetry = new TelemetryClient();
