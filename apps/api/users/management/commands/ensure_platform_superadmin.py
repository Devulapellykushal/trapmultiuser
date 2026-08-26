"""
Ensure platform superadmin exists (local / ops).

Usage:
  python manage.py ensure_platform_superadmin
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

PLATFORM_EMAIL = "superadmin@tracquake.com"
PLATFORM_PASSWORD = "Kushal@12"


class Command(BaseCommand):
    help = "Create or update platform superadmin@tracquake.com (is_superuser)"

    def handle(self, *args, **options):
        User = get_user_model()
        user, created = User.objects.update_or_create(
            email=PLATFORM_EMAIL,
            defaults={
                "username": "superadmin",
                "first_name": "Platform",
                "last_name": "Superadmin",
                "role": User.Role.ADMIN,
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
                "organization": None,
            },
        )
        user.set_password(PLATFORM_PASSWORD)
        user.save(update_fields=["password"])

        # Keep Thirumala admin as tenant ADMIN only
        updated = User.objects.filter(email__iexact="admin@thirumalawheels.com").update(
            is_superuser=False,
            is_staff=True,
        )

        action = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} {PLATFORM_EMAIL} (password reset to seed). "
                f"Thirumala admin demoted from platform superuser: {updated} row(s)."
            )
        )
