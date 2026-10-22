# LocalSaathi Admin Operations REST API Specification

## Base URL
`/api/v1/admin`

All endpoints require standard Bearer token authentication via `Authorization: Bearer <JWT_ACCESS_TOKEN>`.
Unauthenticated requests receive `401 Unauthorized`.
Unauthorized roles receive `403 Forbidden`.

---

## Endpoints

### 1. GET `/overview`
Retrieves aggregated platform KPI metrics.
- **Allowed Roles**: `ADMIN`, `MODERATOR`, `SUPPORT`
- **Query Parameters**:
  - `startDate` (optional): ISO date string
  - `endDate` (optional): ISO date string
- **Response**:
```json
{
  "success": true,
  "data": {
    "dau": 100,
    "mau": 213,
    "registeredWorkers": 353,
    "registeredEmployers": 157,
    "activeWorkers": 167,
    "activeEmployers": 161,
    "activeJobs": 56,
    "jobsCreated": 120,
    "jobsCompleted": 0,
    "totalApplications": 70,
    "applicationToHireRate": 21.4,
    "matchRate": 1.25,
    "bookingCompletionRate": 5.9,
    "avgResponseTimeHours": 0,
    "totalPaymentVolumeInr": 6000,
    "successfulPaymentsCount": 2,
    "failedPaymentsCount": 0,
    "totalRefundsVolumeInr": 750,
    "successfulRefundsCount": 1,
    "totalReportsCount": 11,
    "suspendedUsersCount": 1,
    "activeDisputesCount": 0,
    "pendingVerificationsCount": 1,
    "pendingModerationCasesCount": 10,
    "timestamp": "2026-10-04T17:47:04.696Z"
  }
}
```

---

### 2. GET `/users`
Lists platform users with bounded pagination.
- **Allowed Roles**: `ADMIN`, `MODERATOR`, `SUPPORT`
- **Query Parameters**: `page`, `limit` (max 100), `search`, `role`, `accountStatus`, `verificationStatus`
- **Response**:
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "phone": "+919876543210",
        "role": "WORKER",
        "accountStatus": "ACTIVE",
        "verificationStatus": "VERIFIED",
        "createdAt": "2026-10-04T10:00:00.000Z"
      }
    ],
    "total": 510,
    "page": 1,
    "limit": 20
  }
}
```

---

### 3. GET `/users/:id`
Retrieves comprehensive details for a specific user without leaking credentials or secrets.
- **Allowed Roles**: `ADMIN`, `MODERATOR`, `SUPPORT`

---

### 4. POST `/users/:id/suspend`
Administratively suspends a user, invalidates all active sessions, and logs an immutable audit event.
- **Allowed Roles**: `ADMIN`
- **Body**:
```json
{
  "reason": "Violation of community standards",
  "internalNotes": "Verified via user report #123"
}
```

---

### 5. POST `/users/:id/reinstate`
Reinstates a suspended user account and logs an audit event.
- **Allowed Roles**: `ADMIN`
- **Body**:
```json
{
  "reason": "Appeal accepted",
  "internalNotes": "Restoring account access"
}
```

---

### 6. GET `/workers`
Lists registered worker profiles with skills and rating summaries.
- **Allowed Roles**: `ADMIN`, `MODERATOR`, `SUPPORT`

---

### 7. GET `/employers`
Lists registered employer profiles with business establishment data.
- **Allowed Roles**: `ADMIN`, `MODERATOR`, `SUPPORT`

---

### 8. GET `/jobs`
Lists job postings across the platform.
- **Allowed Roles**: `ADMIN`, `MODERATOR`, `SUPPORT`

---

### 9. POST `/jobs/:id/pause`
Administratively pauses a published job posting.
- **Allowed Roles**: `ADMIN`, `MODERATOR`
- **Body**:
```json
{
  "reason": "Administrative safety review"
}
```

---

### 10. POST `/jobs/:id/resume`
Resumes a paused job posting.
- **Allowed Roles**: `ADMIN`, `MODERATOR`

---

### 11. GET `/reports`
Lists platform abuse reports.
- **Allowed Roles**: `ADMIN`, `MODERATOR`, `SUPPORT`

---

### 12. GET `/disputes`
Lists booking disputes.
- **Allowed Roles**: `ADMIN`, `MODERATOR`, `SUPPORT`

---

### 13. GET `/verifications`
Lists identity verification queues with data-minimized metadata.
- **Allowed Roles**: `ADMIN`, `MODERATOR`, `SUPPORT`

---

### 14. GET `/moderation`
Lists moderation triage cases.
- **Allowed Roles**: `ADMIN`, `MODERATOR`

---

### 15. POST `/moderation/:id/claim`
Claims a moderation case.
- **Allowed Roles**: `ADMIN`, `MODERATOR`

---

### 16. POST `/moderation/:id/resolve`
Resolves a moderation case with a designated action and notes.
- **Allowed Roles**: `ADMIN`, `MODERATOR`

---

### 17. GET `/payments`
Returns sanitized financial ledger transactions.
- **Allowed Roles**: `ADMIN`

---

### 18. GET `/analytics`
Returns aggregate liquidity, conversion, and retention analytics.
- **Allowed Roles**: `ADMIN`, `MODERATOR`

---

### 19. GET `/system-health`
Returns live system diagnostic status and component latencies.
- **Allowed Roles**: `ADMIN`

---

### 20. GET `/audit-logs`
Returns the append-only audit trail.
- **Allowed Roles**: `ADMIN`
