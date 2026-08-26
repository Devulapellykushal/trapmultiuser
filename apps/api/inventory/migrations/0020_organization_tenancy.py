# Organization FK on Warehouse / Store / Product + org-scoped uniqueness.

import uuid

from django.db import migrations, models
import django.db.models.deletion


DEFAULT_ORG_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


def forwards_attach_org(apps, schema_editor):
    Organization = apps.get_model("users", "Organization")
    Warehouse = apps.get_model("inventory", "Warehouse")
    Store = apps.get_model("inventory", "Store")
    Product = apps.get_model("inventory", "Product")

    org, _ = Organization.objects.get_or_create(
        id=DEFAULT_ORG_ID,
        defaults={"name": "Thirumala Wheels", "slug": "thirumala-wheels"},
    )
    if Organization.objects.filter(slug="thirumala-wheels").exclude(id=org.id).exists():
        org = Organization.objects.get(slug="thirumala-wheels")

    Warehouse.objects.filter(organization_id__isnull=True).update(organization_id=org.id)
    Store.objects.filter(organization_id__isnull=True).update(organization_id=org.id)
    Product.objects.filter(organization_id__isnull=True).update(organization_id=org.id)


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0019_warehouse_email_phone_seller_image"),
        ("users", "0004_organization_tenancy"),
    ]

    operations = [
        migrations.AddField(
            model_name="warehouse",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Business workspace that owns this warehouse/shop location",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="warehouses",
                to="users.organization",
            ),
        ),
        migrations.AddField(
            model_name="store",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Business workspace that owns this store",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="stores",
                to="users.organization",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Business workspace that owns this product",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="products",
                to="users.organization",
            ),
        ),
        migrations.AlterField(
            model_name="warehouse",
            name="name",
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name="warehouse",
            name="code",
            field=models.CharField(max_length=20),
        ),
        migrations.AlterField(
            model_name="store",
            name="name",
            field=models.CharField(help_text="Store name", max_length=150),
        ),
        migrations.AlterField(
            model_name="store",
            name="code",
            field=models.CharField(
                blank=True,
                help_text="Short code for store (auto-generated if blank)",
                max_length=20,
            ),
        ),
        migrations.RunPython(forwards_attach_org, backwards_noop),
        migrations.AddConstraint(
            model_name="warehouse",
            constraint=models.UniqueConstraint(
                fields=("organization", "name"), name="warehouse_org_name_uniq"
            ),
        ),
        migrations.AddConstraint(
            model_name="warehouse",
            constraint=models.UniqueConstraint(
                fields=("organization", "code"), name="warehouse_org_code_uniq"
            ),
        ),
        migrations.AddConstraint(
            model_name="store",
            constraint=models.UniqueConstraint(
                fields=("organization", "name"), name="store_org_name_uniq"
            ),
        ),
        migrations.AddConstraint(
            model_name="store",
            constraint=models.UniqueConstraint(
                fields=("organization", "code"), name="store_org_code_uniq"
            ),
        ),
    ]
