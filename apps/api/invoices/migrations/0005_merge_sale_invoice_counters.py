# Generated manually — seed INV-SALE counters from legacy sales.InvoiceSequence

from django.db import migrations


def merge_sale_counters(apps, schema_editor):
    SalesInvoiceSequence = apps.get_model("sales", "InvoiceSequence")
    InvoiceSequence = apps.get_model("invoices", "InvoiceSequence")
    prefix = "INV-SALE"

    for row in SalesInvoiceSequence.objects.all():
        existing = InvoiceSequence.objects.filter(
            prefix=prefix, year=row.year
        ).first()
        max_n = row.last_number
        if existing:
            max_n = max(max_n, existing.current_number)
        InvoiceSequence.objects.update_or_create(
            prefix=prefix,
            year=row.year,
            defaults={"current_number": max_n},
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("invoices", "0004_phase14_gst_compliance"),
        ("sales", "0009_phase1a_tyre_pos"),
    ]

    operations = [
        migrations.RunPython(merge_sale_counters, noop_reverse),
    ]
