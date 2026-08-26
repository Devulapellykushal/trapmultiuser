"""
Permission Classes for Quake Inventory System.

Provides role-based access control for API endpoints.
"""

from rest_framework.permissions import BasePermission, IsAuthenticated

from .organization import SERVICE_LABELS, user_has_service


class IsAdmin(BasePermission):
    """
    Only allow users with ADMIN role.
    
    Use for: Analytics, User Management, Product Create/Update/Delete
    """
    
    message = "Admin access required"
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role == 'ADMIN'


class IsStaffOrAdmin(BasePermission):
    """
    Allow users with STAFF or ADMIN role.
    
    Use for: POS, View Inventory, View Invoices
    """
    
    message = "Staff or admin access required"
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in ['STAFF', 'ADMIN']


class IsAdminOrReadOnly(BasePermission):
    """
    Admin for write operations, authenticated for read.
    
    Use for: Product list (GET: any auth, POST/PUT/DELETE: admin)
    """
    
    message = "Admin access required for this action"
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Read permissions for any authenticated user
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return True
        
        # Write permissions only for ADMIN
        return request.user.role == 'ADMIN'


class IsPlatformSuperuser(BasePermission):
    """Django is_superuser — platform console only (not org ADMIN)."""

    message = "Platform superuser access required"

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "is_superuser", False)
        )


def require_org_service(service_key: str) -> type[BasePermission]:
    """Fail closed when Organization.enabled_services disables a module."""

    label = SERVICE_LABELS.get(service_key, service_key)

    class HasOrgService(BasePermission):
        message = (
            f"{label} is not enabled for your organization. "
            "Contact Quake support if you need this module."
        )

        def has_permission(self, request, view):
            if not request.user or not request.user.is_authenticated:
                return False
            return user_has_service(request.user, service_key)

    HasOrgService.__name__ = f"HasOrgService_{service_key}"
    HasOrgService.__qualname__ = f"HasOrgService_{service_key}"
    return HasOrgService


HasCustomersService = require_org_service("customers")
HasReportsService = require_org_service("reports")
HasAnalyticsService = require_org_service("analytics")
