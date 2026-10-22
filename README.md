# LocalSaathi — Hyperlocal Employment Platform

LocalSaathi is a production-grade hyperlocal employment platform connecting daily-wage workers, skilled informal tradespeople (plumbers, electricians, masons, carpenters, drivers, helpers), and local contractors with nearby job opportunities and verified employers.

Built to scale to **100,000+ registered workers**, **10,000+ daily active users**, and **1,000,000+ job records** with sub-10ms PostGIS geospatial search, voice-first regional accessibility, and asynchronous background queues.

---

## Architecture Topology

```
                       ┌───────────────────────────────┐
                       │            Clients            │
                       │   Worker / Employer Web PWA   │
                       └───────────────┬───────────────┘
                                       │
                              CDN / Reverse Proxy
                                       │
                ┌──────────────────────┴──────────────────────┐
                │                                             │
          Next.js Web (SSR/PWA)                         API Gateway / Cluster
          (apps/web)                                    (apps/api - NestJS)
                │                                             │
                │                                     ┌───────┴────────┐
                │                                     │                │
                │                                REST /api/v1      WebSocket
                │                                     │                │
                │                              ┌──────┴──────┐         │
                │                              │ Domain Core │         │
                │                              │ - Auth/RBAC │         │
                │                              │ - Jobs      │         │
                │                              │ - Matching  │         │
                │                              │ - Messaging │◄────────┘
                │                              │ - Payments  │
                │                              └──────┬──────┘
                │                                     │
                │                       ┌─────────────┴─────────────┐
                │                       │                           │
                ▼                       ▼                           ▼
        Object Storage         PostgreSQL + PostGIS          Redis (Cache & PubSub)
        (Cloud Storage / S3)   - 24 Core Tables                     │
        - Profile Photos       - GiST Spatial Indexes               ▼
        - Identity Docs        - Idempotency & Audit Logs    BullMQ Queues
        - Audio Messages                                            │
                                                                    ▼
                                                            Background Workers
                                                            (apps/worker)
                                                            ┌───────┴───────┐
                                                            │ - Indexing    │
                                                            │ - Notifications│
                                                            │ - SMS / OTP   │
                                                            │ - Embeddings  │
                                                            └───────┬───────┘
                                                                    │
                                                ┌───────────────────┴──────────┐
                                                ▼                              ▼
                                           OpenSearch               External Providers
                                           (Hybrid Retrieval)       (Razorpay, SMS Gateway)
```

---

## Monorepo Layout

```
/
├── apps/
│   ├── web/        # Next.js 14 App Router (Mobile PWA, Tailwind CSS)
│   ├── api/        # NestJS 10 REST API Core (OpenAPI, Helmet, /api/v1)
│   └── worker/     # BullMQ Async Queue Worker Bootstrap (Redis)
│
├── packages/
│   ├── database/   # PostgreSQL + PostGIS Prisma ORM layer, migrations & spatial queries
│   ├── ui/         # Accessible UI Component System (Button, Input, Card)
│   ├── types/      # Shared domain-independent interfaces & API envelopes
│   ├── validation/ # Shared Zod schemas (Phone, UUID, Env, Coordinates)
│   └── config/     # Central TypeScript, ESLint, and Prettier presets
│
├── infra/
│   ├── docker/     # Multi-stage production container Dockerfiles
│   ├── postgres/   # PostgreSQL 16 + PostGIS initialization scripts
│   ├── redis/      # Redis server configuration
│   └── opensearch/ # OpenSearch single-node configuration
│
├── docs/           # Architecture diagrams, API specs, and database ADRs
├── docker-compose.yml
├── turbo.json
└── package.json
```

---

## Prerequisites & Tooling

| Requirement | Minimum Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0` | Verified on `v24.11.1` |
| **npm** | `>= 10.0.0` | Verified on `11.6.2` |
| **Git** | `>= 2.30.0` | Verified on `2.55.0` |
| **PostgreSQL** | `>= 16.0` | Transactional source of truth |
| **PostGIS** | `>= 3.4` | Spatial extensions enabled (`postgis`) |
| **Turborepo** | `^2.4.4` | Workspace Orchestrator |

> **Windows PowerShell Execution Policy Note:**  
> On Windows systems where PowerShell restricts `.ps1` script execution, execute npm commands using `npm.cmd` and `npx.cmd` directly:
> ```powershell
> npm.cmd run <script>
> ```

---

## Getting Started

### 1. Environment Configuration
Copy the template to your local `.env`:
```powershell
Copy-Item .env.example .env
```

### 2. Install Dependencies
```powershell
npm.cmd install
```

### 3. Build All Workspaces
```powershell
npm.cmd run build
```

### 4. Run Development Servers
```powershell
npm.cmd run dev
```
- **Web App:** [http://localhost:3000](http://localhost:3000)
- **API Server:** [http://localhost:4000/api/v1](http://localhost:4000/api/v1)
- **Swagger Docs:** [http://localhost:4000/api/docs](http://localhost:4000/api/docs)
- **API Health:** [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

### Using the Website
Open [http://localhost:3000/login](http://localhost:3000/login) to sign in or register with an Indian mobile number. Choose Worker or Employer when requesting the OTP; after verification, LocalSaathi routes the account to its dashboard. In local development, the simulated OTP appears in the API server terminal. Workers can browse matched listings at `/worker/jobs`; the worker and employer dashboards load their data from the API.

---

## Workspace Orchestration Scripts

| Command | Action |
| :--- | :--- |
| `npm.cmd run dev` | Starts all applications in watch mode concurrently via Turborepo |
| `npm.cmd run build` | Compiles shared packages, Next.js web app, and NestJS API |
| `npm.cmd run typecheck` | Strict TypeScript compiler check across all packages and apps |
| `npm.cmd run test` | Runs Jest unit and e2e integration test suites |
| `npm.cmd run lint` | Runs ESLint across all workspaces |
| `npm.cmd run format` | Auto-formats code using Prettier rules |
| `npm.cmd run clean` | Cleans build caches, `.next`, and `dist` directories |

---

## Database Operations (@localsaathi/database)

| Command | Action |
| :--- | :--- |
| `npm.cmd run generate --workspace=@localsaathi/database` | Regenerates Prisma Client types from `schema.prisma` |
| `npm.cmd run migrate:deploy --workspace=@localsaathi/database` | Applies pending PostgreSQL + PostGIS migrations |
| `npm.cmd run seed --workspace=@localsaathi/database` | Populates realistic development skills, workers, employers & jobs |
| `npm.cmd run test:integration --workspace=@localsaathi/database` | Executes real database integration test suite against PostgreSQL |

---

## Authentication & Identity Operations (@localsaathi/api)

### Architecture Highlights:
- **Phone Number + OTP Verification**: Cryptographic 6-digit random code hashed with HMAC-SHA256 before storage in PostgreSQL (`otp_challenges`).
- **Short-Lived Access Tokens**: 15-minute JWT strictly containing minimal claims (`sub`, `sessionId`, `role`) with zero PII.
- **Stateful Rotating Refresh Tokens**: 7-day refresh tokens delivered via HttpOnly, SameSite=Lax, Secure cookies. Only HMAC-SHA256 hashes are stored in the `sessions` table.
- **Token Reuse Attack Detection**: Replaying an already-rotated refresh token triggers immediate automated breach mitigation, revoking all active sessions for the user and recording a security incident.
- **Server-Side RBAC**: `@Roles(...)` and `RolesGuard` protecting endpoints for `WORKER`, `EMPLOYER`, `ADMIN`, `MODERATOR`, and `SUPPORT`.

### Auth Environment Variables:
```env
JWT_ACCESS_SECRET=replace_with_secure_random_base64_string_min_32_chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=replace_with_another_secure_random_base64_string_min_32_chars
JWT_REFRESH_EXPIRES_IN=7d
AUTH_PEPPER=replace_with_secure_auth_pepper_secret_minimum_32_characters
AUTH_COOKIE_NAME=localsaathi_refresh_token
OTP_LENGTH=6
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=3
OTP_RESEND_COOLDOWN_SECONDS=60
RATE_LIMIT_OTP_REQUESTS=5
RATE_LIMIT_OTP_VERIFY=5
SMS_PROVIDER=development
# For real Twilio Verify delivery, set SMS_PROVIDER=twilio and add:
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
```

### Local Development Authentication Testing:
In development mode (`SMS_PROVIDER=development`), the simulated SMS provider logs safe dispatch notices to the terminal without contacting external gateways:
```text
[DEV SMS DISPATCH] Simulated OTP sent to phone=98****210 (Dev OTP=839201)
```

### Twilio Verify Setup
To send login codes to real mobile numbers, create a Twilio Verify Service and configure these variables in the local `.env` file (never commit credentials):
```env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_VERIFY_SERVICE_SID=your-verify-service-sid
```
Restart the API after changing `.env`. Login codes are sent and checked through Twilio Verify; the existing database-backed expiry, resend cooldown, attempt limit, and rate limit also apply. The destination number is entered on the login page and sent to Twilio in E.164 format. Twilio trial accounts may require verifying recipient numbers in the Twilio console before SMS can be delivered. Twilio Verify integration is for login OTP only; other SMS notifications still require a messaging provider.

### Testing Commands:
```powershell
# Run API test suite (unit + api + real database integration tests)
npm.cmd run test --workspace=@localsaathi/api

# Run entire monorepo test suite
npm.cmd run test
```

---

## Phase 4 — Worker Experience & Onboarding

Phase 4 establishes the worker domain, onboarding workflow, and profile management for informal tradespeople:

- **Progressive 10-Step Onboarding**: Mobile-first stepper (`/worker/onboarding`) validating display name, trade skills, experience, languages, wage, availability, and location.
- **Continuous Server-Side Persistence**: State is saved per-step to PostgreSQL, supporting resume-after-exit.
- **Server-Side Onboarding Gate**: Evaluates 7 criteria before marking a worker `COMPLETED` (`POST /api/v1/workers/me/onboarding/complete`).
- **PostGIS Geospatial Synchronization**: Updates worker geography Point with SRID 4326 (`PUT /api/v1/workers/me/location`), validated via spatial `ST_DWithin` queries.
- **Privacy Threshold**: Exact GPS coordinates are restricted to authenticated worker self-inspection and stripped from public representations.
- **Dedicated Worker Frontend**: Next.js App Router pages for `/worker` (dashboard), `/worker/onboarding` (stepper), `/worker/profile` (profile & edit), `/worker/availability` (calendar slots), and `/worker/skills` (skills directory).


---

## Local Infrastructure (Docker Compose)

When Docker is installed and running on the host, start PostgreSQL (PostGIS), Redis, and OpenSearch, apply database migrations, then start the development servers:

```powershell
docker compose up -d
npm run migrate:deploy --workspace=@localsaathi/database
npm run dev
```

### Non-Docker Development Mode
If Docker is not installed on the host machine:
- The NestJS API automatically reports infrastructure availability dynamically:
  - `GET /api/v1/health/live` remains `200 OK` (Node.js process is alive).
  - `GET /api/v1/health/ready` accurately reports whether local PostgreSQL, Redis, or OpenSearch sockets are listening without faking health.
- Builds, type checking, unit tests, and frontend development run completely standalone without Docker.

---

## Centralized Health & Observability Endpoints

| Endpoint | Method | Semantic Meaning |
| :--- | :--- | :--- |
| `/api/v1/health` | `GET` | Application health summary (uptime, version, environment, memory). |
| `/api/v1/health/live` | `GET` | Process liveness probe for orchestrators (k8s / Docker). |
| `/api/v1/health/ready` | `GET` | Infrastructure readiness check. Verifies live TCP sockets to Postgres, Redis, and OpenSearch. Returns `200` if operational or `503` if required dependencies are degraded. |

---

## Security & Architectural Standards

- **Zero Hardcoded Secrets**: All credentials and API keys are injected via typed environment variables validated with Zod.
- **Strict Dependency Boundaries**: Cross-app imports (`apps/web` ➔ `apps/api`) are forbidden. Domain contracts live exclusively in `packages/types` and `packages/validation`.
- **Structured JSON Logging**: Every HTTP request receives an `X-Request-Id` correlation UUID, logs duration, status code, and automatically redacts tokens, OTPs, and passwords.
- **Centralized Error Envelope**: Consistent `{ success: false, error: { code, message }, requestId }` response format without exposing internal stack traces.
