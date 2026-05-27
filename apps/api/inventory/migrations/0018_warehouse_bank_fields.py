# Generated manually for warehouse bank details (optional) on invoices.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0017_phase1a_tyre_pos"),
    ]

    operations = [
        migrations.AddField(
            model_name="warehouse",
            name="bank_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="warehouse",
            name="bank_account_number",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="warehouse",
            name="bank_ifsc",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
