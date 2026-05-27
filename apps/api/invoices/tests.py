"""
Invoice Tests for Quake Inventory System.

PHASE 14: INVOICE PDFs & COMPLIANCE
====================================
Tests for invoice generation with GST compliance.
"""

import uuid
from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APITestCase, APIClient
from rest_framework import status

from core.test_username import unique_username

from inventory.models import Warehouse, Product, ProductVariant
from inventory import services as inventory_services
from sales.models import Sale, SaleItem, Payment
from sales import services as sales_services
from invoices.models import Invoice, InvoiceItem, InvoiceSequence
from invoices import services


# =============================================================================
# PHASE 14: INVOICE CREATION TESTS
# =============================================================================

class InvoiceCreationTest(TestCase):
    """
    Test: One invoice per sale.
    Phase 14: Verify invoice is created exactly once.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=f"invtest_{uuid.uuid4().hex[:12]}",
            password='adminpass',
            role='ADMIN',
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Invoice Test Product",
            brand="TEST",
            category="TEST",
            sku="INV-001",
            barcode_value="Quake-INV-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="INV-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        # Create a completed sale
        self.sale = sales_services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-INV-001', 'quantity': 2, 'gst_percentage': Decimal('18.00')}],
            payments=[{'method': 'CASH', 'amount': Decimal('200.00')}],  # MRP-inclusive (GST extracted for reporting)
            user=self.admin
        )
    
    def test_invoice_created_for_sale(self):
        """Test that invoice is created for completed sale."""
        invoice = services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="John Doe",
            billing_phone="9999999999"
        )
        
        self.assertIsNotNone(invoice.id)
        # Unified numbering: invoice uses the sale's INV-YYYY-NNNNNN (sales sequence).
        self.assertEqual(invoice.invoice_number, self.sale.invoice_number)
        self.assertTrue(invoice.invoice_number.startswith('INV-'))
        self.assertEqual(invoice.sale_id, self.sale.id)
    
    def test_invoice_has_correct_totals(self):
        """Test that invoice totals match sale."""
        invoice = services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="John Doe"
        )
        
        self.assertEqual(invoice.subtotal_amount, self.sale.subtotal)
        self.assertEqual(invoice.gst_total, self.sale.total_gst)
        self.assertEqual(invoice.total_amount, self.sale.total)


# =============================================================================
# PHASE 14: IDEMPOTENCY TESTS
# =============================================================================

class InvoiceIdempotencyTest(TestCase):
    """
    Test: No duplicate invoices.
    Phase 14: Same sale_id returns existing invoice.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=f"invtest_{uuid.uuid4().hex[:12]}",
            password='adminpass',
            role='ADMIN',
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Idempotency Test Product",
            brand="TEST",
            category="TEST",
            sku="IDEMP-001",
            barcode_value="Quake-IDEMP-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="IDEMP-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        self.sale = sales_services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-IDEMP-001', 'quantity': 1}],
            payments=[{'method': 'CASH', 'amount': Decimal('100.00')}],
            user=self.admin
        )
    
    def test_duplicate_returns_same_invoice(self):
        """Test that duplicate call returns same invoice."""
        # NOTE: Sale processing auto-generates an invoice, so the first
        # explicit call will return the existing invoice created during sale processing
        invoice1 = services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="First Customer"
        )
        
        invoice2 = services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="Second Customer"  # Different name
        )
        
        # Should be the same invoice
        self.assertEqual(invoice1.id, invoice2.id)
        self.assertEqual(invoice1.invoice_number, invoice2.invoice_number)
        # Should keep the billing name from when invoice was first created
        # (during sale processing, which defaults to 'Walk-in Customer')
        self.assertEqual(invoice2.billing_name, "Walk-in Customer")
        self.assertEqual(invoice1.billing_name, invoice2.billing_name)
    
    def test_no_duplicate_invoice_records(self):
        """Test that only one invoice record exists."""
        services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="Customer"
        )
        services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="Customer"
        )
        services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="Customer"
        )
        
        # Should still be only 1 invoice
        self.assertEqual(Invoice.objects.filter(sale=self.sale).count(), 1)


# =============================================================================
# PHASE 14: GST MATCH TESTS
# =============================================================================

class InvoiceTotalsMatchSaleTest(TestCase):
    """
    Test: Invoice totals identical to Sale.
    Phase 14: No recalculation, snapshot only.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=f"invtest_{uuid.uuid4().hex[:12]}",
            password='adminpass',
            role='ADMIN',
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="GST Match Test Product",
            brand="TEST",
            category="TEST",
            sku="GSTMATCH-001",
            barcode_value="Quake-GSTMATCH-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="GSTMATCH-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        # Sale with 10% discount and 18% GST
        self.sale = sales_services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-GSTMATCH-001', 'quantity': 2, 'gst_percentage': Decimal('18.00')}],
            payments=[{'method': 'CASH', 'amount': Decimal('180.00')}],  # MRP-inclusive after 10% discount
            user=self.admin,
            discount_type='PERCENT',
            discount_value=Decimal('10.00')
        )
    
    def test_gst_total_matches_sale(self):
        """Test that invoice gst_total matches sale.total_gst."""
        invoice = services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="GST Test"
        )
        
        self.assertEqual(invoice.gst_total, self.sale.total_gst)
        # With MRP-inclusive pricing: 180 × (18/118) = 27.46
        self.assertEqual(invoice.gst_total, Decimal('27.46'))
    
    def test_line_item_gst_matches_sale_item(self):
        """Test that invoice item GST matches sale item."""
        invoice = services.generate_invoice_for_sale(
            sale_id=str(self.sale.id)
        )
        
        sale_item = self.sale.items.first()
        invoice_item = invoice.items.first()
        
        self.assertEqual(invoice_item.gst_percentage, sale_item.gst_percentage)
        self.assertEqual(invoice_item.gst_amount, sale_item.gst_amount)


# =============================================================================
# PHASE 14: PDF GENERATION TESTS
# =============================================================================

class PDFGenerationTest(TestCase):
    """
    Test: PDF file exists after generation.
    Phase 14: Verify PDF is created.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=f"invtest_{uuid.uuid4().hex[:12]}",
            password='adminpass',
            role='ADMIN',
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="PDF Test Product",
            brand="TEST",
            category="TEST",
            sku="PDF-001",
            barcode_value="Quake-PDF-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="PDF-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        self.sale = sales_services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-PDF-001', 'quantity': 1}],
            payments=[{'method': 'CASH', 'amount': Decimal('100.00')}],
            user=self.admin
        )
    
    def test_pdf_url_is_set(self):
        """Test that pdf_url is populated."""
        invoice = services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="PDF Test"
        )
        
        self.assertIsNotNone(invoice.pdf_url)
        self.assertIn('.pdf', invoice.pdf_url)
    
    def test_pdf_file_exists(self):
        """Test that PDF file is created on disk."""
        import os
        from django.conf import settings
        
        invoice = services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="PDF Test"
        )
        
        pdf_filename = invoice.pdf_url.replace('/media/', '')
        pdf_path = os.path.join(settings.BASE_DIR, 'media', pdf_filename)
        
        self.assertTrue(os.path.exists(pdf_path))
        self.assertGreater(os.path.getsize(pdf_path), 256)
        with open(pdf_path, "rb") as fh:
            self.assertEqual(fh.read(5), b"%PDF-")


# =============================================================================
# PHASE 14: IMMUTABILITY TESTS
# =============================================================================

class InvoiceImmutabilityTest(TestCase):
    """
    Test: Invoice cannot be modified or deleted.
    Phase 14: Financial record immutability.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=f"invtest_{uuid.uuid4().hex[:12]}",
            password='adminpass',
            role='ADMIN',
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Immutable Test Product",
            brand="TEST",
            category="TEST",
            sku="IMMUT-001",
            barcode_value="Quake-IMMUT-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="IMMUT-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        self.sale = sales_services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-IMMUT-001', 'quantity': 1}],
            payments=[{'method': 'CASH', 'amount': Decimal('100.00')}],
            user=self.admin
        )
        
        self.invoice = services.generate_invoice_for_sale(
            sale_id=str(self.sale.id),
            billing_name="Immutable Test"
        )
    
    def test_invoice_update_blocked(self):
        """Test that invoice cannot be updated."""
        self.invoice.total_amount = Decimal('500.00')
        with self.assertRaises(ValueError) as context:
            self.invoice.save()
        self.assertIn("cannot be modified", str(context.exception))
    
    def test_invoice_delete_blocked(self):
        """Test that invoice cannot be deleted."""
        with self.assertRaises(ValueError) as context:
            self.invoice.delete()
        self.assertIn("cannot be deleted", str(context.exception))
    
    def test_invoice_item_update_blocked(self):
        """Test that invoice item cannot be updated."""
        item = self.invoice.items.first()
        item.quantity = 10
        with self.assertRaises(ValueError) as context:
            item.save()
        self.assertIn("cannot be modified", str(context.exception))
    
    def test_invoice_item_delete_blocked(self):
        """Test that invoice item cannot be deleted."""
        item = self.invoice.items.first()
        with self.assertRaises(ValueError) as context:
            item.delete()
        self.assertIn("cannot be deleted", str(context.exception))


# =============================================================================
# PHASE 14: SALE STATUS VALIDATION TESTS
# =============================================================================

class SaleStatusValidationTest(TestCase):
    """
    Test: Only COMPLETED sales can have invoices.
    Phase 14: Status validation.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=f"invtest_{uuid.uuid4().hex[:12]}",
            password='adminpass',
            role='ADMIN',
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
    
    def test_pending_sale_rejected(self):
        """Test that PENDING sale cannot have invoice."""
        # Create a pending sale directly
        sale = Sale.objects.create(
            idempotency_key=uuid.uuid4(),
            invoice_number="TEST-PENDING",
            warehouse=self.warehouse,
            subtotal=Decimal("100.00"),
            total=Decimal("100.00"),
            total_items=1,
            status=Sale.Status.PENDING,
            created_by=self.admin
        )
        
        with self.assertRaises(services.SaleNotCompletedError):
            services.generate_invoice_for_sale(
                sale_id=str(sale.id),
                billing_name="Test"
            )
    
    def test_nonexistent_sale_rejected(self):
        """Test that nonexistent sale raises error."""
        with self.assertRaises(services.SaleNotFoundError):
            services.generate_invoice_for_sale(
                sale_id=str(uuid.uuid4()),
                billing_name="Test"
            )


# =============================================================================
# PHASE 14: INVOICE SEQUENCE TESTS
# =============================================================================

class InvoiceSequenceTest(TestCase):
    """
    Test: Invoice numbers are sequential.
    Phase 14: Financial-year aware numbering.
    """
    
    def test_first_invoice_number_format(self):
        """Test that first invoice is Quake/INV/YYYY/0001."""
        from django.utils import timezone
        
        invoice_number = InvoiceSequence.get_next_invoice_number()
        year = timezone.now().year
        
        self.assertIn(f'Quake/INV/{year}/', invoice_number)
    
    def test_sequential_invoice_numbers(self):
        """Test that invoice numbers are sequential."""
        numbers = []
        for _ in range(3):
            numbers.append(InvoiceSequence.get_next_invoice_number())
        
        # Extract sequence numbers
        sequences = [int(n.split('/')[-1]) for n in numbers]
        
        # Verify sequential
        for i in range(len(sequences) - 1):
            self.assertEqual(sequences[i + 1], sequences[i] + 1)


class SaleInvoiceSequenceTest(TestCase):
    """POS Sale.invoice_number stream: INV-YYYY-NNNNNN via INV-SALE prefix rows."""

    def test_sale_invoice_format_and_sequence(self):
        from django.utils import timezone

        year = timezone.now().year
        n1 = InvoiceSequence.get_next_sale_invoice_number()
        n2 = InvoiceSequence.get_next_sale_invoice_number()
        self.assertTrue(n1.startswith("INV-"))
        self.assertIn(f"INV-{year}-", n1)
        a1 = int(n1.split("-")[-1])
        a2 = int(n2.split("-")[-1])
        self.assertEqual(a2, a1 + 1)


class InvoiceSummaryEndpointTest(APITestCase):
    """GET /api/v1/invoices/summary/ — used by web invoicesService.getInvoiceSummary."""

    def setUp(self):
        from users.models import User

        self.user = User.objects.create_user(
            username=unique_username("inv_summary"),
            password="pass12345",
            role="ADMIN",
        )

    def test_summary_requires_auth(self):
        client = APIClient()
        resp = client.get("/api/v1/invoices/summary/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_summary_empty_returns_zeros(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.get("/api/v1/invoices/summary/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["totalInvoices"], 0)
        self.assertEqual(data["paidCount"], 0)
        self.assertEqual(data["cancelledCount"], 0)
        self.assertEqual(data["totalRevenue"], 0)
        self.assertEqual(data["avgValue"], 0)
