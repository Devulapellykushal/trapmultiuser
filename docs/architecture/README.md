# Quake Inventory System Architecture

## Overview

Quake is a **multi-tenant** retail POS and inventory platform (tyre / general retail). Each business is an **Organization**. Users, warehouses, stores, products, customers, sales, invoices, and business settings are scoped to that organization.

Frontends: Next.js admin (`/admin/*`) and POS (`/pos`). Backend: Django REST API.

## System diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js (apps/web)                                         │
│  Auth · Admin dashboard · POS · Invoice preview             │
└─────────────────────────┬───────────────────────────────────┘
                          │ JWT + REST /api/v1
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Django API (apps/api)                                      │
│  users · inventory · customers · sales · invoices · …       │
│  filter_queryset_for_user(organization_id)                  │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL                                                 │
│  organizations + org FKs on business tables                 │
└─────────────────────────────────────────────────────────────┘
```

## Organization tenancy

| Table / domain | Scoped by |
|----------------|-----------|
| `User` | `organization_id` |
| Warehouse, Store, Product | `organization_id` |
| Customer | `organization_id` (CRM identity rules apply **within** org) |
| Sale | `organization_id` |
| BusinessSettings | `organization_id` |
| Invoice | via `sale__organization_id` |

Helpers: `apps/api/users/organization.py` (`filter_queryset_for_user`, `create_organization_for_signup`).

**Safety rule:** public signup must never attach to an existing business (e.g. Thirumala). See ADR 0003.

Platform operators (`is_superuser`) can disable modules per organization via `/superadmin` — see ADR 0004.

**Industry + multi-business:** each **business** (`Organization`) has a fixed `industry` (`auto_tyre` | `fmcg` | `fnb` | `general`) set at create. One login can own many businesses via `OrganizationMembership`; the top-bar switcher changes the active org so the whole app scopes to that business’s data only — see ADR 0005.

## RBAC

| Role | How obtained | Permissions (within org) |
|------|----------------|---------------------------|
| **ADMIN** | Public signup (owner), or invited by org admin | Catalog write, users, reports, analytics, settings |
| **STAFF** | Invited by org admin | POS, read inventory / invoices |

- One account = **one** role (`User.role`). Login does not choose a role.
- Permission classes: `IsAdmin`, `IsStaffOrAdmin`, `IsAdminOrReadOnly` in `users/permissions.py`.

## Auth

| Flow | Notes |
|------|--------|
| Login | Email + password → JWT (tenant `/login` or platform `/superadmin/login`) |
| Register | Enabled when `AUTH_ALLOW_PUBLIC_SIGNUP=true` → new org + ADMIN |
| Password reset | Token email via `EMAIL_ADAPTER` (`smtp` \| `console`) |
| Capabilities | `GET /api/v1/auth/capabilities/` |
| Session lifecycle | Access refresh + idle + logout — see [session-lifecycle.md](./session-lifecycle.md) |

Pluggable mail: `apps/api/core/email/`.

## Domain modules

| App | Responsibility |
|-----|----------------|
| `users` | Auth, Organization, RBAC, admin user CRUD (org-scoped) |
| `inventory` | Warehouses, stores, products, stock ledger, POs, transfers |
| `customers` | CRM directory, segments, outreach, POS lookup/upsert |
| `sales` | POS checkout, payments, returns, credit |
| `invoices` | Immutable invoices + PDF + business settings |
| `analytics` / `reports` | Org-scoped aggregates |
| `notifications` | Low-stock alerts (org-scoped warehouses) |

## Frontend notes

- Auth routes: `/login`, `/signup`, `/forgot-password`, `/reset-password`
- Admin base: `/admin` (see `lib/admin-routes.ts`)
- Invoice preview is a print sheet; dark theme must not remapped ink colors (`.invoice-print-sheet`)
- React Query cache cleared on login/logout so org A never sees org B cached KPIs

## Related docs

- [ADR 0001 — Tax policy](../adr/0001-tax-policy-indian-tyre-pos.md)
- [ADR 0002 — Customer identity](../adr/0002-customer-identity-mobile-email.md)
- [ADR 0003 — Organization tenancy & RBAC](../adr/0003-organization-tenancy-rbac.md)
- [ADR 0004 — Organization service entitlements](../adr/0004-organization-service-entitlements.md)
- [ADR 0005 — Multi-business + fixed industry](../adr/0005-organization-industry-profile.md)
- [CUSTOMERS.md](../../CUSTOMERS.md) — business CRM guide
- [Environment variables](../env-vars.md)

## Monorepo

- **apps/api** — Django backend  
- **apps/web** — Next.js frontend  
- **packages/** — shared packages (future)
