// ==============================================================================
// LocalSaathi — Distributed Scheduled Jobs Manager (Phase 20)
// Prevents Multi-Instance Cron Duplication via Redis Distributed Mutex Locks
// ==============================================================================

import Redis from 'ioredis';
import { Queue } from 'bullmq';
import {
  JobPriority,
  QueueName,
} from '@localsaathi/types';

export interface ScheduledTaskDefinition {
  name: string;
  queueName: QueueName;
  intervalMs: number;
  lockLeaseMs: number;
  payloadGenerator: () => Record<string, unknown>;
}

export class ScheduledJobsManager {
  private timers: NodeJS.Timeout[] = [];
  private initialTimeouts: NodeJS.Timeout[] = [];
  private isRunning = false;

  constructor(
    private readonly redis: Redis,
    private readonly queues: Map<QueueName, Queue>,
  ) {}

  /**
   * Defines recurring background tasks.
   */
  private getTaskDefinitions(): ScheduledTaskDefinition[] {
    return [
      {
        name: 'payment.scheduled_audit',
        queueName: QueueName.PAYMENT_RECONCILIATION,
        intervalMs: 15 * 60 * 1000, // Every 15 minutes
        lockLeaseMs: 10 * 60 * 1000,
        payloadGenerator: () => ({
          mode: 'SCHEDULED_AUDIT',
          initiatedBy: 'SYSTEM_SCHEDULER',
        }),
      },
      {
        name: 'cleanup.expired_notifications',
        queueName: QueueName.CLEANUP,
        intervalMs: 60 * 60 * 1000, // Every 1 hour
        lockLeaseMs: 30 * 60 * 1000,
        payloadGenerator: () => ({
          target: 'EXPIRED_NOTIFICATIONS',
          retentionDays: 30,
          batchSize: 500,
        }),
      },
      {
        name: 'cleanup.analytics_retention',
        queueName: QueueName.CLEANUP,
        intervalMs: 24 * 60 * 60 * 1000, // Every 24 hours
        lockLeaseMs: 12 * 60 * 60 * 1000,
        payloadGenerator: () => ({
          target: 'ANALYTICS_RETENTION',
          retentionDays: 90,
          batchSize: 1000,
        }),
      },
      {
        name: 'cleanup.dlq_pruning',
        queueName: QueueName.CLEANUP,
        intervalMs: 6 * 60 * 60 * 1000, // Every 6 hours
        lockLeaseMs: 3 * 60 * 60 * 1000,
        payloadGenerator: () => ({
          target: 'DLQ_PRUNING',
          retentionDays: 14,
          batchSize: 500,
        }),
      },
      {
        name: 'cleanup.stale_sessions',
        queueName: QueueName.CLEANUP,
        intervalMs: 2 * 60 * 60 * 1000, // Every 2 hours
        lockLeaseMs: 60 * 60 * 1000,
        payloadGenerator: () => ({
          target: 'STALE_SESSIONS',
          retentionDays: 7,
          batchSize: 500,
        }),
      },
    ];
  }

  /**
   * Starts the distributed scheduler polling loop.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const tasks = this.getTaskDefinitions();
    // eslint-disable-next-line no-console
    console.info(`[ScheduledJobsManager] Initializing ${tasks.length} distributed recurring tasks...`);

    for (const task of tasks) {
      // Run initial tick check with a short stagger
      const timeout = setTimeout(() => this.attemptTaskDispatch(task), 5000);
      timeout.unref();
      this.initialTimeouts.push(timeout);

      // Setup recurring timer
      const timer = setInterval(() => {
        this.attemptTaskDispatch(task).catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[ScheduledJobsManager] Error in task ${task.name}:`, err);
        });
      }, task.intervalMs);
      timer.unref();

      this.timers.push(timer);
    }
  }

  /**
   * Uses Redis distributed lock (SET NX PX) to guarantee that across N worker instances,
   * only ONE instance dispatches the scheduled job for a given window.
   */
  private async attemptTaskDispatch(task: ScheduledTaskDefinition): Promise<void> {
    if (!this.isRunning) return;

    const lockKey = `local_saathi:v1:scheduler:lock:${task.name}`;
    const acquired = await this.redis.set(lockKey, 'LOCKED', 'PX', task.lockLeaseMs, 'NX');

    if (!acquired) {
      // Another instance already scheduled or is executing this window
      return;
    }

    const queue = this.queues.get(task.queueName);
    if (!queue) {
      // eslint-disable-next-line no-console
      console.warn(`[ScheduledJobsManager] Queue ${task.queueName} not found for task ${task.name}`);
      return;
    }

    const jobId = `sched-${task.name}-${Date.now()}`;
    const payload = task.payloadGenerator();

    const jobContract = {
      jobName: task.name,
      schemaVersion: 1,
      jobId,
      payload,
      createdAt: new Date().toISOString(),
      attemptCount: 0,
      priority: JobPriority.LOW,
      idempotencyKey: `sched-idem-${task.name}-${Math.floor(Date.now() / task.intervalMs)}`,
    };

    await queue.add(task.name, jobContract, {
      jobId,
      removeOnComplete: true,
      removeOnFail: false,
    });

    // eslint-disable-next-line no-console
    console.info(
      `[ScheduledJobsManager] Dispatched distributed scheduled task: ${task.name} to ${task.queueName}`,
    );
  }

  /**
   * Cleanly cancels all scheduling timers on shutdown.
   */
  stop(): void {
    this.isRunning = false;
    for (const timeout of this.initialTimeouts) {
      clearTimeout(timeout);
    }
    this.initialTimeouts = [];
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    // eslint-disable-next-line no-console
    console.info('[ScheduledJobsManager] Distributed scheduler stopped.');
  }
}
