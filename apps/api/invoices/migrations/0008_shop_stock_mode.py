# Generated manually for shop_stock_mode on BusinessSettings.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("invoices", "0007_inventory_location_mode"),
    ]

    operations = [
        migrations.AddField(
            model_name="businesssettings",
            name="shop_stock_mode",
            field=models.CharField(
                choices=[
                    ("TRANSFER", "Send stock to each shop"),
                    ("SHARED_GODOWN", "All shops use godown stock"),
                ],
                default="TRANSFER",
                help_text=(
                    "Only for Godown + shops. "
                    "TRANSFER: move stock to each shop before selling. "
                    "SHARED_GODOWN: every shop sells from the same godown stock."
                ),
                max_length=32,
            ),
        ),
    ]
