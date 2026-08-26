"""
Sales Tests for Quake Inventory System.

PHASE 13: POS ENGINE (LEDGER-BACKED)
=====================================

Required tests:
- SaleSuccessTest: Happy path with valid stock, payments
- InsufficientStockTest: Sale rejected when stock < quantity
- AtomicityTest: Partial failure rolls back everything
- LedgerReductionTest: Verify inventory movements created
- PaymentMismatchTest: Reject when payments ≠ total
- BarcodeResolutionTest: Barcode → Product lookup
- InvoiceSequenceTest: Sequential invoice numbers
- DiscountValidationTest: Discount rules enforced
"""

import uuid
from decimal import Decimal
from core.test_username import unique_username
from django.test import TestCase
from rest_framework.test import APITestCase
from rest_framework import status

from inventory.models import Warehouse, Product, ProductVariant, InventoryMovement
from inventory import services as inventory_services
from invoices.models import InvoiceSequence
from .models import Sale, SaleItem, Payment
from . import services


# =============================================================================
# PHASE 13: BARCODE RESOLUTION TESTS
# =============================================================================

class BarcodeResolutionTest(TestCase):
    """
    Test: Barcode → Product lookup.
    Phase 13: Products are resolved by barcode.
    """
    
    def setUp(self):
        self.product = Product.objects.create(
            name="Test Product",
            brand="TEST",
            category="TEST",
            sku="TEST-001",
            barcode_value="Quake-TEST-001"
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
    
    def test_lookup_valid_barcode(self):
        """Test that valid barcode returns product."""
        product = services.lookup_product_by_barcode("Quake-TEST-001")
        self.assertEqual(product.id, self.product.id)
    
    def test_lookup_invalid_barcode(self):
        """Test that invalid barcode raises error."""
        with self.assertRaises(services.InvalidBarcodeError):
            services.lookup_product_by_barcode("INVALID-BARCODE")
    
    def test_scan_barcode_returns_info(self):
        """Test that scan_barcode returns complete product info."""
        result = services.scan_barcode(
            barcode="Quake-TEST-001",
            warehouse_id=self.warehouse.id
        )
        
        self.assertEqual(result['product_id'], str(self.product.id))
        self.assertEqual(result['barcode'], "Quake-TEST-001")
        self.assertEqual(result['sku'], "TEST-001")
        self.assertEqual(result['warehouse_id'], str(self.warehouse.id))
        self.assertEqual(result['item_type'], 'PRODUCT')


# =============================================================================
# PHASE 13: INVOICE SEQUENCE TESTS
# =============================================================================

class InvoiceSequenceTest(TestCase):
    """
    Test: Sequential invoice numbers.
    Phase 13: Invoice numbers must be sequential and concurrency-safe.
    """
    
    def test_first_invoice_number(self):
        """Test that first invoice is INV-YYYY-000001."""
        invoice = InvoiceSequence.get_next_sale_invoice_number()
        self.assertTrue(invoice.startswith("INV-"))
        self.assertTrue(invoice.endswith("-000001"))
    
    def test_sequential_invoice_numbers(self):
        """Test that invoice numbers are sequential."""
        inv1 = InvoiceSequence.get_next_sale_invoice_number()
        inv2 = InvoiceSequence.get_next_sale_invoice_number()
        inv3 = InvoiceSequence.get_next_sale_invoice_number()
        
        # Extract numbers
        num1 = int(inv1.split("-")[-1])
        num2 = int(inv2.split("-")[-1])
        num3 = int(inv3.split("-")[-1])
        
        self.assertEqual(num2, num1 + 1)
        self.assertEqual(num3, num2 + 1)


# =============================================================================
# PHASE 13: SALE SUCCESS TESTS
# =============================================================================

class SaleSuccessTest(APITestCase):
    """
    Test: Happy path with valid stock, payments.
    Phase 13: Sale should complete successfully with all requirements met.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Test Product",
            brand="TEST",
            category="TEST",
            sku="TEST-001",
            barcode_value="Quake-TEST-001"
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="TEST-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        
        # Add opening stock
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
    
    def test_sale_creates_successfully(self):
        """Test that sale is created with valid inputs."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-TEST-001', 'quantity': 2}],
            payments=[{'method': 'CASH', 'amount': Decimal('200.00')}],
            user=self.admin
        )
        
        self.assertEqual(sale.status, Sale.Status.COMPLETED)
        self.assertEqual(sale.total, Decimal('200.00'))
        self.assertEqual(sale.total_items, 2)
        self.assertEqual(sale.items.count(), 1)
        self.assertEqual(sale.payments.count(), 1)
    
    def test_sale_reduces_stock(self):
        """Test that sale reduces available stock."""
        initial_stock = inventory_services.get_product_stock(
            self.product.id, warehouse_id=self.warehouse.id
        )
        
        services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-TEST-001', 'quantity': 10}],
            payments=[{'method': 'UPI', 'amount': Decimal('1000.00')}],
            user=self.admin
        )
        
        final_stock = inventory_services.get_product_stock(
            self.product.id, warehouse_id=self.warehouse.id
        )
        
        self.assertEqual(final_stock, initial_stock - 10)
    
    def test_sale_with_discount(self):
        """Test sale with percentage discount."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-TEST-001', 'quantity': 2}],
            payments=[{'method': 'CARD', 'amount': Decimal('180.00')}],
            user=self.admin,
            discount_type='PERCENT',
            discount_value=Decimal('10.00')  # 10% off
        )
        
        self.assertEqual(sale.subtotal, Decimal('200.00'))
        self.assertEqual(sale.discount_value, Decimal('10.00'))
        self.assertEqual(sale.total, Decimal('180.00'))  # 200 - 20 = 180
    
    def test_sale_with_multi_payment(self):
        """Test sale with multiple payment methods."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-TEST-001', 'quantity': 3}],
            payments=[
                {'method': 'CASH', 'amount': Decimal('200.00')},
                {'method': 'UPI', 'amount': Decimal('100.00')}
            ],
            user=self.admin
        )
        
        self.assertEqual(sale.payments.count(), 2)
        self.assertEqual(sale.total, Decimal('300.00'))


# =============================================================================
# PHASE 13: INSUFFICIENT STOCK TESTS
# =============================================================================

class InsufficientStockTest(TestCase):
    """
    Test: Sale rejected when stock < quantity.
    Phase 13: Overselling must be impossible.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Limited Stock Product",
            brand="TEST",
            category="TEST",
            sku="LIMITED-001",
            barcode_value="Quake-LIMITED-001"
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="LIMITED-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        
        # Add limited stock
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=5,  # Only 5 in stock
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
    
    def test_oversale_rejected(self):
        """Test that sale is rejected when requested > available."""
        with self.assertRaises(services.InsufficientStockError):
            services.process_sale(
                idempotency_key=uuid.uuid4(),
                warehouse_id=self.warehouse.id,
                items=[{'barcode': 'Quake-LIMITED-001', 'quantity': 10}],  # Only 5 available
                payments=[{'method': 'CASH', 'amount': Decimal('1000.00')}],
                user=self.admin
            )
    
    def test_stock_unchanged_on_rejection(self):
        """Test that stock remains unchanged when sale is rejected."""
        initial_stock = inventory_services.get_product_stock(
            self.product.id, warehouse_id=self.warehouse.id
        )
        
        try:
            services.process_sale(
                idempotency_key=uuid.uuid4(),
                warehouse_id=self.warehouse.id,
                items=[{'barcode': 'Quake-LIMITED-001', 'quantity': 10}],
                payments=[{'method': 'CASH', 'amount': Decimal('1000.00')}],
                user=self.admin
            )
        except services.InsufficientStockError:
            pass
        
        final_stock = inventory_services.get_product_stock(
            self.product.id, warehouse_id=self.warehouse.id
        )
        
        self.assertEqual(final_stock, initial_stock)


# =============================================================================
# PHASE 13: ATOMICITY TESTS
# =============================================================================

class AtomicityTest(TestCase):
    """
    Test: Partial failure rolls back everything.
    Phase 13: Sale must be atomic - all or nothing.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product1 = Product.objects.create(
            name="Product 1",
            brand="TEST",
            category="TEST",
            sku="PROD-001",
            barcode_value="Quake-PROD-001"
        )
        ProductVariant.objects.create(
            product=self.product1,
            sku="PROD-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        self.product2 = Product.objects.create(
            name="Product 2 (Limited)",
            brand="TEST",
            category="TEST",
            sku="PROD-002",
            barcode_value="Quake-PROD-002"
        )
        ProductVariant.objects.create(
            product=self.product2,
            sku="PROD-002-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        
        # Product 1 has plenty of stock
        inventory_services.create_inventory_movement(
            product_id=self.product1.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        # Product 2 has limited stock
        inventory_services.create_inventory_movement(
            product_id=self.product2.id,
            movement_type='OPENING',
            quantity=2,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
    
    def test_multi_item_failure_rolls_back_all(self):
        """Test that failure on second item rolls back first item too."""
        initial_stock1 = inventory_services.get_product_stock(
            self.product1.id, warehouse_id=self.warehouse.id
        )
        initial_sale_count = Sale.objects.count()
        
        try:
            services.process_sale(
                idempotency_key=uuid.uuid4(),
                warehouse_id=self.warehouse.id,
                items=[
                    {'barcode': 'Quake-PROD-001', 'quantity': 5},  # Would succeed
                    {'barcode': 'Quake-PROD-002', 'quantity': 10},  # Will fail - only 2 in stock
                ],
                payments=[{'method': 'CASH', 'amount': Decimal('1500.00')}],
                user=self.admin
            )
        except services.InsufficientStockError:
            pass
        
        # Stock for product 1 should be unchanged (rolled back)
        final_stock1 = inventory_services.get_product_stock(
            self.product1.id, warehouse_id=self.warehouse.id
        )
        self.assertEqual(final_stock1, initial_stock1)
        
        # No sale should have been created
        self.assertEqual(Sale.objects.count(), initial_sale_count)


# =============================================================================
# PHASE 13: LEDGER REDUCTION TESTS
# =============================================================================

class LedgerReductionTest(TestCase):
    """
    Test: Verify inventory movements created.
    Phase 13: Stock is derived from ledger, not mutated directly.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Ledger Test Product",
            brand="TEST",
            category="TEST",
            sku="LEDGER-001",
            barcode_value="Quake-LEDGER-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="LEDGER-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        
        # Add opening stock
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
    
    def test_sale_creates_ledger_entry(self):
        """Test that sale creates SALE movement in ledger."""
        initial_movements = InventoryMovement.objects.filter(
            product=self.product,
            movement_type='SALE'
        ).count()
        
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-LEDGER-001', 'quantity': 5}],
            payments=[{'method': 'CASH', 'amount': Decimal('500.00')}],
            user=self.admin
        )
        
        final_movements = InventoryMovement.objects.filter(
            product=self.product,
            movement_type='SALE'
        ).count()
        
        self.assertEqual(final_movements, initial_movements + 1)
    
    def test_ledger_entry_has_correct_quantity(self):
        """Test that SALE ledger entry has negative quantity."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-LEDGER-001', 'quantity': 7}],
            payments=[{'method': 'UPI', 'amount': Decimal('700.00')}],
            user=self.admin
        )
        
        movement = InventoryMovement.objects.filter(
            product=self.product,
            movement_type='SALE',
            reference_id=sale.id
        ).first()
        
        self.assertIsNotNone(movement)
        self.assertEqual(movement.quantity, -7)  # Negative for sales
    
    def test_stock_derived_from_ledger(self):
        """Test that stock equals sum of all movements."""
        from django.db.models import Sum
        
        services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-LEDGER-001', 'quantity': 15}],
            payments=[{'method': 'CASH', 'amount': Decimal('1500.00')}],
            user=self.admin
        )
        
        # Calculate stock from ledger
        ledger_total = InventoryMovement.objects.filter(
            product=self.product,
            warehouse=self.warehouse
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        # Get stock via service
        service_stock = inventory_services.get_product_stock(
            self.product.id, warehouse_id=self.warehouse.id
        )
        
        self.assertEqual(service_stock, ledger_total)


# =============================================================================
# PHASE 13: PAYMENT MISMATCH TESTS
# =============================================================================

class PaymentMismatchTest(TestCase):
    """
    Test: Overpay rejected; underpay rejected unless CREDIT covers the balance.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Payment Test Product",
            brand="TEST",
            category="TEST",
            sku="PAY-001",
            barcode_value="Quake-PAY-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="PAY-001-V1",
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
    
    def test_partial_cash_without_credit_rejected(self):
        """Silent underpay (CASH only) must not complete the sale."""
        with self.assertRaises(services.PaymentMismatchError):
            services.process_sale(
                idempotency_key=uuid.uuid4(),
                warehouse_id=self.warehouse.id,
                items=[{'barcode': 'Quake-PAY-001', 'quantity': 2}],  # 200.00 total
                payments=[{'method': 'CASH', 'amount': Decimal('150.00')}],
                user=self.admin,
            )

    def test_partial_payment_with_explicit_credit_accepted(self):
        """Counter pays less than total only when CREDIT covers the due amount."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-PAY-001', 'quantity': 2}],  # 200.00 total
            payments=[
                {'method': 'CASH', 'amount': Decimal('150.00')},
                {'method': 'CREDIT', 'amount': Decimal('50.00')},
            ],
            user=self.admin,
        )
        self.assertEqual(sale.status, Sale.Status.COMPLETED)
        self.assertEqual(sale.payment_status, Sale.PaymentStatus.PARTIAL)
        self.assertEqual(sale.paid_amount, Decimal('150.00'))
        self.assertEqual(sale.due_amount, Decimal('50.00'))
        self.assertEqual(sale.total, Decimal('200.00'))
    
    def test_overpayment_rejected(self):
        """Test that sale is rejected when payments > total."""
        with self.assertRaises(services.PaymentMismatchError):
            services.process_sale(
                idempotency_key=uuid.uuid4(),
                warehouse_id=self.warehouse.id,
                items=[{'barcode': 'Quake-PAY-001', 'quantity': 2}],  # 200.00 total
                payments=[{'method': 'CASH', 'amount': Decimal('250.00')}],  # Over
                user=self.admin
            )
    
    def test_exact_multi_payment_accepted(self):
        """Test that exact split payment is accepted."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-PAY-001', 'quantity': 3}],  # 300.00 total
            payments=[
                {'method': 'CASH', 'amount': Decimal('150.00')},
                {'method': 'UPI', 'amount': Decimal('150.00')}
            ],
            user=self.admin
        )
        
        self.assertEqual(sale.status, Sale.Status.COMPLETED)


# =============================================================================
# PHASE 13: DISCOUNT VALIDATION TESTS
# =============================================================================

class DiscountValidationTest(TestCase):
    """
    Test: Discount rules enforced.
    Phase 13: Discounts must follow strict rules.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Discount Test Product",
            brand="TEST",
            category="TEST",
            sku="DISC-001",
            barcode_value="Quake-DISC-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="DISC-001-V1",
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
    
    def test_percent_discount_over_100_rejected(self):
        """Test that percentage discount > 100% is rejected."""
        with self.assertRaises(services.InvalidDiscountError):
            services.process_sale(
                idempotency_key=uuid.uuid4(),
                warehouse_id=self.warehouse.id,
                items=[{'barcode': 'Quake-DISC-001', 'quantity': 2}],
                payments=[{'method': 'CASH', 'amount': Decimal('0.00')}],
                user=self.admin,
                discount_type='PERCENT',
                discount_value=Decimal('150.00')  # 150% - invalid
            )
    
    def test_flat_discount_exceeding_subtotal_rejected(self):
        """Test that flat discount > subtotal is rejected."""
        with self.assertRaises(services.InvalidDiscountError):
            services.process_sale(
                idempotency_key=uuid.uuid4(),
                warehouse_id=self.warehouse.id,
                items=[{'barcode': 'Quake-DISC-001', 'quantity': 2}],  # 200.00 subtotal
                payments=[{'method': 'CASH', 'amount': Decimal('0.00')}],
                user=self.admin,
                discount_type='FLAT',
                discount_value=Decimal('250.00')  # More than subtotal
            )
    
    def test_valid_percent_discount_accepted(self):
        """Test that valid percentage discount is applied correctly."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-DISC-001', 'quantity': 2}],  # 200.00 subtotal
            payments=[{'method': 'CASH', 'amount': Decimal('160.00')}],
            user=self.admin,
            discount_type='PERCENT',
            discount_value=Decimal('20.00')  # 20% off
        )
        
        self.assertEqual(sale.subtotal, Decimal('200.00'))
        self.assertEqual(sale.total, Decimal('160.00'))  # 200 - 40 = 160
    
    def test_valid_flat_discount_accepted(self):
        """Test that valid flat discount is applied correctly."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-DISC-001', 'quantity': 2}],  # 200.00 subtotal
            payments=[{'method': 'UPI', 'amount': Decimal('150.00')}],
            user=self.admin,
            discount_type='FLAT',
            discount_value=Decimal('50.00')  # 50.00 flat off
        )
        
        self.assertEqual(sale.subtotal, Decimal('200.00'))
        self.assertEqual(sale.total, Decimal('150.00'))  # 200 - 50 = 150


# =============================================================================
# PHASE 13: IDEMPOTENCY TESTS
# =============================================================================

class IdempotencyTest(TestCase):
    """
    Test: Duplicate sale requests are idempotent.
    Phase 13: Same idempotency_key returns same sale.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
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
    
    def test_duplicate_request_returns_same_sale(self):
        """Test that same idempotency_key returns same sale."""
        key = uuid.uuid4()
        
        sale1 = services.process_sale(
            idempotency_key=key,
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-IDEMP-001', 'quantity': 2}],
            payments=[{'method': 'CASH', 'amount': Decimal('200.00')}],
            user=self.admin
        )
        
        sale2 = services.process_sale(
            idempotency_key=key,
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-IDEMP-001', 'quantity': 2}],
            payments=[{'method': 'CASH', 'amount': Decimal('200.00')}],
            user=self.admin
        )
        
        self.assertEqual(sale1.id, sale2.id)
    
    def test_duplicate_does_not_reduce_stock_twice(self):
        """Test that duplicate request doesn't reduce stock again."""
        key = uuid.uuid4()
        
        initial_stock = inventory_services.get_product_stock(
            self.product.id, warehouse_id=self.warehouse.id
        )
        
        services.process_sale(
            idempotency_key=key,
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-IDEMP-001', 'quantity': 10}],
            payments=[{'method': 'CASH', 'amount': Decimal('1000.00')}],
            user=self.admin
        )
        
        after_first = inventory_services.get_product_stock(
            self.product.id, warehouse_id=self.warehouse.id
        )
        
        services.process_sale(
            idempotency_key=key,  # Same key
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-IDEMP-001', 'quantity': 10}],
            payments=[{'method': 'CASH', 'amount': Decimal('1000.00')}],
            user=self.admin
        )
        
        after_second = inventory_services.get_product_stock(
            self.product.id, warehouse_id=self.warehouse.id
        )
        
        self.assertEqual(after_first, initial_stock - 10)
        self.assertEqual(after_second, after_first)  # No further reduction


# =============================================================================
# PHASE 13.1: STATUS DEFAULT TESTS
# =============================================================================

class SaleStatusDefaultTest(TestCase):
    """
    Test: status = COMPLETED on creation.
    Phase 13.1: Verify sale lifecycle state is set correctly.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Status Test Product",
            brand="TEST",
            category="TEST",
            sku="STATUS-001",
            barcode_value="Quake-STATUS-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="STATUS-001-V1",
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
    
    def test_sale_status_is_completed(self):
        """Test that sale status is COMPLETED after process_sale."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-STATUS-001', 'quantity': 2}],
            payments=[{'method': 'CASH', 'amount': Decimal('200.00')}],
            user=self.admin
        )
        
        self.assertEqual(sale.status, Sale.Status.COMPLETED)
    
    def test_refunded_status_exists(self):
        """Test that REFUNDED status exists in Sale.Status."""
        self.assertIn('REFUNDED', [s.value for s in Sale.Status])


# =============================================================================
# PHASE 13.1: DISCOUNT BEFORE GST TESTS
# =============================================================================

class DiscountBeforeGSTTest(TestCase):
    """
    Test: GST calculated AFTER discount.
    Phase 13.1: Verify correct calculation order.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="GST Order Test Product",
            brand="TEST",
            category="TEST",
            sku="GSTORD-001",
            barcode_value="Quake-GSTORD-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="GSTORD-001-V1",
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
    
    def test_gst_calculated_after_discount(self):
        """Test that GST is calculated on discounted amount."""
        # Subtotal: 2 × 100 = 200 (MRP-inclusive)
        # Discount: 10% = 20
        # Discounted subtotal: 180 (this is final total, GST already included)
        # GST extracted from 180 for reporting: 180 × (18/118) = 27.46
        # Total: 180 (MRP-inclusive)
        
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-GSTORD-001', 'quantity': 2, 'gst_percentage': Decimal('18.00')}],
            payments=[{'method': 'CASH', 'amount': Decimal('180.00')}],  # MRP-inclusive
            user=self.admin,
            discount_type='PERCENT',
            discount_value=Decimal('10.00')
        )
        
        self.assertEqual(sale.subtotal, Decimal('200.00'))
        # GST is extracted for reporting: 180 × (18/118) = 27.46
        self.assertEqual(sale.total_gst, Decimal('27.46'))
        self.assertEqual(sale.total, Decimal('180.00'))  # MRP-inclusive
        
        # Verify line item has correct GST
        item = sale.items.first()
        self.assertEqual(item.gst_percentage, Decimal('18.00'))
        self.assertEqual(item.gst_amount, Decimal('27.46'))


# =============================================================================
# Checkout: optional automatic GST (default off at POS API)
# =============================================================================


class ApplyAutomaticGstOptionTest(TestCase):
    """When apply_automatic_gst is False, totals unchanged but GST snapshots are zero."""

    def setUp(self):
        from users.models import User

        self.admin = User.objects.create_user(
            username=unique_username("admin"), password="adminpass", role="ADMIN"
        )
        self.warehouse = Warehouse.objects.create(name="Test WH", code="TST-WH")
        self.product = Product.objects.create(
            name="GST Toggle Product",
            brand="TEST",
            category="TEST",
            sku="GSTTOG-001",
            barcode_value="Quake-GSTTOG-001",
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="GSTTOG-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00"),
        )
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type="OPENING",
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id,
        )

    def test_apply_automatic_gst_false_zeros_gst(self):
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[
                {
                    "barcode": "Quake-GSTTOG-001",
                    "quantity": 2,
                    "gst_percentage": Decimal("18.00"),
                }
            ],
            payments=[{"method": "CASH", "amount": Decimal("180.00")}],
            user=self.admin,
            discount_type="PERCENT",
            discount_value=Decimal("10.00"),
            apply_automatic_gst=False,
        )
        self.assertEqual(sale.total, Decimal("180.00"))
        self.assertEqual(sale.total_gst, Decimal("0.00"))
        item = sale.items.first()
        self.assertEqual(item.gst_percentage, Decimal("0.00"))
        self.assertEqual(item.gst_amount, Decimal("0.00"))
        self.assertEqual(item.cgst_amount, Decimal("0.00"))
        self.assertEqual(item.sgst_amount, Decimal("0.00"))


class ProcessSaleCustomerFieldsTest(TestCase):
    """Customer contact fields from checkout are persisted on Sale."""

    def setUp(self):
        from users.models import User
        from customers.models import Customer

        self.admin = User.objects.create_user(
            username=unique_username("admin"), password="adminpass", role="ADMIN"
        )
        self.warehouse = Warehouse.objects.create(name="Test WH Cust", code="TST-CUST")
        self.product = Product.objects.create(
            name="Cust Test Product",
            brand="TEST",
            category="TEST",
            sku="CUST-001",
            barcode_value="Quake-CUST-001",
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="CUST-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00"),
        )
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type="OPENING",
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id,
        )
        self.customer = Customer.objects.create(
            name="Ledger Customer",
            phone="9998887777",
            email="ledger@example.com",
            address="123 Billing St",
        )

    def test_persists_request_customer_contact_fields(self):
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{"barcode": "Quake-CUST-001", "quantity": 1}],
            payments=[{"method": "CASH", "amount": Decimal("100.00")}],
            user=self.admin,
            customer_name="Walk In",
            customer_mobile="5551234567",
            customer_email="walk@example.com",
            customer_address="99 Main Rd",
        )
        self.assertEqual(sale.customer_name, "Walk In")
        self.assertEqual(sale.customer_mobile, "5551234567")
        self.assertEqual(sale.customer_email, "walk@example.com")
        self.assertEqual(sale.customer_address, "99 Main Rd")
        # Checkout buyers with phone/name are auto-collected into CRM
        self.assertIsNotNone(sale.customer_id)
        self.assertEqual(sale.customer.name, "Walk In")
        self.assertTrue(
            sale.customer.phone.endswith("5551234567")
            or sale.customer.phone == "5551234567"
        )

    def test_snapshot_fills_from_linked_customer_when_contact_blank(self):
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{"barcode": "Quake-CUST-001", "quantity": 1}],
            payments=[{"method": "CASH", "amount": Decimal("100.00")}],
            user=self.admin,
            customer_id=self.customer.id,
            customer_name="",
            customer_mobile="",
            customer_email="",
            customer_address="",
        )
        self.assertEqual(sale.customer_id, self.customer.id)
        self.assertEqual(sale.customer_name, "Ledger Customer")
        self.assertEqual(sale.customer_mobile, "9998887777")
        self.assertEqual(sale.customer_email, "ledger@example.com")
        self.assertEqual(sale.customer_address, "123 Billing St")


# =============================================================================
# PHASE 13.1: GST STORED TESTS
# =============================================================================

class GSTStoredTest(TestCase):
    """
    Test: Line GST persisted immutably.
    Phase 13.1: Verify GST is stored per line item.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="GST Storage Test Product",
            brand="TEST",
            category="TEST",
            sku="GSTSTORE-001",
            barcode_value="Quake-GSTSTORE-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="GSTSTORE-001-V1",
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
    
    def test_gst_fields_stored_on_sale_item(self):
        """Test that GST fields are stored on SaleItem."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-GSTSTORE-001', 'quantity': 3, 'gst_percentage': Decimal('12.00')}],
            payments=[{'method': 'UPI', 'amount': Decimal('300.00')}],  # MRP-inclusive
            user=self.admin
        )
        
        item = sale.items.first()
        self.assertEqual(item.gst_percentage, Decimal('12.00'))
        # GST extracted: 300 × (12/112) = 32.14
        self.assertEqual(item.gst_amount, Decimal('32.14'))
        self.assertEqual(item.line_total, Decimal('300.00'))
        self.assertEqual(item.line_total_with_gst, Decimal('300.00'))  # GST already included
    
    def test_total_gst_stored_on_sale(self):
        """Test that total_gst is stored on Sale."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-GSTSTORE-001', 'quantity': 2, 'gst_percentage': Decimal('5.00')}],
            payments=[{'method': 'CARD', 'amount': Decimal('200.00')}],  # MRP-inclusive
            user=self.admin
        )
        
        # GST extracted: 200 × (5/105) = 9.52
        self.assertEqual(sale.total_gst, Decimal('9.52'))


# =============================================================================
# PHASE 13.1: GST VALIDATION TESTS
# =============================================================================

class GSTValidationTest(TestCase):
    """
    Test: Reject GST < 0 or > 100.
    Phase 13.1: Verify GST validation rules.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="GST Validation Test Product",
            brand="TEST",
            category="TEST",
            sku="GSTVAL-001",
            barcode_value="Quake-GSTVAL-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="GSTVAL-001-V1",
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
    
    def test_negative_gst_rejected(self):
        """Test that negative GST percentage is rejected."""
        with self.assertRaises(services.InvalidGSTError):
            services.process_sale(
                idempotency_key=uuid.uuid4(),
                warehouse_id=self.warehouse.id,
                items=[{'barcode': 'Quake-GSTVAL-001', 'quantity': 1, 'gst_percentage': Decimal('-5.00')}],
                payments=[{'method': 'CASH', 'amount': Decimal('100.00')}],
                user=self.admin
            )
    
    def test_gst_over_100_rejected(self):
        """Test that GST > 100% is rejected."""
        with self.assertRaises(services.InvalidGSTError):
            services.process_sale(
                idempotency_key=uuid.uuid4(),
                warehouse_id=self.warehouse.id,
                items=[{'barcode': 'Quake-GSTVAL-001', 'quantity': 1, 'gst_percentage': Decimal('150.00')}],
                payments=[{'method': 'CASH', 'amount': Decimal('100.00')}],
                user=self.admin
            )
    
    def test_valid_gst_accepted(self):
        """Test that valid GST (0-100) is accepted."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-GSTVAL-001', 'quantity': 1, 'gst_percentage': Decimal('28.00')}],
            payments=[{'method': 'CASH', 'amount': Decimal('100.00')}],  # MRP-inclusive
            user=self.admin
        )
        
        self.assertEqual(sale.total, Decimal('100.00'))


# =============================================================================
# PHASE 13.1: INVOICE MATH TESTS
# =============================================================================

class InvoiceMathTest(TestCase):
    """
    Test: All totals reconcile exactly.
    Phase 13.1: Verify complete calculation correctness.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product1 = Product.objects.create(
            name="Math Test Product 1",
            brand="TEST",
            category="TEST",
            sku="MATH-001",
            barcode_value="Quake-MATH-001"
        )
        ProductVariant.objects.create(
            product=self.product1,
            sku="MATH-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        self.product2 = Product.objects.create(
            name="Math Test Product 2",
            brand="TEST",
            category="TEST",
            sku="MATH-002",
            barcode_value="Quake-MATH-002"
        )
        ProductVariant.objects.create(
            product=self.product2,
            sku="MATH-002-V1",
            cost_price=Decimal("75.00"),
            selling_price=Decimal("150.00")
        )
        
        inventory_services.create_inventory_movement(
            product_id=self.product1.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        inventory_services.create_inventory_movement(
            product_id=self.product2.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
    
    def test_multi_item_totals_reconcile(self):
        """Test that multi-item sale with discount and GST reconciles."""
        # Item 1: 2 × 100 = 200, GST 18% (MRP-inclusive)
        # Item 2: 1 × 150 = 150, GST 12% (MRP-inclusive)
        # Subtotal: 350 (MRP-inclusive)
        # Discount 10%: 35
        # Discounted subtotal: 315 (this is final total, GST already included)
        # Pro-rata discount:
        #   Item 1: (200/350) × 35 = 20, discounted = 180
        #   Item 2: (150/350) × 35 = 15, discounted = 135
        # GST extracted for reporting:
        #   Item 1: 180 × (18/118) = 27.46
        #   Item 2: 135 × (12/112) = 14.46
        # Total GST: 41.92 (for reporting only)
        # Final: 315 (MRP-inclusive)
        
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[
                {'barcode': 'Quake-MATH-001', 'quantity': 2, 'gst_percentage': Decimal('18.00')},
                {'barcode': 'Quake-MATH-002', 'quantity': 1, 'gst_percentage': Decimal('12.00')},
            ],
            payments=[{'method': 'CASH', 'amount': Decimal('315.00')}],  # MRP-inclusive
            user=self.admin,
            discount_type='PERCENT',
            discount_value=Decimal('10.00')
        )
        
        self.assertEqual(sale.subtotal, Decimal('350.00'))
        self.assertEqual(sale.total_gst, Decimal('41.92'))  # Extracted for reporting
        self.assertEqual(sale.total, Decimal('315.00'))  # MRP-inclusive
        
        # Verify individual items
        items = list(sale.items.all())
        self.assertEqual(len(items), 2)
        
        # Sum of line totals with GST should equal final total
        line_totals_with_gst = sum(item.line_total_with_gst for item in items)
        self.assertEqual(line_totals_with_gst, sale.total)


# =============================================================================
# PHASE 13.1: REFUND PREPARATION TESTS
# =============================================================================

class RefundPreparationTest(TestCase):
    """
    Test: Sale immutability verified.
    Phase 13.1: Prepare for future refund logic.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Refund Prep Test Product",
            brand="TEST",
            category="TEST",
            sku="REFPREP-001",
            barcode_value="Quake-REFPREP-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="REFPREP-001-V1",
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
    
    def test_sale_item_cannot_be_modified(self):
        """Test that SaleItem cannot be modified after creation."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-REFPREP-001', 'quantity': 2}],
            payments=[{'method': 'CASH', 'amount': Decimal('200.00')}],
            user=self.admin
        )
        
        item = sale.items.first()
        item.quantity = 5  # Try to modify
        
        with self.assertRaises(ValueError) as context:
            item.save()
        
        self.assertIn("cannot be modified", str(context.exception))
    
    def test_sale_item_cannot_be_deleted(self):
        """Test that SaleItem cannot be deleted."""
        sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-REFPREP-001', 'quantity': 2}],
            payments=[{'method': 'CASH', 'amount': Decimal('200.00')}],
            user=self.admin
        )
        
        item = sale.items.first()
        
        with self.assertRaises(ValueError) as context:
            item.delete()
        
        self.assertIn("cannot be deleted", str(context.exception))


# =============================================================================
# PHASE 15: RETURNS, REFUNDS & ADJUSTMENTS TESTS
# =============================================================================

class PartialReturnTest(TestCase):
    """
    Test: Partial refund works.
    Phase 15: Return part of a sale.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Partial Return Test Product",
            brand="TEST",
            category="TEST",
            sku="PARTIAL-001",
            barcode_value="Quake-PARTIAL-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="PARTIAL-001-V1",
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
        
        # Create a sale with 5 items
        self.sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-PARTIAL-001', 'quantity': 5}],
            payments=[{'method': 'CASH', 'amount': Decimal('500.00')}],
            user=self.admin
        )
    
    def test_partial_return_succeeds(self):
        """Test that partial return works."""
        from sales import returns as returns_service
        
        sale_item = self.sale.items.first()
        
        return_record = returns_service.process_return(
            sale_id=str(self.sale.id),
            warehouse_id=str(self.warehouse.id),
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 2}],
            reason="Size issue",
            user=self.admin
        )
        
        self.assertIsNotNone(return_record.id)
        self.assertEqual(return_record.items.count(), 1)
        self.assertEqual(return_record.items.first().quantity, 2)
    
    def test_partial_return_refund_amount(self):
        """Test that partial return refund is proportional."""
        from sales import returns as returns_service
        
        sale_item = self.sale.items.first()
        
        return_record = returns_service.process_return(
            sale_id=str(self.sale.id),
            warehouse_id=str(self.warehouse.id),
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 2}],
            reason="Size issue",
            user=self.admin
        )
        
        # Original: 5 × 100 = 500, Return 2 = 200
        self.assertEqual(return_record.refund_amount, Decimal('200.00'))


class FullReturnTest(TestCase):
    """
    Test: Full return updates sale status.
    Phase 15: Sale status → REFUNDED when fully returned.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Full Return Test Product",
            brand="TEST",
            category="TEST",
            sku="FULL-001",
            barcode_value="Quake-FULL-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="FULL-001-V1",
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
        
        self.sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-FULL-001', 'quantity': 3}],
            payments=[{'method': 'CASH', 'amount': Decimal('300.00')}],
            user=self.admin
        )
    
    def test_full_return_changes_status(self):
        """Test that full return sets sale status to REFUNDED."""
        from sales import returns as returns_service
        
        sale_item = self.sale.items.first()
        
        returns_service.process_return(
            sale_id=str(self.sale.id),
            warehouse_id=str(self.warehouse.id),
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 3}],
            reason="Customer changed mind",
            user=self.admin
        )
        
        # Refresh sale from DB
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.status, Sale.Status.REFUNDED)


class OverReturnBlockedTest(TestCase):
    """
    Test: Cannot return more than sold.
    Phase 15: Reject excess return.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Over Return Test Product",
            brand="TEST",
            category="TEST",
            sku="OVER-001",
            barcode_value="Quake-OVER-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="OVER-001-V1",
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
        
        # Sale with quantity 3
        self.sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-OVER-001', 'quantity': 3}],
            payments=[{'method': 'CASH', 'amount': Decimal('300.00')}],
            user=self.admin
        )
    
    def test_over_return_rejected(self):
        """Test that returning more than sold is rejected."""
        from sales import returns as returns_service
        
        sale_item = self.sale.items.first()
        
        with self.assertRaises(returns_service.InvalidReturnQuantityError):
            returns_service.process_return(
                sale_id=str(self.sale.id),
                warehouse_id=str(self.warehouse.id),
                items=[{'sale_item_id': str(sale_item.id), 'quantity': 5}],  # Only sold 3
                reason="Test",
                user=self.admin
            )
    
    def test_cumulative_over_return_rejected(self):
        """Test that cumulative returns cannot exceed sold quantity."""
        from sales import returns as returns_service
        
        sale_item = self.sale.items.first()
        
        # First return: 2 items
        returns_service.process_return(
            sale_id=str(self.sale.id),
            warehouse_id=str(self.warehouse.id),
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 2}],
            reason="First return",
            user=self.admin
        )
        
        # Second return: 2 items (total would be 4, but only sold 3)
        with self.assertRaises(returns_service.InvalidReturnQuantityError):
            returns_service.process_return(
                sale_id=str(self.sale.id),
                warehouse_id=str(self.warehouse.id),
                items=[{'sale_item_id': str(sale_item.id), 'quantity': 2}],
                reason="Second return",
                user=self.admin
            )


class LedgerReturnTest(TestCase):
    """
    Test: Stock increases on return.
    Phase 15: RETURN movement created.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Ledger Return Test Product",
            brand="TEST",
            category="TEST",
            sku="LEDRET-001",
            barcode_value="Quake-LEDRET-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="LEDRET-001-V1",
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
        
        # Sale reduces stock by 5
        self.sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-LEDRET-001', 'quantity': 5}],
            payments=[{'method': 'CASH', 'amount': Decimal('500.00')}],
            user=self.admin
        )
    
    def test_return_creates_movement(self):
        """Test that return creates RETURN inventory movement."""
        from sales import returns as returns_service
        
        sale_item = self.sale.items.first()
        
        returns_service.process_return(
            sale_id=str(self.sale.id),
            warehouse_id=str(self.warehouse.id),
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 2}],
            reason="Test",
            user=self.admin
        )
        
        # Check for RETURN movement
        return_movement = InventoryMovement.objects.filter(
            product=self.product,
            movement_type='RETURN'
        ).first()
        
        self.assertIsNotNone(return_movement)
        self.assertEqual(return_movement.quantity, 2)
    
    def test_stock_increases_on_return(self):
        """Test that stock increases after return."""
        from sales import returns as returns_service
        
        # Stock after sale: 100 - 5 = 95
        stock_after_sale = inventory_services.get_product_stock(
            self.product.id, self.warehouse.id
        )
        self.assertEqual(stock_after_sale, 95)
        
        sale_item = self.sale.items.first()
        
        returns_service.process_return(
            sale_id=str(self.sale.id),
            warehouse_id=str(self.warehouse.id),
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 2}],
            reason="Test",
            user=self.admin
        )
        
        # Stock after return: 95 + 2 = 97
        stock_after_return = inventory_services.get_product_stock(
            self.product.id, self.warehouse.id
        )
        self.assertEqual(stock_after_return, 97)


class AdjustmentTest(TestCase):
    """
    Test: Manual stock adjustments.
    Phase 15: ADJUSTMENT movements.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Adjustment Test Product",
            brand="TEST",
            category="TEST",
            sku="ADJ-001",
            barcode_value="Quake-ADJ-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="ADJ-001-V1",
            cost_price=Decimal("50.00"),
            selling_price=Decimal("100.00")
        )
        
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=50,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
    
    def test_positive_adjustment(self):
        """Test positive stock adjustment."""
        movement = inventory_services.create_stock_adjustment(
            product_id=self.product.id,
            warehouse_id=self.warehouse.id,
            quantity=10,
            reason="Found extra items during count",
            user=self.admin
        )
        
        self.assertEqual(movement.movement_type, 'ADJUSTMENT')
        self.assertEqual(movement.quantity, 10)
        
        new_stock = inventory_services.get_product_stock(
            self.product.id, self.warehouse.id
        )
        self.assertEqual(new_stock, 60)  # 50 + 10
    
    def test_negative_adjustment(self):
        """Test negative stock adjustment."""
        movement = inventory_services.create_stock_adjustment(
            product_id=self.product.id,
            warehouse_id=self.warehouse.id,
            quantity=-5,
            reason="Damaged items",
            user=self.admin
        )
        
        self.assertEqual(movement.quantity, -5)
        
        new_stock = inventory_services.get_product_stock(
            self.product.id, self.warehouse.id
        )
        self.assertEqual(new_stock, 45)  # 50 - 5
    
    def test_over_adjustment_rejected(self):
        """Test that adjustment cannot result in negative stock."""
        with self.assertRaises(inventory_services.InsufficientStockError):
            inventory_services.create_stock_adjustment(
                product_id=self.product.id,
                warehouse_id=self.warehouse.id,
                quantity=-100,  # Only have 50
                reason="Test",
                user=self.admin
            )
    
    def test_zero_adjustment_rejected(self):
        """Test that zero adjustment is rejected."""
        with self.assertRaises(inventory_services.InvalidAdjustmentError):
            inventory_services.create_stock_adjustment(
                product_id=self.product.id,
                warehouse_id=self.warehouse.id,
                quantity=0,
                reason="Test",
                user=self.admin
            )
    
    def test_empty_reason_rejected(self):
        """Test that empty reason is rejected."""
        with self.assertRaises(inventory_services.InvalidAdjustmentError):
            inventory_services.create_stock_adjustment(
                product_id=self.product.id,
                warehouse_id=self.warehouse.id,
                quantity=5,
                reason="",
                user=self.admin
            )


class ReturnImmutabilityTest(TestCase):
    """
    Test: Return records are immutable.
    Phase 15: Returns cannot be modified.
    """
    
    def setUp(self):
        from users.models import User
        from sales.models import Return, ReturnItem
        
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Immutable Return Test Product",
            brand="TEST",
            category="TEST",
            sku="IMMUT-RET-001",
            barcode_value="Quake-IMMUT-RET-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="IMMUT-RET-001-V1",
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
        
        self.sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-IMMUT-RET-001', 'quantity': 5}],
            payments=[{'method': 'CASH', 'amount': Decimal('500.00')}],
            user=self.admin
        )
        
        from sales import returns as returns_service
        sale_item = self.sale.items.first()
        self.return_record = returns_service.process_return(
            sale_id=str(self.sale.id),
            warehouse_id=str(self.warehouse.id),
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 2}],
            reason="Test immutability",
            user=self.admin
        )
    
    def test_return_cannot_be_modified(self):
        """Test that Return cannot be modified."""
        self.return_record.refund_amount = Decimal('9999.00')
        
        with self.assertRaises(ValueError) as context:
            self.return_record.save()
        
        self.assertIn("cannot be modified", str(context.exception))
    
    def test_return_cannot_be_deleted(self):
        """Test that Return cannot be deleted."""
        with self.assertRaises(ValueError) as context:
            self.return_record.delete()
        
        self.assertIn("cannot be deleted", str(context.exception))
    
    def test_return_item_cannot_be_modified(self):
        """Test that ReturnItem cannot be modified."""
        item = self.return_record.items.first()
        item.quantity = 999
        
        with self.assertRaises(ValueError) as context:
            item.save()
        
        self.assertIn("cannot be modified", str(context.exception))
    
    def test_return_item_cannot_be_deleted(self):
        """Test that ReturnItem cannot be deleted."""
        item = self.return_record.items.first()
        
        with self.assertRaises(ValueError) as context:
            item.delete()
        
        self.assertIn("cannot be deleted", str(context.exception))


class OriginalSaleImmutabilityTest(TestCase):
    """
    Test: Original sale unchanged after return.
    Phase 15: No mutation of original records.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(
            name="Test WH",
            code="TST-WH"
        )
        self.product = Product.objects.create(
            name="Sale Immutable Test Product",
            brand="TEST",
            category="TEST",
            sku="SALEIMMUT-001",
            barcode_value="Quake-SALEIMMUT-001"
        )
        ProductVariant.objects.create(
            product=self.product,
            sku="SALEIMMUT-001-V1",
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
        
        self.sale = services.process_sale(
            idempotency_key=uuid.uuid4(),
            warehouse_id=self.warehouse.id,
            items=[{'barcode': 'Quake-SALEIMMUT-001', 'quantity': 5}],
            payments=[{'method': 'CASH', 'amount': Decimal('500.00')}],
            user=self.admin
        )
        
        # Store original values
        self.original_total = self.sale.total
        self.original_item_qty = self.sale.items.first().quantity
    
    def test_sale_total_unchanged_after_return(self):
        """Test that sale total is not changed by return."""
        from sales import returns as returns_service
        
        sale_item = self.sale.items.first()
        
        returns_service.process_return(
            sale_id=str(self.sale.id),
            warehouse_id=str(self.warehouse.id),
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 2}],
            reason="Test",
            user=self.admin
        )
        
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.total, self.original_total)
    
    def test_sale_item_quantity_unchanged_after_return(self):
        """Test that sale item quantity is not changed by return."""
        from sales import returns as returns_service
        
        sale_item = self.sale.items.first()
        
        returns_service.process_return(
            sale_id=str(self.sale.id),
            warehouse_id=str(self.warehouse.id),
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 2}],
            reason="Test",
            user=self.admin
        )
        
        sale_item.refresh_from_db()
        self.assertEqual(sale_item.quantity, self.original_item_qty)


# =============================================================================
# POS TEXT SEARCH (GET /api/v1/sales/pos/search/)
# =============================================================================

class PosSearchServiceTest(TestCase):
    """Tests for services.pos_search (warehouse-scoped product + service search)."""

    def setUp(self):
        from users.models import User
        from inventory.models import ServiceItem

        self.admin = User.objects.create_user(
            username=unique_username('possearch_admin'), password='x', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='POS Search WH', code='PS-WH')
        self.product = Product.objects.create(
            name='Apollo Tyre 185/65 R15',
            brand='Apollo',
            category='TYRE',
            sku='APOLLO-185',
            barcode_value='Quake-PS-APOLLO-001',
        )
        ProductVariant.objects.create(
            product=self.product,
            sku='APOLLO-185-V1',
            cost_price=Decimal('2000'),
            selling_price=Decimal('4500.00'),
        )
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=10,
            user=self.admin,
            warehouse_id=self.warehouse.id,
        )
        ServiceItem.objects.create(
            service_name='Wheel balancing',
            default_price=Decimal('200.00'),
            gst_percent=Decimal('18.00'),
        )

    def test_pos_search_finds_product_by_partial_name(self):
        data = services.pos_search(str(self.warehouse.id), 'Apollo', limit=10)
        self.assertEqual(len(data['products']), 1)
        self.assertEqual(data['products'][0]['item_type'], 'PRODUCT')
        self.assertEqual(data['products'][0]['product_id'], str(self.product.id))
        self.assertEqual(data['products'][0]['available_stock'], 10)

    def test_pos_search_finds_service(self):
        data = services.pos_search(str(self.warehouse.id), 'balancing', limit=10)
        names = [s['service_name'] for s in data['services']]
        self.assertIn('Wheel balancing', names)
        self.assertEqual(data['services'][0]['item_type'], 'SERVICE')

    def test_pos_search_empty_query_returns_empty_lists(self):
        data = services.pos_search(str(self.warehouse.id), '   ', limit=10)
        self.assertEqual(data['products'], [])
        self.assertEqual(data['services'], [])

    def test_pos_search_invalid_warehouse(self):
        with self.assertRaises(services.WarehouseNotFoundError):
            services.pos_search(uuid.uuid4(), 'Apollo', limit=10)

    def test_pos_search_limit_clamped_high(self):
        data = services.pos_search(str(self.warehouse.id), 'Apollo', limit=999)
        self.assertEqual(data['limit'], 50)


class PosSearchApiTest(APITestCase):
    """HTTP tests for GET /api/v1/sales/pos/search/."""

    def setUp(self):
        from users.models import User

        self.user = User.objects.create_user(
            username=unique_username('possearch_api'), password='pass12345', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='API POS WH', code='API-PS')
        self.product = Product.objects.create(
            name='Searchable Widget',
            brand='SW',
            category='CAT',
            sku='SW-001',
            barcode_value='Quake-SW-001',
        )
        ProductVariant.objects.create(
            product=self.product,
            sku='SW-001-V',
            cost_price=Decimal('10'),
            selling_price=Decimal('25.00'),
        )
        inventory_services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=5,
            user=self.user,
            warehouse_id=self.warehouse.id,
        )

    def test_pos_search_requires_warehouse_id(self):
        self.client.force_authenticate(user=self.user)
        r = self.client.get('/api/v1/sales/pos/search/', {'q': 'Widget'})
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('warehouse_id', r.data.get('error', ''))

    def test_pos_search_unknown_warehouse_404(self):
        self.client.force_authenticate(user=self.user)
        r = self.client.get(
            '/api/v1/sales/pos/search/',
            {'q': 'Widget', 'warehouse_id': str(uuid.uuid4())},
        )
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_pos_search_returns_products(self):
        self.client.force_authenticate(user=self.user)
        r = self.client.get(
            '/api/v1/sales/pos/search/',
            {
                'q': 'Widget',
                'warehouse_id': str(self.warehouse.id),
                'limit': '5',
            },
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['query'], 'Widget')
        self.assertEqual(r.data['warehouse_id'], str(self.warehouse.id))
        self.assertEqual(r.data['limit'], 5)
        self.assertEqual(len(r.data['products']), 1)
        self.assertEqual(r.data['products'][0]['item_type'], 'PRODUCT')
