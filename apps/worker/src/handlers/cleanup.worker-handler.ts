// ==============================================================================
// LocalSaathi — Cleanup Queue Worker Handler (Phase 20)
// Safe, Bounded Periodic Data Pruning with Retention Compliance & Zero Financial Impact
// ==============================================================================

import Redis from 'ioredis';
import { PrismaClient } from '@localsaathi/database';
import {
  CleanupJobPayload,
  JobContract,
  QueueName,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class CleanupWorkerHandler extends BaseJobHandler<CleanupJobPayload> {
  readonly queueName = QueueName.CLEANUP;
  readonly defaultTimeoutMs = 120000;

  constructor(
    redis: Redis,
    dlqService: DeadLetterQueueService,
    private readonly prisma: PrismaClient,
  ) {
    super(redis, dlqService);
  }

  protected async process(job: JobContract<CleanupJobPayload>): Promise<void> {
    const { target, retentionDays, batchSize } = job.payload;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // eslint-disable-next-line no-console
    console.info(
      `[CleanupWorker] Executing bounded cleanup for target=${target} (cutoff=${cutoffDate.toISOString()}, batchLimit=${batchSize})...`,
    );

    let prunedCount = 0;

    switch (target) {
      case 'EXPIRED_NOTIFICATIONS': {
        // Prune only read notifications older than cutoff, bounded by batchSize
        const expired = await this.prisma.notification.findMany({
          where: {
            isRead: true,
            createdAt: { lt: cutoffDate },
          },
          select: { id: true },
          take: batchSize,
        });

        if (expired.length > 0) {
          const ids = expired.map((n) => n.id);
          const delRes = await this.prisma.notification.deleteMany({
            where: { id: { in: ids } },
          });
          prunedCount = delRes.count;
        }
        break;
      }

      case 'ANALYTICS_RETENTION': {
        // Prune raw analytics events older than retention window
        const oldEvents = await this.prisma.analyticsEvent.findMany({
          where: { occurredAt: { lt: cutoffDate } },
          select: { id: true },
          take: batchSize,
        });

        if (oldEvents.length > 0) {
          const ids = oldEvents.map((e) => e.id);
          const delRes = await this.prisma.analyticsEvent.deleteMany({
            where: { id: { in: ids } },
          });
          prunedCount = delRes.count;
        }
        break;
      }

      case 'STALE_SESSIONS': {
        // Prune expired sessions
        const expiredSessions = await this.prisma.session.findMany({
          where: { expiresAt: { lt: new Date() } },
          select: { id: true },
          take: batchSize,
        });

        if (expiredSessions.length > 0) {
          const ids = expiredSessions.map((s: { id: string }) => s.id);
          const delRes = await this.prisma.session.deleteMany({
            where: { id: { in: ids } },
          });
          prunedCount = delRes.count;
        }
        break;
      }

      case 'DLQ_PRUNING': {
        // Prune Redis Dead Letter Queue records older than retention
        prunedCount = await this.dlqService.pruneOlderThan(retentionDays);
        break;
      }

      default:
        // eslint-disable-next-line no-console
        console.warn(`[CleanupWorker] Unknown cleanup target: ${target}`);
        return;
    }

    // eslint-disable-next-line no-console
    console.info(
      `[CleanupWorker] Successfully pruned ${prunedCount} record(s) for target=${target}`,
    );
  }
}
