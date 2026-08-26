# ADR 0005: Multi-business workspaces + fixed industry profile

## Status

Accepted (supersedes mutable industry-on-one-org)

## Context

Quake’s engines (POS, stock ledger, GST invoices, CRM mobile/email identity) are vertical-agnostic. Forms and labels differ by industry (`auto_tyre`, `fmcg`, `fnb`, `general`).

A previous approach stored `Organization.industry` and allowed ADMIN to **PATCH** it on the same org. That made it look like inventory “moved” into another industry when only UX labels changed — wrong for real multi-vertical owners (e.g. Kushal runs a tyre shop and an FMCG shop under one login).

## Decision

1. **Organization = one business** with a **fixed** `industry` set at create time (signup or “Add business”). Industry is never mutated afterward.
2. **`OrganizationMembership`** links a user to many orgs, each with a role (`ADMIN` | `STAFF`) in that business.
3. **`User.organization` + `User.role`** are the **active** workspace for the session. Switching updates both from the membership row; all `filter_queryset_for_user` scopes follow the active org.
4. APIs:
   - `GET /api/v1/auth/businesses/` — list memberships
   - `POST /api/v1/auth/businesses/` — create empty business + membership + switch active
   - `POST /api/v1/auth/businesses/switch/` — switch active org
   - Industry PATCH endpoint **removed**
5. Frontend: business switcher (dashboard + POS); Settings shows locked industry for the active business; React Query / POS cache cleared on switch.
6. Out of scope: batch/lot, expiry, recipes, first-class UOM.

## Consequences

- Tyre catalog and FMCG catalog never share rows — they are different `organization_id`s.
- Inviting STAFF attaches membership to the inviter’s **active** org only.
- Existing users backfilled with one membership from `User.organization` (migration `users.0009`).

## References

- ADR 0003 (tenancy), ADR 0002 (CRM identity)
- `users.organization` helpers: `create_business_for_user`, `switch_active_organization`
- Architecture: [docs/architecture/README.md](../architecture/README.md)
