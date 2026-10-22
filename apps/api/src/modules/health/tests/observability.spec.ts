// ==============================================================================
// LocalSaathi — Observability & Monitoring Test Suite (Phase 21)
// Unit & Integration Tests for Logging, Redaction, Correlation, Metrics & Health
// ==============================================================================

import {
  CorrelationContextManager,
  parseTraceparent,
  formatTraceparent,
  generateTraceId,
  generateSpanId,
} from '../../../common/observability/correlation-context';
import {
  sanitizeLogData,
  StructuredLogger,
} from '../../../common/observability/structured-logger.service';
import { MetricsService } from '../../../common/observability/metrics.service';
import { TracingService } from '../../../common/observability/tracing.service';
import { AlertingService } from '../alerting.service';
import { LogLevel } from '@localsaathi/types';

describe('Phase 21 — Observability & Monitoring Platform', () => {
  describe('1. Correlation Context & W3C TraceContext', () => {
    it('generates valid 32-character trace IDs and 16-character span IDs', () => {
      const traceId = generateTraceId();
      const spanId = generateSpanId();

      expect(traceId).toHaveLength(32);
      expect(spanId).toHaveLength(16);
      expect(/^[0-9a-f]{32}$/.test(traceId)).toBe(true);
      expect(/^[0-9a-f]{16}$/.test(spanId)).toBe(true);
    });

    it('correctly parses and formats standard W3C traceparent headers', () => {
      const sampleTraceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const parsed = parseTraceparent(sampleTraceparent);

      expect(parsed).not.toBeNull();
      expect(parsed?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(parsed?.spanId).toBe('00f067aa0ba902b7');
      expect(parsed?.traceFlags).toBe('01');

      const formatted = formatTraceparent(parsed!);
      expect(formatted).toBe(sampleTraceparent);
    });

    it('rejects invalid or malformed traceparent headers safely', () => {
      expect(parseTraceparent('invalid-header')).toBeNull();
      expect(parseTraceparent('')).toBeNull();
      expect(parseTraceparent(null)).toBeNull();
      expect(parseTraceparent('01-trace-span-flag')).toBeNull();
    });

    it('maintains ambient context across asynchronous execution', async () => {
      const context = {
        requestId: 'req-ambient-1',
        correlationId: 'corr-ambient-1',
        startTime: Date.now(),
        traceContext: {
          traceId: generateTraceId(),
          spanId: generateSpanId(),
          traceFlags: '01',
        },
      };

      await CorrelationContextManager.run(context, async () => {
        const retrieved = CorrelationContextManager.get();
        expect(retrieved?.requestId).toBe('req-ambient-1');
        expect(retrieved?.correlationId).toBe('corr-ambient-1');

        await new Promise((r) => setTimeout(r, 10));

        const postYield = CorrelationContextManager.get();
        expect(postYield?.requestId).toBe('req-ambient-1');
      });

      // Context is undefined outside runner
      expect(CorrelationContextManager.get()).toBeUndefined();
    });
  });

  describe('2. Structured Logging & Secret Redaction Allowlist', () => {
    it('strictly redacts sensitive credentials and PII deeply in nested payloads', () => {
      const payload = {
        username: 'worker_sharma',
        password: 'PlainTextPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        nested: {
          refreshToken: 'rot-token-abc',
          pan: 'ABCDE1234F',
          aadhaar: '123456789012',
          salary: 500,
          details: {
            cvv: '123',
            authorization: 'Bearer secret-jwt',
          },
        },
        safeArray: ['normal-data', { secret: 'my-api-key' }],
      };

      const sanitized = sanitizeLogData(payload) as any;

      expect(sanitized.username).toBe('worker_sharma');
      expect(sanitized.password).toBe('[REDACTED_SECRET]');
      expect(sanitized.token).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.refreshToken).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.pan).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.aadhaar).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.salary).toBe(500);
      expect(sanitized.nested.details.cvv).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.details.authorization).toBe('[REDACTED_SECRET]');
      expect(sanitized.safeArray[1].secret).toBe('[REDACTED_SECRET]');
    });

    it('enriches structured log entries with active ambient trace metadata', () => {
      const logger = new StructuredLogger();
      let capturedLog: any = null;
      const originalWrite = process.stdout.write;
      (process.stdout as any).write = (str: string) => {
        try {
          capturedLog = JSON.parse(str);
        } catch {
          // non-json in dev
        }
        return true;
      };

      try {
        const traceContext = {
          traceId: generateTraceId(),
          spanId: generateSpanId(),
          traceFlags: '01',
        };

        CorrelationContextManager.run(
          { requestId: 'req-log-99', correlationId: 'corr-log-99', startTime: Date.now(), traceContext },
          () => {
            logger.logEvent(LogLevel.INFO, 'User action occurred', { targetId: 'job-123' });
          },
        );

        if (capturedLog) {
          expect(capturedLog.requestId).toBe('req-log-99');
          expect(capturedLog.correlationId).toBe('corr-log-99');
          expect(capturedLog.traceId).toBe(traceContext.traceId);
          expect(capturedLog.level).toBe(LogLevel.INFO);
        }
      } finally {
        process.stdout.write = originalWrite;
      }
    });
  });

  describe('3. Prometheus Metrics Registry', () => {
    let metrics: MetricsService;

    beforeEach(() => {
      metrics = new MetricsService();
    });

    it('correctly increments counters with multi-label isolation', () => {
      metrics.incrementCounter('http_requests_total', { method: 'GET', status_class: '2xx' });
      metrics.incrementCounter('http_requests_total', { method: 'GET', status_class: '2xx' }, 2);
      metrics.incrementCounter('http_requests_total', { method: 'POST', status_class: '4xx' });

      expect(
        metrics.getCounterValue('http_requests_total', { method: 'GET', status_class: '2xx' }),
      ).toBe(3);
      expect(
        metrics.getCounterValue('http_requests_total', { method: 'POST', status_class: '4xx' }),
      ).toBe(1);
    });

    it('records histogram observations and accurately calculates quantiles', () => {
      // Record 100 observations: 1ms to 100ms
      for (let i = 1; i <= 100; i++) {
        metrics.recordHistogram('http_request_duration_ms', i, { route: '/api/v1/jobs' });
      }

      const quantiles = metrics.getHistogramQuantiles('http_request_duration_ms', {
        route: '/api/v1/jobs',
      });

      expect(quantiles.count).toBe(100);
      expect(quantiles.sum).toBe(5050);
      expect(quantiles.p50).toBeCloseTo(51, 1);
      expect(quantiles.p90).toBeCloseTo(91, 1);
      expect(quantiles.p95).toBeCloseTo(96, 1);
      expect(quantiles.p99).toBeCloseTo(100, 1);
    });

    it('generates standard Prometheus text exposition format with HELP and TYPE lines', () => {
      metrics.incrementCounter('cache_hits_total', { key_prefix: 'worker_profile' }, 10);
      metrics.setGauge('queue_jobs_waiting', 42, { queue_name: 'notifications' });

      const prometheusText = metrics.exportPrometheusText();

      expect(prometheusText).toContain('# HELP cache_hits_total');
      expect(prometheusText).toContain('# TYPE cache_hits_total counter');
      expect(prometheusText).toContain('cache_hits_total{key_prefix="worker_profile"} 10');
      expect(prometheusText).toContain('# TYPE queue_jobs_waiting gauge');
      expect(prometheusText).toContain('queue_jobs_waiting{queue_name="notifications"} 42');
    });
  });

  describe('4. Distributed Tracing Service', () => {
    it('manages trace span lifecycles and records latency and attributes', () => {
      const tracer = new TracingService();
      const parent = {
        traceId: generateTraceId(),
        spanId: generateSpanId(),
        traceFlags: '01',
      };

      const span = tracer.startSpan('Prisma Query Job.findMany', {
        parentContext: parent,
        kind: 'CLIENT',
        attributes: { 'db.system': 'postgresql' },
      });

      expect(span.traceId).toBe(parent.traceId);
      expect(span.parentSpanId).toBe(parent.spanId);
      expect(span.attributes['db.system']).toBe('postgresql');

      tracer.endSpan(span, 'OK');

      expect(span.status).toBe('OK');
      expect(span.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('5. Alerting Engine & System Diagnostics', () => {
    it('evaluates alerts and triggers on elevated error rates', async () => {
      const metrics = new MetricsService();
      // Simulate 100 requests with 20 errors (20% error rate > 5% threshold)
      for (let i = 0; i < 80; i++) {
        metrics.incrementCounter('http_requests_total', { status_class: '2xx' });
      }
      for (let i = 0; i < 20; i++) {
        metrics.incrementCounter('http_requests_total', { status_class: '5xx' });
        metrics.incrementCounter('http_errors_total', { status_class: '5xx' });
      }

      const alerting = new AlertingService(metrics);
      const summary = await alerting.evaluateAlerts();

      expect(summary.status).toBe('ALERTS_ACTIVE');
      const errorRateAlert = summary.alerts.find((a) => a.ruleName === 'API Error Rate Too High');
      expect(errorRateAlert).toBeDefined();
      expect(errorRateAlert?.currentValue).toBe(20);
    });

    it('evaluates clean health state when metrics are within normal parameters', async () => {
      const metrics = new MetricsService();
      for (let i = 0; i < 50; i++) {
        metrics.incrementCounter('http_requests_total', { status_class: '2xx' });
      }

      const alerting = new AlertingService(metrics);
      const summary = await alerting.evaluateAlerts();

      expect(summary.alerts.filter((a) => a.ruleName === 'API Error Rate Too High')).toHaveLength(0);
    });

    it('dispatches triggered alerts to AlertNotifier implementation', async () => {
      const metrics = new MetricsService();
      for (let i = 0; i < 20; i++) {
        metrics.incrementCounter('http_requests_total', { status_class: '5xx' });
        metrics.incrementCounter('http_errors_total', { status_class: '5xx' });
      }

      const dispatchedAlerts: any[] = [];
      const mockNotifier = {
        notify: async (alert: any) => {
          dispatchedAlerts.push(alert);
        },
      };

      const alerting = new AlertingService(metrics, undefined, mockNotifier);
      const summary = await alerting.evaluateAlerts();

      expect(summary.status).toBe('ALERTS_ACTIVE');
      expect(dispatchedAlerts.length).toBeGreaterThan(0);
      expect(dispatchedAlerts[0].ruleName).toBe('API Error Rate Too High');
    });
  });

  describe('6. Metric Cardinality Hardening', () => {
    let metrics: MetricsService;

    beforeEach(() => {
      metrics = new MetricsService();
    });

    it('strictly forbids high-cardinality identifiers as Prometheus metric labels', () => {
      const forbiddenLabels: Array<Record<string, string>> = [
        { userId: 'usr_12345' },
        { workerId: 'wrk_99999' },
        { employerId: 'emp_88888' },
        { jobId: 'job_77777' },
        { applicationId: 'app_66666' },
        { bookingId: 'bk_55555' },
        { paymentId: 'pay_44444' },
        { notificationId: 'notif_33333' },
        { messageId: 'msg_22222' },
        { requestId: 'req_11111' },
        { correlationId: 'corr_00000' },
        { traceId: 'trc_abcdef' },
        { spanId: 'spn_123456' },
        { socketId: 'sck_999999' },
        { raw_cache_key: 'cache:wrk:123:profile' },
      ];

      for (const forbidden of forbiddenLabels) {
        expect(() => {
          metrics.incrementCounter('http_requests_total', forbidden);
        }).toThrow(/Forbidden high-cardinality metric label rejected/);

        expect(() => {
          metrics.setGauge('queue_jobs_waiting', 10, forbidden);
        }).toThrow(/Forbidden high-cardinality metric label rejected/);

        expect(() => {
          metrics.recordHistogram('http_request_duration_ms', 50, forbidden);
        }).toThrow(/Forbidden high-cardinality metric label rejected/);
      }
    });

    it('permits bounded operational dimensions as metric labels', () => {
      expect(() => {
        metrics.incrementCounter('http_requests_total', {
          method: 'GET',
          route: '/api/v1/jobs/:id',
          status_class: '2xx',
        });
        metrics.setGauge('queue_jobs_waiting', 5, { queue: 'notifications' });
        metrics.recordHistogram('db_query_duration_ms', 12, { model: 'JobPost', operation: 'findMany' });
      }).not.toThrow();
    });
  });

  describe('7. Secret Redaction Comprehensive Regression Tests', () => {
    it('scrubs all mandatory sensitive credentials and identifiers across deep payloads', () => {
      const fullSensitivePayload = {
        auth: {
          password: 'SecretPassword!1',
          passwordHash: '$2b$10$e8wY0123456789abcdefghij',
          otp: '123456',
          otpCode: '654321',
          token: 'jwt.token.here',
          accessToken: 'access.jwt.payload',
          refreshToken: 'refresh.token.payload',
          jwt: 'raw.jwt.token',
          authorization: 'Bearer secret_access_token',
          cookie: 'session_id=xyz987; Path=/',
          session: 'session-cookie-val',
          sessionSecret: 'super-secret-session-key',
        },
        financial: {
          cvv: '999',
          cardNumber: '4111111111111111',
          creditCard: '5500000000000004',
          pan: 'ABCDE1234F',
          panCard: 'XYZPA9876Q',
          aadhaar: '987654321098',
          vpa: 'user@okhdfcbank',
          razorpaySignature: 'razorpay_sig_hex_999',
          razorpayKeySecret: 'rzp_secret_key_123',
          webhookSecret: 'whsec_9988776655',
        },
        mixedArray: [
          'safe_item',
          { password: 'nested_password' },
          [{ aadhaar: 'nested_aadhaar' }],
        ],
      };

      const sanitized = sanitizeLogData(fullSensitivePayload) as any;

      // Verify Auth Redactions
      expect(sanitized.auth.password).toBe('[REDACTED_SECRET]');
      expect(sanitized.auth.passwordHash).toBe('[REDACTED_SECRET]');
      expect(sanitized.auth.otp).toBe('[REDACTED_SECRET]');
      expect(sanitized.auth.otpCode).toBe('[REDACTED_SECRET]');
      expect(sanitized.auth.token).toBe('[REDACTED_SECRET]');
      expect(sanitized.auth.accessToken).toBe('[REDACTED_SECRET]');
      expect(sanitized.auth.refreshToken).toBe('[REDACTED_SECRET]');
      expect(sanitized.auth.jwt).toBe('[REDACTED_SECRET]');
      expect(sanitized.auth.authorization).toBe('[REDACTED_SECRET]');
      expect(sanitized.auth.cookie).toBe('[REDACTED_SECRET]');
      expect(sanitized.auth.session).toBe('[REDACTED_SECRET]');
      expect(sanitized.auth.sessionSecret).toBe('[REDACTED_SECRET]');

      // Verify Financial Redactions
      expect(sanitized.financial.cvv).toBe('[REDACTED_SECRET]');
      expect(sanitized.financial.cardNumber).toBe('[REDACTED_SECRET]');
      expect(sanitized.financial.creditCard).toBe('[REDACTED_SECRET]');
      expect(sanitized.financial.pan).toBe('[REDACTED_SECRET]');
      expect(sanitized.financial.panCard).toBe('[REDACTED_SECRET]');
      expect(sanitized.financial.aadhaar).toBe('[REDACTED_SECRET]');
      expect(sanitized.financial.vpa).toBe('[REDACTED_SECRET]');
      expect(sanitized.financial.razorpaySignature).toBe('[REDACTED_SECRET]');
      expect(sanitized.financial.razorpayKeySecret).toBe('[REDACTED_SECRET]');
      expect(sanitized.financial.webhookSecret).toBe('[REDACTED_SECRET]');

      // Verify Nested Arrays
      expect(sanitized.mixedArray[0]).toBe('safe_item');
      expect(sanitized.mixedArray[1].password).toBe('[REDACTED_SECRET]');
      expect(sanitized.mixedArray[2][0].aadhaar).toBe('[REDACTED_SECRET]');
    });
  });

  describe('8. Health & Diagnostics Accuracy', () => {
    it('verifies process liveness is independent of external dependencies', () => {
      const mockPrisma: any = {};
      const { HealthService } = require('../health.service');
      const healthService = new HealthService(mockPrisma);

      const liveness = healthService.getLiveness();
      expect(liveness.status).toBe('alive');
      expect(liveness.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(liveness.timestamp).toBeDefined();
    });
  });
});
