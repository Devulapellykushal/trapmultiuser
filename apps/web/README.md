# Quake Web (Next.js)

Admin dashboard and POS for Quake Inventory — multi-tenant, RBAC-aware UI.

## Run

From repo root (preferred):

```bash
pnpm install
pnpm dev:web
```

Or:

```bash
cd apps/web
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Set `NEXT_PUBLIC_API_BASE_URL` (see `apps/web/.env.example`) to the API, e.g. `http://localhost:8000/api/v1`.

## Routes

| Path | Purpose |
|------|---------|
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Auth |
| `/admin/*` | Dashboard (inventory, customers, sales/invoices, reports, settings, users) |
| `/pos` | Point of sale |
| `/superadmin/login` | Platform owner login (isolated session) |
| `/superadmin` | Platform console — orgs, users, service toggles |

Brand assets: `public/assets/2d/Quake_Logo.png`, favicon.

## Product behaviour (UI)

- **Signup** → empty workspace; user is org **ADMIN**.
- **Login** → email + password only (role comes from the account).
- **Users** (admin) → invite staff/admins into **this** organization only.
- **Sidebar modules** → filtered by `user.enabledServices` from `/auth/me/` (superadmin toggles per org).
- **Sessions** → shop `/login` and platform `/superadmin/login` are isolated (separate tokens). Each flow is login → portal → logout → same login page.
- **Customers** → Directory / Segments / Outreach; POS match UX per [`CUSTOMERS.md`](../../CUSTOMERS.md).
- **Invoice preview** → print sheet (ink on paper). Dark theme must not remapped `#0c0d10` inside `.invoice-print-sheet`.
- Session change clears React Query cache so KPIs never leak across organizations.

## Scripts

```bash
pnpm dev      # development
pnpm build    # production build
pnpm start    # serve build
pnpm lint
```

## Stack

Next.js App Router, TypeScript, Tailwind, TanStack Query, Zustand auth store, Framer Motion.

More architecture: [docs/architecture/README.md](../../docs/architecture/README.md).
