"""Shared organization scoping for analytics querysets."""


def scope_by_org(queryset, organization_id, *, field: str = "organization_id"):
    """Restrict queryset to org; empty if caller has no organization."""
    if organization_id is None:
        return queryset.none()
    return queryset.filter(**{field: organization_id})
