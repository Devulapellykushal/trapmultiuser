"""
Platform superadmin API — list organizations/users and toggle enabled services.

Requires Django User.is_superuser (not org ADMIN).
"""

from __future__ import annotations

from django.db.models import Count, Prefetch, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Organization, User
from .organization import (
    SERVICE_KEYS,
    SERVICE_LABELS,
    get_enabled_services,
    set_enabled_services,
)
from .permissions import IsPlatformSuperuser


def _member_payload(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "is_superuser": bool(user.is_superuser),
        "name": f"{user.first_name} {user.last_name}".strip() or user.email,
        "date_joined": user.date_joined,
        "organization_id": str(user.organization_id) if user.organization_id else None,
        "organization_name": user.organization.name if user.organization_id else None,
    }


class SuperadminMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            {"is_superuser": bool(getattr(request.user, "is_superuser", False))},
            status=status.HTTP_200_OK,
        )


class SuperadminOrganizationListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformSuperuser]

    def get(self, request):
        qs = (
            Organization.objects.annotate(user_count=Count("users"))
            .prefetch_related(
                Prefetch(
                    "users",
                    queryset=User.objects.order_by("date_joined"),
                    to_attr="_prefetched_members",
                )
            )
            .order_by("name")
        )
        q = (request.query_params.get("q") or "").strip().lower()
        results = []
        for org in qs:
            members = getattr(org, "_prefetched_members", [])
            owner = next(
                (u for u in members if u.role == User.Role.ADMIN and not u.is_superuser),
                None,
            )
            if owner is None:
                owner = next(
                    (u for u in members if u.role == User.Role.ADMIN),
                    members[0] if members else None,
                )
            owner_email = owner.email if owner else None
            if q:
                hay = " ".join(
                    filter(
                        None,
                        [
                            org.name,
                            org.slug,
                            owner_email,
                            *[u.email for u in members],
                        ],
                    )
                ).lower()
                if q not in hay:
                    continue
            results.append(
                {
                    "id": str(org.id),
                    "name": org.name,
                    "slug": org.slug,
                    "created_at": org.created_at,
                    "user_count": org.user_count,
                    "owner_email": owner_email,
                    "enabled_services": get_enabled_services(org),
                }
            )
        return Response({"results": results, "service_labels": SERVICE_LABELS})


class SuperadminOrganizationDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformSuperuser]

    def get(self, request, pk):
        try:
            org = Organization.objects.annotate(user_count=Count("users")).get(pk=pk)
        except (Organization.DoesNotExist, ValueError):
            return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)

        members = list(org.users.select_related("organization").order_by("date_joined"))
        owner = next(
            (m for m in members if m.role == User.Role.ADMIN and not m.is_superuser),
            None,
        )
        if owner is None:
            owner = next(
                (m for m in members if m.role == User.Role.ADMIN),
                members[0] if members else None,
            )
        return Response(
            {
                "id": str(org.id),
                "name": org.name,
                "slug": org.slug,
                "created_at": org.created_at,
                "updated_at": org.updated_at,
                "user_count": org.user_count,
                "owner_email": owner.email if owner else None,
                "enabled_services": get_enabled_services(org),
                "members": [_member_payload(m) for m in members],
                "service_labels": SERVICE_LABELS,
            }
        )


class SuperadminUserListView(APIView):
    """Flat directory of every registered user across organizations."""

    permission_classes = [IsAuthenticated, IsPlatformSuperuser]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        qs = User.objects.select_related("organization").order_by("-date_joined")
        if q:
            qs = qs.filter(
                Q(email__icontains=q)
                | Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
                | Q(organization__name__icontains=q)
                | Q(organization__slug__icontains=q)
            )
        results = [_member_payload(u) for u in qs[:500]]
        return Response(
            {
                "results": results,
                "count": len(results),
            }
        )


class SuperadminOrganizationServicesView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformSuperuser]

    def patch(self, request, pk):
        try:
            org = Organization.objects.get(pk=pk)
        except (Organization.DoesNotExist, ValueError):
            return Response({"detail": "Organization not found."}, status=status.HTTP_404_NOT_FOUND)

        body = request.data if isinstance(request.data, dict) else {}
        patch = {}
        for key in SERVICE_KEYS:
            if key in body:
                patch[key] = body[key]
        if not patch:
            return Response(
                {
                    "detail": f"Provide at least one of: {', '.join(SERVICE_KEYS)}",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        enabled = set_enabled_services(org, patch)
        return Response(
            {
                "id": str(org.id),
                "enabled_services": enabled,
            },
            status=status.HTTP_200_OK,
        )
