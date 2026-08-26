# ADR 0003: Organization tenancy and RBAC

## Status

Accepted

## Context

Quake started as a single shared database for one shop (Thirumala). Public email signup then created users on that same data plane, so new accounts could see another business’s inventory, customers, and KPIs.

We already had **RBAC** (`ADMIN` / `STAFF`) for permissions inside a shop. We needed a **data boundary** so each business is isolated, while keeping the existing role model.

## Decision

### 1. Organization = workspace

Introduce `Organization` (`users.Organization`). Attach:

- `User.organization`
- `Warehouse`, `Store`, `Product`, `Customer`, `Sale`, `BusinessSettings.organization`

List/create APIs filter and stamp by `request.user.organization_id` (`filter_queryset_for_user`). Missing org → empty queryset (fail closed).

### 2. Signup creates a new org

Public `register_user`:

1. Create a **new** `Organization` (never reuse Thirumala / default slug)
2. Create the user as **ADMIN** of that org
3. Empty catalogue — no warehouses, products, or customers from other tenants

### 3. Invite stays in-org

Admin “Add user” (`UserCreateSerializer`) assigns `organization = request.user.organization`, creates an `OrganizationMembership`, and the chosen role (`STAFF` or `ADMIN`).

### 3b. Multi-business (same login)

A user may hold many memberships. Switching active business updates `User.organization` + `User.role` from the membership. Industry is fixed per org — see [ADR 0005](./0005-organization-industry-profile.md).

### 4. RBAC mapping (unchanged meanings, scoped)

| Role | Meaning |
|------|---------|
| ADMIN | Owner/manager **of their organization** |
| STAFF | Counter / day-to-day **of the same organization** |

One email → one stored role. Login does not pick Admin vs Staff.

### 5. Legacy data

Migrations:

- Seed default org `thirumala-wheels` and attach historical rows / seed users
- Peel non-Thirumala emails off that org into their own workspaces (`0005_peel_non_thirumala_users`)

### 6. Client safety

Clear React Query cache on login/logout so cached summaries cannot cross organizations.

## Consequences

- Isolation tests: `apps/api/users/tests.py` (signup org ≠ Thirumala; empty lists/summary for new users; invited STAFF inherits creator org).
- Analytics, reports, stock summary, POS products, notifications must pass `organization_id`.
- Categories/suppliers may remain shared taxonomy until separately tenancy-scoped.
- Invoice PDF / preview are presentation; data still comes from org-scoped invoice APIs.
- Module entitlements (which sidebar services an org may use) are separate: see [ADR 0004](./0004-organization-service-entitlements.md).

## References

- `apps/api/users/organization.py`, `users/services/auth_service.py`
- Migrations: `users.0004`, `users.0005`, `inventory.0020`, `customers.0002`, `sales.0011`, `invoices.0010`
- Architecture: [docs/architecture/README.md](../architecture/README.md)
