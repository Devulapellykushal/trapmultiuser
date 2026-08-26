"""
Custom User Model for Quake Inventory System.

Extends Django's AbstractUser with role-based access control + organization tenancy.

RBAC (per business via OrganizationMembership; denormalized on User for active org):
- ADMIN: owner/manager of that organization (settings, catalog, users, reports)
- STAFF: day-to-day POS / inventory within that organization

How accounts get roles:
- Public signup → new Organization + membership ADMIN + active org
- “Add business” → another Organization + membership ADMIN + switch active
- Admin “Add user” → STAFF or ADMIN membership inside the creator’s *active* org
- Login does not choose a role; active membership role is authoritative
"""

import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class Organization(models.Model):
    """One business workspace. Users and business data are scoped to this."""

    class Industry(models.TextChoices):
        AUTO_TYRE = "auto_tyre", "Auto / Tyre"
        FMCG = "fmcg", "FMCG"
        FNB = "fnb", "Food & Beverage"
        GENERAL = "general", "General retail"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=80, unique=True)
    industry = models.CharField(
        max_length=32,
        choices=Industry.choices,
        default=Industry.AUTO_TYRE,
        db_index=True,
        help_text=(
            "Fixed industry for this business at creation. "
            "Drives UX profiles; catalog/CRM data stay isolated to this org. "
            "Not changed later — add another business instead."
        ),
    )
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
            "Role for the active business (synced from OrganizationMembership "
            "when switching). Signup / add-business set ADMIN."
        ),
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.PROTECT,
        related_name="users",
        null=True,
        blank=True,
        help_text=(
            "Active business workspace for this session. "
            "User may belong to multiple orgs via OrganizationMembership."
        ),
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


class OrganizationMembership(models.Model):
    """
    Links a user to a business (organization) with a role in that business.

    One login can own/join many businesses (e.g. tyre shop + FMCG). Switching
    active business updates User.organization + User.role from this row.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(
        max_length=10,
        choices=User.Role.choices,
        default=User.Role.STAFF,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "organization_memberships"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "organization"],
                name="uniq_membership_user_organization",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "organization"]),
        ]

    def __str__(self):
        return f"{self.user_id}@{self.organization_id}:{self.role}"


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
