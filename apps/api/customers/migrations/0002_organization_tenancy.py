# Organization FK on Customer.

import uuid

from django.db import migrations, models
import django.db.models.deletion


DEFAULT_ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


def forwards_attach_org(apps, schema_editor):
    Organization = apps.get_model("users", "Organization")
    Customer = apps.get_model("customers", "Customer")

    org, _ = Organization.objects.get_or_create(
        id=DEFAULT_ORG_ID,
        defaults={"name": "Thirumala Wheels", "slug": "thirumala-wheels"},
    )
    if Organization.objects.filter(slug="thirumala-wheels").exclude(id=org.id).exists():
        org = Organization.objects.get(slug="thirumala-wheels")

    Customer.objects.filter(organization_id__isnull=True).update(organization_id=org.id)


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0001_phase1a_tyre_pos"),
        ("users", "0004_organization_tenancy"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Business workspace that owns this customer",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="customers",
                to="users.organization",
            ),
        ),
        migrations.RunPython(forwards_attach_org, backwards_noop),
    ]
