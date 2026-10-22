# LocalSaathi — Production Configuration Specification

## 1. System Hardware & Sizing Expectations

| Subsystem | CPU Allocation | Memory Limit | Connection / Concurrency Limit | High Availability Target |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | 4 vCPU | 8 GB RAM | `max_connections = 200` | Primary + Standby Replica with WAL Streaming |
| **Redis Cache / Queue** | 2 vCPU | 4 GB RAM | `maxmemory = 2GB`, policy: `noeviction` | Redis Sentinel / Managed Cluster with AOF |
| **API Containers (NestJS)** | 1 vCPU (per pod) | 1 GB RAM (per pod) | 50 concurrent requests per pod | Minimum 3 Pods across Availability Zones |
| **Web Containers (Next.js)** | 1 vCPU (per pod) | 1 GB RAM (per pod) | 100 concurrent requests per pod | Minimum 2 Pods |
| **Worker Containers (BullMQ)**| 1 vCPU (per pod) | 1 GB RAM (per pod) | Concurrency: 10 per queue | Minimum 2 Pods (Idempotent handlers) |

---

## 2. PostgreSQL Production Configuration

* **Connection Pool Formula:**
  $$\text{Total App Connections} = (\text{API Pods} \times \text{Prisma Pool Size}) + (\text{Worker Pods} \times \text{Prisma Pool Size})$$
  $$3 \times 20 + 2 \times 20 = 100 \text{ connections} \le 200 \text{ max\_connections}$$
* **Prisma Connection Limit:** Configured via `connection_limit=20` in connection string.
* **SSL / TLS Mode:** `sslmode=verify-full` with institutional CA bundle.
* **Role Separation:**
  * `app_user`: DML privileges only (SELECT, INSERT, UPDATE, DELETE).
  * `migration_user`: DDL privileges (CREATE, ALTER) used during CI/CD migrations.
  * `backup_user`: Read-only (SELECT) used during backup jobs.

---

## 3. Redis Production Configuration

* **Eviction Policy:** Strictly set to `noeviction`. Ensures BullMQ queues and outbox tasks are never dropped under high memory load.
* **Persistence:** `appendonly yes` with `appendfsync everysec` for durable queue recovery.
* **Authentication:** Mandatory `requirepass` with 64-character entropy key.
* **Command Hardening:** Dangerous commands (`FLUSHALL`, `FLUSHDB`, `DEBUG`, `KEYS`) disabled in production.

---

## 4. Object Storage & Media Configuration

* **Private Buckets:** Default public access completely blocked (`BlockPublicAcls = true`, `IgnorePublicAcls = true`).
* **Presigned URLs:**
  * Upload URLs: 15-minute TTL, strict `Content-Type` validation (`image/jpeg`, `image/png`, `application/pdf`).
  * Download URLs: 5-minute TTL for sensitive KYC identity documents and worker verification certificates.
* **Server-Side Encryption:** Mandatory `AES256` or `aws:kms`.

---

## 5. Security Headers & Proxy Specification

Configured via Nginx reverse proxy / Cloudflare edge:
* `Content-Security-Policy`: Restricts scripts, styles, fonts, and connects to verified origins.
* `Strict-Transport-Security`: `max-age=31536000; includeSubDomains; preload`.
* `X-Frame-Options`: `DENY`.
* `X-Content-Type-Options`: `nosniff`.
* `Referrer-Policy`: `strict-origin-when-cross-origin`.
