# Seed platform superadmin (idempotent) and demote Thirumala org admin from is_superuser.

from django.contrib.auth.hashers import make_password
from django.db import migrations

PLATFORM_EMAIL = "superadmin@tracquake.com"
PLATFORM_PASSWORD = "Kushal@12"
THIRUMALA_ADMIN_EMAIL = "admin@thirumalawheels.com"


def seed_platform_superadmin(apps, schema_editor):
    User = apps.get_model("users", "User")
    hashed = make_password(PLATFORM_PASSWORD)

    User.objects.update_or_create(
        email=PLATFORM_EMAIL,
        defaults={
            "username": "superadmin",
            "first_name": "Platform",
            "last_name": "Superadmin",
            "role": "ADMIN",
            "is_staff": True,
            "is_superuser": True,
            "is_active": True,
            "password": hashed,
            "organization": None,
        },
    )

    # Thirumala shop admin stays org ADMIN, not platform superuser
    User.objects.filter(email__iexact=THIRUMALA_ADMIN_EMAIL).update(
        is_superuser=False,
        is_staff=True,
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0006_organization_enabled_services"),
    ]

    operations = [
        migrations.RunPython(seed_platform_superadmin, noop_reverse),
    ]
