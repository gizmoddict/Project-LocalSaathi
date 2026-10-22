# LocalSaathi — Production Smoke Test Catalog

## 1. Scope & Execution

The production smoke test suite ([`scripts/deploy/smoke-test.js`](file:///p:/Project%20Localsaathi/scripts/deploy/smoke-test.js)) executes 18 automated operational checks immediately following container deployment or environment provisioning.

Command:
```bash
TARGET_URL=https://api.localsaathi.com WEB_URL=https://localsaathi.com npm run deploy:smoke-test
```

---

## 2. The 18 Production Smoke Checks

| Check # | Smoke Test Target | Endpoint / Route | Success Criteria |
| :--- | :--- | :--- | :--- |
| **01** | Web Application Root Load | `GET /` | Returns HTTP 200/304; renders HTML markup. |
| **02** | API Health Summary | `GET /api/v1/health` | Returns HTTP 200 with `status: ok` and uptime. |
| **03** | Infrastructure Readiness Probe | `GET /api/v1/health/ready` | Returns HTTP 200 with `status: ready`. |
| **04** | Database Connectivity | `GET /api/v1/health/ready` | Database dependency reports `status: ok`. |
| **05** | Redis Cache & Queue Broker | `GET /api/v1/health/ready` | Redis dependency reports `status: ok`. |
| **06** | Authentication Subsystem | `POST /api/v1/auth/otp/request` | Reaches controller; rejects bad body with 400. |
| **07** | Background Worker & Queues | `GET /api/v1/health/system` | Queue subsystem reports `HEALTHY`. |
| **08** | Job Discovery & Search | `GET /api/v1/jobs` | Returns HTTP 200 with job collection array. |
| **09** | Job Creation Contract | `POST /api/v1/jobs` | Responds with auth guard rejection (401) on unauthenticated call. |
| **10** | Worker Application Flow | `GET /api/v1/applications` | Requires authentication; responds with 401. |
| **11** | Booking & Escrow Subsystem | `GET /api/v1/bookings` | Requires authentication; responds with 401. |
| **12** | Real-time Messaging Subsystem | `GET /api/v1/messages` | Requires authentication; responds with 401. |
| **13** | Notification Dispatcher | `GET /api/v1/notifications` | Requires authentication; responds with 401. |
| **14** | Payment Gateway Safe State | `GET /api/v1/payments` | Guarded endpoint responsive; no unhandled crashes. |
| **15** | Admin 10-Subsystem Diagnostics | `GET /api/v1/health/system` | Evaluates all 10 core subsystems. |
| **16** | Prometheus Metrics Exposition | `GET /metrics` | Returns Prometheus text format with HELP/TYPE lines. |
| **17** | Traceable Release Version | `GET /api/v1/health/version` | Returns current Git commit SHA and build timestamp. |
| **18** | WebSocket Socket.IO Transport | `GET /socket.io/` | Handshake responds with HTTP 200 or 400 without crashing. |
