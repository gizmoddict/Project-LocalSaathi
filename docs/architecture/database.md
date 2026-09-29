# LocalSaathi Database Architecture & PostGIS Strategy

## 1. Overview

LocalSaathi employs **PostgreSQL 16+ with the PostGIS 3.4+ extension** as its primary transactional source of truth. The data layer is encapsulated within the `@localsaathi/database` package using **Prisma ORM**, providing typed database access, migration management, and native PostGIS spatial query capabilities across all application modules.

```
                      PostgreSQL 16 + PostGIS
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     │                           │                           │
apps/api                    apps/worker             packages/database
(NestJS PrismaService)   (BullMQ Data Access)      (Prisma Client & Types)
```

---

## 2. Core Entities & Relational Map

The schema is partitioned into 27 normalized relational entities covering all operational aspects of the platform:

```
                               ┌──────────────┐
                               │    users     │
                               └──────┬───────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │ 1:1                   │ 1:1                   │ 1:N
              ▼                       ▼                       ▼
    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
    │ worker_profiles  │    │employer_profiles │    │     sessions     │
    └─────────┬────────┘    └─────────┬────────┘    │   user_devices   │
              │                       │             │  notifications   │
       ┌──────┼──────┐                │             │  identity_verif  │
       │ 1:N  │ 1:1  │ 1:N            │ 1:N         │    documents     │
       ▼      ▼      ▼                ▼             └──────────────────┘
  [skills] [loc] [avail]        ┌───────────┐
                                │ job_posts │
                                └─────┬─────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │ 1:N                   │ 1:1                   │ 1:N
              ▼                       ▼                       ▼
    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
    │ job_applications │    │  job_locations   │    │job_req_skills    │
    └─────────┬────────┘    └──────────────────┘    └──────────────────┘
              │ 1:1
              ▼
    ┌──────────────────┐
    │     bookings     │◄──────┐
    └─────────┬────────┘       │
              │ 1:N            │
              ├────────────────┼───────────────┐
              ▼                ▼               ▼
        ┌───────────┐    ┌───────────┐   ┌───────────┐
        │  ratings  │    │ payments  │   │ disputes  │
        └───────────┘    └───────────┘   └───────────┘
```

---

## 3. PostGIS Geospatial Strategy

Geospatial discovery is the foundation of LocalSaathi. Daily-wage and skilled workers need jobs within accessible commute radiuses (1 km to 20 km).

### Coordinate Model
- Stored as `latitude` and `longitude` (`DOUBLE PRECISION`) for standard application transport and API contracts.
- Native PostGIS geometry/geography column:
  ```sql
  location geography(Point, 4326)
  ```
- Automated trigger synchronization (`fn_sync_point_location`) keeps `location` continuously populated from coordinates on `INSERT` or `UPDATE`.

### Spatial GiST Indexing
Standard B-Tree indexes cannot index two-dimensional geographic space efficiently. LocalSaathi implements Generalized Search Tree (**GiST**) indexes:
```sql
CREATE INDEX idx_job_locations_location_gist ON job_locations USING GIST (location);
CREATE INDEX idx_worker_locations_location_gist ON worker_locations USING GIST (location);
```

### Core Spatial Queries
Implemented in `packages/database/src/spatial.queries.ts`:
1. **`findWorkersWithinRadius(lat, lng, radiusMeters)`**:
   Uses `ST_DWithin(location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, radiusMeters)`.
2. **`findJobsWithinRadius(lat, lng, radiusMeters)`**:
   Finds published jobs within worker commute distance.
3. **`findWorkersNearJob(jobId, radiusMeters)`**:
   Computes geographic proximity between candidates and the job work site.
4. **`findJobsNearWorker(workerProfileId, radiusMeters)`**:
   Hyperlocal job feed generation for worker mobile app.

---

## 4. Comprehensive Indexing Strategy

Indexes are added only to support specific, high-frequency query patterns:

| Table | Index Columns | Index Type | Query Supported | Why Index Exists |
| :--- | :--- | :--- | :--- | :--- |
| `users` | `(role, account_status)` | B-Tree Composite | Admin / filtering by role and status | Prevents sequential scan when listing active workers vs employers |
| `users` | `(created_at DESC)` | B-Tree | User onboarding pagination | Sorts new registrations chronologically |
| `worker_profiles` | `(is_available, avg_rating DESC)` | B-Tree Composite | Candidate ranking feed | Retrieves available workers sorted by reputation without sorting in-memory |
| `worker_profiles` | `(expected_wage)` | B-Tree | Wage-range filtering | Supports minimum/maximum wage slider queries |
| `skills` | `(category, is_active)` | B-Tree Composite | Skill categorization selector | Populates category dropdowns and worker skill pickers |
| `worker_skills` | `(skill_id, is_verified)` | B-Tree Composite | Finding workers with verified trade skill | Used by matching engine to match specific verified skills |
| `job_posts` | `(status, category, published_at DESC)` | B-Tree Composite | Hyperlocal job discovery feed | Primary filter query: active jobs in category sorted by publication date |
| `job_posts` | `(employer_profile_id, status)` | B-Tree Composite | Employer dashboard job list | Rapidly loads employer active vs draft job postings |
| `job_locations` | `(location)` | GiST Spatial | Radius search (`ST_DWithin`) | Enables sub-10ms geographic radius boundary scans |
| `job_locations` | `(city, locality)` | B-Tree Composite | Text-based locality browsing | Supports hierarchical city/neighborhood browsing when GPS is disabled |
| `worker_locations` | `(location)` | GiST Spatial | Proximity candidate discovery | Radius query finding nearby available tradespeople |
| `worker_locations` | `(is_active, updated_at DESC)` | B-Tree Composite | Stale location cleanup | Identifies inactive locations for privacy and retention cleanup |
| `availability` | `(worker_profile_id, date, status)` | B-Tree Composite | Worker calendar availability lookup | Prevents double-booking and quickly checks date availability |
| `job_applications` | `(job_post_id, status)` | B-Tree Composite | Employer applicant review | Fetches all pending applications for a job post |
| `job_applications` | `(worker_profile_id, status)` | B-Tree Composite | Worker application tracker | Displays "My Applications" tab with current statuses |
| `bookings` | `(employer_profile_id, status)` | B-Tree Composite | Employer bookings dashboard | Tracks active, completed, or disputed hire contracts |
| `bookings` | `(worker_profile_id, status)` | B-Tree Composite | Worker upcoming schedule | Fast schedule lookup for confirmed work assignments |
| `conversation_members`| `(user_id, joined_at DESC)` | B-Tree Composite | User inbox conversation list | Loads recent chats in reverse chronological order |
| `messages` | `(conversation_id, sent_at DESC)` | B-Tree Composite | Chat history cursor pagination | Implements cursor-based message retrieval in chat window |
| `notifications` | `(recipient_id, is_read, created_at DESC)` | B-Tree Composite | Unread notification badge & feed | Instantly counts unread notifications (`is_read = false`) |
| `ratings` | `(reviewed_user_id, rating)` | B-Tree Composite | Public profile review summary | Calculates worker/employer reputation metrics |
| `payments` | `(payer_id, status)` | B-Tree Composite | Payment history & ledger | Rapidly loads user transaction statements |
| `payments` | `(created_at DESC)` | B-Tree | Admin financial reporting | Time-series payment volume aggregation |
| `payment_events` | `(is_processed, received_at ASC)` | B-Tree Composite | Webhook processing queue | Finds unprocessed webhook events in arrival order |
| `audit_logs` | `(entity_type, entity_id, created_at DESC)` | B-Tree Composite | Entity audit trail inspection | Forensic security inspection for specific records |
| `sessions` | `(user_id, expires_at)` | B-Tree Composite | Session validation & cleanup | Authenticates sessions and deletes expired refresh tokens |

---

## 5. Database Constraints & Data Integrity

Critical business rules are enforced at the database level:

1. **Unique Phone Numbers**: `users(phone)` ensures 1 phone = 1 account.
2. **Skill Normalization**: `skills(normalized_name)` prevents duplicate entries (`plumbing` vs `Plumbing`).
3. **Duplicate Worker Skills**: `worker_skills(worker_profile_id, skill_id)` ensures a worker cannot register the same skill twice.
4. **Duplicate Applications**: `job_applications(job_post_id, worker_profile_id)` prevents workers from spamming multiple applications to the same job.
5. **Duplicate Bookings**: `bookings(application_id)` enforces a 1:1 mapping between accepted application and booking.
6. **Chat Membership**: `conversation_members(conversation_id, user_id)` guarantees unique membership per conversation.
7. **Ratings Integrity**:
   - `ratings(booking_id, reviewer_id)` allows only 1 review per booking per party.
   - `CHECK (rating >= 1 AND rating <= 5)` restricts ratings to valid integer scores.
   - `CHECK (reviewer_id != reviewed_user_id)` strictly prohibits self-rating manipulation.
8. **Payment Idempotency**:
   - `payments(idempotency_key)` is globally unique, eliminating double-charge risks.
   - `payment_events(event_id)` is globally unique, eliminating duplicate webhook processing.
9. **Monetary Non-Negativity**:
   - `CHECK (amount >= 0)` on `payments`.
   - `CHECK (wage_amount >= 0)` on `job_posts`.
   - `CHECK (total_amount >= 0)` on `bookings`.

---

## 6. Monetary Representation Decision

### Standard: `DECIMAL(12, 2)`
- Floating-point representations (`FLOAT`, `DOUBLE PRECISION`) are **strictly prohibited** for financial calculations due to binary rounding inaccuracies (`0.1 + 0.2 = 0.30000000000000004`).
- `DECIMAL(12, 2)` supports exact financial arithmetic up to **₹9,999,999,999.99** (nearly 1,000 Crore INR) with exact 2-decimal precision (paise).

---

## 7. Soft Deletion vs. Immutable Retention Strategy

| Entity Category | Entities | Strategy | Rationale |
| :--- | :--- | :--- | :--- |
| **Personal Identifiers** | `users`, `worker_profiles`, `employer_profiles` | **Soft Delete** (`deleted_at`) | Complies with right-to-be-forgotten / deletion requests while maintaining historical foreign keys for tax and dispute reconciliation. |
| **Operational Postings** | `job_posts`, `messages`, `documents` | **Soft Delete** (`deleted_at`) | Prevents broken conversation feeds or missing hire contexts when a post is removed. |
| **Financial Ledgers** | `payments`, `payment_events`, `bookings` | **Hard Retain / Immutable** | Financial records cannot be deleted; must be permanently archived for audit compliance. |
| **Security Audit Trails** | `audit_logs` | **Immutable Append-Only** | Audit logs have no update or delete operations; permanent tamper-evident security record. |
| **Ephemeral State** | `worker_locations` (latest only), `sessions` | **Hard Update / Purge** | Workers have only 1 latest location record (`worker_profile_id @unique`) to eliminate continuous location tracking history. Expired sessions are physically purged. |

---

## 8. Privacy & Data Minimization

1. **No Plaintext Credentials**: All passwords and OTPs are hashed prior to storage.
2. **Session Security**: Only hashed refresh token signatures (`session_token_hash`) are persisted in `sessions`. Raw tokens are never stored.
3. **No Raw Identity Documents in DB**: Identity documents are stored in private object storage; only opaque reference keys (`object_storage_key`) and MIME metadata are stored in PostgreSQL.
4. **No Continuous GPS History**: Worker location retains only the latest approximate location point (`worker_profile_id @unique`), preventing tracking of historical movement trajectories.

---

## 9. Migration & Seed Operations

- **Generate Client**:
  ```powershell
  npm.cmd run generate --workspace=@localsaathi/database
  ```
- **Apply Migrations**:
  ```powershell
  npm.cmd run migrate:deploy --workspace=@localsaathi/database
  ```
- **Run Seed**:
  ```powershell
  npm.cmd run seed --workspace=@localsaathi/database
  ```
- **Execute Integration Tests**:
  ```powershell
  npm.cmd run test:integration --workspace=@localsaathi/database
  ```
