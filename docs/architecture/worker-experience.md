# LocalSaathi Worker Experience & Onboarding Architecture (Phase 4)

## 1. Worker Domain Overview

The Worker Experience domain establishes the operational and identity foundation for skilled artisans, daily-wage laborers, and service technicians across urban and rural India. It bridges the gap between low-friction mobile access and structured transactional data required for future hyperlocal matching.

```
                      ┌──────────────────────────────────────────────┐
                      │              Client Application              │
                      └───────┬──────────────────────────────▲───────┘
                              │                              │
                    1. Authenticate (Phone + OTP)   7. Profile Eligible
                    2. Complete Stepper (1-10)         for Future Search
                              │                              │
┌─────────────────────────────┼──────────────────────────────┴──────────────────────────────────────┐
│ NestJS Worker Module (apps/api)                                                                   │
│                                                                                                   │
│  ┌───────────────────────┐   ┌────────────────────────┐   ┌────────────────────────────────────┐  │
│  │   WorkerController    ├──►│     WorkerService      ├──►│      WorkerCompletionService       │  │
│  └───────────────────────┘   └───────────┬────────────┘   └────────────────────────────────────┘  │
│                                          │                                                        │
│                                          ▼                                                        │
│                              ┌────────────────────────┐   ┌────────────────────────────────────┐  │
│                              │   ProfileImageStorage  ├──►│           WorkerMapper             │  │
│                              └────────────────────────┘   └────────────────────────────────────┘  │
└──────────────────────────────────────────┼────────────────────────────────────────────────────────┘
                                           │
                                           ▼
                              ┌────────────────────────────────────────┐
                              │   PostgreSQL 16 + PostGIS Database     │
                              │   - worker_profiles (onboarding status)│
                              │   - worker_skills (unique relations)   │
                              │   - availability (time slots)          │
                              │   - worker_locations (geography Point) │
                              │   - skills (normalized catalog)        │
                              └────────────────────────────────────────┘
```

---

## 2. Onboarding Workflow

The onboarding experience is designed mobile-first for workers navigating low-bandwidth conditions on entry-level smartphones. It employs an asynchronous, 10-step progressive disclosure model where progress is saved continuously on the server, permitting resume-after-exit.

| Step | Section | Description | Persistence Action |
|---|---|---|---|
| **1** | **About You** | Worker public display name and brief bio/specialties. | `PATCH /workers/me` |
| **2** | **Skills** | Select trades from catalog or specify custom skills. | `POST /workers/me/skills` |
| **3** | **Experience** | Cumulative years of professional trade experience. | `PATCH /workers/me` |
| **4** | **Languages** | Spoken languages (Hindi, English, Bengali, Telugu, etc.). | `PATCH /workers/me` |
| **5** | **Wage** | Expected base wage in INR, wage basis, and travel radius. | `PATCH /workers/me` |
| **6** | **Availability** | Upcoming date schedule and daily work hours. | `POST /workers/me/availability` |
| **7** | **Location** | Locality, city, state, PIN code, and GPS coordinates. | `PUT /workers/me/location` |
| **8** | **Photo** | Optional portrait photo upload for employer trust. | `POST /workers/me/photo` |
| **9** | **Review** | Aggregated verification of all entered data. | Read-only aggregation |
| **10** | **Complete** | Server-side gate evaluation and status finalization. | `POST /workers/me/onboarding/complete` |

---

## 3. Data Models

### Worker Profile (`worker_profiles`)
- `id`: UUID Primary Key
- `userId`: Relation to `users.id` (`@unique`, Cascade Delete)
- `displayName`: String (2-100 chars)
- `profilePhotoKey`: String | null (storage reference)
- `bio`: Text | null
- `experienceYears`: Integer (0-60)
- `expectedWage`: Decimal(12, 2) | null
- `wageType`: Enum (`HOURLY`, `DAILY`, `FIXED`, `PIECE_RATE`)
- `preferredRadiusKm`: Integer (1-100, default 10)
- `languages`: String array (default `["hi", "en"]`)
- `isAvailable`: Boolean (default true)
- `onboardingStatus`: Enum (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`)
- `onboardingCompletedAt`: Timestamp with time zone | null
- `completedJobsCount`, `avgRating`, `ratingCount`, `reliabilityScore`: Performance metrics

### Worker Skills (`worker_skills`)
- `id`: UUID Primary Key
- `workerProfileId`: Relation to `worker_profiles.id`
- `skillId`: Relation to `skills.id`
- `proficiency`: Enum (`BEGINNER`, `INTERMEDIATE`, `EXPERT`)
- `experienceYears`: Integer (0-60)
- `isVerified`: Boolean (server-controlled)
- Constraint: `@@unique([workerProfileId, skillId])` prevents duplicate trade entries.

### Platform Skill Catalog (`skills`)
- `id`: UUID Primary Key
- `name`: Display name (e.g., "Plumbing")
- `normalizedName`: `@unique` lowercase slug (e.g., "plumbing", "pipe_fitting")
- `category`: Functional category grouping (e.g., "Plumbing", "Electrical", "Construction")
- `isActive`: Boolean flag

### Worker Location (`worker_locations`)
- `id`: UUID Primary Key
- `workerProfileId`: `@unique` relation to `worker_profiles.id`
- `latitude`: Float (-90 to 90)
- `longitude`: Float (-180 to 180)
- `location`: PostGIS `geography(Point, 4326)`
- `locality`, `city`, `state`, `pinCode`, `addressLine`: Address metadata
- `isActive`: Boolean

### Availability Schedule (`availability`)
- `id`: UUID Primary Key
- `workerProfileId`: Relation to `worker_profiles.id`
- `date`: `@db.Date` (normalized to UTC midnight)
- `startTime`, `endTime`: String formatted as 24-hour `HH:mm`
- `status`: Enum (`AVAILABLE`, `UNAVAILABLE`, `BOOKED`)
- Constraint: `@@unique([workerProfileId, date])` ensures one primary availability slot per date.

---

## 4. Location & Privacy Architecture

### Exact vs. Obfuscated Coordinates
1. **Worker Self-View (`/workers/me/location`)**:
   - The authenticated worker may inspect their exact coordinates (`latitude`, `longitude`) to calibrate their service radius and home base.
2. **Public / Employer View (Future Phases)**:
   - Workers' exact home GPS coordinates are considered highly sensitive PII.
   - Public and search APIs expose only neighborhood boundaries (`locality`, `city`, `state`, `pinCode`) and distance approximations (e.g. "~2.5 km away").
   - Exact coordinates are never broadcast to arbitrary search queries.

### PostGIS Spatial Synchronization
When a location is updated via `PUT /api/v1/workers/me/location`:
```sql
UPDATE worker_locations
SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
WHERE worker_profile_id = $3::uuid;
```
This enables sub-10ms distance calculation via `ST_DWithin` and `ST_Distance` indexed by the GiST spatial index `idx_worker_locations_location_gist`.

---

## 5. Profile Completion Engine

Profile completion is evaluated centrally by `WorkerCompletionService` across 7 deterministic dimensions:

1. `basic_profile`: Display name provided and >= 2 characters.
2. `skills`: At least 1 registered trade skill.
3. `experience`: Cumulative experience years defined (>= 0).
4. `languages`: At least 1 language specified.
5. `wage`: Expected wage > 0 and wage type configured.
6. `availability`: At least 1 availability schedule slot recorded.
7. `location`: Location coordinates, city, and locality recorded.

```typescript
completionPercentage = Math.round((completedSteps.length / 7) * 100);
isComplete = remainingSteps.length === 0;
```

### Server-Side Onboarding Gate
When a worker invokes `POST /api/v1/workers/me/onboarding/complete`:
- If `!isComplete`, the server rejects with `422 Unprocessable Entity`, returning the list of missing steps (`remainingSteps`).
- If `isComplete`, the record transitions to `COMPLETED` and records `onboardingCompletedAt`.
- The endpoint is **strictly idempotent**: subsequent calls return success without altering existing state.

---

## 6. Authorization & Anti-IDOR Principles

1. **Role Enforcement**:
   - All worker APIs require `@Roles(UserRole.WORKER)`.
   - Employers and unauthenticated users receive `403 Forbidden` and `401 Unauthorized` respectively.
2. **No Client-Supplied Worker IDs**:
   - Endpoints do not accept `workerId` or `userId` in route parameters or request bodies.
   - The worker profile is derived strictly from the verified access token claims:
     ```
     request.user.sub ──► lookup user ──► lookup workerProfile
     ```
   - This eliminates Insecure Direct Object References (IDOR).
3. **Protected Status Fields**:
   - Fields such as `verificationStatus`, `accountStatus`, `avgRating`, and `reliabilityScore` are server-controlled and rejected if supplied in client payloads.

---

## 7. API Specification

| Method | Endpoint | Description | Status Codes |
|---|---|---|---|
| `GET` | `/api/v1/workers/me` | Fetch worker profile and onboarding state | 200, 401, 403 |
| `PATCH` | `/api/v1/workers/me` | Update basic profile (name, bio, wage, radius) | 200, 422 |
| `GET` | `/api/v1/workers/me/skills` | List worker trade skills | 200 |
| `POST` | `/api/v1/workers/me/skills` | Add a skill (catalog or normalized custom) | 201, 409, 422 |
| `PATCH` | `/api/v1/workers/me/skills/:skillId` | Update proficiency or experience years | 200, 404, 422 |
| `DELETE`| `/api/v1/workers/me/skills/:skillId` | Remove a skill from profile | 200, 404 |
| `GET` | `/api/v1/workers/me/location` | Retrieve current work location and coordinates | 200 |
| `PUT` | `/api/v1/workers/me/location` | Set/update location and PostGIS spatial point | 200, 422 |
| `GET` | `/api/v1/workers/me/availability` | List scheduled availability slots | 200 |
| `POST` | `/api/v1/workers/me/availability` | Create date availability slot | 201, 409, 422 |
| `PATCH` | `/api/v1/workers/me/availability/:id` | Update availability slot times/status | 200, 404, 422 |
| `DELETE`| `/api/v1/workers/me/availability/:id` | Delete availability slot | 200, 404 |
| `GET` | `/api/v1/workers/me/completion` | Get completion percentage and missing steps | 200 |
| `POST` | `/api/v1/workers/me/onboarding/complete`| Server-side gate to finalize onboarding | 200, 422 |
| `POST` | `/api/v1/workers/me/photo` | Upload profile photo (JPEG/PNG/WebP, max 5MB) | 200, 400 |
| `GET` | `/api/v1/workers/skills` | Public platform skill catalog search | 200 |

---

## 8. Frontend Route Structure

| Route | Component | Purpose |
|---|---|---|
| `/worker` | `WorkerDashboardPage` | Overview of profile readiness, active trades, location, and placeholder for Phase 5 job matching. |
| `/worker/onboarding` | `WorkerOnboardingPage` | Mobile-first 10-step wizard with server-side autosave and resume capability. |
| `/worker/profile` | `WorkerProfilePage` | Full profile view with inline editing actions for bio, wage, and service radius. |
| `/worker/availability` | `WorkerAvailabilityPage` | Schedule manager for adding, updating, and removing work availability dates. |
| `/worker/skills` | `WorkerSkillsPage` | Skills directory with catalog search, proficiency levels, and custom additions. |

---

## 9. Future Phase Dependencies

1. **Phase 5 (Matching Engine)**: Will query `worker_locations` (`location` PostGIS Point) and `worker_skills` to match workers with active `job_locations`.
2. **Phase 6 (Voice Onboarding)**: Will map spoken regional audio into this worker API schema.
3. **Phase 7 (Verification & Trust)**: Will advance `User.verificationStatus` from `UNVERIFIED` to `VERIFIED` via Aadhaar/DigiLocker step-up authentication.
