# LocalSaathi Admin Operations Dashboard & Governance Console

## 1. Overview & Architecture

The **LocalSaathi Admin Operations Dashboard** (Phase 15) is an operational and governance interface designed to run directly over the verified domain services of Phases 1–14 (authentication, RBAC, workers, employers, jobs, applications, matching, bookings, messaging, notifications, trust & safety, moderation, disputes, and payments).

It adheres to strict architectural boundaries:
- **Zero Business Logic Duplication**: Frontend admin views act purely as operational presentations over backend services.
- **Backend-Enforced Authorization**: In addition to Next.js route middleware/layout checks, every single API route strictly enforces `JwtAuthGuard`, `RolesGuard`, and role metadata `@Roles(UserRole.ADMIN, ...)`.
- **Live PostgreSQL Aggregations**: KPI metrics (DAU, MAU, registration numbers, match rates, hire rates, completion rates, gross transaction volume) are computed from real PostgreSQL relations without mocking or fake counters.
- **Data Minimization & Privacy Protection**: Zero credentials, password hashes, OTP secrets, or session tokens are exposed in admin responses. Identity verification documents are delivered with masked identifiers and strictly sanitized metadata—zero permanent public document URLs are ever returned to the client.
- **Immutable Auditability**: Destructive or critical administrative actions (suspending a user, reinstating an account, pausing/resuming a job, claiming or resolving moderation cases) are recorded into an append-only `AuditLog` table with composite indexes on `(createdAt DESC)` and `(action, createdAt DESC)`.

---

## 2. Admin RBAC Capabilities Map

| Capability | ADMIN | MODERATOR | SUPPORT | WORKER | EMPLOYER |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `VIEW_METRICS` | ✅ | ✅ | ✅ | ❌ (403) | ❌ (403) |
| `VIEW_USERS` | ✅ | ✅ | ✅ | ❌ (403) | ❌ (403) |
| `MANAGE_USERS` (Suspend / Reinstate) | ✅ | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| `VIEW_WORKERS` | ✅ | ✅ | ✅ | ❌ (403) | ❌ (403) |
| `VIEW_EMPLOYERS` | ✅ | ✅ | ✅ | ❌ (403) | ❌ (403) |
| `VIEW_JOBS` | ✅ | ✅ | ✅ | ❌ (403) | ❌ (403) |
| `MANAGE_JOBS` (Pause / Resume) | ✅ | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |
| `VIEW_REPORTS` | ✅ | ✅ | ✅ | ❌ (403) | ❌ (403) |
| `MANAGE_REPORTS` | ✅ | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |
| `VIEW_DISPUTES` | ✅ | ✅ | ✅ | ❌ (403) | ❌ (403) |
| `MANAGE_DISPUTES` | ✅ | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |
| `VIEW_VERIFICATIONS` | ✅ | ✅ | ✅ | ❌ (403) | ❌ (403) |
| `MANAGE_VERIFICATIONS` | ✅ | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |
| `VIEW_MODERATION` | ✅ | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |
| `MANAGE_MODERATION` | ✅ | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |
| `VIEW_PAYMENTS` | ✅ | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| `MANAGE_PAYMENTS` | ✅ | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| `VIEW_AUDIT_LOGS` | ✅ | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| `VIEW_SYSTEM_HEALTH` | ✅ | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |
| `VIEW_ANALYTICS` | ✅ | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |

---

## 3. Web Navigation & Route Structure

The web application is implemented in `apps/web/src/app/admin` using the Next.js App Router:

1. `/admin`: Primary operational dashboard featuring real-time KPI metric cards (DAU, MAU, registered workers/employers, match rate, hire rate, booking completion rate, gross payment volume, pending verifications, active disputes, and open abuse reports).
2. `/admin/users`: Searchable, paginated user management directory with role and account status filters, inspection drawer, and administrative suspension/reinstatement dialogs.
3. `/admin/workers`: Worker directory displaying verification status, primary trade skills, locations, average ratings, and review counts.
4. `/admin/employers`: Employer directory showing business trade names, jobs posted, and verification states.
5. `/admin/jobs`: Job postings management table with status filtering, wage parameters, applicant count, and administrative pause/resume operations.
6. `/admin/reports`: Trust & Safety abuse reports queue for user, job, and messaging complaints.
7. `/admin/disputes`: Mediation queue for non-financial booking and contract disputes.
8. `/admin/payments`: Financial transaction ledger with sanitized payment data, amount in INR, booking references, and PCI-compliant data masking.
9. `/admin/verifications`: Identity verification review queue with document type and masked document numbers.
10. `/admin/moderation`: Central triage queue for incident handling with claim and resolution dispositions.
11. `/admin/analytics`: Liquidity and performance breakdowns, hiring funnels, and transaction metrics.
12. `/admin/system-health`: Live infrastructure diagnostic board showing PostgreSQL latency, Redis ping, outbox backlog, and WebSocket connections.
13. `/admin/audit-logs`: Immutable audit log trail viewer with actor ID, action names, target entity references, and structured metadata.

---

## 4. Query Bounds & Performance

All listing endpoints strictly enforce bounded pagination via Zod schemas:
- Minimum page: 1
- Minimum limit: 1
- Default limit: 20
- Maximum limit: 100
- Composite database indexes applied for fast sorting on `createdAt DESC` and filtered lookups.
