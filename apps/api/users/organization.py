"""
Organization tenancy helpers — scope all business data by org.

Tenancy + RBAC map:
- Organization = one business workspace (data boundary + fixed industry)
- OrganizationMembership = user ↔ org with role in that business
- User.organization / User.role = *active* business for this session
- One login may own many businesses (tyre + FMCG); switching scopes the whole app
- Industry is set once at org create — never mutated; add another business instead
- Public signup / “Add business” → NEW org + ADMIN membership
- Invited users join the inviter’s *active* org with the assigned role
- Superadmin toggles Organization.enabled_services (sidebar modules)
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from django.db import transaction
from django.utils.text import slugify

from .models import Organization, OrganizationMembership, User

INDUSTRY_CHOICES = frozenset(
    choice.value for choice in Organization.Industry
)

DEFAULT_INDUSTRY = Organization.Industry.AUTO_TYRE


def normalize_industry(value: str | None) -> str:
    if value and value in INDUSTRY_CHOICES:
        return value
    return DEFAULT_INDUSTRY


def get_organization_industry(org: Organization | None) -> str:
    if org is None:
        return DEFAULT_INDUSTRY
    return normalize_industry(getattr(org, "industry", None))


def ensure_membership(
    user: User,
    organization: Organization,
    *,
    role: str,
) -> OrganizationMembership:
    """Create or update membership so user↔org stays authoritative."""
    membership, created = OrganizationMembership.objects.get_or_create(
        user=user,
        organization=organization,
        defaults={"role": role},
    )
    if not created and membership.role != role:
        membership.role = role
        membership.save(update_fields=["role", "updated_at"])
    return membership


def list_memberships_for_user(user: User):
    return (
        OrganizationMembership.objects.filter(user=user)
        .select_related("organization")
        .order_by("organization__name")
    )


@transaction.atomic
def switch_active_organization(user: User, organization_id: uuid.UUID | str) -> User:
    """
    Point User.organization + User.role at a membership the user already has.
    Data isolation stays on organization_id filters — switch only changes scope.
    """
    try:
        membership = OrganizationMembership.objects.select_related(
            "organization",
        ).get(user=user, organization_id=organization_id)
    except OrganizationMembership.DoesNotExist as exc:
        raise ValueError("You do not belong to that business.") from exc

    user.organization = membership.organization
    user.role = membership.role
    user.save(update_fields=["organization", "role"])
    return user


@transaction.atomic
def create_business_for_user(
    user: User,
    *,
    name: str,
    industry: str | None = None,
) -> Organization:
    """
    Add another isolated business under the same login.
    Caller becomes ADMIN of the new org and switches active workspace to it.
    """
    label = (name or "").strip()
    if not label:
        raise ValueError("Business name is required.")

    org = Organization.objects.create(
        name=label[:200],
        slug=unique_org_slug(label),
        industry=normalize_industry(industry),
        enabled_services=dict(DEFAULT_ENABLED_SERVICES),
    )
    ensure_membership(user, org, role=User.Role.ADMIN)
    user.organization = org
    user.role = User.Role.ADMIN
    user.save(update_fields=["organization", "role"])
    return org


@transaction.atomic
def leave_business_for_user(user: User, organization_id: uuid.UUID | str) -> User:
    """
    Unlink this login from a business (drop OrganizationMembership).

    Rules:
    - Must already belong to that business
    - Must keep at least one other business (cannot leave the last one)
    - Cannot leave as the last ADMIN while other members remain
    - If it was the active workspace, switch to another membership
    """
    try:
        membership = OrganizationMembership.objects.select_related(
            "organization",
        ).get(user=user, organization_id=organization_id)
    except OrganizationMembership.DoesNotExist as exc:
        raise ValueError("You do not belong to that business.") from exc

    other_memberships = list(
        OrganizationMembership.objects.filter(user=user)
        .exclude(organization_id=organization_id)
        .select_related("organization")
        .order_by("organization__name")
    )
    if not other_memberships:
        raise ValueError(
            "You cannot leave your only business. "
            "Add another business first, or keep this one."
        )

    org = membership.organization
    remaining_admins = OrganizationMembership.objects.filter(
        organization=org,
        role=User.Role.ADMIN,
    ).exclude(user=user)
    other_members = OrganizationMembership.objects.filter(
        organization=org,
    ).exclude(user=user)
    if (
        membership.role == User.Role.ADMIN
        and other_members.exists()
        and not remaining_admins.exists()
    ):
        raise ValueError(
            "You are the last admin of this business. "
            "Promote another admin before leaving."
        )

    was_active = str(user.organization_id) == str(organization_id)
    membership.delete()

    if was_active:
        next_m = other_memberships[0]
        user.organization = next_m.organization
        user.role = next_m.role
        user.save(update_fields=["organization", "role"])

    return user

# Keys match tenant sidebar / module ids (Dashboard & Settings always on).
SERVICE_KEYS = (
    "pos",
    "warehouses",
    "stores",
    "inventory",
    "customers",
    "sales",
    "reports",
    "analytics",
)

DEFAULT_ENABLED_SERVICES: dict[str, bool] = {key: True for key in SERVICE_KEYS}

SERVICE_LABELS: dict[str, str] = {
    "pos": "POS",
    "warehouses": "Warehouses / Godown",
    "stores": "Stores",
    "inventory": "Inventory",
    "customers": "Customers (CRM)",
    "sales": "Sales",
    "reports": "Reports",
    "analytics": "Analytics",
}


def user_organization_id(user) -> uuid.UUID | None:
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return getattr(user, "organization_id", None)


def filter_queryset_for_user(queryset, user, *, field: str = "organization_id"):
    """Restrict queryset to the caller's organization. Empty if none."""
    org_id = user_organization_id(user)
    if org_id is None:
        return queryset.none()
    return queryset.filter(**{field: org_id})


def unique_org_slug(base: str) -> str:
    raw = slugify(base)[:60] or "business"
    slug = raw
    n = 1
    while Organization.objects.filter(slug=slug).exists():
        slug = f"{raw}-{n}"
        n += 1
    return slug


def get_enabled_services(org: Organization | None) -> dict[str, bool]:
    """Merge stored flags with defaults (missing key = enabled)."""
    merged = dict(DEFAULT_ENABLED_SERVICES)
    if org is None:
        return merged
    raw = getattr(org, "enabled_services", None) or {}
    if isinstance(raw, dict):
        for key in SERVICE_KEYS:
            if key in raw:
                merged[key] = bool(raw[key])
    return merged


def set_enabled_services(org: Organization, patch: dict[str, Any]) -> dict[str, bool]:
    """Apply partial service toggles; persist and return full merged map."""
    current = get_enabled_services(org)
    for key, value in (patch or {}).items():
        if key in SERVICE_KEYS:
            current[key] = bool(value)
    org.enabled_services = current
    org.save(update_fields=["enabled_services", "updated_at"])
    return current


def org_has_service(org: Organization | None, service_key: str) -> bool:
    if service_key not in SERVICE_KEYS:
        return True
    return bool(get_enabled_services(org).get(service_key, True))


def user_has_service(user, service_key: str) -> bool:
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    org_id = getattr(user, "organization_id", None)
    if org_id is None:
        return org_has_service(None, service_key)
    # Always read entitlements from DB so superadmin toggles apply immediately
    org = Organization.objects.filter(pk=org_id).only("enabled_services").first()
    return org_has_service(org, service_key)


def create_organization_for_signup(
    *,
    email: str,
    name: str = "",
    industry: str | None = None,
) -> Organization:
    """New public signup → brand-new empty business (not shared with anyone)."""
    label = (name or "").strip() or email.split("@")[0] or "My Business"
    # Prefer domain as business hint when no name
    if not (name or "").strip() and "@" in email:
        domain = email.split("@", 1)[1].split(".", 1)[0]
        if domain and domain not in ("gmail", "yahoo", "hotmail", "outlook", "icloud"):
            label = domain.replace("-", " ").title()
    return Organization.objects.create(
        name=label[:200],
        slug=unique_org_slug(label),
        industry=normalize_industry(industry),
        enabled_services=dict(DEFAULT_ENABLED_SERVICES),
    )


def org_label_from_email(email: str) -> str:
    local = re.sub(r"[^a-zA-Z0-9]+", " ", email.split("@")[0]).strip()
    return local.title() if local else "My Business"
