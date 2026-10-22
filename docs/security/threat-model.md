# LocalSaathi — Threat Model & Security Architecture

**Document Version:** 1.0.0  
**Phase:** Phase 17 — Complete Security Hardening  
**Date:** October 2026  
**Methodology:** STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)  

---

## 1. System Architecture & Trust Boundaries

LocalSaathi is a hyperlocal, high-trust blue-collar employment platform operating in India. The application handles identity verification (Aadhaar, PAN, driving licenses), financial transactions (escrow, payouts, refunds via Razorpay), exact geospatial geolocation data (PostGIS), and bidirectional real-time communications.

```
                    ┌────────────────────────────────────────────────────────┐
                    │               UNTRUSTED EXTERNAL ZONE                  │
                    │  [Web Browser / Mobile Client]     [Automated Bots]    │
                    │  [Third-Party Razorpay Webhook]    [SMS Gateway Webhook│
                    └──────────────────────────┬─────────────────────────────┘
                                               │
                                 HTTPS / WSS   │  TLS 1.3 / Strict CORS / CSP
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ TRUST BOUNDARY 1: EDGE & API GATEWAY                                                    │
│  - Reverse Proxy / Nginx / NestJS API Gateway (Port 4000)                              │
│  - Helmet Security Headers (HSTS, NoSniff, FrameGuard DENY, CSP)                       │
│  - Strict Allowed-Origin CORS Validation                                                │
│  - Body Parsing & Raw Buffer Preservation (HMAC Validation)                             │
│  - IP & User Distributed Rate Limiters (Redis-Backed Token Bucket)                      │
│  - Global Input Sanitization & Zod Schema Validation Pipeline                           │
└──────────────────────────────────────────────┬──────────────────────────────────────────┘
                                               │
                                Authenticated  │  JWT Bearer + Refresh Token Rotation
                                Context        │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ TRUST BOUNDARY 2: APPLICATION DOMAIN LAYER                                              │
│  - RBAC Guards: WORKER, EMPLOYER, MODERATOR, SUPPORT, ADMIN                             │
│  - IDOR Guards: Resource Ownership Checks (Worker ID, Employer ID, Booking ID)          │
│  - State Machine Enforcers (Booking FSM, Payment FSM, Dispute FSM)                      │
│  - Antivirus & Magic Byte Scanner Interface                                             │
│  - SSRF URL Validator (Private RFC 1918 & Cloud Metadata Filter)                        │
└──────────────────────┬───────────────────────────────┬──────────────────────────────────┘
                       │                               │
                       ▼                               ▼
┌─────────────────────────────────────────┐     ┌─────────────────────────────────────────┐
│ TRUST BOUNDARY 3: DATA PERSISTENCE      │     │ TRUST BOUNDARY 4: REAL-TIME & MESSAGING │
│  - PostgreSQL 16 + PostGIS 3.4          │     │  - Redis 7.2 (Pub/Sub & Cache)          │
│  - Database-Level Audit Log Immutability│     │  - Socket.IO Gateways (/messages,       │
│    (Trigger blocking UPDATE & DELETE)   │     │    /notifications)                      │
│  - Transactional Outbox Pattern         │     │  - Session Token Invalidation Channel   │
│  - Parameterized Prisma Queries (No SQLi│     │  - Presence & Typing Rate Limits        │
└─────────────────────────────────────────┘     └─────────────────────────────────────────┘
```

---

## 2. Threat Actor Personas & Threat Analysis

### Actor 1: Unauthenticated External Attacker
- **Motivation:** System compromise, mass data theft, toll fraud via SMS abuse, service denial.
- **Capabilities:** Port scanning, automated fuzzing, API brute-forcing, forged HTTP headers, credential stuffing.
- **Potential Threats:**
  - *OTP Flooding:* Requesting thousands of SMS OTPs to deplete SMS gateway credits or harass phone numbers.
  - *OTP Brute-Force:* Attempting all 1,000,000 combinations of 6-digit OTP codes.
  - *CORS / CSRF Exploits:* Exploiting loose CORS origins to trigger cross-origin actions.
  - *Denial of Service:* Submitting massive JSON payloads (20MB+) or high-concurrency requests to saturate CPU/RAM.
- **Mitigations:**
  - Distributed Redis-backed rate limiting (maximum 3 OTP requests / 15 min per phone, max 9 / 15 min per IP).
  - Strict 5-attempt threshold on OTP verification with cryptographic hash verification and immediate invalidation on success.
  - Strict Express body size limit (2MB) with JSON parsing validation.
  - Explicit CORS whitelist allowing only authorized LocalSaathi origins; no wildcard fallbacks.

---

### Actor 2: Malicious Authenticated Worker
- **Motivation:** Fraudulent wage extraction, impersonating certified workers, accessing other workers' private documents or employers' payment details.
- **Capabilities:** Authenticated user with valid JWT for `WORKER` role, browser developer tools, direct API clients (Postman/curl).
- **Potential Threats:**
  - *IDOR on Documents:* Fetching identity documents belonging to other workers by manipulating UUIDs in `/verifications/:id`.
  - *IDOR on Payouts:* Attempting to trigger payouts or view banking details of other workers.
  - *Malicious Document Upload:* Uploading executable scripts disguised as images (polyglots) to exploit image processing libraries.
  - *GPS Spoofing:* Spoofing location coordinates to falsely qualify for geographic search matches.
- **Mitigations:**
  - Strict IDOR validation in service queries (`where: { userId: currentUserId }`).
  - Magic byte binary inspection and file extension validation on uploads.
  - Direct object storage keys are never exposed directly to other workers.
  - Verification documents accessible only by document owner and authorized `ADMIN`/`MODERATOR` roles.
  - PostGIS bounding checks validating latitude [-90, 90] and longitude [-180, 180].

---

### Actor 3: Malicious Authenticated Employer
- **Motivation:** Free labor, underpaying workers, fake job scams, fraudulent refund demands.
- **Capabilities:** Authenticated user with valid JWT for `EMPLOYER` role, business profile creation rights, job posting rights.
- **Potential Threats:**
  - *Fake Job Scams:* Posting jobs containing malicious URLs or phishing links.
  - *Payment Bypass:* Attempting to confirm bookings without escrow payment capture.
  - *Unauthorized Refunds:* Triggering refunds for completed or active jobs without dispute resolution.
  - *Worker Harassment:* Sending abusive messages or repeated booking spam.
- **Mitigations:**
  - Strict booking FSM state enforcement (transition to confirmed requires validated payment capture).
  - Refund service validates payment state (`CAPTURED`), booking status, dispute approval, or admin authorization.
  - Text input sanitization on job titles, descriptions, and messages.
  - Worker blocking and reporting mechanism with automatic moderation triggers.

---

### Actor 4: Untrusted Insider / Compromised Staff
- **Motivation:** Exfiltrating user PII (Aadhaar numbers, phone numbers), altering dispute resolutions for bribes, tampering with audit logs to cover tracks.
- **Capabilities:** Valid credentials for `SUPPORT`, `MODERATOR`, or `ADMIN` roles.
- **Potential Threats:**
  - *Audit Log Tampering:* Deleting audit records to cover up unauthorized inspection or data modification.
  - *Role Escalation:* A Support staff member attempting to execute administrative actions (e.g. initiating payouts).
  - *Bulk PII Exfiltration:* Querying all worker identities or phone numbers via admin endpoints.
- **Mitigations:**
  - Immutable audit logs enforced via PostgreSQL trigger: `UPDATE` and `DELETE` queries on `audit_logs` are unconditionally blocked by the database engine.
  - Strict RBAC separation: `SUPPORT` cannot access financial actions; only `ADMIN` can initiate payouts and system reconciliations.
  - All admin operations strictly log both the `operatorId` and the `targetUserId`.

---

### Actor 5: Third-Party Provider Compromise / Man-in-the-Middle
- **Motivation:** Intercepting webhooks, injecting false payment confirmations, spoofing SMS status.
- **Capabilities:** Compromised network routing, eavesdropping on unencrypted connections, sending forged webhooks.
- **Potential Threats:**
  - *Webhook Forgery:* Sending fake `payment.captured` webhooks from an arbitrary IP to credit bookings without real money transfer.
  - *Webhook Replay:* Re-sending a historical legitimate webhook payload multiple times to trigger duplicate event handling.
- **Mitigations:**
  - Cryptographic HMAC SHA-256 signature verification over authentic raw byte buffer (`req.rawBody`).
  - Replay protection with unique database constraint on `payment_events(event_id)`.
  - Webhook timestamp validation enforcing a maximum 5-minute clock skew window.

---

### Actor 6: Automated Bots and Data Scrapers
- **Motivation:** Harvesting worker phone numbers, scraping job postings to populate competitor platforms, indexing user profiles.
- **Capabilities:** Headless browsers (Puppeteer/Playwright), rotating proxies, distributed IP pools.
- **Potential Threats:**
  - *Worker Phone Harvesting:* Calling `/workers` or `/jobs` endpoints iteratively to collect worker contact information.
  - *Denial of Service via Heavy Search Queries:* Issuing thousands of complex PostGIS spatial radius queries simultaneously.
- **Mitigations:**
  - Masked worker contact details: phone numbers are never returned in public search endpoints.
  - Distributed Redis rate limiters on public discovery endpoints.
  - Strict pagination limits (maximum 50 items per page enforced via Zod schema).

---

### Actor 7: Competitor Platforms
- **Motivation:** Sabotaging platform availability, mass registering fake worker profiles to lower platform trust.
- **Capabilities:** Scripted automated registration using automated burner numbers.
- **Potential Threats:**
  - *Sybil Account Creation:* Creating thousands of dummy worker accounts to pollute search matching.
- **Mitigations:**
  - Identity verification required for verified badge and prioritized matching.
  - OTP verification required for phone number registration.
  - Anomaly detection via moderation rules (flagging rapid multiple registrations from identical IP subnets).

---

### Actor 8: Compromised Client Device / Browser
- **Motivation:** Stealing active session tokens, hijacking user actions via XSS, intercepting local storage data.
- **Capabilities:** Malicious browser extensions, device malware, public Wi-Fi access.
- **Potential Threats:**
  - *XSS Token Theft:* Injecting script to steal JWT tokens from local storage or document cookies.
  - *Session Hijacking:* Using a stolen token to make API calls after a user signs out.
- **Mitigations:**
  - Short-lived JWT access tokens (15 minutes).
  - Refresh token rotation: each refresh invalidates the previous refresh token and issues a new pair; reuse detection immediately revokes the entire session chain.
  - Redis token revocation / session termination: signout immediately deletes session from Redis and marks it revoked in PostgreSQL.
  - Strict Content-Security-Policy and XSS input sanitization.

---

### Actor 9: Supply Chain Attacker
- **Motivation:** Injecting backdoor code into npm packages to steal environment variables (`DATABASE_URL`, `JWT_SECRET`, `RAZORPAY_KEY_SECRET`).
- **Capabilities:** Compromising a maintainer account of an npm package in the dependency tree.
- **Potential Threats:**
  - *Secret Exfiltration:* Transitive dependency reading `process.env` during build or runtime and transmitting secrets to an external server.
- **Mitigations:**
  - Regular dependency vulnerability scanning (`npm audit`).
  - Lockfile integrity enforcement (`package-lock.json`).
  - Environment variables sanitized from error logs and client bundles.
  - Runtime container runs as non-root user with minimal network egress permissions.

---

### Actor 10: Infrastructure & Network Attacker
- **Motivation:** Container breakout, sniffing internal traffic, accessing unauthenticated Redis instances.
- **Capabilities:** Attacker inside the same cloud VPC or Docker network.
- **Potential Threats:**
  - *Redis Data Tampering:* Connecting directly to Redis (port 6379) without authentication to flush cache or tamper with rate limits.
  - *Database Connection Hijacking:* Intercepting unencrypted PostgreSQL traffic.
- **Mitigations:**
  - Redis protected with password authentication (`REDIS_PASSWORD`) and bound strictly to internal network.
  - PostgreSQL connections enforce TLS in production environments.
  - Non-root user in Docker containers, minimal Alpine/Debian slim base images.

---

## 3. STRIDE Threat Matrix Summary

| STRIDE Category | Major Risk | Applied Mitigations |
|---|---|---|
| **Spoofing** | Forged user identities, forged webhook signatures, fake GPS locations | OTP auth, HMAC SHA-256 webhook validation, PostGIS coordinate validation |
| **Tampering** | Altering booking state, modifying audit logs, tampering with payment status | Booking FSM, DB trigger on `audit_logs`, atomic DB transactions |
| **Repudiation** | Denying an administrative action or payment confirmation | Immutable append-only `audit_logs`, dual-actor tracking (`actorId` + `metadata`) |
| **Information Disclosure** | Exposing Aadhaar IDs, phone numbers, stack traces in API errors | IDOR guards, sensitive field filtering, GlobalHttpExceptionFilter scrubbing |
| **Denial of Service** | OTP flooding, massive payload upload, analytics event flooding | Redis token-bucket rate limiting, 2MB body limit, file size bounds |
| **Elevation of Privilege** | Workers acting as employers, support acting as admin | NestJS RolesGuard, RBAC matrix, resource ownership checks |
