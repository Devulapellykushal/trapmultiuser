"""
Custom User Model for Quake Inventory System.

Extends Django's AbstractUser with role-based access control.
"""

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user with role field for RBAC.
    
    Roles:
    - ADMIN: Full access to all features
    - STAFF: POS access, view inventory, sales summary/trends for dashboard (no deep inventory reports or profit/tax)
    """
    
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Admin'
        STAFF = 'STAFF', 'Staff'
    
    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.STAFF,
        help_text="User role determines permissions"
    )
    
    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
    
    def __str__(self):
        return f"{self.username} ({self.role})"
    
    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN
    
    @property
    def is_staff_role(self):
        return self.role == self.Role.STAFF
