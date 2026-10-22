# LocalSaathi — Cache Key Reference & Catalogue

**Phase:** Phase 19 — Distributed Redis Caching Platform  
**Root Namespace:** `local_saathi`  
**Schema Version:** `v1`  
**Key Structure:** `local_saathi:v1:{namespace}:{entity_type}:{identifier}:{normalized_parameters}`  

---

## Complete Cache Catalogue

### 1. Skill Catalog Metadata
- **Object:** Active Platform Skill Catalog List
- **Cache Key Pattern:** `local_saathi:v1:skills:catalog:{category}:{queryHash}`
  - Example: `local_saathi:v1:skills:catalog:electrical:none`
  - Example: `local_saathi:v1:skills:catalog:all:9a2b8f10c3d4`
- **TTL:** 86,400 Seconds (24 Hours)
- **Consistency:** Eventually Consistent
- **Invalidation Trigger:** Admin mutations: `SKILL_CREATED`, `SKILL_UPDATED`, `SKILL_DELETED`
- **Maximum Size:** 32 KB (up to 100 skill items)
- **Security Classification:** `CACHEABLE` (Public reference data; zero PII)
- **Fallback Behavior:** Transparent query against `prisma.skill.findMany({ where: { isActive: true } })`

---

### 2. Public Employer Information
- **Object:** Public Employer Profile Projection
- **Cache Key Pattern:** `local_saathi:v1:employer:public:{employerId}`
  - Example: `local_saathi:v1:employer:public:48b30bf2-2736-4188-b226-e1372b7a9504`
- **TTL:** 3,600 Seconds (1 Hour)
- **Consistency:** Eventually Consistent
- **Invalidation Trigger:** Employer profile mutation: `EMPLOYER_UPDATED`, `EMPLOYER_VERIFIED`
- **Maximum Size:** 2 KB
- **Security Classification:** `CACHEABLE` (Excludes private phone, address, KYC docs, and bank details)
- **Fallback Behavior:** Query against `prisma.employerProfile.findUnique({ where: { id: employerId } })`

---

### 3. Public Job Post Detail
- **Object:** Public Published Job Details Projection with Requirements & Location
- **Cache Key Pattern:** `local_saathi:v1:jobs:detail:{jobId}`
  - Example: `local_saathi:v1:jobs:detail:133f0ff0-809f-4cb2-a8de-35d4aa0cef47`
- **TTL:** 900 Seconds (15 Minutes)
- **Consistency:** Eventually Consistent (with immediate write-invalidation)
- **Invalidation Trigger:** Job transitions: `JOB_UPDATED`, `JOB_PUBLISHED`, `JOB_PAUSED`, `JOB_RESUMED`, `JOB_FILLED`, `JOB_CANCELLED`
- **Maximum Size:** 8 KB
- **Security Classification:** `CONDITIONALLY_CACHEABLE` (Only `PUBLISHED` jobs; worker-specific match score & distance are dynamically computed in memory)
- **Fallback Behavior:** Relational join against `prisma.jobPost.findUnique` with `jobLocation`, `jobRequiredSkills`, `employerProfile`

---

### 4. Hyperlocal Job Spatial Candidate IDs
- **Object:** Candidate Job Post UUID Array for a Geohash Grid Cell
- **Cache Key Pattern:** `local_saathi:v1:jobs:geo:{geohash}:{radiusKm}:{filterHash}`
  - Example: `local_saathi:v1:jobs:geo:tuc8d:15:default`
- **TTL:** 120 Seconds (2 Minutes)
- **Consistency:** Eventually Consistent
- **Invalidation Trigger:** Any job status transition in the locality or automatic TTL expiry
- **Maximum Size:** 16 KB (Array of UUID strings up to 200 items)
- **Security Classification:** `CONDITIONALLY_CACHEABLE` (Only candidate IDs; zero worker PII or final auth decisions)
- **Fallback Behavior:** PostGIS `ST_DWithin` spatial query over `job_locations`

---

### 5. Admin Dashboard Overview Metrics Rollup
- **Object:** Platform High-Level Operational KPI Counter Aggregate
- **Cache Key Pattern:** `local_saathi:v1:admin:metrics:overview`
- **TTL:** 30 Seconds
- **Consistency:** Eventually Consistent
- **Invalidation Trigger:** Outbox event triggers or 30-second TTL expiry
- **Maximum Size:** 4 KB
- **Security Classification:** `CONDITIONALLY_CACHEABLE` (Aggregated summary metrics only; never authoritative for financial reconciliation)
- **Fallback Behavior:** Native PostgreSQL aggregate query execution

---

## Prohibited Cache Matrix (DO NOT CACHE)

| Domain Object | Prohibited Key | Reason for Prohibition | Authoritative Source |
|:---|:---|:---|:---|
| **Payment Orders & Transactions** | `local_saathi:v1:payments:*` | Financial source of truth; stale cache risks duplicate charges or incorrect escrow. | PostgreSQL ACID + Razorpay Webhook Signatures |
| **Booking Contracts & State** | `local_saathi:v1:bookings:*` | Multi-party contract state machine; requires row-level PostgreSQL locks. | PostgreSQL ACID Transactions |
| **User Suspensions & Bans** | `local_saathi:v1:users:suspended:*` | Stale suspension cache could allow banned actors to access platform. | PostgreSQL `users.status` + JWT Revocation |
| **Session Revocation Tokens** | `local_saathi:v1:sessions:revoked:*` | Immediate session invalidation required for credential theft protection. | PostgreSQL `sessions.revoked_at` |
| **Private Chat Messages** | `local_saathi:v1:messages:*` | Direct user messages are confidential; served via cursor-paginated DB queries. | PostgreSQL `messages` Table |
| **KYC / Verification Documents** | `local_saathi:v1:documents:*` | Identity documents require ephemeral presigned URLs and owner-only access. | PostgreSQL + MinIO/S3 Signed URLs |
