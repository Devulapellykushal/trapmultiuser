"""
Sync CRM customers from historical sales / invoices.
Usage: python manage.py sync_customers_from_sales
"""
from django.core.management.base import BaseCommand

from customers.services import sync_customers_from_sales


class Command(BaseCommand):
    help = "Create/update Customers from every completed sale buyer and re-link invoices"

    def handle(self, *args, **options):
        result = sync_customers_from_sales()
        self.stdout.write(
            self.style.SUCCESS(
                "Synced: created={customers_created} linked={sales_linked} "
                "skipped={sales_skipped} total_customers={total_customers}".format(
                    **result
                )
            )
        )
