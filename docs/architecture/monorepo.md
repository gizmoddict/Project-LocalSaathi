# LocalSaathi Monorepo Architecture & Dependency Boundaries

## 1. Overview

LocalSaathi uses an npm workspaces + Turborepo monorepo topology. The codebase is organized into **Applications** (`apps/`) and **Shared Packages** (`packages/`), flanked by containerized local infrastructure definitions (`infra/`).

```
/
├── apps/
│   ├── web/        # Next.js App Router (Worker & Employer Web PWA)
│   ├── api/        # NestJS REST API Core & WebSocket Gateway
│   └── worker/     # BullMQ Async Queue Consumer (Redis)
│
├── packages/
│   ├── ui/         # Accessible Tailwind Component System
│   ├── types/      # Domain-Independent Interfaces & DTO Contracts
│   ├── validation/ # Shared Zod Validation Schemas
│   └── config/     # Base TypeScript, ESLint, & Prettier Presets
│
├── infra/
│   ├── docker/     # Multi-stage production container definitions
│   ├── postgres/   # PostgreSQL 16 + PostGIS initialization scripts
│   ├── redis/      # Redis server configuration
│   └── opensearch/ # OpenSearch single-node configuration
│
└── docs/
    └── architecture/
```

---

## 2. Dependency Rules & Directionality

To maintain loose coupling and avoid circular references or monolithic leakage, all code imports must strictly obey the following dependency graph:

```
          apps/web                     apps/api                     apps/worker
       ┌─────┴─────┐                ┌─────┴─────┐                ┌─────┴─────┐
       │           │                │           │                │           │
       ▼           ▼                ▼           ▼                ▼           ▼
  packages/ui  packages/types  packages/types packages/validation packages/types packages/validation
       │           ▲                ▲           │
       └───────────┼────────────────┘           │
                   │                            │
                   └────────────────────────────┘
```

### Prohibited Import Paths:
1. **Never import between apps**:
   - `apps/web` MUST NOT import from `apps/api` or `apps/worker`.
   - `apps/api` MUST NOT import from `apps/web` or `apps/worker`.
   - `apps/worker` MUST NOT import from `apps/web` or `apps/api`.
2. **Never import from apps into packages**:
   - Shared packages in `packages/*` MUST NOT import any module from `apps/*`.
3. **Keep `packages/types` pure**:
   - `packages/types` must have zero runtime dependencies and contain only TypeScript types, interfaces, and enums.
4. **Keep `packages/ui` browser-focused**:
   - `packages/ui` must only contain React presentation components and must never couple to backend services or direct database queries.

---

## 3. Package & Application Responsibilities

| Subsystem | Responsibility | Runtime Stack |
| :--- | :--- | :--- |
| **`apps/web`** | User-facing web application for workers and employers. Low-bandwidth optimized, accessible, SSR + PWA. | Next.js 14/15, React, Tailwind CSS |
| **`apps/api`** | Central transactional REST API with Swagger/OpenAPI, versioned endpoints under `/api/v1`, centralized error handling, and WebSocket gateways. | NestJS 10, Express, Swagger |
| **`apps/worker`** | Decoupled background queue worker processing notifications, SMS OTPs, search indexing, and embedding generation. | BullMQ, IORedis, Node.js |
| **`packages/types`** | Canonical TypeScript types (enums, base entities, API envelopes, pagination shapes). | Pure TypeScript (zero runtime deps) |
| **`packages/validation`** | Standardized Zod schemas for environment variables, phone numbers, UUIDs, and input validation. | Zod, TypeScript |
| **`packages/ui`** | Reusable, accessible UI components (Button, Input, Card) with ARIA attributes and mobile-first touch targets. | React, Tailwind CSS |
| **`packages/config`** | Shared configs: `tsconfig/base.json`, `tsconfig/node.json`, `tsconfig/nextjs.json`, ESLint, and Prettier. | JSON / CommonJS |

---

## 4. API Error Envelope Convention

All API responses and errors adhere to strict JSON envelopes defined in `@localsaathi/types`:

### Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "timestamp": "2026-09-30T02:30:00.000Z"
}
```

### Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid phone number. Must be a valid 10-digit Indian mobile number.",
    "details": [ ... ]
  },
  "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "timestamp": "2026-09-30T02:30:00.000Z"
}
```
Stack traces are suppressed in production environments.
