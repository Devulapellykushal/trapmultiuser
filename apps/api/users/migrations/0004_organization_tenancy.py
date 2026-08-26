# Organization model + User.organization (users app only).
# Business-table FKs live in inventory/customers/sales/invoices migrations.

import uuid

from django.db import migrations, models
import django.db.models.deletion


DEFAULT_ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


def forwards_seed_org_users(apps, schema_editor):
    Organization = apps.get_model("users", "Organization")
    User = apps.get_model("users", "User")

    org, _ = Organization.objects.get_or_create(
        id=DEFAULT_ORG_ID,
        defaults={
            "name": "Thirumala Wheels",
            "slug": "thirumala-wheels",
        },
    )
    if Organization.objects.filter(slug="thirumala-wheels").exclude(id=org.id).exists():
        org = Organization.objects.get(slug="thirumala-wheels")

    User.objects.filter(organization_id__isnull=True).update(organization_id=org.id)


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0003_password_reset_welcome_email"),
    ]

    operations = [
        migrations.CreateModel(
            name="Organization",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=200)),
                ("slug", models.SlugField(max_length=80, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "organizations",
                "ordering": ["name"],
            },
        ),
        migrations.AddField(
            model_name="user",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Business workspace this user belongs to",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="users",
                to="users.organization",
            ),
        ),
        migrations.RunPython(forwards_seed_org_users, backwards_noop),
    ]
