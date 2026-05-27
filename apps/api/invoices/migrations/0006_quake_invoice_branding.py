# Generated manually — Quake invoice header + legacy BusinessSettings cleanup.

from django.db import migrations, models

SINGLETON_PK = "00000000-0000-0000-0000-000000000001"
LEGACY_BUSINESS_NAMES = frozenset({"EDIT - BY Quake", "Quake INVENTORY"})


def forwards_quake_branding(apps, schema_editor):
    BusinessSettings = apps.get_model("invoices", "BusinessSettings")
    try:
        s = BusinessSettings.objects.get(pk=SINGLETON_PK)
    except BusinessSettings.DoesNotExist:
        return

    dirty = []
    original_name = (s.business_name or "").strip()

    if original_name in LEGACY_BUSINESS_NAMES:
        s.business_name = "Quake"
        dirty.append("business_name")

    if (s.tagline or "").strip() == "Premium Apparel":
        s.tagline = ""
        dirty.append("tagline")

    fill_address = original_name in LEGACY_BUSINESS_NAMES or not (
        s.address_line1 or ""
    ).strip()
    if fill_address:
        s.address_line1 = "P No 385, Ground Floor"
        s.address_line2 = "Film Nagar, Jubilee Hills"
        s.city = "Hyderabad"
        s.state = "Telangana"
        s.pincode = "500033"
        dirty.extend(
            ["address_line1", "address_line2", "city", "state", "pincode"]
        )

    if not (s.gstin or "").strip():
        s.gstin = ""
        dirty.append("gstin")

    if dirty:
        s.save(update_fields=list(dict.fromkeys(dirty)))


class Migration(migrations.Migration):

    dependencies = [
        ("invoices", "0005_merge_sale_invoice_counters"),
    ]

    operations = [
        migrations.RunPython(forwards_quake_branding, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="businesssettings",
            name="business_name",
            field=models.CharField(default="Quake", max_length=200),
        ),
        migrations.AlterField(
            model_name="businesssettings",
            name="tagline",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
    ]
