# LocalSaathi — Data Integrity & Financial Consistency Architecture

## 1. Data Integrity Strategy

In LocalSaathi, data integrity safeguards both relational consistency across complex micro-domain models (Workers, Employers, Jobs, Applications, Bookings, Ratings) and mathematical correctness across financial state machines (Escrow, Captures, Refunds, Payouts).

Integrity is preserved through three distinct layers:
1. **Database-Enforced Invariants:** Foreign keys with strict constraints, unique composite indices, and database triggers where appropriate.
2. **Transactional Domain Boundaries:** Unit-of-work state mutations encapsulated in Prisma `$transaction` blocks ensuring atomic updates alongside the Transactional Outbox.
3. **Automated DR & Post-Restore Integrity Auditing (`npm run db:integrity`):** Periodic and post-incident verification of cross-table invariants.

---

## 2. Structural & Relational Integrity Checks

The integrity audit engine evaluates eight domain checks:

### 2.1 Foreign Key Orphan Detection
Detects dangling child records that lost parent association due to partial database operations or corrupted restore sets:
* `WorkerProfile` must point to a valid `User` (`userId`).
* `EmployerProfile` must point to a valid `User` (`userId`).
* `Job` must point to a valid employer `User` (`employerId`).
* `Application` must point to valid `Job` (`jobId`) and worker `User` (`workerId`).
* `Booking` must point to valid `Job`, `User` (worker), and `User` (employer).
* `Refund` must point to a valid `Payment` (`paymentId`).

### 2.2 Domain State Constraints
* **Job Application State:** If an `Application` has status `ACCEPTED`, there must exist an associated `Booking` linking the worker and employer.
* **Booking State Consistency:** A `Booking` in status `COMPLETED` cannot have an active or uncaptured `Payment`.

---

## 3. Financial Consistency & Reconciliation Architecture

Financial transactions in LocalSaathi follow strict double-entry and external reconciliation rules.

```
       +-------------------------------------------------------------+
       |                  Booking Confirmed / Escrow                 |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |              Local Payment Record Created                   |
       |      - status: PENDING / CAPTURED                           |
       |      - amount > 0                                           |
       |      - idempotencyKey: UNIQUE                               |
       +-------------------------------------------------------------+
                                      |
                         Reconciliation / DR Audit
                                      v
       +-------------------------------------------------------------+
       |             External Payment Gateway Check                  |
       |                   (Razorpay / Stripe)                       |
       +-------------------------------------------------------------+
               |                                            |
         State Match                                State Mismatch
               v                                            v
    [NORMAL OPERATION]                     [Mark PENDING_RECONCILIATION]
                                           [Trigger Operator Alert]
                                           [Do NOT Auto-Mutate Balances]
```

### 3.1 Financial Invariants
1. **Non-Negative Amounts:** Every `Payment` and `Refund` amount must be strictly greater than zero ($amount > 0$).
2. **Refund Boundary Rule:** The sum of all refunds issued against a specific payment must never exceed the captured payment amount:
   $$\sum \text{Refund.amount} \le \text{Payment.amount}$$
3. **Strict Financial Idempotency:** Each payment creation attempt requires a client-generated or server-derived `idempotencyKey`. Duplicate idempotency keys targeting conflicting amounts or bookings trigger immediate audit failure.
4. **Non-Destructive Anomaly Handling:** If an external payment status cannot be confirmed during restore, the local record is tagged `PENDING_RECONCILIATION`. System logic forbids automatic balance alterations or transaction purges without human operator sign-off.

---

## 4. Integrity Check Severities & Anomaly Codes

| Anomaly Code | Severity | Root Cause / Impact | Action Required |
| :--- | :--- | :--- | :--- |
| `ORPHAN_WORKER_PROFILE` | **FAIL** | User record missing for worker profile. | Investigate deletion log; restore user or archive profile. |
| `ORPHAN_JOB_EMPLOYER` | **FAIL** | Employer user missing for job. | Reconnect employer ID or close job. |
| `NEGATIVE_PAYMENT_AMOUNT` | **FAIL** | Payment amount is negative; invalid invariant. | Isolate payment; initiate fraud investigation. |
| `REFUND_EXCEEDS_PAYMENT` | **FAIL** | Sum of refunds exceeds original payment. | Block further payouts; investigate accounting ledger. |
| `DUPLICATE_FINANCIAL_IDEMPOTENCY_KEY` | **FAIL** | Same idempotency key used for multiple payments. | Verify gateway charge records for duplicate billing. |
| `UNCERTAIN_PAYMENT_STATE_FLAGGED` | **WARN** | Payment status is `PENDING_RECONCILIATION`. | Query payment gateway API to confirm capture or decline. |
| `STALE_OUTBOX_EVENT_DETECTED` | **WARN** | Outbox event in `PROCESSING` status $> 5$ minutes. | Reset event status to `PENDING` to resume background processing. |
