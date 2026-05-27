# Seed dev login accounts (idempotent on migrate).

from django.contrib.auth.hashers import make_password
from django.db import migrations


DEV_PASSWORD = "Kushal@12"

SEED_USERS = (
    {
        "username": "admin",
        "email": "admin@thirumalawheels.com",
        "role": "ADMIN",
        "first_name": "Admin",
        "last_name": "User",
        "is_staff": True,
        "is_superuser": True,
    },
    {
        "username": "staff",
        "email": "staff@thirumalawheels.com",
        "role": "STAFF",
        "first_name": "Staff",
        "last_name": "User",
        "is_staff": False,
        "is_superuser": False,
    },
)


def seed_users(apps, schema_editor):
    User = apps.get_model("users", "User")
    hashed = make_password(DEV_PASSWORD)
    for spec in SEED_USERS:
        email = spec["email"]
        defaults = {
            "username": spec["username"],
            "first_name": spec["first_name"],
            "last_name": spec["last_name"],
            "role": spec["role"],
            "is_staff": spec["is_staff"],
            "is_superuser": spec["is_superuser"],
            "is_active": True,
            "password": hashed,
        }
        User.objects.update_or_create(email=email, defaults=defaults)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_users, noop_reverse),
    ]
