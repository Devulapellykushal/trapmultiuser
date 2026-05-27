"""
Write sample invoice PDFs to repo-root ``testinvoice/`` for visual QA.

Usage (from ``apps/api``):

    uv run python manage.py generate_test_invoice_pdfs
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from django.core.management.base import BaseCommand

from inventory import services as inventory_services
from inventory.models import Product, ProductVariant, Warehouse
from invoices import services as invoice_services
from invoices.pdf.paths import testinvoice_dir
from invoices.pdf.write_pdf import write_invoice_pdf_best_effort
from sales import services as sales_services
from users.models import User


class Command(BaseCommand):
    help = "Create fixture sales/invoices and write PDFs to trap/testinvoice/"

    def handle(self, *args, **options):
        out = testinvoice_dir()
        self.stdout.write(f"Output directory: {out}")

        admin = User.objects.create_user(
            username=f"pdfgen_{uuid.uuid4().hex[:12]}",
            password="unused",
            role="ADMIN",
        )
        wh, _ = Warehouse.objects.get_or_create(
            code="PDF-WH",
            defaults={"name": "PDF Gen WH"},
        )

        def stock_product(name: str, sku: str, barcode: str, price: str):
            p, _ = Product.objects.get_or_create(
                sku=sku,
                defaults={
                    "name": name,
                    "brand": "TEST",
                    "category": "TEST",
                    "barcode_value": barcode,
                },
            )
            variant_sku = f"{sku}-V1"
            pv, _ = ProductVariant.objects.get_or_create(
                sku=variant_sku,
                defaults={
                    "product": p,
                    "cost_price": Decimal("40.00"),
                    "selling_price": Decimal(price),
                },
            )
            if pv.selling_price != Decimal(price):
                pv.selling_price = Decimal(price)
                pv.save(update_fields=["selling_price"])
            inventory_services.create_inventory_movement(
                product_id=p.id,
                movement_type="OPENING",
                quantity=50,
                user=admin,
                warehouse_id=wh.id,
            )
            return p

        # --- Scenario A: single line, cash ---
        p1 = stock_product("Scenario A Tee", "PDF-A-001", "Quake-PDF-A-001", "118.00")
        sale_a = sales_services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=wh.id,
            items=[
                {
                    "barcode": "Quake-PDF-A-001",
                    "quantity": 1,
                    "gst_percentage": Decimal("18.00"),
                }
            ],
            payments=[{"method": "CASH", "amount": Decimal("118.00")}],
            user=admin,
        )
        inv_a = invoice_services.generate_invoice_for_sale(
            sale_id=str(sale_a.id),
            billing_name="Retail Customer A",
            billing_phone="9000000001",
        )
        path_a = out / "scenario_a_single_line.pdf"
        write_invoice_pdf_best_effort(inv_a, str(path_a))
        self.stdout.write(self.style.SUCCESS(f"Wrote {path_a}"))

        # --- Scenario B: two lines, UPI ---
        p2 = stock_product("Scenario B Jeans", "PDF-B-001", "Quake-PDF-B-001", "236.00")
        p3 = stock_product("Scenario B Cap", "PDF-B-002", "Quake-PDF-B-002", "59.00")
        sale_b = sales_services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=wh.id,
            items=[
                {
                    "barcode": "Quake-PDF-B-001",
                    "quantity": 2,
                    "gst_percentage": Decimal("18.00"),
                },
                {
                    "barcode": "Quake-PDF-B-002",
                    "quantity": 1,
                    "gst_percentage": Decimal("18.00"),
                },
            ],
            payments=[{"method": "UPI", "amount": Decimal("531.00")}],
            user=admin,
        )
        inv_b = invoice_services.generate_invoice_for_sale(
            sale_id=str(sale_b.id),
            billing_name="Bulk Buyer B",
            billing_phone="9000000002",
        )
        path_b = out / "scenario_b_multi_line.pdf"
        write_invoice_pdf_best_effort(inv_b, str(path_b))
        self.stdout.write(self.style.SUCCESS(f"Wrote {path_b}"))

        # --- Scenario C: percent discount ---
        p4 = stock_product("Scenario C Shirt", "PDF-C-001", "Quake-PDF-C-001", "100.00")
        sale_c = sales_services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=wh.id,
            items=[
                {
                    "barcode": "Quake-PDF-C-001",
                    "quantity": 3,
                    "gst_percentage": Decimal("18.00"),
                }
            ],
            payments=[{"method": "CARD", "amount": Decimal("270.00")}],
            user=admin,
            discount_type="PERCENT",
            discount_value=Decimal("10"),
        )
        inv_c = invoice_services.generate_invoice_for_sale(
            sale_id=str(sale_c.id),
            billing_name="Discount Customer C",
            billing_phone="9000000003",
        )
        path_c = out / "scenario_c_with_discount.pdf"
        write_invoice_pdf_best_effort(inv_c, str(path_c))
        self.stdout.write(self.style.SUCCESS(f"Wrote {path_c}"))

        self.stdout.write(self.style.SUCCESS("Done. Open PDFs in testinvoice/ to verify layout."))
