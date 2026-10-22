import { SearchIndexingWorkerHandler } from '../src/handlers/search-indexing.worker-handler';
import { JobContract, SearchIndexingJobPayload } from '@localsaathi/types';

describe('Search Indexing Worker Handler (Phase 28)', () => {
  let handler: SearchIndexingWorkerHandler;
  let redisMock: any;
  let dlqServiceMock: any;

  beforeEach(() => {
    const memoryStore = new Map<string, string>();
    redisMock = {
      get: jest.fn(async (key: string) => memoryStore.get(key) || null),
      set: jest.fn(async (key: string, value: string) => {
        memoryStore.set(key, value);
        return 'OK';
      }),
    };
    dlqServiceMock = {
      sendToDeadLetter: jest.fn(),
    };

    handler = new SearchIndexingWorkerHandler(redisMock, dlqServiceMock);
  });

  const createJob = (
    version: number,
    action: 'UPSERT' | 'DELETE' = 'UPSERT',
    entityId = 'job-uuid-1',
  ): JobContract<SearchIndexingJobPayload> => ({
    jobName: 'sync-search-index',
    schemaVersion: 1,
    jobId: 'job-execution-1',
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    priority: 1,
    idempotencyKey: `search:job:${entityId}:${version}`,
    payload: {
      action,
      entityType: 'JOB',
      entityId,
      version,
      document: {
        title: 'Senior Plumber Needed',
        category: 'Plumbing',
        wageAmount: 1200,
      },
    },
  });

  it('1. Version Guard - should process job when version is newer than current indexed version', async () => {
    const job = createJob(10);
    await (handler as any).process(job);

    expect(redisMock.get).toHaveBeenCalledWith('local_saathi:v1:search:version:JOB:job-uuid-1');
    expect(redisMock.set).toHaveBeenCalledWith(
      'local_saathi:v1:search:version:JOB:job-uuid-1',
      '10:UPSERT',
      'EX',
      86400 * 7,
    );
  });

  it('2. Out-of-Order Discard - should silently discard stale job when version < currentVersion', async () => {
    // Current version in Redis is 20:UPSERT
    redisMock.get.mockResolvedValue('20:UPSERT');

    // Stale job arrives with version 15
    const staleJob = createJob(15);
    await (handler as any).process(staleJob);

    // Redis version key must NOT be overwritten with an older version
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('3. Delete Action - should process DELETE action for cancelled or deleted jobs', async () => {
    const deleteJob = createJob(25, 'DELETE', 'job-to-delete');
    await (handler as any).process(deleteJob);

    expect(redisMock.set).toHaveBeenCalledWith(
      'local_saathi:v1:search:version:JOB:job-to-delete',
      '25:DELETE',
      'EX',
      86400 * 7,
    );
  });

  it('4. Offline Resilience - handles unreachable OpenSearch cluster without unhandled crash', async () => {
    const originalUrl = process.env.OPENSEARCH_URL;
    process.env.OPENSEARCH_URL = 'http://127.0.0.1:9999'; // Offline port
    try {
      const offlineHandler = new SearchIndexingWorkerHandler(redisMock, dlqServiceMock);
      const job = createJob(30);

      // Should complete process without throwing unhandled rejection
      await expect((offlineHandler as any).process(job)).resolves.not.toThrow();
    } finally {
      process.env.OPENSEARCH_URL = originalUrl;
    }
  });

  it('5. Worker Entity Routing - maps WORKER entityType to localsaathi-workers index', () => {
    const workerIndex = (handler as any).getIndexName('WORKER');
    const jobIndex = (handler as any).getIndexName('JOB');

    expect(workerIndex).toBe('localsaathi-workers');
    expect(jobIndex).toBe('localsaathi-jobs');
  });

  it('6. Delete vs Update Ordering - rejects out-of-order UPSERT when entity is already marked DELETE at equal version', async () => {
    // Entity was already deleted at version 50
    redisMock.get.mockResolvedValue('50:DELETE');

    // Out-of-order UPSERT arrives with equal version 50
    const upsertJob = createJob(50, 'UPSERT');
    await (handler as any).process(upsertJob);

    // UPSERT must be discarded and must NOT overwrite the DELETE key
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('7. Delete vs Update Ordering - allows DELETE to supersede UPSERT when versions are equal', async () => {
    // Current entity is UPSERT at version 50
    redisMock.get.mockResolvedValue('50:UPSERT');

    // DELETE arrives with equal version 50
    const deleteJob = createJob(50, 'DELETE');
    await (handler as any).process(deleteJob);

    // DELETE must supersede UPSERT
    expect(redisMock.set).toHaveBeenCalledWith(
      'local_saathi:v1:search:version:JOB:job-uuid-1',
      '50:DELETE',
      'EX',
      86400 * 7,
    );
  });

  it('8. Idempotent Retries - allows exact job retries with equal version to execute idempotently', async () => {
    // Current state is 60:UPSERT
    redisMock.get.mockResolvedValue('60:UPSERT');

    // Retry of the same job arrives
    const retryJob = createJob(60, 'UPSERT');
    await (handler as any).process(retryJob);

    // Allowed to update/refresh key
    expect(redisMock.set).toHaveBeenCalledWith(
      'local_saathi:v1:search:version:JOB:job-uuid-1',
      '60:UPSERT',
      'EX',
      86400 * 7,
    );
  });
});
