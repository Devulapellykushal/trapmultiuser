# Sale.store — which shop counter sold (stock may still use warehouse)

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0010_add_stores_and_transfers"),
        ("sales", "0009_phase1a_tyre_pos"),
    ]

    operations = [
        migrations.AddField(
            model_name="sale",
            name="store",
            field=models.ForeignKey(
                blank=True,
                help_text="Shop counter that sold this (when using shared godown or multi-shop POS)",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="sales",
                to="inventory.store",
            ),
        ),
        migrations.AddIndex(
            model_name="sale",
            index=models.Index(
                fields=["store", "created_at"],
                name="sales_sale_store_i_created_idx",
            ),
        ),
    ]
