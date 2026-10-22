# LocalSaathi Payment Infrastructure Architecture (Phase 14)

## 1. Overview & System Purpose

The LocalSaathi Payment Infrastructure provides an end-to-end, provider-agnostic financial transaction, settlement, refund, and payout system. It mediates transactions between informal blue-collar workers and employers while strictly guaranteeing that:

1. **Local PostgreSQL is the sole durable source of truth**: External payment gateways (e.g. Razorpay, mock sandboxes) are third-party processing transports, never the system of record.
2. **Provider Abstraction**: All business and booking domains interact with payments exclusively via the `PaymentProvider` interface. Switching or adding payment gateways requires zero changes to core domain logic.
3. **Transaction Safety & Zero Loss**: Every state modification is wrapped in database transactions, emitting transactional outbox events to guarantee reliable notification and background job dispatch.
4. **Idempotency & Replay Protection**: Both REST API mutation endpoints and webhook ingress channels enforce database-level uniqueness, preventing double charges, conflicting edits, or duplicate webhook executions.
5. **Decoupled Payouts**: Customer collection (`Payment`) and worker disbursement (`Payout`) are intentionally partitioned into separate lifecycles, enabling escrow-like guarantees, dispute withholding, and batch reconciliation.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       LOCALSAATHI PAYMENT INFRASTRUCTURE                       │
├────────────────────┬────────────────────┬───────────────────────────────────────┤
│ Ingress & Orders   │ Webhooks & Events  │ Settlements & Reconciliations         │
├────────────────────┼────────────────────┼───────────────────────────────────────┤
│ • Client Idempotent│ • HMAC-SHA256 Sig  │ • Full / Partial Refunds              │
│ • State Machine    │ • Replay Protected │ • Remaining Balance Over-Refund Guard │
│ • IDOR Protected   │ • DB Event Log     │ • Worker Payouts (Admin / Automated)  │
│ • Provider Orders  │ • Outbox Dispatch  │ • Discrepancy & Fraud Scanning        │
└────────────────────┴────────────────────┴───────────────────────────────────────┘
```

---

## 2. Payment State Machine & Lifecycle

All payments undergo strict, deterministic state transitions governed by `PaymentStateMachine`:

```
                       ┌──────────────┐
                       │  INITIATED   │ (Order created on Provider & DB)
                       └──────┬───────┘
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │  AUTHORIZED  │ │   CAPTURED   │ │    FAILED    │ (Terminal)
     └──────┬───────┘ └──────┬───────┘ └──────────────┘
            │                │
            │ Auto-Capture   ├────────────────┐
            ▼                │                │
     ┌──────────────┐        ▼                ▼
     │   CAPTURED   │ ┌──────────────┐ ┌──────────────┐
     └──────────────┘ │   REFUNDED   │ │   DISPUTED   │
                      └──────────────┘ └──────┬───────┘
                                              │
                                              ▼
                                       ┌──────────────┐
                                       │   REFUNDED   │
                                       └──────────────┘
```

### Transition Matrix
- `INITIATED` $\rightarrow$ `AUTHORIZED`, `CAPTURED`, `FAILED`
- `AUTHORIZED` $\rightarrow$ `CAPTURED`, `FAILED`
- `CAPTURED` $\rightarrow$ `REFUNDED`, `DISPUTED`
- `DISPUTED` $\rightarrow$ `REFUNDED`, `CAPTURED`
- `FAILED` $\rightarrow$ *Terminal state* (No further transitions permitted)
- `REFUNDED` $\rightarrow$ *Terminal state* (No further transitions permitted)

Direct jumps from `INITIATED` to `REFUNDED`, or transitions out of `FAILED`/`REFUNDED`, are rejected with `400 Bad Request`.

---

## 3. Database Schema & Normalized Models

The subsystem introduces five normalized tables to ensure complete auditability:

### 1. `Payment`
- Stores primary transaction state, booking association, currency, amount, provider details, and captured timestamps.
- Unique constraint: `idempotency_key` (enforces single initiation per client transaction).

### 2. `PaymentAttempt`
- Tracks individual gateway interaction attempts (e.g., retries due to bank gateway drops, user switching UPI app to Card).
- Captures sanitized request payloads and raw provider responses.

### 3. `PaymentEvent`
- Immutable event audit log of all external and internal state mutations.
- Enforces `UNIQUE(event_id)` where `event_id` is supplied by the provider webhook to guarantee replay safety.

### 4. `Refund`
- Records partial and full refund transactions linked to a `Payment`.
- Contains `idempotency_key`, `provider_refund_id`, `amount`, and `status`.

### 5. `Payout`
- Disburses earned wages to workers for confirmed/completed bookings.
- Decouples employer payments from worker disbursements.
- Contains `worker_id`, `booking_id`, `amount`, `status`, and `provider_payout_id`.

---

## 4. Idempotency & Concurrency Guarantees

LocalSaathi implements a two-tier idempotency protocol:

### Client API Requests (`POST /api/v1/payments`, `POST /refund`, `POST /payouts`)
1. **Uniqueness**: Every mutation requires a client-supplied `idempotencyKey` UUID.
2. **Identical Replay**: If an existing record with the identical key has matching business parameters (`bookingId`, `amount`), the system idempotently returns the existing record with HTTP `200 OK`.
3. **Payload Conflict**: If a request reuses an `idempotencyKey` with different parameters (e.g. altered amount), the request is rejected immediately with HTTP `409 Conflict`.
4. **Database Guard**: Database-level unique indexes on `idempotencyKey` prevent race conditions across parallel application instances.

### Webhook Ingress (`POST /api/v1/payments/webhooks/:provider`)
1. **Signature Verification**: Every incoming webhook payload is verified using HMAC SHA-256 with the provider's webhook secret. Invalid signatures result in HTTP `401 Unauthorized`.
2. **Replay Ingress**: The webhook `event.id` is queried against the `PaymentEvent` table. If the event was already processed, the webhook immediately acknowledges with `{ received: true, duplicate: true }` without repeating state transitions or emitting redundant domain events.

---

## 5. Booking Lifecycle & IDOR Protection

Payments are deeply integrated into the booking lifecycle:
- Payments can only be initiated for bookings in valid operational states: `CONFIRMED`, `IN_PROGRESS`, or `COMPLETED`. Draft or cancelled bookings cannot receive payments.
- Only the employer associated with the booking (or platform `ADMIN`) can initiate payment for that booking.
- Workers (payees) and employers (payers) can inspect payment receipts for bookings they are party to. Unauthorized third-party users receive `403 Forbidden` / `404 Not Found`.

---

## 6. Financial Reconciliation Engine

The `ReconciliationService` performs cross-system audits across:
1. **PostgreSQL DB Records**: Current balances, captured sums, and refund sums.
2. **PaymentEvent Trail**: Verifies that state transitions correspond to recorded audit events.
3. **External Provider Status**: Compares local database records against provider query results to detect stale states or dropped webhooks.
