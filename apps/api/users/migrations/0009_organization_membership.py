# OrganizationMembership + backfill from User.organization

import uuid

from django.db import migrations, models
import django.db.models.deletion


def backfill_memberships(apps, schema_editor):
    User = apps.get_model("users", "User")
    OrganizationMembership = apps.get_model("users", "OrganizationMembership")
    for user in User.objects.exclude(organization_id__isnull=True).iterator():
        OrganizationMembership.objects.get_or_create(
            user_id=user.id,
            organization_id=user.organization_id,
            defaults={"role": user.role or "STAFF"},
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0008_organization_industry"),
    ]

    operations = [
        migrations.CreateModel(
            name="OrganizationMembership",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "role",
                    models.CharField(
                        choices=[("ADMIN", "Admin"), ("STAFF", "Staff")],
                        default="STAFF",
                        max_length=10,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="memberships",
                        to="users.organization",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="memberships",
                        to="users.user",
                    ),
                ),
            ],
            options={
                "db_table": "organization_memberships",
            },
        ),
        migrations.AddIndex(
            model_name="organizationmembership",
            index=models.Index(
                fields=["user", "organization"],
                name="membership_user_org_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="organizationmembership",
            constraint=models.UniqueConstraint(
                fields=("user", "organization"),
                name="uniq_membership_user_organization",
            ),
        ),
        migrations.AlterField(
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
                    "Fixed industry for this business at creation. "
                    "Drives UX profiles; catalog/CRM data stay isolated to this org. "
                    "Not changed later — add another business instead."
                ),
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="user",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text=(
                    "Active business workspace for this session. "
                    "User may belong to multiple orgs via OrganizationMembership."
                ),
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="users",
                to="users.organization",
            ),
        ),
        migrations.RunPython(backfill_memberships, noop_reverse),
    ]
