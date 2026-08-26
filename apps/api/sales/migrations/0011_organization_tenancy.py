# Organization FK on Sale.

import uuid

from django.db import migrations, models
import django.db.models.deletion


DEFAULT_ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


def forwards_attach_org(apps, schema_editor):
    Organization = apps.get_model("users", "Organization")
    Sale = apps.get_model("sales", "Sale")

    org, _ = Organization.objects.get_or_create(
        id=DEFAULT_ORG_ID,
        defaults={"name": "Thirumala Wheels", "slug": "thirumala-wheels"},
    )
    if Organization.objects.filter(slug="thirumala-wheels").exclude(id=org.id).exists():
        org = Organization.objects.get(slug="thirumala-wheels")

    Sale.objects.filter(organization_id__isnull=True).update(organization_id=org.id)


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0010_sale_store"),
        ("users", "0004_organization_tenancy"),
    ]

    operations = [
        migrations.AddField(
            model_name="sale",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Business workspace that owns this sale",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="sales",
                to="users.organization",
            ),
        ),
        migrations.RunPython(forwards_attach_org, backwards_noop),
    ]
