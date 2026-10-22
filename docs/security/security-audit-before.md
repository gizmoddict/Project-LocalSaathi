# LocalSaathi — Pre-Remediation Security Audit Baseline

**Document Version:** 1.0.0  
**Phase:** Phase 17 — Complete Security Hardening  
**Date:** October 2026  
**Status:** Pre-Remediation Baseline Assessment  

---

## 1. Executive Summary

This security audit baseline documents the adversarial security assessment performed across the LocalSaathi platform prior to applying targeted security remediations. The assessment evaluated all application boundaries across the full stack: Next.js 14 web client, NestJS API gateway, PostgreSQL 16 + PostGIS 3.4 database, Redis 7.2 cache & pub/sub, WebSockets, background event processors, and third-party integrations (SMS gateway, Razorpay payment provider).

While foundational security controls (JWT authentication, role-based authorization guards, Zod schema validation, transaction-bound state transitions, and basic Helmet headers) were implemented across Phases 1–16, this audit identifies critical, high, and medium severity vulnerabilities and hardening gaps that require remediation to ensure defense-in-depth and enterprise-grade resilience.

---

## 2. Vulnerability Register & Findings Matrix

| Finding ID | Title | Severity | Affected Component | Remediated Status |
|---|---|---|---|---|
| **SEC-001** | Development CORS Wildcard & Incomplete Origin Restriction | HIGH | `apps/api/src/main.ts` | Remediated in Phase 17 |
| **SEC-002** | Missing Raw Body Buffer for Webhook HMAC Signature Verification | CRITICAL | `apps/api/src/main.ts`, Payment Webhook | Remediated in Phase 17 |
| **SEC-003** | In-Memory OTP & Session Rate Limiter Lack Distributed Redis Storage | HIGH | `apps/api/src/modules/auth/services/rate-limiter.service.ts` | Remediated in Phase 17 |
| **SEC-004** | Audit Log Table Modifiability (Missing Database-Level Immutability) | HIGH | PostgreSQL `audit_logs` Schema / DB Engine | Remediated in Phase 17 |
| **SEC-005** | Sensitive Identity Verification Document Storage Key Exposure & Direct Reference | HIGH | `apps/api/src/modules/trust-safety` | Remediated in Phase 17 |
| **SEC-006** | Missing Antivirus / Malware Quarantine Interface Hook on File Ingress | MEDIUM | File Upload Pipeline / Worker Avatar | Remediated in Phase 17 |
| **SEC-007** | CSP Headers Disabled in Development Mode and Weak Permissions Policy | MEDIUM | `apps/api/src/main.ts` (Helmet Configuration) | Remediated in Phase 17 |
| **SEC-008** | SSRF Vulnerability in Webhook and External Integration Dispatchers | HIGH | External HTTP / Outgoing Webhook Handlers | Remediated in Phase 17 |
| **SEC-009** | XSS and Rich Input Injection Vulnerability in Text & Markdown Bio Fields | MEDIUM | User Profiles, Jobs, Messaging Payloads | Remediated in Phase 17 |
| **SEC-010** | Replay Window Expiry Check Missing on Payment Webhook Timestamps | HIGH | `apps/api/src/modules/payment/services/webhook.service.ts` | Remediated in Phase 17 |
| **SEC-011** | Open Analytics Ingestion Endpoint Missing IP/Actor Throttling Guard | MEDIUM | `apps/api/src/modules/analytics` | Remediated in Phase 17 |
| **SEC-012** | WebSocket Origin Validation Missing Explicit Whitelist Verification | HIGH | `apps/api/src/modules/messaging/realtime/messaging.gateway.ts` | Remediated in Phase 17 |
| **SEC-013** | Transitive Dependency Vulnerabilities in Build Tooling (`postcss`, `qs`) | MEDIUM | Root `package.json` / Lockfile | Remediated in Phase 17 |
| **SEC-014** | Admin Impersonation Audit Trail Lacks Separate Actor and Target Field Enforcements | MEDIUM | Admin Session & Audit Logging | Remediated in Phase 17 |
| **SEC-015** | PII Leakage Risk in Unfiltered Server-Side Error Envelopes | LOW | `apps/api/src/common/filters/http-exception.filter.ts` | Remediated in Phase 17 |

---

## 3. Detailed Finding Descriptions

### SEC-001: Development CORS Wildcard & Incomplete Origin Restriction
- **Severity:** HIGH
- **Affected Component:** `apps/api/src/main.ts` (CORS Middleware)
- **Exploit Scenario:** An attacker hosts a malicious website `attacker.com` that triggers browser-based credentialed API calls (`credentials: true`) to `http://localhost:4000` or staging environments. Because the non-production branch allowed any origin, the attacker steals or mutates sensitive data on behalf of an authenticated victim whose browser sends cookies or cached credentials.
- **Evidence:** Line 51 of `apps/api/src/main.ts`:
  ```typescript
  if (!origin || allowedOrigins.includes(origin) || config.NODE_ENV !== 'production') {
    callback(null, true);
  }
  ```
- **Impact:** Cross-Origin Request Forgery and unauthorized cross-origin data exposure in local and non-production environments.
- **Recommended Fix:** Enforce explicit regex or whitelist matching against authorized LocalSaathi frontend origins across all environments; forbid wildcard fallbacks when credentials are enabled.

---

### SEC-002: Missing Raw Body Buffer for Webhook HMAC Signature Verification
- **Severity:** CRITICAL
- **Affected Component:** `apps/api/src/main.ts`, `apps/api/src/modules/payment/services/webhook.service.ts`
- **Exploit Scenario:** Razorpay webhooks calculate HMAC SHA-256 over the byte-for-byte serialized payload received from the payment gateway. If Express body parsing parses JSON without storing the raw `Buffer`, reconstructing the payload with `JSON.stringify(body)` risks subtle whitespace, floating-point, or key-ordering mismatches. This could cause valid webhooks to fail signature validation, or conversely lead developers to bypass verification in edge cases.
- **Evidence:** `express.json({ limit: '2mb' })` is mounted without `verify: (req, res, buf) => { req.rawBody = buf; }`.
- **Impact:** Risk of signature verification mismatch, webhook delivery failure, or payment status divergence.
- **Recommended Fix:** Mount Express JSON and URL-encoded parsers with custom `verify` handlers that capture `req.rawBody = buf`, guaranteeing exact cryptographic integrity checks.

---

### SEC-003: In-Memory OTP & Session Rate Limiter Lack Distributed Redis Storage
- **Severity:** HIGH
- **Affected Component:** `apps/api/src/modules/auth/services/rate-limiter.service.ts`
- **Exploit Scenario:** An attacker distributes an OTP brute-force or SMS flooding attack across multiple cluster nodes or forces container restarts. Because rate limit counters were stored in an in-memory `Map<string, RateLimitRecord>`, restarting the process or hitting distinct replicas bypasses the throttling thresholds completely.
- **Evidence:** `private readonly inMemoryStore = new Map<string, RateLimitRecord>();` in `AuthRateLimiterService`.
- **Impact:** SMS exhaustion denial of service, financial costs from SMS toll fraud, and potential 6-digit OTP brute-force if rate limits reset.
- **Recommended Fix:** Implement a distributed Redis sliding-window token bucket / counter with atomic Redis commands (`INCR`, `EXPIRE`, or Lua script), with graceful in-memory fallback only when Redis is unavailable.

---

### SEC-004: Audit Log Table Modifiability (Missing Database-Level Immutability)
- **Severity:** HIGH
- **Affected Component:** PostgreSQL database schema (`audit_logs` table)
- **Exploit Scenario:** A rogue administrator or attacker with temporary SQL injection access issues an `UPDATE audit_logs SET action = 'benign' WHERE ...` or `DELETE FROM audit_logs WHERE actor_id = '...'` to erase evidence of malicious actions or data exfiltration.
- **Evidence:** The Prisma schema defines `model AuditLog` with no database trigger preventing `UPDATE` or `DELETE`.
- **Impact:** Tampering of regulatory compliance trail and non-repudiation guarantees.
- **Recommended Fix:** Deploy a PostgreSQL trigger `BEFORE UPDATE OR DELETE ON audit_logs` raising an uncatchable PL/pgSQL exception `RAISE EXCEPTION 'Audit logs are immutable'`.

---

### SEC-005: Sensitive Identity Verification Document Storage Key Exposure & Direct Reference
- **Severity:** HIGH
- **Affected Component:** `apps/api/src/modules/trust-safety/services/verification.service.ts`
- **Exploit Scenario:** Verification API endpoints return internal `objectStorageKey` paths (e.g. `verifications/usr-123/aadhaar_front.jpg`). If an unauthenticated or unauthorized actor accesses storage directly or manipulates path references, identity documents (Aadhaar cards, PAN cards, licenses) containing PII can be downloaded or indexed.
- **Evidence:** `verification.service.ts` returns `objectStorageKey` directly to callers without presigned expiration or access authorization tokens.
- **Impact:** Exposure of sensitive government identity documents (Aadhaar / PAN) violating DPDP Act and data protection standards.
- **Recommended Fix:** Provide an explicit authorization-guarded document download proxy that validates caller permissions (User self or Admin/Moderator), generates short-lived signed tokens, logs audit events on download, and scrubs raw storage paths from non-privileged responses.

---

### SEC-006: Missing Antivirus / Malware Quarantine Interface Hook on File Ingress
- **Severity:** MEDIUM
- **Affected Component:** `apps/api/src/modules/worker/services/profile-image-storage.service.ts`
- **Exploit Scenario:** An attacker uploads a polyglot file (e.g., an authentic JPEG image embedded with active shellcode or malicious PDF exploits). While magic byte checks validate initial header bytes, the platform lacked an explicit asynchronous antivirus scanning hook (`AntivirusScanner` interface) to quarantine suspicious uploads prior to serving.
- **Evidence:** No AV scanning abstraction exists; files are written directly to disk without a quarantine status lifecycle.
- **Impact:** Potential propagation of infected files to other platform users or administrators.
- **Recommended Fix:** Implement `AntivirusScanner` service abstraction with built-in heuristic signature checks (EICAR test string detection, embedded executable script detection) and asynchronous scanning hook.

---

### SEC-007: CSP Headers Disabled in Development Mode and Weak Permissions Policy
- **Severity:** MEDIUM
- **Affected Component:** `apps/api/src/main.ts`
- **Exploit Scenario:** In dev/staging environments, `contentSecurityPolicy` is disabled completely. Furthermore, restrictive permissions policies (disabling camera, microphone, geolocation access except when explicitly requested) were not configured on the API gateway.
- **Evidence:** `contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false`.
- **Impact:** Development environments vulnerable to clickjacking, iframe embedding, and unexpected browser feature exploitation.
- **Recommended Fix:** Configure strict Helmet defaults: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and explicit Permissions-Policy directives.

---

### SEC-008: SSRF Vulnerability in Webhook and External Integration Dispatchers
- **Severity:** HIGH
- **Affected Component:** Outgoing webhook delivery, third-party notification dispatchers
- **Exploit Scenario:** If custom webhook URLs or callback endpoints are ever permitted from user input without IP validation, an attacker could specify `http://169.254.169.254/latest/meta-data/` or `http://127.0.0.1:6379/` to probe internal cloud metadata services, Docker daemon endpoints, or Redis.
- **Evidence:** Lack of centralized URL validator prohibiting RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, link-local `169.254.0.0/16`).
- **Impact:** Server-Side Request Forgery against cloud metadata or internal microservices.
- **Recommended Fix:** Implement a strict SSRF guard utility that resolves DNS and verifies the target IP does not fall within loopback, private, or link-local ranges before issuing outgoing HTTP requests.

---

### SEC-009: XSS and Rich Input Injection Vulnerability in Text & Markdown Bio Fields
- **Severity:** MEDIUM
- **Affected Component:** Worker Profile (`bio`, `experience`), Job (`description`), Chat (`content`)
- **Exploit Scenario:** A worker or employer submits profile data containing HTML tags or javascript URIs (e.g. `<img src=x onerror=alert(1)>`, `javascript:void(0)`). If rendered on the frontend without proper sanitization, this leads to Stored XSS.
- **Evidence:** Zod schemas check string lengths but do not explicitly strip dangerous HTML or script tags prior to persistence.
- **Impact:** Stored Cross-Site Scripting affecting platform administrators and users.
- **Recommended Fix:** Implement backend text sanitization sanitizing HTML tags, stripping javascript URI protocols, and escaping raw angle brackets in non-HTML user-generated content.

---

### SEC-010: Replay Window Expiry Check Missing on Payment Webhook Timestamps
- **Severity:** HIGH
- **Affected Component:** `apps/api/src/modules/payment/services/webhook.service.ts`
- **Exploit Scenario:** An attacker intercepts a legitimate historical payment webhook payload with a valid signature. Although the database stores `eventId`, if an event arrives for an order without an event ID or with altered nonces outside the replay window, stale state updates could be re-evaluated.
- **Evidence:** Webhook handler validates signature and database uniqueness, but does not enforce a maximum allowable clock skew window (e.g. 5 minutes) on timestamped payloads.
- **Impact:** Potential replay attack if an idempotency record is pruned or missing.
- **Recommended Fix:** Enforce a strict 5-minute maximum timestamp tolerance window for all timestamped payment provider webhooks.

---

### SEC-011: Open Analytics Ingestion Endpoint Missing IP/Actor Throttling Guard
- **Severity:** MEDIUM
- **Affected Component:** `apps/api/src/modules/analytics/analytics.controller.ts`
- **Exploit Scenario:** The `POST /api/v1/analytics/events` endpoint accepts client-side product telemetry. Without per-IP and per-session throttling, an automated script could flood millions of events, exhausting PostgreSQL disk storage or buffer cache.
- **Evidence:** Analytics ingestion endpoint uses batch validation but lacks distributed rate limiting guards.
- **Impact:** Denial of Service and storage exhaustion on database partitions.
- **Recommended Fix:** Apply Redis-backed sliding-window rate limiting to the analytics ingest controller (e.g., maximum 100 events per minute per IP).

---

### SEC-012: WebSocket Origin Validation Missing Explicit Whitelist Verification
- **Severity:** HIGH
- **Affected Component:** `apps/api/src/modules/messaging/realtime/messaging.gateway.ts`
- **Exploit Scenario:** A malicious website opens a cross-origin WebSocket connection to `ws://localsaathi-api/messages` from an authenticated browser. Because WebSockets do not strictly adhere to SOP unless origin is checked during the handshake, the malicious site could eavesdrop on real-time messages.
- **Evidence:** Gateway initializes without explicit `allowRequest` origin validation against `CORS_ALLOWED_ORIGINS`.
- **Impact:** Cross-Site WebSocket Hijacking (CSWSH) and real-time conversation eavesdropping.
- **Recommended Fix:** Implement handshake origin verification in Socket.IO gateway ensuring origin matches configured frontend domains.

---

### SEC-013: Transitive Dependency Vulnerabilities in Build Tooling (`postcss`, `qs`)
- **Severity:** MEDIUM
- **Affected Component:** Root `package.json`, `package-lock.json`
- **Exploit Scenario:** Known vulnerabilities in transitive build and utility packages (e.g. prototype pollution in old `qs`, regex DoS in `postcss`).
- **Evidence:** `npm audit` reports moderate/high severity advisories in dev dependencies.
- **Impact:** Potential build-time tampering or edge-case runtime vulnerability.
- **Recommended Fix:** Update vulnerable dependencies and configure lockfile overrides where appropriate.

---

### SEC-014: Admin Impersonation Audit Trail Lacks Separate Actor and Target Field Enforcements
- **Severity:** MEDIUM
- **Affected Component:** `apps/api/src/modules/admin/services/admin-auth.service.ts`
- **Exploit Scenario:** When an administrator inspects or performs actions on behalf of another user, failure to distinctly record both the acting administrator (`operatorId`) and the affected user (`subjectId`) obscures accountability during forensic audits.
- **Evidence:** Audit log schemas record `actorId`, but metadata payloads must strictly mandate `impersonatorAdminId` when applicable.
- **Impact:** Incomplete forensic traceability.
- **Recommended Fix:** Enforce dual-identifier logging (`actorId` = admin, `targetUserId` = subject) for all privileged administrative actions.

---

### SEC-015: PII Leakage Risk in Unfiltered Server-Side Error Envelopes
- **Severity:** LOW
- **Affected Component:** `apps/api/src/common/filters/http-exception.filter.ts`
- **Exploit Scenario:** Internal database constraints or Prisma error messages containing phone numbers, hashed tokens, or internal column names could leak in error messages if non-standard exceptions are thrown.
- **Evidence:** `exception.message` could theoretically reflect unhandled query error text in edge scenarios.
- **Impact:** Information disclosure.
- **Recommended Fix:** Scrub sensitive terms (phone numbers, tokens, internal stack traces, DB connection strings) from all error response strings across all environments.

---

## 4. Remediation Roadmap

All 15 findings are mapped to concrete remediation tasks in Phase 17:
1. **Database Immutability:** Add PostgreSQL trigger on `audit_logs` table (SEC-004).
2. **Gateway & CORS Hardening:** Strict origin enforcement, raw body capture, and hardened Helmet headers (SEC-001, SEC-002, SEC-007).
3. **Distributed Rate Limiting:** Redis-backed sliding window limiter for Auth OTP, sessions, and Analytics (SEC-003, SEC-011).
4. **Document Access & Storage Protection:** Secure document proxy controller, time-limited signed access, and audit trail on document retrieval (SEC-005).
5. **Malware / Antivirus Interface:** File upload quarantine hook and buffer scanning (SEC-006).
6. **Network & Input Hardening:** SSRF guard utility, XSS input sanitization, and WebSocket origin checks (SEC-008, SEC-009, SEC-012).
7. **Webhook Security:** Enforce 5-minute timestamp tolerance and replay prevention (SEC-010).
8. **Audit Trail & Error Scrubbing:** Strict impersonation logging and error PII scrubber (SEC-014, SEC-015).
