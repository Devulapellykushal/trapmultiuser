"""
Organization tenancy helpers — scope all business data by org.

Tenancy + RBAC map:
- Organization = one business workspace (data boundary)
- User.role = ADMIN | STAFF inside that workspace (permission boundary)
- Public signup always creates a NEW org and an ADMIN owner
- Invited users join the inviter’s org with the role the admin assigns
- Superadmin toggles Organization.enabled_services (sidebar modules)
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from django.utils.text import slugify

from .models import Organization

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


def create_organization_for_signup(*, email: str, name: str = "") -> Organization:
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
        enabled_services=dict(DEFAULT_ENABLED_SERVICES),
    )


def org_label_from_email(email: str) -> str:
    local = re.sub(r"[^a-zA-Z0-9]+", " ", email.split("@")[0]).strip()
    return local.title() if local else "My Business"
