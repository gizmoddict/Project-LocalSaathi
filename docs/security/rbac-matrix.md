# LocalSaathi — Role-Based Access Control (RBAC) & Authorization Matrix

**Document Version:** 1.0.0  
**Phase:** Phase 17 — Complete Security Hardening  
**Date:** October 2026  
**Authorization Model:** Dual Layer (Role-Based Access Control via `RolesGuard` + Resource Ownership Validation / IDOR Prevention in Service Layer)

---

## 1. System Roles Definition

| Role | Hierarchy / Scope | Description |
|---|---|---|
| **PUBLIC** | Unauthenticated | Prospective users, anonymous visitors, external payment webhooks |
| **WORKER** | Blue-Collar Talent | Job seekers, identity verification submitters, contract workers |
| **EMPLOYER** | Hiring Entity | Individual households, contractors, business job posters |
| **SUPPORT** | First-tier Ops Staff | Read-only dispute viewer, user lookup, basic status inspection |
| **MODERATOR** | Trust & Safety Officer | Content moderation, dispute resolution, identity verification approval/rejection |
| **ADMIN** | Executive Operations | Complete platform control, financial payouts, reconciliation, role management |

---

## 2. Resource-Level Authorization Matrix

**Legend:**
- `ALLOW`: Permitted unconditionally
- `OWN`: Permitted only if the authenticated user is the direct owner of the resource
- `PARTY`: Permitted if the user is a registered participant (e.g. Worker or Employer on a Booking/Conversation)
- `DENY`: Strictly forbidden (returns HTTP 403 Forbidden or 401 Unauthorized)

### 2.1 Authentication & Profile Lifecycle

| Endpoint / Operation | Method | PUBLIC | WORKER | EMPLOYER | SUPPORT | MODERATOR | ADMIN |
|---|---|---|---|---|---|---|---|
| `/auth/otp/request` | POST | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `/auth/otp/verify` | POST | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `/auth/session/refresh` | POST | DENY | OWN | OWN | OWN | OWN | OWN |
| `/auth/session/revoke` | POST | DENY | OWN | OWN | OWN | OWN | OWN |
| `/workers/profile` (Create/Update) | POST/PUT | DENY | OWN | DENY | DENY | DENY | ALLOW |
| `/workers/profile` (Get Own) | GET | DENY | OWN | DENY | DENY | DENY | ALLOW |
| `/workers/photo` (Upload Avatar) | POST | DENY | OWN | DENY | DENY | DENY | ALLOW |
| `/employers/profile` (Create/Update)| POST/PUT | DENY | DENY | OWN | DENY | DENY | ALLOW |
| `/employers/profile` (Get Own) | GET | DENY | DENY | OWN | DENY | DENY | ALLOW |

### 2.2 Jobs & Applications

| Endpoint / Operation | Method | PUBLIC | WORKER | EMPLOYER | SUPPORT | MODERATOR | ADMIN |
|---|---|---|---|---|---|---|---|
| `/jobs` (List / Discover Active) | GET | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `/jobs/:id` (Get Details) | GET | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `/jobs` (Create Job) | POST | DENY | DENY | ALLOW | DENY | DENY | ALLOW |
| `/jobs/:id` (Update / Cancel Job) | PATCH/DELETE| DENY | DENY | OWN | DENY | DENY | ALLOW |
| `/applications` (Submit Application)| POST | DENY | ALLOW | DENY | DENY | DENY | DENY |
| `/applications/mine` (Worker Apps) | GET | DENY | OWN | DENY | DENY | DENY | ALLOW |
| `/applications/:id` (Get Application)| GET | DENY | OWN | PARTY | ALLOW | ALLOW | ALLOW |
| `/applications/:id/shortlist` | POST | DENY | DENY | PARTY | DENY | DENY | ALLOW |
| `/applications/:id/accept` | POST | DENY | DENY | PARTY | DENY | DENY | ALLOW |
| `/applications/:id/reject` | POST | DENY | DENY | PARTY | DENY | DENY | ALLOW |
| `/applications/:id/withdraw` | POST | DENY | OWN | DENY | DENY | DENY | ALLOW |

### 2.3 Bookings & Contracts

| Endpoint / Operation | Method | PUBLIC | WORKER | EMPLOYER | SUPPORT | MODERATOR | ADMIN |
|---|---|---|---|---|---|---|---|
| `/bookings` (Create Contract Offer) | POST | DENY | DENY | ALLOW | DENY | DENY | ALLOW |
| `/bookings/mine` (List User Bookings)| GET | DENY | OWN | OWN | DENY | DENY | ALLOW |
| `/bookings/:id` (Get Booking Details)| GET | DENY | PARTY | PARTY | ALLOW | ALLOW | ALLOW |
| `/bookings/:id/confirm` | POST | DENY | PARTY | PARTY | DENY | DENY | ALLOW |
| `/bookings/:id/start` | POST | DENY | PARTY | PARTY | DENY | DENY | ALLOW |
| `/bookings/:id/complete` | POST | DENY | PARTY | PARTY | DENY | DENY | ALLOW |
| `/bookings/:id/cancel` | POST | DENY | PARTY | PARTY | DENY | DENY | ALLOW |

### 2.4 Real-Time Messaging & Notifications

| Endpoint / Operation | Method | PUBLIC | WORKER | EMPLOYER | SUPPORT | MODERATOR | ADMIN |
|---|---|---|---|---|---|---|---|
| `/conversations` (List Active) | GET | DENY | OWN | OWN | DENY | DENY | ALLOW |
| `/conversations/:id/messages` (List)| GET | DENY | PARTY | PARTY | DENY | DENY | ALLOW |
| `/conversations/:id/messages` (Send)| POST | DENY | PARTY | PARTY | DENY | DENY | ALLOW |
| `/notifications` (List In-App) | GET | DENY | OWN | OWN | OWN | OWN | OWN |
| `/notifications/:id/read` | PATCH | DENY | OWN | OWN | OWN | OWN | OWN |
| `/notifications/preferences` | GET/PATCH| DENY | OWN | OWN | OWN | OWN | OWN |
| Socket.IO `/messages` Handshake | WSS | DENY | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| Socket.IO `/notifications` Handshake| WSS | DENY | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |

### 2.5 Payments, Escrow & Financial Operations

| Endpoint / Operation | Method | PUBLIC | WORKER | EMPLOYER | SUPPORT | MODERATOR | ADMIN |
|---|---|---|---|---|---|---|---|
| `/payments` (Initiate Escrow) | POST | DENY | DENY | ALLOW | DENY | DENY | ALLOW |
| `/payments/mine` (Payment History) | GET | DENY | OWN | OWN | DENY | DENY | ALLOW |
| `/payments/:id` (Payment Details) | GET | DENY | PARTY | PARTY | ALLOW | ALLOW | ALLOW |
| `/payments/:id/events` (Audit Log)| GET | DENY | PARTY | PARTY | ALLOW | ALLOW | ALLOW |
| `/payments/:id/refund` (Request) | POST | DENY | DENY | PARTY | DENY | DENY | ALLOW |
| `/payments/payouts/mine` | GET | DENY | OWN | DENY | DENY | DENY | ALLOW |
| `/payments/payouts` (Execute Payout) | POST | DENY | DENY | DENY | DENY | DENY | ALLOW |
| `/payments/reconciliation` | GET | DENY | DENY | DENY | DENY | DENY | ALLOW |
| `/payments/webhooks/:provider` | POST | ALLOW* | DENY | DENY | DENY | DENY | DENY |

*\*Public webhook endpoint guarded exclusively by cryptographic HMAC SHA-256 signature and replay prevention.*

### 2.6 Trust, Safety & Verification

| Endpoint / Operation | Method | PUBLIC | WORKER | EMPLOYER | SUPPORT | MODERATOR | ADMIN |
|---|---|---|---|---|---|---|---|
| `/verifications/submit` | POST | DENY | OWN | OWN | DENY | DENY | ALLOW |
| `/verifications/status` | GET | DENY | OWN | OWN | DENY | DENY | ALLOW |
| `/verifications/:id` | GET | DENY | OWN | OWN | ALLOW | ALLOW | ALLOW |
| `/documents/:id/download` | GET | DENY | OWN | OWN | DENY | ALLOW | ALLOW |
| `/moderation/cases` (List Queue) | GET | DENY | DENY | DENY | ALLOW | ALLOW | ALLOW |
| `/moderation/cases/:id/review` | POST | DENY | DENY | DENY | DENY | ALLOW | ALLOW |
| `/moderation/cases/:id/resolve` | POST | DENY | DENY | DENY | DENY | ALLOW | ALLOW |
| `/disputes` (Open Dispute) | POST | DENY | PARTY | PARTY | DENY | DENY | ALLOW |
| `/disputes/:id` (Get Dispute) | GET | DENY | PARTY | PARTY | ALLOW | ALLOW | ALLOW |
| `/disputes/:id/resolve` | POST | DENY | DENY | DENY | DENY | ALLOW | ALLOW |

### 2.7 Administrative Operations & System Observability

| Endpoint / Operation | Method | PUBLIC | WORKER | EMPLOYER | SUPPORT | MODERATOR | ADMIN |
|---|---|---|---|---|---|---|---|
| `/admin/users` (List / Search) | GET | DENY | DENY | DENY | ALLOW | ALLOW | ALLOW |
| `/admin/users/:id/status` (Suspend)| PATCH | DENY | DENY | DENY | DENY | ALLOW | ALLOW |
| `/admin/audit-logs` (View Trail) | GET | DENY | DENY | DENY | DENY | DENY | ALLOW |
| `/admin/system-health` | GET | DENY | DENY | DENY | DENY | ALLOW | ALLOW |
| `/admin/analytics` (Metrics Query) | GET | DENY | DENY | DENY | DENY | ALLOW | ALLOW |
| `/analytics/events` (Ingest Batch) | POST | ALLOW** | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |

*\*\*Public analytics ingestion rate-limited per IP/Session to prevent storage exhaustion.*

---

## 3. IDOR Defense Implementation Rules

1. **Explicit Identity Binding:**
   - Every service operation fetching user-specific records MUST enforce `userId: user.userId` in the Prisma query `where` clause.
   - Do NOT accept `userId` as an untrusted URL parameter or body attribute for operations performed on the caller's behalf.

2. **Party Membership Verification:**
   - On shared resources (Bookings, Conversations, Disputes), the query MUST verify:
     ```typescript
     const isParticipant = resource.workerId === user.userId || resource.employerId === user.userId;
     const isPrivileged = user.role === UserRole.ADMIN || user.role === UserRole.MODERATOR;
     if (!isParticipant && !isPrivileged) {
       throw new ForbiddenException('Access denied to requested resource');
     }
     ```

3. **Database-Level Defense:**
   - Sensitive child relationships (e.g., identity verification documents) MUST never be exposed without ownership or administrative role verification.
