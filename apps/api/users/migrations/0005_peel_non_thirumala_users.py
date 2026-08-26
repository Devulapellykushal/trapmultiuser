# Peel public-signup users off the default Thirumala org into their own workspaces.

from django.db import migrations
from django.utils.text import slugify


THIRUMALA_EMAILS = {
    "admin@thirumalawheels.com",
    "staff@thirumalawheels.com",
}


def unique_slug(Organization, base: str) -> str:
    raw = slugify(base)[:60] or "business"
    slug = raw
    n = 1
    while Organization.objects.filter(slug=slug).exists():
        slug = f"{raw}-{n}"
        n += 1
    return slug


def forwards_peel(apps, schema_editor):
    Organization = apps.get_model("users", "Organization")
    User = apps.get_model("users", "User")

    try:
        thiru = Organization.objects.get(slug="thirumala-wheels")
    except Organization.DoesNotExist:
        return

    for user in User.objects.filter(organization_id=thiru.id).exclude(
        email__in=THIRUMALA_EMAILS
    ):
        label = (
            f"{user.first_name} {user.last_name}".strip()
            or (user.email.split("@")[0] if user.email else user.username)
            or "My Business"
        )
        org = Organization.objects.create(
            name=label[:200],
            slug=unique_slug(Organization, label),
        )
        user.organization_id = org.id
        user.role = "ADMIN"
        user.save(update_fields=["organization_id", "role"])


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0004_organization_tenancy"),
    ]

    operations = [
        migrations.RunPython(forwards_peel, backwards_noop),
    ]
