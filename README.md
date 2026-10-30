# LocalSaathi — Hyperlocal Employment Platform

<<<<<<< HEAD
**LocalSaathi** is a production-grade hyperlocal employment and gig platform tailored for **informal and skilled blue-collar workers** (electricians, plumbers, carpenters, masons, painters, helpers) and **local contractors/employers** in India. It bridges the gap between nearby workers and verified work opportunities with transparent wages, skill verification, commute-distance calculation, contract management, and multilingual accessibility.

The project is structured as a **unified, full-stack Next.js 14 application** optimized for zero-configuration, 1-click deployment on **Vercel's Free (Hobby) tier**, with native support for live PostgreSQL + PostGIS databases or instant zero-database demo previews.

---

## 🌟 Key Features

### 👷 1. Worker Workspace (`/worker`)
- **Interactive Trade Discovery (`/worker/jobs`)**: Personalized nearby jobs sorted by skill compatibility, employer ratings, and commute distance (`${job.distanceKm} km away`).
- **Device Location Permission (`LocationPermissionCard`)**: One-click browser geolocation with strict coordinate bounds checking (`[-90, 90]`, `[-180, 180]`), 6-decimal precision rounding, and manual trade hub fallbacks (Hazratganj, Aliganj, Gomti Nagar, Noida Sector 18, Connaught Place, and custom city search).
- **Interactive Leaflet Map (`InteractiveLocationMap`)**: Visual radius adjustment slider (1–50 km) and neighborhood trade pins.
- **Worker Profile & Readiness (`/worker/profile`, `/worker/skills`, `/worker/availability`)**: Trade experience tracking, language preferences, hourly/daily expected wage, and weekly availability calendars.
- **Application & Booking Tracking (`/worker/applications`, `/worker/bookings`)**: Real-time status indicators (Submitted, Shortlisted, Accepted, Completed).

### 🏢 2. Employer & Contractor Hub (`/employer`)
- **Fast Job Posting (`/employer/jobs/new`)**: Create trade requirements with wage specification (Daily/Hourly/Lump-sum), worker headcount, duration, and skill criteria.
- **Applicant Review & Shortlisting (`/employer/jobs/[id]/applications`)**: Review verified worker profiles, compare distances, and shortlist or accept with one click.
- **Booking & Shift Management (`/employer/bookings`)**: Manage confirmed workers, track work days, and initiate completion releases.
- **Business Profile Readiness (`/employer/profile`)**: Business type, verified trade credentials, and location details.

### 🛡️ 3. Platform Administration & Observability (`/admin`)
- **Operations Dashboard (`/admin`)**: Real-time metrics on registered workers, active employers, total jobs posted, and gross platform volume.
- **Dispute Resolution & Moderation (`/admin/disputes`, `/admin/moderation`, `/admin/reports`)**: Incident investigation, complaint handling, and account safety actions.
- **System Health & Audit Logs (`/admin/system-health`, `/admin/audit-logs`)**: Live probe metrics, immutable security logs, and runtime diagnostics.

### 🔐 4. Authentication & Security (`/login`)
- **Mobile Number + Dynamic Cryptographic OTP**: Every OTP request generates a fresh, randomized 6-digit verification challenge using Node.js `crypto.randomInt()`.
- **Zero-Friction Dev Mode & 1-Click Profiles**: Pre-configured demo logins for Ramesh Kumar (Worker), Rajesh Sharma (Employer), and Platform Admin for instant evaluation.
- **JWT Session Tokens**: Role-based access control (`WORKER`, `EMPLOYER`, `ADMIN`) protecting sensitive actions.
- **Worker Privacy Guarantee**: Exact GPS coordinates are never broadcast to employers or exposed in public API payloads; commute distance is computed securely server-side.

---

## 🏗️ Architecture & Project Structure

The entire application runs from the repository root as a cohesive Next.js 14 App Router project:

```
Project Localsaathi/
├── src/
│   ├── app/                                # Next.js 14 App Router (Pages & API)
│   │   ├── (landing)/page.tsx              # Public homepage & trade search
│   │   ├── login/page.tsx                  # Mobile OTP Authentication portal
│   │   ├── worker/                         # Worker Workspace (jobs, profile, skills, availability)
│   │   ├── employer/                       # Employer Hub (job postings, applicants, bookings)
│   │   ├── admin/                          # Admin & Observability dashboards
│   │   ├── messages/                       # Messaging & conversations
│   │   ├── notifications/                  # In-app notifications & preferences
│   │   ├── payments/                       # Payments & payout histories
│   │   └── api/                            # Vercel Serverless Route Handlers
│   │       ├── health/route.ts             # Health probe (/api/health)
│   │       └── v1/[...slug]/route.ts       # Unified API Router (/api/v1/*)
│   ├── components/                         # UI Components & Design System
│   │   ├── ui/                             # Buttons, Cards, Inputs, Badges
│   │   ├── location/                       # LocationPermissionCard & Hub Selector
│   │   └── map/                            # Interactive Leaflet Map components
│   ├── hooks/                              # React Hooks (useDeviceLocation, useTranslation)
│   ├── i18n/                               # Regional language localization (Hindi, English, etc.)
│   ├── lib/                                # API Client, Prisma Singleton, Serverless Data
│   ├── types/                              # Shared TypeScript Domain Types & DTOs
│   └── validation/                         # Zod Validation Schemas
├── prisma/
│   └── schema.prisma                       # PostgreSQL + PostGIS Prisma schema
├── public/                                 # Static assets & icons
├── next.config.mjs                         # Next.js production configuration
├── tailwind.config.ts                      # Tailwind CSS design tokens
├── postcss.config.js                       # PostCSS configuration
├── tsconfig.json                           # TypeScript configuration with path aliases
├── vercel.json                             # 1-Click Vercel deployment configuration
└── package.json                            # Root scripts & dependencies
=======
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
>>>>>>> 096eee3 (Update LocalSaathi changes)
```

---

<<<<<<< HEAD
## ⚡ Serverless API Route Handlers (`/api/v1/*`)

Because Vercel's Free tier executes via serverless functions (without persistent background daemons), all backend requests from `apiClient` are handled by [`src/app/api/v1/[...slug]/route.ts`](file:///p:/Project%20Localsaathi/src/app/api/v1/[...slug]/route.ts):

- **Catch-All Sub-Routing**: Automatically maps incoming requests (`/api/v1/auth/otp/*`, `/api/v1/workers/me/*`, `/api/v1/jobs/*`, `/api/v1/admin/*`) with zero 404 risk.
- **Dual Execution Modes**:
  1. **Live Database Mode**: When `DATABASE_URL` is configured, Prisma executes persistent transactional queries.
  2. **Instant Demo Mode**: When running without a database, [`src/lib/serverless-data.ts`](file:///p:/Project%20Localsaathi/src/lib/serverless-data.ts) provides realistic in-memory trade jobs, worker profiles, and bookings. The site is 100% interactive on Vercel preview environments out-of-the-box.
- **Sub-50ms Response Times**: Fast, lightweight serverless execution well within Vercel's 10-second free function timeout limit.

---

## 🚀 1-Click Deployment on Vercel

### Step 1: Push Code to Git
Ensure your latest code is pushed to your GitHub or GitLab repository:
```powershell
git add .
git commit -m "Deploy LocalSaathi on Vercel"
git push origin main
```

### Step 2: Import into Vercel
1. Go to **[vercel.com/new](https://vercel.com/new)** and import your repository.
2. Vercel detects **Next.js** automatically:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./`
   - **Build Command**: `prisma generate && next build`
   - **Output Directory**: `.next`

### Step 3: Configure Environment Variables (Optional)
If connecting a real database:
- `DATABASE_URL`: `postgresql://user:password@host:5432/dbname?sslmode=require` (e.g. from Neon Serverless Postgres with PostGIS or Supabase).

*(If you don't provide a database URL, LocalSaathi will automatically run in zero-configuration serverless demo mode).*

### Step 4: Click Deploy
Click **Deploy**. Your site will build and deploy across Vercel's global edge network in under 60 seconds!

---

## 💻 Local Development

### 1. Prerequisites
- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`

### 2. Install Dependencies
```powershell
npm install
```

### 3. Generate Prisma Client
```powershell
npx prisma generate
```

### 4. Run Development Server
```powershell
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

- **Landing Page**: [http://localhost:3000](http://localhost:3000)
- **Login Portal**: [http://localhost:3000/login](http://localhost:3000/login)
- **Worker Workspace**: [http://localhost:3000/worker](http://localhost:3000/worker)
- **Nearby Jobs**: [http://localhost:3000/worker/jobs](http://localhost:3000/worker/jobs)
- **Employer Hub**: [http://localhost:3000/employer](http://localhost:3000/employer)
- **Admin Dashboard**: [http://localhost:3000/admin](http://localhost:3000/admin)
- **API Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 🛠️ Verification & Quality Gates

| Script | Purpose |
| :--- | :--- |
| `npm run build` | Compiles Prisma schema and executes production `next build` (39 routes). |
| `npm run typecheck` | Strict `tsc --noEmit` check across all components, hooks, and route handlers. |
| `npm run lint` | ESLint check across all pages and libraries. |
| `node scripts/test-device-location.js` | 18/18 tests verifying coordinate bounds, error mapping, and UI cards. |
| `node scripts/verify-nextjs-vercel-build.js` | 6/6 tests verifying Vercel deployment artifacts and package configs. |

---

## 📦 Preserved Monorepo History

The original multi-service Turborepo structure (with dedicated NestJS backend, BullMQ queue workers, and Docker Compose configurations) is safely preserved on git branch:
```powershell
git checkout backup-monorepo-pre-nextjs
```

---

## 📄 License
Private & Proprietary — LocalSaathi Hyperlocal Employment Platform.
=======
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
"# Project-LocalSaathi" 
>>>>>>> 096eee3 (Update LocalSaathi changes)
