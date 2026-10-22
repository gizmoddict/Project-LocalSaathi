# LocalSaathi Payment API Specification (Phase 14)

## Base URL
`/api/v1/payments`

All authenticated endpoints require a Bearer JWT access token in the `Authorization` header:
```
Authorization: Bearer <jwt-access-token>
```

---

## Endpoints

### 1. Initiate Payment
- **Route**: `POST /api/v1/payments`
- **RBAC**: `EMPLOYER`, `ADMIN`
- **Request Body**:
```json
{
  "bookingId": "uuid-of-confirmed-booking",
  "amount": 3000,
  "currency": "INR",
  "idempotencyKey": "pay_unique_key_uuid",
  "metadata": {}
}
```
- **Responses**:
  - `201 Created` / `200 OK` (Replay): Returns created/existing `PaymentResponse`.
  - `400 Bad Request`: Invalid parameters or invalid booking state.
  - `403 Forbidden`: User is not the employer on this booking.
  - `409 Conflict`: Idempotency key reused with conflicting parameters.

---

### 2. Get Payment Details
- **Route**: `GET /api/v1/payments/:id`
- **RBAC**: Authenticated (`EMPLOYER`, `WORKER`, `ADMIN`, `MODERATOR`)
- **IDOR**: Caller must be payer, payee, or platform admin/moderator.
- **Responses**:
  - `200 OK`: Full payment details including attempts, refunds, and timestamps.
  - `403 Forbidden`: Unauthorized access.
  - `404 Not Found`: Payment ID does not exist.

---

### 3. List Current User Payments
- **Route**: `GET /api/v1/payments/mine`
- **RBAC**: Authenticated
- **Query Parameters**:
  - `page`: default 1
  - `limit`: default 20
  - `status`: filter by `PaymentStatus`
  - `bookingId`: filter by `bookingId`
- **Responses**:
  - `200 OK`: Paginated list of payments where user is payer or payee (all for admin).

---

### 4. Get Payment Audit Events
- **Route**: `GET /api/v1/payments/:id/events`
- **RBAC**: Authenticated (IDOR enforced)
- **Responses**:
  - `200 OK`: Chronological list of recorded `PaymentEvent` entries.

---

### 5. Request Refund
- **Route**: `POST /api/v1/payments/:id/refund`
- **RBAC**: `EMPLOYER`, `ADMIN`
- **IDOR**: Caller must be payer or admin.
- **Request Body**:
```json
{
  "amount": 750,
  "reason": "Contract scope adjusted",
  "idempotencyKey": "rfnd_unique_key_uuid"
}
```
- **Responses**:
  - `200 OK` / `201 Created`: Refund executed successfully.
  - `400 Bad Request`: Payment not in refundable state (`CAPTURED` or `DISPUTED`), or requested amount exceeds remaining captured balance.

---

### 6. Create Worker Payout
- **Route**: `POST /api/v1/payments/payouts`
- **RBAC**: `ADMIN`
- **Request Body**:
```json
{
  "workerId": "uuid-of-worker",
  "bookingId": "uuid-of-booking",
  "amount": 2250,
  "currency": "INR",
  "idempotencyKey": "pout_unique_key_uuid"
}
```
- **Responses**:
  - `201 Created`: Payout disbursed and recorded.

---

### 7. List Worker Payouts
- **Route**: `GET /api/v1/payments/payouts`
- **RBAC**: Authenticated
- **Query Parameters**: `workerId` (only allowed for ADMIN)
- **Responses**:
  - `200 OK`: List of payouts for authenticated worker.

---

### 8. Financial Reconciliation Report
- **Route**: `GET /api/v1/payments/reconciliation`
- **RBAC**: `ADMIN`
- **Responses**:
  - `200 OK`: Comprehensive audit discrepancy report with metrics, pending audits, and flagged issues.

---

### 9. Webhook Ingress
- **Route**: `POST /api/v1/payments/webhooks/:provider`
- **Public**: Verified via cryptographic header signature (`x-webhook-signature` or `x-razorpay-signature`)
- **Responses**:
  - `200 OK`: Webhook processed or recognized duplicate.
  - `401 Unauthorized`: Signature mismatch or missing secret.
