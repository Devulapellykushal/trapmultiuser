"""
Custom User Model for Quake Inventory System.

Extends Django's AbstractUser with role-based access control + organization tenancy.

RBAC (one account → one role):
- ADMIN: owner/manager of their organization (settings, catalog, users, reports)
- STAFF: day-to-day POS / inventory within the same organization

How accounts get roles:
- Public signup → new Organization + user as ADMIN of that empty workspace
- Admin “Add user” → STAFF or ADMIN inside the creator’s organization
- Login does not choose a role; User.role on the account is authoritative
"""

import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class Organization(models.Model):
    """One business workspace. Users and business data are scoped to this."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=80, unique=True)
    enabled_services = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Sidebar / module entitlements for this org. "
            "Missing keys default to enabled. Superadmin toggles these."
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "organizations"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class User(AbstractUser):
    """
    Custom user with a single role per account + organization tenancy.

    Roles:
    - ADMIN: Full access within their organization
    - STAFF: POS / day-to-day within their organization
    """

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        STAFF = "STAFF", "Staff"

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.STAFF,
        help_text=(
            "Single role for this account. Public signup creates ADMIN; "
            "org admins invite STAFF/ADMIN into their workspace."
        ),
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.PROTECT,
        related_name="users",
        null=True,
        blank=True,
        help_text="Business workspace this user belongs to",
    )
    welcome_email_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the one-time welcome email was sent",
    )

    class Meta:
        db_table = "users"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return f"{self.username} ({self.role})"

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN

    @property
    def is_staff_role(self):
        return self.role == self.Role.STAFF


class PasswordResetToken(models.Model):
    """One-time token for email password reset links."""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "users_password_reset_token"
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self):
        return f"reset:{self.user_id}:{self.token[:8]}…"
