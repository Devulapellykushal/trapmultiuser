"""Write sample PDFs under repo-root ``testinvoice/`` for quick visual regression."""

from __future__ import annotations

import os
import uuid
from decimal import Decimal

from django.test import TestCase

from inventory import services as inventory_services
from inventory.models import Product, ProductVariant, Warehouse
from invoices import services as invoice_services
from invoices.pdf.paths import testinvoice_dir
from invoices.pdf.write_pdf import write_invoice_pdf_best_effort
from sales import services as sales_services
from users.models import User


class TestinvoiceOutputTest(TestCase):
    """Ensures ``write_invoice_pdf_best_effort`` produces real PDFs in ``trap/testinvoice/``."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username=f"invout_{uuid.uuid4().hex[:12]}",
            password="x",
            role="ADMIN",
        )
        self.wh = Warehouse.objects.create(name="Out WH", code="OUT-WH")
        self.product = Product.objects.create(
            name="Output Test Tee",
            brand="TEST",
            category="TEST",
            sku="OUT-001",
            barcode_value="Quake-OUT-001",
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="OUT-001-V1",
            cost_price=Decimal("40.00"),
            selling_price=Decimal("118.00"),
        )
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type="OPENING",
            quantity=20,
            user=self.admin,
            warehouse_id=self.wh.id,
        )
        self.sale = sales_services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.wh.id,
            items=[
                {
                    "barcode": "Quake-OUT-001",
                    "quantity": 1,
                    "gst_percentage": Decimal("18.00"),
                }
            ],
            payments=[{"method": "CASH", "amount": Decimal("118.00")}],
            user=self.admin,
        )
        self.invoice = invoice_services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="Testinvoice QA",
            billing_phone="9111111111",
        )

    def test_pdf_written_to_testinvoice_dir(self):
        out = testinvoice_dir()
        path = out / f"pytest_invoice_{uuid.uuid4().hex[:10]}.pdf"
        write_invoice_pdf_best_effort(self.invoice, str(path))
        self.assertTrue(os.path.isfile(path))
        self.assertGreater(os.path.getsize(path), 200)
        with open(path, "rb") as fh:
            self.assertEqual(fh.read(5), b"%PDF-")
