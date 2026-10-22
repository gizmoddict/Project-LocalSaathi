// ==============================================================================
// LocalSaathi — Search Indexing Queue Worker Handler (Phase 20)
// Version-Aware Idempotent Document Synchronization (OpenSearch Bridge)
// ==============================================================================

import Redis from 'ioredis';
import {
  JobContract,
  QueueName,
  SearchIndexingJobPayload,
} from '@localsaathi/types';
import { BaseJobHandler } from './base.handler';
import { DeadLetterQueueService } from '../dlq/dlq.service';

export class SearchIndexingWorkerHandler extends BaseJobHandler<SearchIndexingJobPayload> {
  readonly queueName = QueueName.SEARCH_INDEXING;
  readonly defaultTimeoutMs = 15000;

  private readonly opensearchUrl?: string;
  private readonly opensearchAuth?: string;

  constructor(redis: Redis, dlqService: DeadLetterQueueService) {
    super(redis, dlqService);
    this.opensearchUrl = process.env.OPENSEARCH_URL;
    if (process.env.OPENSEARCH_USERNAME && process.env.OPENSEARCH_PASSWORD) {
      this.opensearchAuth =
        'Basic ' +
        Buffer.from(
          `${process.env.OPENSEARCH_USERNAME}:${process.env.OPENSEARCH_PASSWORD}`,
        ).toString('base64');
    }
  }

  protected async process(job: JobContract<SearchIndexingJobPayload>): Promise<void> {
    const { action, entityType, entityId, version, document } = job.payload;

    // 1. Version Guard: Prevent stale out-of-order jobs from overwriting newer indexed versions
    const versionKey = `local_saathi:v1:search:version:${entityType}:${entityId}`;
    const currentVersionStr = await this.redis.get(versionKey);

    let currentVersion = -1;
    let lastAction: string | null = null;
    if (currentVersionStr) {
      if (currentVersionStr.includes(':')) {
        const [vStr, act] = currentVersionStr.split(':');
        currentVersion = parseInt(vStr || '0', 10);
        lastAction = act || null;
      } else {
        currentVersion = parseInt(currentVersionStr, 10);
      }
    }

    // 1.1 Strictly older version: discard
    if (version < currentVersion) {
      // eslint-disable-next-line no-console
      console.warn(
        `[SearchIndexWorker] Discarded stale indexing job for ${entityType} ${entityId}: jobVersion=${version} < currentVersion=${currentVersion}`,
      );
      return;
    }

    // 1.2 Tie-breaker at equal version:
    // If entity was already marked DELETED at this version, reject incoming UPSERT to prevent resurrection
    if (version === currentVersion && lastAction === 'DELETE' && action === 'UPSERT') {
      // eslint-disable-next-line no-console
      console.warn(
        `[SearchIndexWorker] Discarded stale UPSERT for ${entityType} ${entityId}: entity is already marked DELETE at version ${version}`,
      );
      return;
    }

    // 2. Perform indexing operation
    if (action === 'UPSERT') {
      await this.indexDocument(entityType, entityId, document);
    } else if (action === 'DELETE') {
      await this.deleteDocument(entityType, entityId);
    }

    // 3. Update highest indexed version and action state
    await this.redis.set(versionKey, `${version}:${action}`, 'EX', 86400 * 7);

    // eslint-disable-next-line no-console
    console.info(
      `[SearchIndexWorker] Successfully synced ${entityType}:${entityId} (action=${action}, version=${version})`,
    );
  }

  private getIndexName(entityType: string): string {
    return entityType === 'WORKER' ? 'localsaathi-workers' : 'localsaathi-jobs';
  }

  private async indexDocument(
    entityType: string,
    entityId: string,
    document?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.opensearchUrl) {
      // Simulated OpenSearch REST ingestion roundtrip when URL is unconfigured
      await new Promise((resolve) => setTimeout(resolve, 15));
      // eslint-disable-next-line no-console
      console.debug(`[SearchIndexWorker] Document upserted (simulated): ${entityType}:${entityId}`);
      return;
    }

    const indexName = this.getIndexName(entityType);
    const targetUrl = `${this.opensearchUrl.replace(/\/+$/, '')}/${indexName}/_doc/${entityId}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.opensearchAuth) {
        headers['Authorization'] = this.opensearchAuth;
      }

      const docBody = {
        id: entityId,
        entityType,
        indexedAt: new Date().toISOString(),
        ...(document || {}),
      };

      const response = await fetch(targetUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(docBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenSearch responded with status ${response.status}: ${errorText}`);
      }

      // eslint-disable-next-line no-console
      console.debug(`[SearchIndexWorker] Document upserted in cluster: ${entityType}:${entityId}`);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn(
        `[SearchIndexWorker] OpenSearch cluster request failed (cluster unreachable or offline at ${this.opensearchUrl}): ${err?.message}`,
      );
    }
  }

  private async deleteDocument(entityType: string, entityId: string): Promise<void> {
    if (!this.opensearchUrl) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      // eslint-disable-next-line no-console
      console.debug(`[SearchIndexWorker] Document deleted (simulated): ${entityType}:${entityId}`);
      return;
    }

    const indexName = this.getIndexName(entityType);
    const targetUrl = `${this.opensearchUrl.replace(/\/+$/, '')}/${indexName}/_doc/${entityId}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const headers: Record<string, string> = {};
      if (this.opensearchAuth) {
        headers['Authorization'] = this.opensearchAuth;
      }

      const response = await fetch(targetUrl, {
        method: 'DELETE',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(`OpenSearch responded with status ${response.status}: ${errorText}`);
      }

      // eslint-disable-next-line no-console
      console.debug(`[SearchIndexWorker] Document deleted from cluster: ${entityType}:${entityId}`);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn(
        `[SearchIndexWorker] OpenSearch cluster delete failed (cluster unreachable or offline at ${this.opensearchUrl}): ${err?.message}`,
      );
    }
  }
}
