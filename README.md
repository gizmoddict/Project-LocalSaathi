# LocalSaathi — Hyperlocal Employment Platform

**LocalSaathi** is a production-grade hyperlocal employment and gig platform tailored for **informal and skilled blue-collar workers** (electricians, plumbers, carpenters, masons, painters, helpers) and **local contractors/employers** in India. It bridges the gap between nearby workers and verified work opportunities with transparent wages, skill verification, commute-distance calculation, contract management, and multilingual accessibility.

The project is structured as a **unified, full-stack Next.js 14 application** optimized for zero-configuration, 1-click deployment on **Vercel's Free (Hobby) tier**, with native support for live PostgreSQL + PostGIS databases or instant zero-database demo previews.

---

## 🌟 Key Features

### 👷 1. Worker Workspace (`/worker`)
- **Interactive Trade Discovery (`/worker/jobs`)**: Personalized nearby jobs sorted by skill compatibility, employer ratings, and commute distance (`${job.distanceKm} km away`).
- **Device Location Permission (`LocationPermissionCard`)**: One-click browser geolocation with strict coordinate bounds checking (`[-90, 90]`, `[-180, 180]`), 6-decimal precision rounding, and manual trade hub fallbacks (Hazratganj, Aliganj, Gomti Nagar, Noida Sector 18, Connaught Place, and custom city search).
- **Interactive Leaflet Map (`InteractiveLocationMap`)**: Visual radius adjustment slider (1–50 km) and neighborhood trade pins.
- **Worker Profile & Readiness (`/worker/profile`, `/worker/skills`, `/worker/availability`)**: Trade experience tracking, language preferences, hourly/daily expected wage, and weekly availability calendars.
- **Application & Booking Tracking (`/worker/applications`, `/worker/bookings`)**: Real-time status indicators (Submitted, Shortlisted, Accepted, Completed).

### 🏢 2. Employer & Contractor Hub (`/employer`)
- **Fast Job Posting (`/employer/jobs/new`)**: Create trade requirements with wage specification (Daily/Hourly/Lump-sum), worker headcount, duration, and skill criteria.
- **Applicant Review & Shortlisting (`/employer/jobs/[id]/applications`)**: Review verified worker profiles, compare distances, and shortlist or accept with one click.
- **Booking & Shift Management (`/employer/bookings`)**: Manage confirmed workers, track work days, and initiate completion releases.
- **Business Profile Readiness (`/employer/profile`)**: Business type, verified trade credentials, and location details.

### 🛡️ 3. Platform Administration & Observability (`/admin`)
- **Operations Dashboard (`/admin`)**: Real-time metrics on registered workers, active employers, total jobs posted, and gross platform volume.
- **Dispute Resolution & Moderation (`/admin/disputes`, `/admin/moderation`, `/admin/reports`)**: Incident investigation, complaint handling, and account safety actions.
- **System Health & Audit Logs (`/admin/system-health`, `/admin/audit-logs`)**: Live probe metrics, immutable security logs, and runtime diagnostics.

### 🔐 4. Authentication & Security (`/login`)
- **Mobile Number + Dynamic Cryptographic OTP**: Every OTP request generates a fresh, randomized 6-digit verification challenge using Node.js `crypto.randomInt()`.
- **Zero-Friction Dev Mode & 1-Click Profiles**: Pre-configured demo logins for Ramesh Kumar (Worker), Rajesh Sharma (Employer), and Platform Admin for instant evaluation.
- **JWT Session Tokens**: Role-based access control (`WORKER`, `EMPLOYER`, `ADMIN`) protecting sensitive actions.
- **Worker Privacy Guarantee**: Exact GPS coordinates are never broadcast to employers or exposed in public API payloads; commute distance is computed securely server-side.

---

## 🏗️ Architecture & Project Structure

The entire application runs from the repository root as a cohesive Next.js 14 App Router project:

```
Project Localsaathi/
├── src/
│   ├── app/                                # Next.js 14 App Router (Pages & API)
│   │   ├── (landing)/page.tsx              # Public homepage & trade search
│   │   ├── login/page.tsx                  # Mobile OTP Authentication portal
│   │   ├── worker/                         # Worker Workspace (jobs, profile, skills, availability)
│   │   ├── employer/                       # Employer Hub (job postings, applicants, bookings)
│   │   ├── admin/                          # Admin & Observability dashboards
│   │   ├── messages/                       # Messaging & conversations
│   │   ├── notifications/                  # In-app notifications & preferences
│   │   ├── payments/                       # Payments & payout histories
│   │   └── api/                            # Vercel Serverless Route Handlers
│   │       ├── health/route.ts             # Health probe (/api/health)
│   │       └── v1/[...slug]/route.ts       # Unified API Router (/api/v1/*)
│   ├── components/                         # UI Components & Design System
│   │   ├── ui/                             # Buttons, Cards, Inputs, Badges
│   │   ├── location/                       # LocationPermissionCard & Hub Selector
│   │   └── map/                            # Interactive Leaflet Map components
│   ├── hooks/                              # React Hooks (useDeviceLocation, useTranslation)
│   ├── i18n/                               # Regional language localization (Hindi, English, etc.)
│   ├── lib/                                # API Client, Prisma Singleton, Serverless Data
│   ├── types/                              # Shared TypeScript Domain Types & DTOs
│   └── validation/                         # Zod Validation Schemas
├── prisma/
│   └── schema.prisma                       # PostgreSQL + PostGIS Prisma schema
├── public/                                 # Static assets & icons
├── next.config.mjs                         # Next.js production configuration
├── tailwind.config.ts                      # Tailwind CSS design tokens
├── postcss.config.js                       # PostCSS configuration
├── tsconfig.json                           # TypeScript configuration with path aliases
├── vercel.json                             # 1-Click Vercel deployment configuration
└── package.json                            # Root scripts & dependencies
```

---

## ⚡ Serverless API Route Handlers (`/api/v1/*`)

Because Vercel's Free tier executes via serverless functions (without persistent background daemons), all backend requests from `apiClient` are handled by [`src/app/api/v1/[...slug]/route.ts`](file:///p:/Project%20Localsaathi/src/app/api/v1/[...slug]/route.ts):

- **Catch-All Sub-Routing**: Automatically maps incoming requests (`/api/v1/auth/otp/*`, `/api/v1/workers/me/*`, `/api/v1/jobs/*`, `/api/v1/admin/*`) with zero 404 risk.
- **Dual Execution Modes**:
  1. **Live Database Mode**: When `DATABASE_URL` is configured, Prisma executes persistent transactional queries.
  2. **Instant Demo Mode**: When running without a database, [`src/lib/serverless-data.ts`](file:///p:/Project%20Localsaathi/src/lib/serverless-data.ts) provides realistic in-memory trade jobs, worker profiles, and bookings. The site is 100% interactive on Vercel preview environments out-of-the-box.
- **Sub-50ms Response Times**: Fast, lightweight serverless execution well within Vercel's 10-second free function timeout limit.

---

## 🚀 1-Click Deployment on Vercel

### Step 1: Push Code to Git
Ensure your latest code is pushed to your GitHub or GitLab repository:
```powershell
git add .
git commit -m "Deploy LocalSaathi on Vercel"
git push origin main
```

### Step 2: Import into Vercel
1. Go to **[vercel.com/new](https://vercel.com/new)** and import your repository.
2. Vercel detects **Next.js** automatically:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./`
   - **Build Command**: `prisma generate && next build`
   - **Output Directory**: `.next`

### Step 3: Configure Environment Variables (Optional)
If connecting a real database:
- `DATABASE_URL`: `postgresql://user:password@host:5432/dbname?sslmode=require` (e.g. from Neon Serverless Postgres with PostGIS or Supabase).

*(If you don't provide a database URL, LocalSaathi will automatically run in zero-configuration serverless demo mode).*

### Step 4: Click Deploy
Click **Deploy**. Your site will build and deploy across Vercel's global edge network in under 60 seconds!

---

## 💻 Local Development

### 1. Prerequisites
- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`

### 2. Install Dependencies
```powershell
npm install
```

### 3. Generate Prisma Client
```powershell
npx prisma generate
```

### 4. Run Development Server
```powershell
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

- **Landing Page**: [http://localhost:3000](http://localhost:3000)
- **Login Portal**: [http://localhost:3000/login](http://localhost:3000/login)
- **Worker Workspace**: [http://localhost:3000/worker](http://localhost:3000/worker)
- **Nearby Jobs**: [http://localhost:3000/worker/jobs](http://localhost:3000/worker/jobs)
- **Employer Hub**: [http://localhost:3000/employer](http://localhost:3000/employer)
- **Admin Dashboard**: [http://localhost:3000/admin](http://localhost:3000/admin)
- **API Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 🛠️ Verification & Quality Gates

| Script | Purpose |
| :--- | :--- |
| `npm run build` | Compiles Prisma schema and executes production `next build` (39 routes). |
| `npm run typecheck` | Strict `tsc --noEmit` check across all components, hooks, and route handlers. |
| `npm run lint` | ESLint check across all pages and libraries. |
| `node scripts/test-device-location.js` | 18/18 tests verifying coordinate bounds, error mapping, and UI cards. |
| `node scripts/verify-nextjs-vercel-build.js` | 6/6 tests verifying Vercel deployment artifacts and package configs. |

---

## 📦 Preserved Monorepo History

The original multi-service Turborepo structure (with dedicated NestJS backend, BullMQ queue workers, and Docker Compose configurations) is safely preserved on git branch:
```powershell
git checkout backup-monorepo-pre-nextjs
```

---

## 📄 License
Private & Proprietary — LocalSaathi Hyperlocal Employment Platform.
