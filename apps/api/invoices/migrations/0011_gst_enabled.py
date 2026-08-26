# gst_enabled on BusinessSettings

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("invoices", "0010_organization_tenancy"),
    ]

    operations = [
        migrations.AddField(
            model_name="businesssettings",
            name="gst_enabled",
            field=models.BooleanField(
                default=True,
                help_text=(
                    "If True, products can set a GST slab and POS can calculate GST. "
                    "If False, tax is off for this business (inventory + billing)."
                ),
            ),
        ),
    ]
