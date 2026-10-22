# LocalSaathi — Distributed Redis Caching Strategy

**Phase:** Phase 19 — Distributed Redis Caching Platform  
**Status:** Approved & Implemented  
**Core Law:** The PostgreSQL database and domain services remain the durable, authoritative source of truth. Redis is strictly a non-authoritative performance cache and ephemeral message bus. Never allow cached values to become authoritative business state.

---

## 1. Architectural Principles

1. **Database as the Sole Source of Truth:**
   - Under no circumstances does Redis become the primary repository for business data, financial records, authentication tokens, or access control decisions.
   - Any write mutation is committed to PostgreSQL first. If Redis update or invalidation fails, the database remains correct.
2. **Graceful Degradation (Fail-Open / Non-Fatal):**
   - A Redis connection failure, outage, or timeout must NEVER bring down the LocalSaathi application or result in 500 Internal Server Errors on read paths.
   - All cache access is wrapped in try/catch blocks; upon any cache error, execution transparently falls back to PostgreSQL.
3. **Cache-Aside with Stampede Protection:**
   - Services look up values from Redis first.
   - On a cache miss, multiple concurrent requests for the same cold key must NOT hammer PostgreSQL simultaneously. Distributed mutex locking with bounded polling (`SET NX PX`) serializes data generation so only 1 query hits the database while concurrent requests await population.
4. **Post-Commit Invalidation via Transactional Outbox:**
   - Invalidation occurs strictly AFTER the PostgreSQL transaction is committed.
   - Cache purging is triggered both locally after mutations and asynchronously by the `CacheInvalidationHandler` via outbox events.
5. **No Secret or Sensitive Data Caching:**
   - Credentials, OTP hashes, JWT secrets, refresh tokens, private chat bodies, user KYC/Aadhaar/PAN documents, and signed URLs are strictly prohibited from Redis storage.

---

## 2. Cache-Aside Execution Lifecycle

```
Client HTTP Request
        │
        ▼
   Authorization / Security Guards (JWT, RBAC, Suspended User Check)
        │
        ▼
   Service.method()
        │
        ▼
   CacheService.wrap(key, fetchFn, options)
        │
        ├──► Step 1: Check Redis (GET key)
        │      ├── HIT: Return cached DTO (Sub-millisecond)
        │      └── MISS: Continue
        │
        ├──► Step 2: Redis Unavailable?
        │      └── YES: Fallback directly to fetchFn() (PostgreSQL)
        │
        ├──► Step 3: Intra-Process Deduplication (inFlightPromises)
        │      └── YES: Return active Promise
        │
        ├──► Step 4: Distributed Mutex Lock (SET key:lock NX PX 4000)
        │      ├── ACQUIRED:
        │      │     1. Execute fetchFn() against PostgreSQL
        │      │     2. Check payload size boundary (< 64 KB)
        │      │     3. Store in Redis with TTL (SET key value EX ttl)
        │      │     4. Release Lock via Lua script
        │      │     5. Return fresh DTO
        │      └── BUSY (Another worker holds lock):
        │            1. Poll Redis every 50ms (up to 800ms)
        │            2. If populated: Return newly cached DTO
        │            3. If timeout reached: Fallback to direct fetchFn()
```

---

## 3. Stampede Protection (Thundering Herd Defense)

When high-traffic entities (such as popular jobs or skill lists) expire or are invalidated, hundreds of concurrent mobile clients may request the same resource at the same instant.

### Dual-Layer Defense:
1. **Intra-Process Single-Flight:**
   - Maintains a concurrent `Map<string, Promise<T>>` in the Node.js process memory.
   - Multiple requests in the same event loop share the same pending execution promise without even issuing redundant Redis lock calls.
2. **Inter-Process Distributed Mutex:**
   - Utilizes `SET key:lock uuid PX 4000 NX`.
   - The winning process queries PostgreSQL, normalizes the DTO, sets the cache, and releases the lock via an atomic Lua script comparing the UUID.
   - Waiting workers poll at 50 ms intervals for up to 800 ms. If the cache is populated during this window, they return the cached value. If the lock holder fails or takes $>800\text{ ms}$, waiting workers fall back to direct PostgreSQL query execution to ensure request liveness.

---

## 4. Negative Caching Policy

Negative caching stores a lightweight sentinel (`__LOCALSAATHI_NIL__`) when an entity does not exist in the database.

- **Allowed For:** Nonexistent public skills (`skills:item:{id}`) or nonexistent public employer profiles (`employer:public:{id}`).
- **Prohibited For:** Authorization failures, suspended user lookups, or payment status. Negative caching an authorization decision could permanently lock out valid users or allow revoked sessions.
- **Negative TTL:** Bounded strictly to **30 Seconds** (`CACHE_CONSTANTS.TTL.NEGATIVE_CACHE`).

---

## 5. Redis Memory Safety & Eviction Strategy

1. **Dedicated Key Namespace:** All cache keys are prefixed with `local_saathi:v1:`. Rate-limiter keys (`ratelimit:`) and presence keys (`presence:`) operate in distinct namespaces.
2. **Mandatory TTL on All Keys:** No cache key is ever written with infinite TTL. Every key has an explicit, bounded expiration.
3. **Payload Size Boundaries:**
   - Maximum serialized payload: **64 KB** (`CACHE_CONSTANTS.LIMITS.MAX_PAYLOAD_BYTES`).
   - Maximum array items: **200 items** (`CACHE_CONSTANTS.LIMITS.MAX_ARRAY_ITEMS`).
   - If an entity exceeds 64 KB, the cache write is skipped, and the data is served directly from the database to prevent Redis buffer bloat.
4. **Recommended Redis Eviction Policy:** `volatile-lru` or `allkeys-lru`. If Redis reaches `maxmemory`, least recently used keys with TTLs are evicted without affecting critical Pub/Sub messaging.

---

## 6. Security Analysis & Invariants

1. **Authorization Precedence:** HTTP route guards (`JwtAuthGuard`, `RolesGuard`, `SuspendedUserGuard`) execute **before** any service or cache layer is accessed. A cached job detail response can NEVER be accessed by an unauthenticated or unauthorized user.
2. **Tenant & Data Isolation:** Cached DTOs contain **only public projections**.
   - Public Employer Cache contains: `businessName`, `businessType`, `locality`, `city`, `verificationState`, `totalJobsPosted`.
   - It strictly excludes: private phone numbers, home addresses, bank account details, and internal moderation reports.
3. **Cache Poisoning Prevention:**
   - All user-supplied query strings and search parameters are trimmed, lowercased, and hashed via SHA-256 (`hashFilterObject`) into a 12-character hexadecimal digest.
   - User input cannot inject arbitrary Redis commands, override delimiters, or trigger memory exhaustion via long strings.
