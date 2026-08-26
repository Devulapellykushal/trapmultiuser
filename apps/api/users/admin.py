"""
User Admin Configuration.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import Organization, OrganizationMembership, User


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "industry", "created_at"]
    list_filter = ["industry"]
    search_fields = ["name", "slug"]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ["user", "organization", "role", "created_at"]
    list_filter = ["role"]
    search_fields = ["user__email", "organization__name"]
    raw_id_fields = ["user", "organization"]


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["username", "email", "role", "organization", "is_active", "is_staff"]
    list_filter = ["role", "is_active", "is_staff"]
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Role & business", {"fields": ("role", "organization")}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("Role & business", {"fields": ("role", "organization")}),
    )
