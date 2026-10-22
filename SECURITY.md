# LocalSaathi Security Policy

**Effective Date:** October 2026  
**Version:** 1.0.0  
**Scope:** LocalSaathi Core Platform (`@localsaathi/api`, `@localsaathi/web`, `@localsaathi/database`, `@localsaathi/types`, `@localsaathi/validation`, `@localsaathi/config`)

---

## 1. Responsible Disclosure Policy

LocalSaathi welcomes responsible vulnerability reporting from security researchers, partners, and users. We are committed to addressing valid security vulnerabilities promptly and transparently while ensuring user safety and platform reliability.

If you believe you have discovered a vulnerability in LocalSaathi, please review the guidelines below before disclosing it publicly.

### Reporting Guidelines
- **Submit Reports Privately:** Do **NOT** post details of vulnerabilities on public issue trackers, forums, or social media until we have investigated and deployed a remediation.
- **Do Not Exploit:** Do not access, modify, or destroy real user data. Only test against accounts you own or synthetic accounts created for security testing.
- **Do Not Disrupt:** Avoid Denial of Service (DoS/DDoS) attacks, automated high-frequency stress testing on production infrastructure, spamming, or phishing.
- **Safe Harbor:** LocalSaathi will not pursue legal action against researchers who discover and report vulnerabilities in good faith following these guidelines.

---

## 2. Reporting Process & Communication Channels

Send vulnerability reports to our dedicated Trust & Safety engineering team:

- **Email:** `security@localsaathi.com`
- **PGP Fingerprint (Optional):** `4F2A 9B8C 1E7D 3A5F 8B2C 0E9D 4A6F 7B1C 3E5D 2A8F`
- **Initial Response SLA:** 48 business hours
- **Triage & Severity Assessment:** 5 business days
- **Remediation SLA:**
  - **CRITICAL / P0:** Fix deployed within 24–72 hours
  - **HIGH / P1:** Fix deployed within 7 business days
  - **MEDIUM / P2:** Fix deployed within 14 business days
  - **LOW / P3:** Scheduled in the standard release cycle

### Information to Include in Your Report
1. Detailed description of the vulnerability and its potential security impact.
2. Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
3. Affected endpoints, parameters, models, or components.
4. Remediation suggestions (if applicable).

---

## 3. Cryptographic Standards & Baseline Specifications

LocalSaathi mandates modern cryptographic algorithms and strict security controls across all platform tiers:

| Security Domain | Standard / Algorithm | Parameters & Key Management |
|---|---|---|
| **Data in Transit** | TLS 1.3 / TLS 1.2 minimum | Strict forward secrecy cipher suites, HSTS enforced (`max-age=31536000; includeSubDomains; preload`). |
| **Data at Rest** | AES-256-GCM | Encrypted PostgreSQL volume, encrypted Redis volume, AES-256-GCM for sensitive column attributes. |
| **Authentication Tokens** | JWT (JSON Web Tokens) | HMAC SHA-256 (`HS256`) with minimum 256-bit entropy (`JWT_ACCESS_SECRET`). Alg `none` explicitly rejected. |
| **Token Lifecycles** | Short-Lived Access + Rotating Refresh | Access tokens: 15 minutes. Refresh tokens: 7 days. Single-use refresh rotation with automated reuse detection and session invalidation. |
| **OTP Hashing** | HMAC SHA-256 with Server Pepper | Plaintext OTPs are never persisted. Hashes computed as `HMAC-SHA256(phone:otp, AUTH_PEPPER)` with constant-time equality. Single-use verification. |
| **Webhook Signatures** | HMAC SHA-256 | Verified using `crypto.timingSafeEqual` against the raw byte-for-byte HTTP request body (`req.rawBody`). Clock skew limited to 300 seconds. |
| **Document Access** | Time-Limited Signed Tokens | Signed temporary HMAC-SHA256 tokens (`expiresAt: 5 minutes`) restricting document download to authorized tenants. |

---

## 4. Platform Security Architecture

The LocalSaathi architecture follows a defense-in-depth model across every layer:

```
[ Internet Client ]
       │
       ▼ (TLS 1.3 / Strict Origin CORS / Helmet Headers)
[ NestJS API Gateway ]
  ├── Express Body Parser (2MB Limit + Raw Body Buffer Capture)
  ├── Global Rate Limiting (Redis-backed Token Bucket)
  ├── Security Filters (XSS Sanitizer, SSRF Validator, PII Error Scrubber)
  ├── JWT Auth Guard & Session Status Check
  ├── RBAC Capability Guard (WORKER, EMPLOYER, MODERATOR, SUPPORT, ADMIN)
  └── Antivirus / Malware Inspection Hook
       │
       ├── (Internal Direct Connection)
       ▼
[ PostgreSQL 16 + PostGIS 3.4 ]
  ├── Row-Level Tenant Isolation
  ├── Immutability Triggers (audit_logs UPDATE & DELETE blocked at engine level)
  └── Transactional State Integrity (Outbox Pattern)
       │
       ▼
[ Redis 7.2 ] (Protected Mode, Password Auth, Ephemeral Rate Limit Keys & Pub/Sub)
```

### Core Security Principles:
1. **Adversarial Input Validation:** All external HTTP inputs are validated via strict Zod schemas before reaching business logic controllers.
2. **Strict RBAC Enforcement:** Role capabilities are evaluated independently on the backend. Client-side route hiding is never trusted as an authorization mechanism.
3. **Tenant & IDOR Isolation:** All database queries for user resources enforce tenant ownership predicates (`where: { id: resourceId, ownerId: callerId }`).
4. **Audit Immutability:** Audit records are written within atomic transactions and protected by an uncatchable PostgreSQL engine trigger preventing mutation or deletion.
5. **No Plaintext PII in Logs:** Phone numbers, OTP codes, session tokens, and passwords are unconditionally redacted or scrubbed from application logs and exception responses.

---

## 5. Threat Model Summary (STRIDE)

| Threat Category | Primary Risk | Implemented Countermeasure |
|---|---|---|
| **Spoofing** | Forged JWT access tokens or caller identity spoofing | Cryptographic HMAC validation, signature rejection, user lookup against active database records. |
| **Tampering** | Webhook payload alteration, audit log modification | Byte-for-byte HMAC verification (`req.rawBody`), PostgreSQL immutable database triggers. |
| **Repudiation** | Action denial by users, employers, or staff | Atomic audit logging capturing `actorId`, `action`, `entityType`, `ipAddress`, and `userAgent`. |
| **Information Disclosure** | PII leakage in stack traces, document exposure | Global exception PII scrubber, signed document access proxies, strict CORS origin matching. |
| **Denial of Service** | OTP SMS flooding, analytics payload floods | Distributed Redis sliding window token buckets, 2MB Express payload limits. |
| **Elevation of Privilege** | Self-assigning `ADMIN` role, Support payout abuse | Registration role allowlist (`WORKER` / `EMPLOYER`), granular RBAC policy checks. |

---

## 6. Incident Response Lifecycle

LocalSaathi adheres to a 5-phase security incident response procedure compliant with the Digital Personal Data Protection (DPDP) Act:

1. **Identification:** Automated intrusion detection, anomaly monitoring, or responsible disclosure trigger incident triage and severity classification.
2. **Containment:** Revocation of compromised session chains, token blacklisting in Redis, origin firewalling, or temporary endpoint suspension.
3. **Eradication:** Root cause analysis, code remediation, peer review, and zero-downtime hotfix deployment.
4. **Recovery:** System health verification, database consistency validation, and monitoring restored services for anomalous activity.
5. **Post-Incident Review & Disclosure:** Generation of post-mortem analysis, implementation of preventative tests, and notification of relevant authorities and affected data principals within statutory timelines.
