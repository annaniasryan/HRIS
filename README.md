# HRIS — Manufacturing Workforce (Permanent + Daily Workers)

A production-ready Human Resource Information System built for a manufacturing
company with a mix of permanent staff and daily-wage workers.

**Stack:** Next.js 14 (App Router, Server Actions) · TypeScript · Tailwind CSS ·
Prisma ORM · PostgreSQL · NextAuth (credentials + roles) — deploys straight to Vercel.

## Modules

- **Employee Management** — permanent staff and daily workers, department/position,
  compensation (monthly salary or daily rate), status (active/inactive/terminated).
- **Attendance & Time Tracking** — a daily grid HR fills in (status, clock in/out,
  overtime) for every active employee. This is what daily-worker pay is calculated from.
- **Leave Management** — self-service leave requests (permanent staff only — daily
  workers have no login), HR Manager/Executive approval, leave balances.
- **Payroll** — one click computes a payroll run for a date range: permanent staff
  get their fixed monthly salary, daily workers get `daily rate × days attended`,
  plus overtime pay. Runs move Draft → Finalized → Paid.

## Roles

| Role | Can do |
|---|---|
| **Executive** | Company-wide read access, approve leave, view payroll |
| **HR Manager** | Everything: manage employees, attendance, approve leave, run & finalize payroll |
| **HR Staff** | Manage employees & attendance day-to-day (no leave approval, no payroll finalize) |
| **Worker** | Self-service — own attendance history, request leave, view own payslips |

Daily workers are **Employee** records only — they never get a login. HR staff
record their attendance each day, and payroll is calculated from it.

## Local setup

1. **Install dependencies** (needs your own internet connection — this project was
   generated without running `npm install`, so do that first):
   ```bash
   npm install
   ```

2. **Start a local PostgreSQL database.** Easiest with Docker:
   ```bash
   docker run --name hris-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=hris -p 5432:5432 -d postgres:16
   ```
   Or use an existing local Postgres install / a free hosted one (Neon, Supabase).

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   - `DATABASE_URL` — your Postgres connection string
   - `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL` — `http://localhost:3000` for local dev

4. **Create the database schema:**
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Seed sample data** (departments, positions, 4 staff logins, 8 daily workers,
   a few days of attendance):
   ```bash
   npm run db:seed
   ```

6. **Run the app:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 and sign in with one of the seeded accounts
   (password for all: `Password123!`):
   - `executive@hris.local`
   - `hrmanager@hris.local`
   - `hrstaff@hris.local`
   - `worker@hris.local`

## Deploying to Vercel

1. Push this project to a GitHub repo.
2. Create a Postgres database — the simplest options are **Vercel Postgres** or
   **Neon** (both work; Neon has a generous free tier). Copy its connection string.
3. In Vercel: **New Project** → import the repo.
4. Add environment variables in the Vercel project settings:
   - `DATABASE_URL` — your production Postgres connection string
   - `NEXTAUTH_SECRET` — a random secret (`openssl rand -base64 32`)
   - `NEXTAUTH_URL` — your deployed URL, e.g. `https://your-app.vercel.app`
5. Deploy. The build runs `prisma generate` automatically (via the `build` and
   `postinstall` scripts), so no extra Vercel config is needed.
6. Run the migration and seed against production once, from your machine:
   ```bash
   DATABASE_URL="<your production URL>" npx prisma migrate deploy
   DATABASE_URL="<your production URL>" npm run db:seed   # optional, sample data
   ```
7. **Change the seeded passwords immediately** if you seeded production, or skip
   seeding and create your real HR Manager account directly in the database /
   via a one-off script.

## Project structure

```
prisma/schema.prisma        Data model: employees, attendance, leave, payroll, users
prisma/seed.ts               Sample departments, staff, daily workers, attendance
src/lib/auth.ts              NextAuth config (credentials provider, JWT sessions)
src/lib/rbac.ts              Role → permission map used throughout the app
src/lib/payroll.ts           Wage calculation (permanent salary vs. daily rate × days)
src/middleware.ts            Route protection (redirects unauthenticated users to /login)
src/app/(dashboard)/         All authenticated pages (employees, attendance, leave, payroll)
src/app/actions/             Server Actions — all writes go through these, with RBAC checks
src/components/              Shared UI (Sidebar, Topbar, forms, StatusBadge)
```

## Known v1 limitations / suggested next steps

- Departments and positions are seeded, not yet manageable from the UI — add an
  admin screen if you need to add/edit them without touching the database.
- Leave balances default to 12 days/year on first approval; add a UI for HR to
  set custom allocations per employee.
- Overtime pay rate is derived automatically from salary/daily rate (monthly
  salary ÷ 173 hours, or daily rate ÷ 8 hours) — adjust `ASSUMED_MONTHLY_HOURS`
  in `src/app/actions/payroll.ts` if your labor policy differs.
- No payslip PDF export yet — the payroll detail page can be extended with a
  PDF/print view if you need physical payslips.
- Audit fields (`recordedById`, `approvedById`, `createdById`) store the acting
  user's id as a plain string for simplicity, without a foreign-key relation.
