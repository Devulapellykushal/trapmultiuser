# Quake Inventory API

Django + DRF backend for Quake (TRAP) multi-tenant POS / inventory.

## Run locally

Configure the database in the **repo root** `.env` (`DATABASE_URL`, or legacy `POSTGRES_*` / `USE_SQLITE`).

```bash
cd apps/api
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

- Health: `GET /health/`
- OpenAPI: `/api/docs/` · `/api/redoc/`
- Auth base: `/api/v1/auth/`
- Admin users: `/api/v1/admin/users/`
- Superadmin (platform `is_superuser`): `/api/v1/superadmin/` — org list + service toggles

## Tenancy & RBAC

Every business row is scoped to an **Organization**. Callers only see their org’s data.

| Event | Result |
|-------|--------|
| Public signup (`POST /api/v1/auth/register/`) | New org + user **ADMIN** |
| Admin creates user | Same org as creator; role ADMIN or STAFF |
| Login | JWT; role is whatever is stored on the user |

See [ADR 0003](../../docs/adr/0003-organization-tenancy-rbac.md) and [ADR 0004](../../docs/adr/0004-organization-service-entitlements.md).

Isolation tests:

```bash
python manage.py test users.tests
```

## Seed users (after migrate)

| Email | Role | Password |
|-------|------|----------|
| `superadmin@tracquake.com` | Platform `is_superuser` (`/superadmin`) | `Kushal@12` |
| `admin@thirumalawheels.com` | Org ADMIN (Thirumala) | `Kushal@12` |
| `staff@thirumalawheels.com` | Org STAFF (Thirumala) | `Kushal@12` |

`users.0007_seed_platform_superadmin` (or `python manage.py ensure_platform_superadmin`) creates the platform account and keeps Thirumala admin as tenant-only.

## Auth & email

| Setting | Purpose |
|---------|---------|
| `AUTH_ALLOW_PUBLIC_SIGNUP` | Allow `/auth/register/` (default true) |
| `EMAIL_ADAPTER` | `smtp` or `console` |
| `SMTP_*` | Host, port, username, password, TLS |
| `FRONTEND_URL` | Links in reset / welcome emails |
| `AUTH_DEV_RETURN_RESET_TOKEN` | Dev-only: return reset token in API body |

Mail adapters live in `core/email/`.

## Notable apps

| App | Notes |
|-----|--------|
| `users` | Organization, JWT auth, password reset, org-scoped user admin |
| `inventory` | Stock ledger, warehouses/stores, POS products (org-scoped) |
| `customers` | CRM; identity rules within org ([CUSTOMERS.md](../../CUSTOMERS.md)) |
| `sales` / `invoices` | Checkout, credit, immutable invoices + PDF |
| `analytics` / `reports` | Aggregates filtered by `organization_id` |

Package layout is declared in `pyproject.toml` for editable installs (`uv` / pip).
