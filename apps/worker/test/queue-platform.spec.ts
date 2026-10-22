// ==============================================================================
// LocalSaathi — Queue & Worker Platform Test Suite (Phase 20)
// Universal Job Contracts, Schema Validation, Idempotency, DLQ Sanitization & Lifecycle
// ==============================================================================

import {
  QueueName,
  JobPriority,
  JobContract,
  NotificationJobPayload,
  SmsJobPayload,
} from '@localsaathi/types';
import {
  jobContractSchema,
  getPayloadSchemaForQueue,
  notificationJobPayloadSchema,
  smsJobPayloadSchema,
  imageProcessingJobPayloadSchema,
} from '@localsaathi/validation';
import { DeadLetterQueueService } from '../src/dlq/dlq.service';
import { BaseJobHandler } from '../src/handlers/base.handler';
import { ScheduledJobsManager } from '../src/scheduler/scheduled-jobs.manager';
import { WorkerBootstrap } from '../src/worker.bootstrap';
import { UnrecoverableError } from 'bullmq';

describe('LocalSaathi Queue & Worker Platform (Phase 20)', () => {
  // ----------------------------------------------------------------------------
  // 1. Universal Job Contract & Zod Validation
  // ----------------------------------------------------------------------------
  describe('Universal Job Contract Validation', () => {
    it('should validate a compliant JobContract envelope', () => {
      const validContract: JobContract<NotificationJobPayload> = {
        jobName: 'send-notification',
        schemaVersion: 1,
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        correlationId: 'trace-12345',
        payload: {
          recipientUserId: '550e8400-e29b-41d4-a716-446655440001',
          notificationType: 'BOOKING_CONFIRMED',
          title: 'Booking Confirmed',
          body: 'Your booking has been accepted by the employer.',
          channel: 'ALL',
        },
        createdAt: new Date().toISOString(),
        attemptCount: 0,
        priority: JobPriority.HIGH,
        idempotencyKey: 'notification:booking:123',
        sourceEventId: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = jobContractSchema.safeParse(validContract);
      expect(result.success).toBe(true);
    });

    it('should reject a malformed JobContract missing required fields', () => {
      const invalidContract = {
        jobName: 'ab', // min length is 3
        payload: {},
        // missing schemaVersion, jobId, createdAt, priority, idempotencyKey
      };

      const result = jobContractSchema.safeParse(invalidContract);
      expect(result.success).toBe(false);
    });

    it('should validate and reject queue-specific schemas accurately', () => {
      // Valid Notification
      const validNotif: NotificationJobPayload = {
        recipientUserId: '550e8400-e29b-41d4-a716-446655440001',
        notificationType: 'JOB_APPLIED',
        title: 'New Application',
        body: 'A worker applied for your job posting.',
        channel: 'IN_APP',
      };
      expect(notificationJobPayloadSchema.safeParse(validNotif).success).toBe(true);

      // Invalid Notification: invalid UUID
      const invalidNotif = { ...validNotif, recipientUserId: 'invalid-id' };
      expect(notificationJobPayloadSchema.safeParse(invalidNotif).success).toBe(false);

      // Valid SMS
      const validSms: SmsJobPayload = {
        toPhone: '+919876543210',
        message: 'Your verification code is 123456',
        otpCode: '123456',
        purpose: 'AUTH_OTP',
      };
      expect(smsJobPayloadSchema.safeParse(validSms).success).toBe(true);

      // Invalid SMS: bad phone number format
      const invalidSms = { ...validSms, toPhone: '000' };
      expect(smsJobPayloadSchema.safeParse(invalidSms).success).toBe(false);

      // Antivirus guard enforcement on Image Processing
      const unverifiedImage = {
        sourceFilePath: '/uploads/raw/doc.jpg',
        targetStorageKey: '/processed/doc.webp',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        operations: ['WEBP_OPTIMIZE'],
        antivirusChecked: false, // Must be true!
      };
      expect(imageProcessingJobPayloadSchema.safeParse(unverifiedImage).success).toBe(false);
    });

    it('should resolve correct Zod schemas for all 12 queues via getPayloadSchemaForQueue', () => {
      for (const queueName of Object.values(QueueName)) {
        const schema = getPayloadSchemaForQueue(queueName);
        expect(schema).toBeDefined();
        expect(typeof schema.parse).toBe('function');
      }
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Dead-Letter Queue & Secret Sanitization
  // ----------------------------------------------------------------------------
  describe('DeadLetterQueueService Sanitization & Secret Scrubbing', () => {
    let mockRedis: any;
    let dlqService: DeadLetterQueueService;

    beforeEach(() => {
      mockRedis = {
        hset: jest.fn().mockResolvedValue(1),
        zadd: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
        zcard: jest.fn().mockResolvedValue(3),
        zrevrange: jest.fn().mockResolvedValue(['dlq-1']),
        hmget: jest.fn().mockResolvedValue([
          JSON.stringify({
            dlqId: 'dlq-1',
            queueName: 'sms-queue',
            jobId: 'job-1',
            failureCategory: 'PROVIDER_OUTAGE',
            sanitizedPayload: { toPhone: '+919876543210', otpCode: '[REDACTED_SECRET]' },
            failedAt: new Date().toISOString(),
          }),
        ]),
      };
      dlqService = new DeadLetterQueueService(mockRedis);
    });

    it('should sanitize sensitive credentials, OTPs, and tokens in payload', async () => {
      const sensitiveJob: JobContract<any> = {
        jobName: 'send-otp-sms',
        schemaVersion: 1,
        jobId: 'job-sensitive-001',
        payload: {
          toPhone: '+919876543210',
          otpCode: '984321', // Sensitive!
          secret: 'super-secret-key', // Sensitive!
          password: 'plain_password', // Sensitive!
          token: 'eyJhbGciOi...', // Sensitive!
          nonSensitiveInfo: 'Informational message text',
        },
        createdAt: new Date().toISOString(),
        attemptCount: 3,
        priority: JobPriority.CRITICAL,
        idempotencyKey: 'sms:otp:123',
      };

      const dlqRecord = await dlqService.recordFailure(
        QueueName.SMS,
        sensitiveJob,
        new Error('Third-party SMS provider 503 gateway failure'),
        'PROVIDER_OUTAGE',
      );

      expect(dlqRecord.failureCategory).toBe('PROVIDER_OUTAGE');
      expect(dlqRecord.sanitizedPayload.otpCode).toBe('[REDACTED_SECRET]');
      expect(dlqRecord.sanitizedPayload.secret).toBe('[REDACTED_SECRET]');
      expect(dlqRecord.sanitizedPayload.password).toBe('[REDACTED_SECRET]');
      expect(dlqRecord.sanitizedPayload.token).toBe('[REDACTED_SECRET]');
      expect(dlqRecord.sanitizedPayload.nonSensitiveInfo).toBe('Informational message text');
      expect(mockRedis.hset).toHaveBeenCalled();
      expect(mockRedis.zadd).toHaveBeenCalled();
    });

    it('should report queue DLQ counts and fetch records', async () => {
      const count = await dlqService.getCount();
      expect(count).toBe(3);

      const records = await dlqService.listRecords(0, 10);
      expect(records.length).toBe(1);
      expect(records[0]?.sanitizedPayload?.otpCode).toBe('[REDACTED_SECRET]');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. BaseJobHandler Idempotency & Error Routing
  // ----------------------------------------------------------------------------
  describe('BaseJobHandler Idempotency & Error Taxonomy', () => {
    class TestConcreteHandler extends BaseJobHandler<{ target: string; retentionDays: number; batchSize: number }> {
      readonly queueName = QueueName.CLEANUP;
      readonly defaultTimeoutMs = 5000;
      processCount = 0;

      protected async process(): Promise<void> {
        this.processCount += 1;
      }
    }

    let mockRedis: any;
    let mockDlqService: any;
    let handler: TestConcreteHandler;

    beforeEach(() => {
      mockRedis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
      };
      mockDlqService = {
        recordFailure: jest.fn().mockResolvedValue({}),
      };
      handler = new TestConcreteHandler(mockRedis, mockDlqService);
    });

    it('should acquire 24h idempotency lock and process job successfully', async () => {
      mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce('OK');

      const jobData: JobContract<any> = {
        jobName: 'test-job',
        schemaVersion: 1,
        jobId: '550e8400-e29b-41d4-a716-446655440001',
        payload: {
          target: 'EXPIRED_NOTIFICATIONS',
          retentionDays: 30,
          batchSize: 100,
        },
        createdAt: new Date().toISOString(),
        attemptCount: 0,
        priority: JobPriority.NORMAL,
        idempotencyKey: 'cleanup:notif:001',
      };

      await handler.execute(jobData as any);
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
      expect(mockRedis.set).toHaveBeenNthCalledWith(
        1,
        'local_saathi:v1:worker:idempotency:cleanup-queue:cleanup:notif:001',
        'IN_PROGRESS',
        'EX',
        300,
        'NX',
      );
      expect(mockRedis.set).toHaveBeenNthCalledWith(
        2,
        'local_saathi:v1:worker:idempotency:cleanup-queue:cleanup:notif:001',
        'COMPLETED',
        'EX',
        86400,
      );
      expect(handler.processCount).toBe(1);
    });

    it('should idempotently skip execution if job is already COMPLETED in Redis', async () => {
      mockRedis.set.mockResolvedValueOnce(null);
      mockRedis.get.mockResolvedValueOnce('COMPLETED');

      const jobData: JobContract<any> = {
        jobName: 'test-job',
        schemaVersion: 1,
        jobId: '550e8400-e29b-41d4-a716-446655440001',
        payload: {
          target: 'EXPIRED_NOTIFICATIONS',
          retentionDays: 30,
          batchSize: 100,
        },
        createdAt: new Date().toISOString(),
        attemptCount: 1,
        priority: JobPriority.NORMAL,
        idempotencyKey: 'cleanup:notif:001',
      };

      await handler.execute(jobData as any);
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
      expect(handler.processCount).toBe(0);
    });

    it('should throw UnrecoverableError and route to DLQ on schema validation error', async () => {
      const invalidJobData: JobContract<any> = {
        jobName: 'test-invalid',
        schemaVersion: 1,
        jobId: '550e8400-e29b-41d4-a716-446655440001',
        payload: {
          target: 'INVALID_TARGET_TYPE', // Invalid enum
        },
        createdAt: new Date().toISOString(),
        attemptCount: 0,
        priority: JobPriority.NORMAL,
        idempotencyKey: 'cleanup:bad:001',
      };

      await expect(handler.execute(invalidJobData as any)).rejects.toThrow(UnrecoverableError);
      expect(mockDlqService.recordFailure).toHaveBeenCalledWith(
        QueueName.CLEANUP,
        expect.any(Object),
        expect.any(Error),
        'VALIDATION_FAILED',
      );
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Distributed Scheduler (Mutex Lock Coordination)
  // ----------------------------------------------------------------------------
  describe('ScheduledJobsManager Distributed Mutex', () => {
    let mockRedis: any;
    let mockQueue: any;
    let scheduler: ScheduledJobsManager;

    beforeEach(() => {
      mockRedis = {
        set: jest.fn().mockResolvedValue('OK'),
      };
      mockQueue = {
        add: jest.fn().mockResolvedValue({ id: 'job-reconcile' }),
      };
      const queuesMap = new Map();
      queuesMap.set(QueueName.PAYMENT_RECONCILIATION, mockQueue);
      scheduler = new ScheduledJobsManager(mockRedis, queuesMap);
    });

    afterEach(() => {
      scheduler.stop();
    });

    it('should acquire distributed lock and enqueue cron task', async () => {
      (scheduler as any).isRunning = true;
      const testTask = {
        name: 'payment.scheduled_audit',
        queueName: QueueName.PAYMENT_RECONCILIATION,
        intervalMs: 900000,
        lockLeaseMs: 600000,
        payloadGenerator: () => ({ mode: 'SCHEDULED_AUDIT' }),
      };

      await (scheduler as any).attemptTaskDispatch(testTask);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'local_saathi:v1:scheduler:lock:payment.scheduled_audit',
        'LOCKED',
        'PX',
        600000,
        'NX',
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'payment.scheduled_audit',
        expect.objectContaining({
          jobName: 'payment.scheduled_audit',
          priority: JobPriority.LOW,
        }),
        expect.any(Object),
      );
    });

    it('should yield and not enqueue when another worker instance holds mutex lease', async () => {
      (scheduler as any).isRunning = true;
      mockRedis.set.mockResolvedValueOnce(null); // Mutex lock held elsewhere

      const testTask = {
        name: 'payment.scheduled_audit',
        queueName: QueueName.PAYMENT_RECONCILIATION,
        intervalMs: 900000,
        lockLeaseMs: 600000,
        payloadGenerator: () => ({ mode: 'SCHEDULED_AUDIT' }),
      };

      await (scheduler as any).attemptTaskDispatch(testTask);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------------------
  // 5. WorkerBootstrap Lifecycle & Status
  // ----------------------------------------------------------------------------
  describe('WorkerBootstrap Lifecycle', () => {
    it('should report correct initial stopped status', () => {
      const bootstrap = new WorkerBootstrap();
      expect(bootstrap.getStatus().isRunning).toBe(false);
    });
  });
});
