# ADR 0004: Organization service entitlements (superadmin)

## Status

Accepted

## Context

Multi-tenant Quake orgs all received the same sidebar modules (POS, CRM, reports, …). Platform operators need to turn modules off per business without inventing per-user feature flags or a billing product.

## Decision

1. **`Organization.enabled_services`** — JSON map of module keys (`pos`, `warehouses`, `stores`, `inventory`, `customers`, `sales`, `reports`, `analytics`). Missing keys default to **enabled**. New signups store the full default map (all on).

2. **Who toggles** — Django `User.is_superuser` via `/superadmin` UI and `/api/v1/superadmin/` APIs. Seed account: `superadmin@tracquake.com` signs in at **`/superadmin/login`** with an **isolated browser session** (separate tokens from shop `/login`). Org `ADMIN` / `STAFF` stay tenant roles and cannot change entitlements.

3. **Enforcement**
   - Tenant sidebar + command palette filter by `user.enabledServices`
   - Dashboard / POS client redirects when a route’s service is off
   - Module APIs (customers, reports, analytics) return **403** when the org service is disabled
   - Always on: Dashboard, Settings (Users remains org-admin only)

4. **Auth payload** — `/auth/me/` and login include `isSuperuser` and `enabledServices` so the web app does not need an extra round-trip.

## Consequences

- Superadmin console: web `/superadmin` (not under `/admin` tenant chrome).
- Helpers: `users.organization.get_enabled_services` / `set_enabled_services` / `user_has_service`.
- Out of scope: billing/plans, per-user flags inside an org, marketing-page gating.

## References

- `apps/api/users/organization.py`, `users/superadmin_views.py`, migration `users.0006`
- Web: `apps/web/app/superadmin/`, `lib/enabled-services.ts`
- Tenancy ADR: [0003-organization-tenancy-rbac.md](./0003-organization-tenancy-rbac.md)
