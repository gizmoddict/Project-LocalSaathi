# LocalSaathi Trust, Verification & Safety Platform Architecture (Phase 13)

## 1. Overview & System Purpose

The Trust, Verification & Safety Platform provides the essential compliance, integrity, and safety layer for LocalSaathi. It protects informal blue-collar workers and employers through:

1. **Identity & Document Verification Workflow**: Multi-tier worker and employer identity verification with strict MIME, magic byte, and file-size constraints.
2. **Abuse, Fraud & Safety Reporting**: First-class reporting across Users, Jobs, and Messages with rate limiting and duplicate-report spam guards.
3. **Operational Moderation Engine**: Centralized case management, priority queues, and atomic case claim/resolve lifecycles.
4. **Granular Capability Restrictions & Suspension**: Non-destructive operational restrictions (`CANNOT_MESSAGE`, `CANNOT_POST_JOBS`, `CANNOT_APPLY`, `CANNOT_ACCEPT_BOOKINGS`) and immediate session-revoking account suspension.
5. **Non-Financial Operational Dispute Mediation**: Dispute handling for agreed scope, attendance, and behavioral conflicts on confirmed bookings without financial/escrow liability.
6. **Immutable Audit Trails**: Tamper-proof audit logging for every administrative/moderator intervention.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LOCALSAATHI TRUST & SAFETY                           │
├────────────────────┬────────────────────┬───────────────────────────────────────┤
│ Verification       │ Reporting & Safety │ Moderation & Enforcement              │
├────────────────────┼────────────────────┼───────────────────────────────────────┤
│ • Aadhaar / PAN    │ • User Reports     │ • Queue Management (Priority)         │
│ • Business License │ • Job Reports      │ • Capability Restrictions (Scattered) │
│ • Document Meta    │ • Message Reports  │ • Account Suspension (Session Revoke) │
│ • Anti-Tamper Keys │ • Anti-Spam Guards │ • Operational Dispute Resolution      │
└────────────────────┴────────────────────┴───────────────────────────────────────┘
```

---

## 2. Verification Lifecycle & State Machine

Every identity verification follows a deterministic state machine:

```
                  ┌──────────────┐
                  │  UNVERIFIED  │ (Default for new accounts)
                  └──────┬───────┘
                         │ Submit Documents
                         ▼
                  ┌──────────────┐
                  │   PENDING    │ (Moderation case created)
                  └──────┬───────┘
                         │ Moderator Claim
                         ▼
                  ┌──────────────┐
                  │ UNDER_REVIEW │
                  └──────┬───────┘
             Approve ────┴──── Reject / Expire
            ┌────────┘        └────────┐
            ▼                          ▼
     ┌──────────────┐           ┌──────────────┐
     │   VERIFIED   │           │   REJECTED   │
     └──────┬───────┘           └──────┬───────┘
            │ Document Expired         │ User Re-submits
            ▼                          ▼
     ┌──────────────┐           ┌──────────────┐
     │   EXPIRED    │           │   PENDING    │
     └──────────────┘           └──────────────┘
```

### Verification Rules
- Users cannot have multiple overlapping `PENDING` or `UNDER_REVIEW` verification requests.
- Submitting verification updates `User.verificationStatus = 'PENDING'` and creates a `ModerationCase` with priority `MEDIUM` or `HIGH`.
- Verification documents are recorded only as metadata references (storage keys, SHA-256 hashes, MIME types, byte sizes); actual binary data resides in private object storage.
- Document validation enforces:
  - Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
  - Maximum file size: `5MB` (`5,242,880 bytes`).
  - Storage key format: `verifications/:userId/:documentId.:ext`.

---

## 3. Reporting Subsystem & Anti-Spam Safeguards

Users can report violations across three domain targets:

| Target | Endpoint | Validation & Safeguards |
| :--- | :--- | :--- |
| **User** | `POST /api/v1/users/:id/reports` | Self-reporting prohibited; Duplicate active report blocked. |
| **Job Post** | `POST /api/v1/jobs/:id/reports` | Employer cannot report own job; Duplicate active report blocked. |
| **Message** | `POST /api/v1/messages/:id/reports` | Reporter must be a member of the conversation. |

### Case Queuing
Every report atomically:
1. Creates a `Report` record with status `PENDING`.
2. Creates or links a `ModerationCase` (`caseType = 'REPORT'`).
3. Dispatches a `USER_REPORTED` outbox and domain event for asynchronous notification delivery to on-duty safety teams.
4. Records an immutable audit log entry.

---

## 4. Moderation Engine & Priority Queues

Moderation endpoints are protected by `JwtAuthGuard` and `RolesGuard`, restricted strictly to `ADMIN` and `MODERATOR` roles.

### Case Priority Matrix
- `CRITICAL`: Immediate safety threat, physical violence, harassment report.
- `HIGH`: Confirmed booking dispute, fraudulent job posting.
- `MEDIUM`: Standard identity verification, repeated user reporting.
- `LOW`: Routine profile updates, minor discrepancy checks.

### Case Action Workflow
1. **Claim Case**: Atomically transitions `PENDING` $\rightarrow$ `UNDER_REVIEW`, assigning `assignedToId = moderatorId`.
2. **Resolve Case**: Moderator supplies resolution type (`WARNING`, `CONTENT_REMOVAL`, `CAPABILITY_RESTRICTION`, `SUSPENSION`, `APPROVE_VERIFICATION`, `REJECT_VERIFICATION`) and resolution notes. Case status transitions to `RESOLVED`.
3. **Dismiss Case**: Transitions case to `DISMISSED` with explanatory rationale.
4. **Escalate Case**: Transitions case to `ESCALATED`, raising priority to `CRITICAL` for senior supervisor evaluation.

---

## 5. Account Suspension & Capability Restrictions

Rather than binary account deletion, LocalSaathi enforces tiered enforcement:

### 1. Capability Restrictions
Capability restrictions allow a user to remain active on the platform while restricting specific high-risk actions:

| Restriction Type | Impacted Service & Guard |
| :--- | :--- |
| `CANNOT_MESSAGE` | Blocks `MessageService.sendMessage` with `403 Forbidden`. |
| `CANNOT_POST_JOBS` | Blocks `JobService.createJob` with `403 Forbidden`. |
| `CANNOT_APPLY` | Blocks `ApplicationService.applyForJob` with `403 Forbidden`. |
| `CANNOT_ACCEPT_BOOKINGS` | Blocks `BookingService.confirmBooking` with `403 Forbidden`. |

Restrictions can be permanent or time-bound (`expiresAt`). Active restrictions are evaluated in realtime across domain services.

### 2. Account Suspension
When severe violations occur:
1. `User.accountStatus` transitions from `ACTIVE` to `SUSPENDED`.
2. All active user sessions in `Session` table are immediately revoked (`revokedAt = NOW()`).
3. `JwtAuthGuard` rejects all requests from suspended accounts with `403 Forbidden`.
4. Refresh token rotation immediately rejects token renewal for suspended users.

---

## 6. Operational Booking Disputes

Disputes address real-world operational friction:
- No-show by employer or worker
- Misrepresentation of site conditions or required tools
- Dispute over scope expansion without prior agreement
- Unprofessional or unsafe conduct on site

### Non-Financial Scope
Disputes are strictly **operational and non-arbitral**. LocalSaathi facilitates platform mediation, warning issuance, and contract status resolution, but explicitly does NOT handle escrow, payment withholding, or financial arbitration in this phase.

---

## 7. Event-Driven Notification Integration

Safety actions publish transactional events through the Phase 10 Outbox:

```
Moderator Action ──► Transactional Outbox ──► Async Outbox Worker
                            │
                            ├──────► Domain Event Service
                            │
                            └──────► Notification Service
                                           │
                                           ├──────► In-App Notification (Postgres)
                                           └──────► Real-Time Socket.IO (/notifications)
```

Events dispatched:
- `VERIFICATION_APPROVED` $\rightarrow$ Informs user that their trust badge is active.
- `VERIFICATION_REJECTED` $\rightarrow$ Informs user of reason and re-submission path.
- `ACCOUNT_SUSPENDED` $\rightarrow$ Informs user of policy violation and appeals procedure.
- `USER_RESTRICTED` $\rightarrow$ Informs user of temporary feature limitations.
- `DISPUTE_RAISED` / `DISPUTE_RESOLVED` $\rightarrow$ Notifies both parties of operational dispute updates.

---

## 8. Database Models

The Trust & Safety schema extends the database without disrupting prior phases:

- `identity_verifications`: Tracks worker/employer document verification state.
- `documents`: Stores document metadata (MIME type, size, storage key, SHA-256 hash).
- `reports`: Stores complaints on users, jobs, and messages.
- `moderation_cases`: Centralized case tracking with case number and status FSM.
- `moderation_case_actions`: Immutable ledger of every action taken by moderators on a case.
- `user_restrictions`: Active and historical capability restrictions on users.
- `disputes`: Operational dispute records attached to bookings.
