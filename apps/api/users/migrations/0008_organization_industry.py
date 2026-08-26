# Organization.industry UX profile (auto_tyre | fmcg | fnb | general)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0007_seed_platform_superadmin"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="industry",
            field=models.CharField(
                choices=[
                    ("auto_tyre", "Auto / Tyre"),
                    ("fmcg", "FMCG"),
                    ("fnb", "Food & Beverage"),
                    ("general", "General retail"),
                ],
                db_index=True,
                default="auto_tyre",
                help_text=(
                    "UX profile for add-product forms, presets, and labels. "
                    "Does not change POS/stock/CRM identity engines."
                ),
                max_length=32,
            ),
        ),
    ]
