# Generated manually for inventory_location_mode on BusinessSettings.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("invoices", "0006_quake_invoice_branding"),
    ]

    operations = [
        migrations.AddField(
            model_name="businesssettings",
            name="inventory_location_mode",
            field=models.CharField(
                choices=[
                    ("SINGLE_SHOP", "One shop only"),
                    ("GODOWN_AND_SHOPS", "Godown and shops"),
                ],
                default="SINGLE_SHOP",
                help_text=(
                    "SINGLE_SHOP: one shop UI (no godown/shop split). "
                    "GODOWN_AND_SHOPS: godown + shops + transfers."
                ),
                max_length=32,
            ),
        ),
    ]
