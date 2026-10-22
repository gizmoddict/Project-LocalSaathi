# LocalSaathi Authentication & RBAC Architecture (Phase 3)

## 1. Overview

LocalSaathi implements a production-grade, privacy-first authentication and authorization system tailored for informal and skilled blue-collar workers, employers, contractors, and administrators in the Indian market.

The primary authentication mechanism is **Mobile Phone Number + Cryptographic OTP Verification**, paired with short-lived **JWT Access Tokens** and database-backed **Rotating Refresh Tokens** with automated token-reuse attack detection.

```
┌─────────────────┐       POST /api/v1/auth/otp/request        ┌──────────────────┐
│   Web / Mobile  │ ─────────────────────────────────────────► │     Auth API     │
│     Client      │ ◄───────────────────────────────────────── │   (NestJS API)   │
└────────┬────────┘         Generic Success (Anti-Enum)        └────────┬─────────┘
         │                                                              │
         │                POST /api/v1/auth/otp/verify                  │
         ├─────────────────────────────────────────────────────────────►│
         │                                                              │
         │                                                    ┌─────────┴─────────┐
         │                                                    │   PostgreSQL DB   │
         │                                                    │  (otp_challenges, │
         │                                                    │  users, sessions) │
         │                                                    └───────────────────┘
         │                                                              │
         │ ◄────────────────────────────────────────────────────────────┘
         ▼   Returns: Access Token (JSON) + Refresh Token (HttpOnly Cookie)
```

---

## 2. Phone Number Handling & Anti-Enumeration

- **Canonical Format:** Strict Indian 10-digit mobile number normalization (`[6-9]\d{9}`). Automatically cleans and normalizes prefixes (`+91`, `91`, formatting dashes/spaces).
- **Anti-Enumeration Defense:** The `/auth/otp/request` endpoint always returns a constant-time generic message (`"If the phone number is valid, a verification OTP code has been dispatched."`) regardless of whether the user is already registered or a newcomer. Attackers cannot query the endpoint to determine user existence.
- **Just-In-Time Registration:** New users are automatically registered upon verifying their first OTP challenge without leaking registration states in advance.

---

## 3. Cryptographic OTP Lifecycle

```
Client Request ──► Rate Limit Check ──► Cooldown Check (60s)
                       │
                       ▼
              crypto.randomInt() ──► 6-Digit OTP (e.g. "839201")
                       │
                       ├──────► HMAC-SHA256(pepper) ──► Persist in `otp_challenges`
                       │                                (Never stores raw OTP)
                       │
                       └──────► SmsProvider.sendOtp()
                                (Development simulator or Production Gateway)
```

### Key Security Safeguards:
1. **Cryptographic Randomness:** Generated exclusively via Node's `crypto.randomInt()`. `Math.random()` is strictly prohibited.
2. **Peppered HMAC-SHA256:** The challenge record stores only `otp_hash`. Plaintext OTPs never touch the database.
3. **Resend Cooldown:** Enforces a minimum 60-second cooldown (`OTP_RESEND_COOLDOWN_SECONDS`) between successive OTP requests for the same phone number.
4. **Previous Invalidation:** Requesting a new OTP immediately cancels and marks all previous pending challenges for that phone as consumed.
5. **Attempt Limiting:** Maximum 3 verification attempts (`OTP_MAX_ATTEMPTS`). Exceeding the threshold permanently locks and consumes the challenge.
6. **Timing-Safe Equality:** Hash comparison executes using `crypto.timingSafeEqual()` to defeat side-channel timing attacks.
7. **Single-Use Consumption:** Upon successful verification, the challenge is immediately stamped with `consumed_at = NOW()`, permanently preventing replay attacks.
8. **Zero Logging:** OTP values are never logged in application logs or returned in HTTP responses.

---

## 4. Token & Session Architecture

### Access Tokens (Stateless & Short-Lived)
- **Format:** Standard JSON Web Token (JWT) signed with HMAC-SHA256.
- **Lifetime:** 15 minutes (`JWT_ACCESS_EXPIRES_IN=15m`).
- **Strict Privacy Principle (Zero PII):**
  ```json
  {
    "sub": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "sessionId": "7b1d4289-498c-4a3b-9e45-1c88d8b991b1",
    "role": "WORKER",
    "iat": 1774992000,
    "exp": 1774992900
  }
  ```
  *No phone numbers, names, locations, wages, or sensitive identifiers are embedded inside the JWT payload.*

### Refresh Tokens & Database Sessions (Stateful & Rotated)
- **Format:** 40-byte cryptographically secure random hexadecimal string (`crypto.randomBytes(40).toString('hex')`).
- **Database Storage:** Only the HMAC-SHA256 hash of the refresh token is stored in the `sessions` table (`session_token_hash`).
- **Lifetime:** 7 days (`JWT_REFRESH_EXPIRES_IN=7d`).
- **Transport:** Delivered in an **HttpOnly, SameSite=Lax, Secure (in production)** cookie (`localsaathi_refresh_token`), protecting browser clients from XSS token theft. A fallback JSON body option is supported for native mobile/PWA environments.

---

## 5. Refresh Token Rotation & Reuse Detection (Breach Defense)

Every time `POST /api/v1/auth/refresh` is called:
1. The submitted refresh token is hashed.
2. **Valid Rotation:** If it matches `session_token_hash`:
   - A new refresh token is generated.
   - The session record is updated: `session_token_hash` becomes the new hash, and the old hash is retained in `previous_token_hash`.
   - A fresh 15-minute access token is issued.
3. **Token Reuse Attack Detection:** If the incoming token matches `previous_token_hash`:
   - An attacker or compromised client attempted to replay an already-rotated token.
   - LocalSaathi triggers **immediate automatic breach mitigation**:
     - The compromised session is revoked.
     - **ALL active sessions for that user are immediately revoked** (`revoked_at = NOW()`).
     - A high-severity security alert is recorded in `audit_logs` (`action = 'TOKEN_REUSE_DETECTED'`).
     - The request is terminated with `401 Unauthorized`.

---

## 6. Role-Based Access Control (RBAC)

Supported Roles:
- `WORKER`: Informal and skilled service providers.
- `EMPLOYER`: Contractors, households, small businesses posting jobs.
- `ADMIN`: Platform operators.
- `MODERATOR`: Content and dispute supervisors.
- `SUPPORT`: Customer support agents.

### Server-Side Guards & Decorators:
- `@Public()`: Marks endpoints accessible without authentication (e.g. health checks, OTP request/verify).
- `@Roles(...roles: UserRole[])`: Declares role requirements on controller classes or handler methods.
- `@CurrentUser()`: Extracts strongly-typed `AuthenticatedUser` (`{ userId, sessionId, role }`) from the request context.
- `JwtAuthGuard`: Validates bearer token signature, checks active non-revoked session in PostgreSQL, and ensures the user is not suspended or deactivated.
- `RolesGuard`: Verifies that `user.role` fulfills the `@Roles()` criteria. Rejects unauthorized attempts with `403 Forbidden`.

### Privilege Escalation Prevention:
Self-registration through `POST /auth/otp/verify` strictly allows only `WORKER` or `EMPLOYER` roles. Clients attempting to register as `ADMIN`, `MODERATOR`, or `SUPPORT` are rejected with `400 Bad Request`. Privileged accounts must be provisioned through protected administrative seed or migration operations.

---

## 7. Account Lifecycle & Statuses

- `ACTIVE`: Fully functional account.
- `PENDING_VERIFICATION`: Registered user prior to completing identity verification (access allowed to onboarding).
- `SUSPENDED`: Suspended accounts are immediately blocked at the guard level; all session refresh attempts and API calls are rejected with `403 Forbidden`.
- `DELETED`: Soft-deleted / deactivated accounts. Blocked from authentication. Compliance audit records are immutably preserved.

---

## 8. Rate Limiting Architecture

| Target | Window | Max Allowable | Identifier |
| :--- | :--- | :--- | :--- |
| **OTP Request** | 15 minutes | 5 requests | Phone number & IP address |
| **OTP Verify** | 15 minutes | 5 attempts | Phone number & IP address |
| **Session Refresh** | 1 minute | 30 requests | Session ID & IP address |

Implemented via `AuthRateLimiterService`. Configurable through environment variables (`RATE_LIMIT_OTP_REQUESTS`, `RATE_LIMIT_OTP_VERIFY`).

---

## 9. API Reference

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/otp/request` | Public | Request OTP code for phone login/registration |
| `POST` | `/api/v1/auth/otp/verify` | Public | Verify OTP challenge, issue access JWT + refresh token |
| `POST` | `/api/v1/auth/refresh` | Public (Cookie/Body) | Rotate refresh token and receive new access token |
| `POST` | `/api/v1/auth/logout` | Bearer JWT | Invalidate current session and clear auth cookie |
| `POST` | `/api/v1/auth/logout-all` | Bearer JWT | Invalidate all sessions across all user devices |
| `GET` | `/api/v1/auth/me` | Bearer JWT | Fetch minimal self profile (`id`, `role`, `status`) |
| `GET` | `/api/v1/auth/sessions` | Bearer JWT | List active devices and sessions for user |
| `DELETE`| `/api/v1/auth/sessions/:id`| Bearer JWT | Revoke specific session by ID |

---

## 10. Development SMS Simulator vs Production

- **Development (`SMS_PROVIDER=development`):**
  Uses `DevelopmentSmsProvider`. In local environments, safe development logs display simulated dispatch. If accidentally executed in `NODE_ENV=production`, it immediately throws a fatal exception.
- **Production (`SMS_PROVIDER=production`):**
  Uses `ProductionSmsProvider`. Requires explicit `SMS_PROVIDER_API_KEY` and gateway credentials in the environment. If credentials are missing, it fails explicitly with structured error logging. Plaintext OTPs are never logged.
