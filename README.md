# Quake Inventory System

Multi-tenant retail POS and inventory for tyre / retail shops — Django API + Next.js admin & POS.

**Brand:** Quake (ink + champagne). Canonical mark: `apps/web/public/assets/2d/Quake_Logo.png`.

## What it is

- **Organization tenancy** — each business has its own workspace (warehouses, products, customers, sales, invoices). Public signup never shares another shop’s data.
- **RBAC** — one email → one role (`ADMIN` or `STAFF`) inside that organization.
- **POS** — GST billing, discounts, credit sales, barcode, shared godown / multi-shop modes.
- **Customers CRM** — directory, segments, outreach; identity by mobile (preferred) or email. See [`CUSTOMERS.md`](./CUSTOMERS.md).
- **Auth** — email login, public signup, password reset (SMTP or console adapter).
- **Superadmin** — platform `is_superuser` console at `/superadmin` toggles which modules each organization can use (CRM, reports, etc.).

## Project structure

```
trapmultiuser/
├── apps/
│   ├── api/          # Django + DRF (PostgreSQL)
│   ├── web/          # Next.js App Router (admin + POS)
│   └── client/       # Product studio / related client
├── docs/
│   ├── architecture/ # System overview + tenancy
│   ├── adr/          # Architecture decision records
│   └── …
├── CUSTOMERS.md      # Business guide — customer identity
├── .env.example
└── README.md
```

## Quick start

### Prerequisites

- Node.js 18+, PNPM 8+
- Python 3.9+
- PostgreSQL 12+ (or SQLite via `USE_SQLITE` for local only)

### Install

```bash
pnpm install
cp .env.example .env   # set DATABASE_URL / secrets / FRONTEND_URL
```

### Backend (`apps/api`)

```bash
cd apps/api
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

**API:** http://localhost:8000 · **Swagger:** http://localhost:8000/api/docs/

After migrate, seed logins:

| Email | Role | Password |
|-------|------|----------|
| `superadmin@tracquake.com` | Platform superuser (`/superadmin/login`) | `Kushal@12` |
| `admin@thirumalawheels.com` | Org ADMIN (Thirumala) | `Kushal@12` |
| `staff@thirumalawheels.com` | Org STAFF (Thirumala) | `Kushal@12` |

Public signup creates a **new empty organization** and an **ADMIN** owner for that workspace.

### Frontend (`apps/web`)

```bash
pnpm dev:web
# or: cd apps/web && pnpm dev
```

**App:** http://localhost:3000 · Auth: `/login`, `/signup` · Admin: `/admin` · POS: `/pos` · Platform: `/superadmin/login`

## Tenancy & roles (short)

| Concept | Rule |
|---------|------|
| **Organization** | Data boundary — inventory, customers, sales, invoices, settings |
| **ADMIN** | Full access in their org (catalog, users, reports, settings) |
| **STAFF** | Day-to-day POS / read inventory in the same org |
| **Signup** | Always new org + ADMIN |
| **Invite user** | Same org; role chosen by an ADMIN |
| **Superadmin** | Django `is_superuser` — org service toggles at `/superadmin` |

Engineering detail: [`docs/adr/0003-organization-tenancy-rbac.md`](./docs/adr/0003-organization-tenancy-rbac.md), [`docs/adr/0004-organization-service-entitlements.md`](./docs/adr/0004-organization-service-entitlements.md), [`docs/architecture/README.md`](./docs/architecture/README.md).

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, TypeScript, Tailwind |
| Backend | Django 4.2, DRF, JWT |
| Database | PostgreSQL |
| API docs | drf-spectacular |
| Packages | PNPM workspaces |

## Docs map

| Doc | Audience |
|-----|----------|
| [`CUSTOMERS.md`](./CUSTOMERS.md) | Business — CRM identity |
| [`docs/architecture/README.md`](./docs/architecture/README.md) | Engineering — architecture |
| [`docs/adr/`](./docs/adr/) | Decisions (tax, customers, tenancy) |
| [`docs/env-vars.md`](./docs/env-vars.md) | Environment variables |
| [`apps/api/README.md`](./apps/api/README.md) | API runbook |
| [`apps/web/README.md`](./apps/web/README.md) | Web app runbook |

## License

Proprietary — All rights reserved.
