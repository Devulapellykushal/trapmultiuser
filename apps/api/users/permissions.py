"""
Permission Classes for Quake Inventory System.

Provides role-based access control for API endpoints.
"""

from rest_framework.permissions import BasePermission, IsAuthenticated


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
