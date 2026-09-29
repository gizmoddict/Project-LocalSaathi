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
├── docs/           # Architecture diagrams, API specs, and ADRs
├── docker-compose.yml
├── turbo.json
└── package.json
```

---

## Prerequisites & Tooling

| Requirement | Minimum Version | Verified Host Version |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0` | `v24.11.1` |
| **npm** | `>= 10.0.0` | `11.6.2` |
| **Git** | `>= 2.30.0` | `2.55.0` |
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

## Local Infrastructure (Docker Compose)

When Docker is installed and running on the host, spin up PostgreSQL (PostGIS), Redis, and OpenSearch with a single command:

```powershell
docker-compose up -d
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
