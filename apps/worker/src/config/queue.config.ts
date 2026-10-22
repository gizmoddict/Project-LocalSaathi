// ==============================================================================
// LocalSaathi — Background Queue Configuration & Concurrency Policy (Phase 20)
// Defines Intentional Concurrency, Backoff, Timeout, and Priority for All Queues
// ==============================================================================

import { QueueName, JobPriority, QueueConfigPolicy } from '@localsaathi/types';

export const QUEUE_CONFIG_POLICIES: Record<QueueName, QueueConfigPolicy> = {
  [QueueName.NOTIFICATIONS]: {
    queueName: QueueName.NOTIFICATIONS,
    concurrency: 10,
    defaultPriority: JobPriority.HIGH,
    maxRetries: 5,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    timeoutMs: 15000,
  },
  [QueueName.SMS]: {
    queueName: QueueName.SMS,
    concurrency: 5,
    defaultPriority: JobPriority.HIGH,
    maxRetries: 3,
    initialBackoffMs: 2000,
    maxBackoffMs: 60000,
    timeoutMs: 10000,
    rateLimit: {
      max: 20,
      durationMs: 1000, // 20 SMS per second maximum downstream limit
    },
  },
  [QueueName.EMAIL]: {
    queueName: QueueName.EMAIL,
    concurrency: 5,
    defaultPriority: JobPriority.NORMAL,
    maxRetries: 4,
    initialBackoffMs: 2000,
    maxBackoffMs: 60000,
    timeoutMs: 20000,
  },
  [QueueName.TRANSLATION]: {
    queueName: QueueName.TRANSLATION,
    concurrency: 3,
    defaultPriority: JobPriority.LOW,
    maxRetries: 3,
    initialBackoffMs: 3000,
    maxBackoffMs: 30000,
    timeoutMs: 20000,
  },
  [QueueName.VOICE_PROCESSING]: {
    queueName: QueueName.VOICE_PROCESSING,
    concurrency: 2,
    defaultPriority: JobPriority.LOW,
    maxRetries: 3,
    initialBackoffMs: 5000,
    maxBackoffMs: 60000,
    timeoutMs: 60000,
  },
  [QueueName.EMBEDDING_GENERATION]: {
    queueName: QueueName.EMBEDDING_GENERATION,
    concurrency: 2,
    defaultPriority: JobPriority.LOW,
    maxRetries: 3,
    initialBackoffMs: 3000,
    maxBackoffMs: 30000,
    timeoutMs: 30000,
  },
  [QueueName.SEARCH_INDEXING]: {
    queueName: QueueName.SEARCH_INDEXING,
    concurrency: 5,
    defaultPriority: JobPriority.NORMAL,
    maxRetries: 4,
    initialBackoffMs: 2000,
    maxBackoffMs: 30000,
    timeoutMs: 15000,
  },
  [QueueName.RECOMMENDATIONS]: {
    queueName: QueueName.RECOMMENDATIONS,
    concurrency: 3,
    defaultPriority: JobPriority.LOW,
    maxRetries: 2,
    initialBackoffMs: 2000,
    maxBackoffMs: 15000,
    timeoutMs: 20000,
  },
  [QueueName.ANALYTICS]: {
    queueName: QueueName.ANALYTICS,
    concurrency: 20,
    defaultPriority: JobPriority.LOW,
    maxRetries: 5,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    timeoutMs: 10000,
  },
  [QueueName.IMAGE_PROCESSING]: {
    queueName: QueueName.IMAGE_PROCESSING,
    concurrency: 3, // CPU-bound thumbnailing & WebP transcoding
    defaultPriority: JobPriority.LOW,
    maxRetries: 3,
    initialBackoffMs: 3000,
    maxBackoffMs: 30000,
    timeoutMs: 30000,
  },
  [QueueName.PAYMENT_RECONCILIATION]: {
    queueName: QueueName.PAYMENT_RECONCILIATION,
    concurrency: 2, // Strict external provider rate limit & transactional consistency
    defaultPriority: JobPriority.CRITICAL,
    maxRetries: 5,
    initialBackoffMs: 5000,
    maxBackoffMs: 120000,
    timeoutMs: 45000,
  },
  [QueueName.CLEANUP]: {
    queueName: QueueName.CLEANUP,
    concurrency: 1, // Serialized maintenance to prevent lock contention
    defaultPriority: JobPriority.LOW,
    maxRetries: 2,
    initialBackoffMs: 10000,
    maxBackoffMs: 60000,
    timeoutMs: 120000,
  },
};
