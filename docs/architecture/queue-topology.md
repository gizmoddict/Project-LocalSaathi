# LocalSaathi Queue Topology & Resource Governance

## 1. Unified Queue Matrix (12 Isolated Queues)

LocalSaathi segregates asynchronous workloads into 12 dedicated BullMQ queues to prevent noisy-neighbor starvation. High-frequency network I/O operations (such as notifications) are isolated from computationally heavy workloads (such as image thumbnail generation, speech recognition, and vector embeddings).

| Queue Name | Primary Purpose | Concurrency | Priority | Max Retries | Backoff Strategy | Rate Limit | Timeout |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `notifications-queue` | In-app notification creation & WebSocket push bridge | 10 | HIGH (2) | 3 | Exponential (1s) | 100/sec | 15s |
| `sms-queue` | OTP and critical SMS dispatch via telecom gateway | 5 | CRITICAL (1) | 3 | Exponential (2s) | 20/sec | 10s |
| `email-queue` | Transactional receipts, contracts, dispute updates | 5 | NORMAL (5) | 4 | Exponential (2s) | 15/sec | 20s |
| `translation-queue` | Multilingual profile & job posting localization | 4 | NORMAL (5) | 3 | Exponential (3s) | 10/sec | 30s |
| `voice-processing-queue` | Audio transcribing & intent extraction (Whisper/Speech API) | 2 | NORMAL (5) | 2 | Exponential (5s) | 5/sec | 60s |
| `embedding-generation-queue` | Vector generation for semantic job/worker matching | 3 | LOW (10) | 3 | Exponential (3s) | 10/sec | 45s |
| `search-indexing-queue` | Elastic/OpenSearch document index & deletion sync | 6 | HIGH (2) | 5 | Exponential (1s) | 50/sec | 15s |
| `recommendations-queue` | Geospatial worker-job recommendation candidate ranking | 4 | LOW (10) | 2 | Fixed (5s) | 10/sec | 30s |
| `analytics-queue` | Asynchronous batch ingestion into analytics datastore | 8 | LOW (10) | 5 | Exponential (2s) | 200/sec | 20s |
| `image-processing-queue` | Antivirus inspection, WebP compression, thumbnail resizing | 3 | NORMAL (5) | 2 | Fixed (5s) | 5/sec | 45s |
| `payment-reconciliation-queue` | Double-entry financial audit between PG & Razorpay events | 2 | HIGH (2) | 3 | Exponential (5s) | 5/sec | 60s |
| `cleanup-queue` | Bounded data pruning (expired sessions, analytics, DLQ) | 1 | LOW (10) | 2 | Fixed (10s) | 2/sec | 120s |

---

## 2. Resource Allocation & Isolation Rationales

### 2.1 CPU & Memory-Bound Tasks
- **`image-processing-queue` (Concurrency: 3)**:
  Image decoding, buffer allocation, and sharp/canvas transformations consume substantial CPU and RAM. Limiting concurrency to 3 ensures a sudden wave of user avatar uploads does not cause Out-Of-Memory (OOM) crashes or throttle transactional API threads.
- **`voice-processing-queue` (Concurrency: 2)**:
  Local Saathi supports voice search and regional dialect audio notes for informal blue-collar workers. Audio buffer streaming and speech model inference are memory and CPU intensive. Concurrency is strictly bounded to 2 per worker process.

### 2.2 Network I/O & External Provider Bounded Tasks
- **`sms-queue` (Rate Limit: 20/sec, Concurrency: 5)**:
  Telecom SMS aggregators (e.g., Twilio, Gupshup, Msg91) impose strict per-second account rate limits and penalize burst spikes. BullMQ rate-limiting enforces `max: 20, duration: 1000` to prevent provider-side HTTP 429 throttling.
- **`email-queue` (Rate Limit: 15/sec, Concurrency: 5)**:
  Transactional email providers enforce outbound send quotas. Rate limiting ensures steady, reputable IP deliverability.

### 2.3 Critical Business Consistency & High-Throughput Buffering
- **`notifications-queue` (Concurrency: 10)**:
  Hyperlocal job applications, shortlist decisions, and booking requests require fast delivery (<500ms) to maintain high user engagement. High concurrency and low backoff ensure rapid queue draining.
- **`search-indexing-queue` (Concurrency: 6)**:
  Ensures newly posted jobs in nearby wards are immediately discoverable on search feeds.
- **`payment-reconciliation-queue` (Concurrency: 2)**:
  Financial audits require deterministic, serial verification against ledger records. Low concurrency avoids locking contention on `payments` and `bookings` database rows.
- **`cleanup-queue` (Concurrency: 1)**:
  Data retention deletions (e.g. `DELETE ... WHERE expires_at < NOW() LIMIT 1000`) execute as singleton operations to minimize row-level lock escalation and avoid read degradation on live tables.

---

## 3. Queue Configuration Architecture

Each queue's operational parameters are defined in `apps/worker/src/config/queue.config.ts`:

```typescript
export interface QueueConfigPolicy {
  concurrency: number;
  priority: JobPriority;
  attempts: number;
  backoff: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  timeoutMs: number;
  rateLimit?: {
    max: number;
    durationMs: number;
  };
}
```

This separation allows DevOps and engineering to adjust concurrency and retry backoffs per queue environment without modifying handler business logic.
