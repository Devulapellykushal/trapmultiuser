# barcode_enabled on BusinessSettings

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("invoices", "0008_shop_stock_mode"),
    ]

    operations = [
        migrations.AddField(
            model_name="businesssettings",
            name="barcode_enabled",
            field=models.BooleanField(
                default=True,
                help_text=(
                    "If True, every product gets a barcode and POS shows scan. "
                    "If False, barcodes are optional — sell by search/tap."
                ),
            ),
        ),
    ]
