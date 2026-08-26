# Organization.enabled_services for superadmin module toggles

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0005_peel_non_thirumala_users"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="enabled_services",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    "Sidebar / module entitlements for this org. "
                    "Missing keys default to enabled. Superadmin toggles these."
                ),
            ),
        ),
    ]
