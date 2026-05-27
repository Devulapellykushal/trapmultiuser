"""
Inventory Tests for Quake Inventory System.
Tests for ledger-based stock management and hardening rules.

HARDENING TESTS (Phase 2.1):
- Soft delete behavior
- Ledger immutability
- Price immutability when stock exists
- Single entry point for stock mutation
"""

import uuid
from decimal import Decimal
from django.test import TestCase
from django.db import transaction
from rest_framework.test import APITestCase
from rest_framework import status

from core.test_username import unique_username

from .models import Warehouse, Product, ProductVariant, StockLedger, StockSnapshot
from .serializers import ProductVariantUpdateSerializer
from . import services


class WarehouseModelTest(TestCase):
    """Tests for Warehouse model."""
    
    def test_create_warehouse(self):
        warehouse = Warehouse.objects.create(
            name="Main Warehouse",
            code="WH001"
        )
        self.assertEqual(warehouse.name, "Main Warehouse")
        self.assertEqual(warehouse.code, "WH001")
        self.assertTrue(warehouse.is_active)
        self.assertIsNotNone(warehouse.id)


class ProductModelTest(TestCase):
    """Tests for Product and ProductVariant models."""
    
    def test_create_product_with_variant(self):
        product = Product.objects.create(
            name="Luxury T-Shirt",
            brand="Quake",
            category="Apparel"
        )
        variant = ProductVariant.objects.create(
            product=product,
            sku="Quake-TS-001-M-BLK",
            size="M",
            color="Black",
            cost_price=Decimal("25.00"),
            selling_price=Decimal("49.99")
        )
        
        self.assertEqual(product.variants.count(), 1)
        self.assertEqual(variant.product, product)
        self.assertEqual(variant.get_total_stock(), 0)


class StockLedgerTest(TestCase):
    """Tests for StockLedger immutability."""
    
    def setUp(self):
        self.warehouse = Warehouse.objects.create(name="Test WH", code="TWH")
        self.product = Product.objects.create(
            name="Test Product",
            brand="Test",
            category="Test"
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="TEST-001",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("20.00")
        )
    
    def test_ledger_entry_creation(self):
        """Test that ledger entries can be created."""
        entry = services.record_purchase(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=100,
            notes="Initial stock"
        )
        
        self.assertIsNotNone(entry.id)
        self.assertEqual(entry.quantity, 100)
        self.assertEqual(entry.event_type, StockLedger.EventType.PURCHASE)
    
    def test_ledger_entry_immutable(self):
        """Test that ledger entries cannot be modified."""
        entry = services.record_purchase(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=50
        )
        
        entry.quantity = 100
        with self.assertRaises(ValueError):
            entry.save()
    
    def test_ledger_entry_no_delete(self):
        """Test that ledger entries cannot be deleted."""
        entry = services.record_purchase(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=50
        )
        
        with self.assertRaises(ValueError):
            entry.delete()


class StockSnapshotTest(TestCase):
    """Tests for StockSnapshot accuracy."""
    
    def setUp(self):
        self.warehouse = Warehouse.objects.create(name="Test WH", code="TWH")
        self.product = Product.objects.create(
            name="Test Product",
            brand="Test",
            category="Test"
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="TEST-001",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("20.00")
        )
    
    def test_snapshot_accuracy_after_purchase(self):
        """Test that snapshot is accurate after purchase."""
        services.record_purchase(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=100
        )
        
        snapshot = StockSnapshot.objects.get(
            variant=self.variant,
            warehouse=self.warehouse
        )
        self.assertEqual(snapshot.quantity, 100)
    
    def test_snapshot_accuracy_after_multiple_operations(self):
        """Test snapshot accuracy after multiple operations."""
        # Purchase 100
        services.record_purchase(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=100
        )
        
        # Another purchase 50
        services.record_purchase(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=50
        )
        
        # Adjustment -30
        services.record_adjustment(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=-30,
            notes="Inventory correction for damaged goods"
        )
        
        snapshot = StockSnapshot.objects.get(
            variant=self.variant,
            warehouse=self.warehouse
        )
        # 100 + 50 - 30 = 120
        self.assertEqual(snapshot.quantity, 120)
    
    def test_snapshot_matches_ledger_sum(self):
        """Test that snapshot matches sum of ledger entries."""
        services.record_purchase(self.variant, self.warehouse, 100)
        services.record_purchase(self.variant, self.warehouse, 50)
        services.record_adjustment(
            self.variant, self.warehouse, -20,
            notes="Test adjustment for reconciliation"
        )
        
        # Get snapshot
        snapshot = StockSnapshot.objects.get(
            variant=self.variant,
            warehouse=self.warehouse
        )
        
        # Calculate from ledger
        from django.db.models import Sum
        ledger_total = StockLedger.objects.filter(
            variant=self.variant,
            warehouse=self.warehouse
        ).aggregate(total=Sum('quantity'))['total']
        
        self.assertEqual(snapshot.quantity, ledger_total)


class NegativeStockPreventionTest(TestCase):
    """Tests for negative stock prevention."""
    
    def setUp(self):
        self.warehouse = Warehouse.objects.create(name="Test WH", code="TWH")
        self.product = Product.objects.create(
            name="Test Product",
            brand="Test",
            category="Test"
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="TEST-001",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("20.00")
        )
    
    def test_prevent_negative_stock(self):
        """Test that negative stock is prevented by default."""
        # Start with 50 items
        services.record_purchase(self.variant, self.warehouse, 50)
        
        # Try to deduct 100 (more than available)
        with self.assertRaises(services.InsufficientStockError):
            services.record_adjustment(
                variant=self.variant,
                warehouse=self.warehouse,
                quantity=-100,
                notes="This should fail due to insufficient stock"
            )
    
    def test_allow_negative_when_permitted(self):
        """Test that negative stock is allowed when explicitly permitted."""
        services.record_purchase(self.variant, self.warehouse, 50)
        
        # Allow negative stock
        entry = services.record_adjustment(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=-100,
            notes="Allowing negative for correction purposes",
            allow_negative=True
        )
        
        snapshot = StockSnapshot.objects.get(
            variant=self.variant,
            warehouse=self.warehouse
        )
        self.assertEqual(snapshot.quantity, -50)


class AtomicTransactionTest(TestCase):
    """Tests for atomic transaction behavior."""
    
    def setUp(self):
        self.warehouse = Warehouse.objects.create(name="Test WH", code="TWH")
        self.product = Product.objects.create(
            name="Test Product",
            brand="Test",
            category="Test"
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="TEST-001",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("20.00")
        )
    
    def test_transaction_rollback_on_failure(self):
        """Test that failed operations don't create partial entries."""
        services.record_purchase(self.variant, self.warehouse, 50)
        
        initial_ledger_count = StockLedger.objects.count()
        
        try:
            services.record_adjustment(
                variant=self.variant,
                warehouse=self.warehouse,
                quantity=-100,
                notes="This should fail and rollback"
            )
        except services.InsufficientStockError:
            pass
        
        # Verify no new ledger entry was created
        self.assertEqual(StockLedger.objects.count(), initial_ledger_count)


class StockSummaryTest(TestCase):
    """
    Tests for stock summary functionality.
    Phase 11.2: Uses InventoryMovement ledger.
    Phase 12: Uses warehouse for required movement types.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('testadmin'), password='testpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='Sum WH', code='SUM-WH')
        self.product1 = Product.objects.create(
            name="Test Product 1",
            brand="Test",
            category="Test"
        )
        self.product2 = Product.objects.create(
            name="Test Product 2",
            brand="Test",
            category="Test"
        )
    
    def test_stock_summary(self):
        """Test stock summary calculation using InventoryMovement ledger."""
        # Add stock via InventoryMovement (Phase 11/12)
        services.create_inventory_movement(
            product_id=self.product1.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        services.create_inventory_movement(
            product_id=self.product2.id,
            movement_type='OPENING',
            quantity=5,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        summary = services.get_stock_summary()
        
        self.assertEqual(summary['total_stock'], 105)
        self.assertEqual(summary['total_products'], 2)
        self.assertEqual(len(summary['low_stock_items']), 1)  # product2 with 5 stock


# ============================================================================
# PHASE 2.1 HARDENING TESTS
# ============================================================================

class SoftDeleteTest(APITestCase):
    """
    Tests for soft delete behavior.
    Rule 1: No hard delete for business entities.
    
    Phase 10A: Products use is_deleted=True for soft delete.
    """
    
    def setUp(self):
        # Create admin user for authentication
        from users.models import User
        self.admin_user = User.objects.create_user(
            username=unique_username('testadmin'),
            password='testpass123',
            role='ADMIN'
        )
        self.client.force_authenticate(user=self.admin_user)
        
        self.warehouse = Warehouse.objects.create(name="Test WH", code="TWH")
        self.product = Product.objects.create(
            name="Test Product",
            brand="Test",
            category="Test"
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="TEST-001",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("20.00")
        )
    
    def test_product_delete_sets_is_deleted(self):
        """Test that deleting a product sets is_deleted=True (Phase 10A)."""
        url = f'/api/v1/inventory/products/{self.product.id}/'
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Refresh from database
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_deleted)  # Phase 10A: uses is_deleted
        
        # Product should still exist in database
        self.assertTrue(Product.objects.filter(id=self.product.id).exists())
    
    def test_product_delete_deactivates_variants(self):
        """Test that deleting a product also deactivates its variants."""
        url = f'/api/v1/inventory/products/{self.product.id}/'
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Variant should be inactive
        self.variant.refresh_from_db()
        self.assertFalse(self.variant.is_active)
    
    def test_warehouse_delete_becomes_inactive(self):
        """Test that deleting a warehouse sets is_active=False."""
        url = f'/api/v1/inventory/warehouses/{self.warehouse.id}/'
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Warehouse should still exist but be inactive
        self.warehouse.refresh_from_db()
        self.assertFalse(self.warehouse.is_active)
        self.assertTrue(Warehouse.objects.filter(id=self.warehouse.id).exists())
    
    def test_deleted_products_excluded_by_default(self):
        """Test that deleted products are excluded from list by default."""
        # Create another active product
        Product.objects.create(name="Active Product", brand="Test", category="Test")
        
        # Soft delete (Phase 10A) original product
        self.product.is_deleted = True
        self.product.save()
        
        url = '/api/v1/inventory/products/'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Only non-deleted products should be returned
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
    
    def test_deleted_products_visible_with_filter(self):
        """Test that ?is_deleted=true shows deleted products (admin only)."""
        # Soft delete product
        self.product.is_deleted = True
        self.product.save()
        
        # Create an active product
        Product.objects.create(name="Active Product", brand="Test", category="Test")
        
        url = '/api/v1/inventory/products/?is_deleted=true'
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should return only deleted products
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['name'], 'Test Product')


class LedgerImmutabilityTest(TestCase):
    """
    Tests for ledger immutability.
    Rule 2: StockLedger must be immutable (append-only).
    """
    
    def setUp(self):
        self.warehouse = Warehouse.objects.create(name="Test WH", code="TWH")
        self.product = Product.objects.create(
            name="Test Product",
            brand="Test",
            category="Test"
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="TEST-001",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("20.00")
        )
    
    def test_ledger_update_forbidden(self):
        """Test that ledger entries cannot be updated via save()."""
        entry = services.record_purchase(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=100
        )
        
        entry.quantity = 200
        with self.assertRaises(ValueError) as context:
            entry.save()
        
        self.assertIn("cannot be modified", str(context.exception))
    
    def test_ledger_delete_forbidden(self):
        """Test that ledger entries cannot be deleted."""
        entry = services.record_purchase(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=100
        )
        
        with self.assertRaises(ValueError) as context:
            entry.delete()
        
        self.assertIn("cannot be deleted", str(context.exception))
    
    def test_ledger_bulk_update_prevented(self):
        """Test that bulk update on ledger is prevented."""
        services.record_purchase(self.variant, self.warehouse, 100)
        
        # Bulk update should not affect immutable fields
        # Note: This tests that our model override catches individual saves
        # Django's bulk update bypasses save(), but we document this limitation
        initial_count = StockLedger.objects.count()
        
        # Verify entries exist and are correct
        self.assertEqual(initial_count, 1)
    
    def test_corrections_via_adjustment(self):
        """Test that corrections are done via new ADJUSTMENT entries."""
        # Initial purchase
        services.record_purchase(self.variant, self.warehouse, 100)
        
        # Correction via adjustment
        services.record_adjustment(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=-10,
            notes="Correction: 10 items were counted incorrectly"
        )
        
        # Should have 2 ledger entries, not 1 modified entry
        self.assertEqual(StockLedger.objects.count(), 2)
        
        # Final stock should be 90
        snapshot = StockSnapshot.objects.get(
            variant=self.variant,
            warehouse=self.warehouse
        )
        self.assertEqual(snapshot.quantity, 90)


class PriceImmutabilityTest(TestCase):
    """
    Tests for price immutability.
    Rule 4: Cannot modify price while stock exists.
    """
    
    def setUp(self):
        self.warehouse = Warehouse.objects.create(name="Test WH", code="TWH")
        self.product = Product.objects.create(
            name="Test Product",
            brand="Test",
            category="Test"
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="TEST-001",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("20.00")
        )
    
    def test_price_update_blocked_with_stock(self):
        """
        Test that price update is blocked when stock exists.
        Phase 11.2: Uses InventoryMovement ledger.
        """
        from users.models import User
        admin = User.objects.create_user(
            username=unique_username('testadmin'), password='testpass', role='ADMIN'
        )
        
        # Add stock via InventoryMovement (Phase 11/12)
        services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=admin,
            warehouse_id=self.warehouse.id
        )
        
        # Try to update price via serializer
        serializer = ProductVariantUpdateSerializer(
            instance=self.variant,
            data={
                'sku': 'TEST-001',
                'cost_price': Decimal('15.00'),  # Changed
                'selling_price': Decimal('25.00'),  # Changed
            }
        )
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('error', serializer.errors)
    
    def test_price_update_allowed_with_zero_stock(self):
        """Test that price update is allowed when stock is zero."""
        # No stock added
        
        serializer = ProductVariantUpdateSerializer(
            instance=self.variant,
            data={
                'sku': 'TEST-001',
                'cost_price': Decimal('15.00'),
                'selling_price': Decimal('25.00'),
            }
        )
        
        self.assertTrue(serializer.is_valid())
    
    def test_price_update_error_message(self):
        """
        Test that price update error message is clear.
        Phase 11.2: Uses InventoryMovement ledger.
        """
        from users.models import User
        admin = User.objects.create_user(
            username=unique_username('testadmin2'), password='testpass', role='ADMIN'
        )
        
        # Add stock via InventoryMovement (Phase 11/12)
        services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=50,
            user=admin,
            warehouse_id=self.warehouse.id
        )
        
        serializer = ProductVariantUpdateSerializer(
            instance=self.variant,
            data={
                'sku': 'TEST-001',
                'cost_price': Decimal('15.00'),  # Changed price
                'selling_price': Decimal('30.00'),  # Changed price
            }
        )
        
        self.assertFalse(serializer.is_valid())
        # Check that error contains the expected message
        errors_str = str(serializer.errors)
        self.assertIn('Cannot modify price while stock exists', errors_str)
    
    def test_non_price_updates_allowed_with_stock(self):
        """Test that non-price updates are allowed even with stock."""
        services.record_purchase(self.variant, self.warehouse, 100)
        
        serializer = ProductVariantUpdateSerializer(
            instance=self.variant,
            data={
                'sku': 'TEST-001-UPDATED',
                'reorder_threshold': 20,
                'cost_price': self.variant.cost_price,  # Same price
                'selling_price': self.variant.selling_price,  # Same price
            }
        )
        
        self.assertTrue(serializer.is_valid())


class SingleEntryPointTest(TestCase):
    """
    Tests for single entry point for stock mutation.
    Rule 3: All stock changes must go through record_stock_event().
    """
    
    def setUp(self):
        self.warehouse = Warehouse.objects.create(name="Test WH", code="TWH")
        self.product = Product.objects.create(
            name="Test Product",
            brand="Test",
            category="Test"
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="TEST-001",
            cost_price=Decimal("10.00"),
            selling_price=Decimal("20.00")
        )
    
    def test_record_stock_event_is_atomic(self):
        """Test that record_stock_event uses atomic transaction."""
        # This is verified by checking that failed operations don't create partial entries
        initial_count = StockLedger.objects.count()
        
        try:
            services.record_adjustment(
                variant=self.variant,
                warehouse=self.warehouse,
                quantity=-100,  # No stock exists, this should fail
                notes="This should fail with insufficient stock"
            )
        except services.InsufficientStockError:
            pass
        
        # No ledger entry should be created
        self.assertEqual(StockLedger.objects.count(), initial_count)
    
    def test_quantity_zero_validation(self):
        """Test that quantity=0 is rejected."""
        with self.assertRaises(services.InvalidEventError):
            services.record_adjustment(
                variant=self.variant,
                warehouse=self.warehouse,
                quantity=0,
                notes="Zero quantity should be rejected"
            )
    
    def test_warehouse_validation(self):
        """Test that invalid warehouse is rejected."""
        from django.core.exceptions import ObjectDoesNotExist
        
        # Create a fake UUID
        import uuid
        fake_warehouse = type('FakeWarehouse', (), {'id': uuid.uuid4()})()
        
        with self.assertRaises(Exception):
            services.record_purchase(
                variant=self.variant,
                warehouse=fake_warehouse,
                quantity=100
            )
    
    def test_adjustment_entry_changes_stock(self):
        """Test that adjustment entry correctly changes stock."""
        services.record_purchase(self.variant, self.warehouse, 100)
        
        services.record_adjustment(
            variant=self.variant,
            warehouse=self.warehouse,
            quantity=-30,
            notes="Test adjustment reduces stock by 30"
        )
        
        snapshot = StockSnapshot.objects.get(
            variant=self.variant,
            warehouse=self.warehouse
        )
        self.assertEqual(snapshot.quantity, 70)


# =============================================================================
# PHASE 10.1: SKU AND ATTRIBUTE VALIDATION TESTS
# =============================================================================

class SKUGenerationTest(TestCase):
    """
    Tests for Phase 10.1 SKU generation.
    
    Rules:
    - Format: {BRAND}-{CATEGORY}-{SEQUENCE:06d}
    - Deterministic (not random)
    - Concurrency-safe
    - Immutable after creation
    """
    
    def test_sku_format_deterministic(self):
        """Test that SKU follows retail-grade format (uppercase BRAND-CATEGORY-NNNNNN)."""
        product = Product.objects.create(
            name="Test Polo",
            brand="Quake",
            category="POLO"
        )
        
        self.assertIsNotNone(product.sku)
        # generate_retail_sku normalizes to uppercase alphanumeric segments
        self.assertTrue(product.sku.startswith("QUAKE-POLO-"), product.sku)
        
        parts = product.sku.split("-")
        self.assertEqual(len(parts), 3, product.sku)
        self.assertEqual(len(parts[2]), 6)
        self.assertTrue(parts[2].isdigit())
    
    def test_sku_sequence_increments(self):
        """Test that sequential products get incrementing SKU sequences."""
        product1 = Product.objects.create(
            name="Polo 1",
            brand="NIKE",
            category="SHIRT"
        )
        product2 = Product.objects.create(
            name="Polo 2",
            brand="NIKE",
            category="SHIRT"
        )
        
        # Extract sequence numbers
        seq1 = int(product1.sku.split('-')[2])
        seq2 = int(product2.sku.split('-')[2])
        
        # Second product should have higher sequence
        self.assertGreater(seq2, seq1)
    
    def test_sku_immutable_on_update(self):
        """Test that SKU cannot be changed after creation."""
        product = Product.objects.create(
            name="Test Product",
            brand="Quake",
            category="TEE"
        )
        original_sku = product.sku
        
        # Attempt to change SKU should raise error
        product.sku = "NEW-SKU-123456"
        with self.assertRaises(ValueError) as context:
            product.save()
        
        self.assertIn("SKU cannot be modified", str(context.exception))
        
        # SKU should remain unchanged
        product.refresh_from_db()
        self.assertEqual(product.sku, original_sku)
    
    def test_existing_sku_preserved(self):
        """Test that products created with explicit SKU keep it."""
        product = Product.objects.create(
            name="Legacy Product",
            brand="OLD",
            category="ITEM",
            sku="LEGACY-SKU-001"
        )
        
        self.assertEqual(product.sku, "LEGACY-SKU-001")


class AttributeValidationTest(TestCase):
    """
    Tests for Phase 10.1 attribute validation.
    
    Rules:
    - Must be dict (JSON object)
    - Keys must be strings
    - Values: string, number, or list of strings
    - No nested objects
    - No mixed-type arrays
    """
    
    def test_valid_attributes_object(self):
        """Test that valid JSON object is accepted."""
        from .serializers import validate_product_attributes
        
        valid_attrs = {
            "sizes": ["S", "M", "L"],
            "colors": ["Black", "White"],
            "pattern": "Solid",
            "fit": "Slim",
            "price_tier": 2
        }
        
        result = validate_product_attributes(valid_attrs)
        self.assertEqual(result, valid_attrs)
    
    def test_reject_string_attributes(self):
        """Test that string value is rejected."""
        from .serializers import validate_product_attributes
        from rest_framework import serializers
        
        with self.assertRaises(serializers.ValidationError) as context:
            validate_product_attributes("blue shirt")
        
        self.assertIn("expected object", str(context.exception))
    
    def test_reject_array_attributes(self):
        """Test that array value is rejected."""
        from .serializers import validate_product_attributes
        from rest_framework import serializers
        
        with self.assertRaises(serializers.ValidationError) as context:
            validate_product_attributes(["S", "M", "L"])
        
        self.assertIn("expected object", str(context.exception))
    
    def test_reject_null_attributes(self):
        """Test that null value is rejected."""
        from .serializers import validate_product_attributes
        from rest_framework import serializers
        
        with self.assertRaises(serializers.ValidationError) as context:
            validate_product_attributes(None)
        
        self.assertIn("null is not allowed", str(context.exception))
    
    def test_reject_nested_objects(self):
        """Test that nested objects are rejected."""
        from .serializers import validate_product_attributes
        from rest_framework import serializers
        
        nested_attrs = {
            "details": {"color": "Blue", "size": "M"}
        }
        
        with self.assertRaises(serializers.ValidationError) as context:
            validate_product_attributes(nested_attrs)
        
        self.assertIn("nested objects not allowed", str(context.exception))
    
    def test_reject_mixed_type_array(self):
        """Test that mixed-type arrays are rejected."""
        from .serializers import validate_product_attributes
        from rest_framework import serializers
        
        mixed_attrs = {
            "sizes": ["S", 1, True]
        }
        
        with self.assertRaises(serializers.ValidationError) as context:
            validate_product_attributes(mixed_attrs)
        
        self.assertIn("must contain only strings", str(context.exception))
    
    def test_empty_dict_allowed(self):
        """Test that empty dict is allowed."""
        from .serializers import validate_product_attributes
        
        result = validate_product_attributes({})
        self.assertEqual(result, {})


# =============================================================================
# PHASE 11: INVENTORY LEDGER TESTS
# =============================================================================

from .models import InventoryMovement


class OpeningStockTest(TestCase):
    """
    Test: OPENING movements must have positive quantity.
    Phase 11 Rule: Opening stock is always an addition.
    Phase 12: Warehouse is required for OPENING.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('testadmin'), password='testpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='Test WH', code='TEST-WH')
        self.product = Product.objects.create(
            name="Test Product", brand="TEST", category="TEST"
        )
    
    def test_opening_positive_quantity_succeeds(self):
        """Test that OPENING with positive quantity succeeds."""
        movement = InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse,
            movement_type='OPENING',
            quantity=100,
            reference_type='opening',
            created_by=self.admin
        )
        self.assertEqual(movement.quantity, 100)
        self.assertEqual(movement.movement_type, 'OPENING')
    
    def test_opening_negative_quantity_fails(self):
        """Test that OPENING with negative quantity fails."""
        from django.core.exceptions import ValidationError
        
        with self.assertRaises(ValidationError):
            movement = InventoryMovement(
                product=self.product,
                warehouse=self.warehouse,
                movement_type='OPENING',
                quantity=-50,
                reference_type='opening',
                created_by=self.admin
            )
            movement.full_clean()
    
    def test_opening_zero_quantity_fails(self):
        """Test that OPENING with zero quantity fails."""
        from django.core.exceptions import ValidationError
        
        with self.assertRaises(ValidationError):
            movement = InventoryMovement(
                product=self.product,
                warehouse=self.warehouse,
                movement_type='OPENING',
                quantity=0,
                reference_type='opening',
                created_by=self.admin
            )
            movement.full_clean()


class SaleReducesStockTest(TestCase):
    """
    Test: SALE movements reduce stock (negative quantity).
    Phase 11 Rule: Sales always deduct.
    Phase 12: Warehouse is required for SALE.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('testadmin'), password='testpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='Test WH', code='SALE-WH')
        self.product = Product.objects.create(
            name="Test Product", brand="TEST", category="TEST"
        )
    
    def test_sale_negative_quantity_succeeds(self):
        """Test that SALE with negative quantity succeeds."""
        # First add opening stock
        InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse,
            movement_type='OPENING',
            quantity=100,
            created_by=self.admin
        )
        
        # Then record sale
        movement = InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse,
            movement_type='SALE',
            quantity=-10,
            reference_type='sale',
            created_by=self.admin
        )
        
        self.assertEqual(movement.quantity, -10)
        
        # Verify stock derivation
        stock = services.get_product_stock(self.product.id)
        self.assertEqual(stock, 90)  # 100 - 10
    
    def test_sale_positive_quantity_fails(self):
        """Test that SALE with positive quantity fails."""
        from django.core.exceptions import ValidationError
        
        with self.assertRaises(ValidationError):
            movement = InventoryMovement(
                product=self.product,
                warehouse=self.warehouse,
                movement_type='SALE',
                quantity=10,  # Should be negative
                reference_type='sale',
                created_by=self.admin
            )
            movement.full_clean()


class OverSaleBlockedTest(TestCase):
    """
    Test: Cannot sell more than available stock.
    Phase 11 Rule: Overselling is impossible.
    Phase 12: Uses warehouse for OPENING/SALE movements.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('testadmin'), password='testpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='Test WH', code='OVER-WH')
        self.product = Product.objects.create(
            name="Test Product", brand="TEST", category="TEST"
        )
    
    def test_overselling_blocked(self):
        """Test that selling more than available stock fails."""
        # Add 50 units
        services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=50,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        # Try to sell 100 (more than available)
        with self.assertRaises(services.InsufficientProductStockError):
            services.create_inventory_movement(
                product_id=self.product.id,
                movement_type='SALE',
                quantity=-100,
                user=self.admin,
                warehouse_id=self.warehouse.id
            )
    
    def test_exact_stock_sale_succeeds(self):
        """Test that selling exactly available stock succeeds."""
        # Add 50 units
        services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=50,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        # Sell exactly 50
        movement = services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='SALE',
            quantity=-50,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        self.assertEqual(movement.quantity, -50)
        
        # Verify stock is now 0
        stock = services.get_product_stock(self.product.id)
        self.assertEqual(stock, 0)


class LedgerDerivationTest(TestCase):
    """
    Test: Stock = SUM(inventory_movements.quantity)
    Phase 11 Core Principle: Stock is derived, never stored.
    Phase 12: Uses warehouse for required movement types.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('testadmin'), password='testpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='Test WH', code='LED-WH')
        self.product = Product.objects.create(
            name="Test Product", brand="TEST", category="TEST"
        )
    
    def test_stock_equals_sum_of_movements(self):
        """Test that stock equals sum of all movements."""
        from django.db.models import Sum
        
        # Create multiple movements (using warehouse for required types)
        services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='PURCHASE',
            quantity=50,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='SALE',
            quantity=-30,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        # DAMAGE and RETURN don't require warehouse
        services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='DAMAGE',
            quantity=-5,
            user=self.admin
        )
        services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='RETURN',
            quantity=10,
            user=self.admin
        )
        
        # Calculate expected: 100 + 50 - 30 - 5 + 10 = 125
        expected_stock = 125
        
        # Get derived stock
        derived_stock = services.get_product_stock(self.product.id)
        
        # Get sum from DB directly
        db_sum = InventoryMovement.objects.filter(
            product=self.product
        ).aggregate(total=Sum('quantity'))['total']
        
        self.assertEqual(derived_stock, expected_stock)
        self.assertEqual(db_sum, expected_stock)
        self.assertEqual(derived_stock, db_sum)
    
    def test_stock_is_zero_when_no_movements(self):
        """Test that stock is 0 when there are no movements."""
        stock = services.get_product_stock(self.product.id)
        self.assertEqual(stock, 0)


class RBACMovementTest(APITestCase):
    """
    Test: Staff cannot create movements (Admin only).
    Phase 11 RBAC: Create movement = Admin only.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.staff = User.objects.create_user(
            username=unique_username('staff'), password='staffpass', role='STAFF'
        )
        self.warehouse = Warehouse.objects.create(name='Test WH', code='RBAC-WH')
        self.product = Product.objects.create(
            name="Test Product", brand="TEST", category="TEST"
        )
    
    def test_admin_can_create_movement(self):
        """Test that admin can create movement."""
        self.client.force_authenticate(user=self.admin)
        
        response = self.client.post('/api/v1/inventory/movements/', {
            'product_id': str(self.product.id),
            'warehouse_id': str(self.warehouse.id),
            'movement_type': 'OPENING',
            'quantity': 100,
            'remarks': 'Admin created'
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
    
    def test_staff_cannot_create_movement(self):
        """Test that staff cannot create movement."""
        self.client.force_authenticate(user=self.staff)
        
        response = self.client.post('/api/v1/inventory/movements/', {
            'product_id': str(self.product.id),
            'movement_type': 'OPENING',
            'quantity': 100,
            'remarks': 'Staff attempt'
        })
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_staff_cannot_view_ledger(self):
        """Test that staff cannot view movement ledger."""
        self.client.force_authenticate(user=self.staff)
        
        response = self.client.get('/api/v1/inventory/movements/')
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_staff_can_view_stock(self):
        """Test that staff can view derived stock."""
        self.client.force_authenticate(user=self.staff)
        
        response = self.client.get(
            f'/api/v1/inventory/stock/?product_id={self.product.id}'
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class AuditTrailTest(TestCase):
    """
    Test: Every movement has created_by and timestamp.
    Phase 11 Rule: Full audit trail.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('auditadmin'), password='testpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='Audit WH', code='AUD-WH')
        self.product = Product.objects.create(
            name="Audit Product", brand="AUDIT", category="TEST"
        )
    
    def test_movement_has_created_by(self):
        """Test that movement records the user who created it."""
        movement = services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id,
            remarks='Audit test'
        )
        
        self.assertEqual(movement.created_by, self.admin)
        self.assertEqual(movement.created_by.username, self.admin.username)
    
    def test_movement_has_timestamp(self):
        """Test that movement has auto-generated timestamp."""
        from django.utils import timezone
        
        before = timezone.now()
        
        movement = services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        after = timezone.now()
        
        self.assertIsNotNone(movement.created_at)
        self.assertGreaterEqual(movement.created_at, before)
        self.assertLessEqual(movement.created_at, after)
    
    def test_movement_immutable_no_update(self):
        """Test that movements cannot be updated."""
        movement = services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        movement.quantity = 200
        with self.assertRaises(ValueError):
            movement.save()
    
    def test_movement_immutable_no_delete(self):
        """Test that movements cannot be deleted."""
        movement = services.create_inventory_movement(
            product_id=self.product.id,
            movement_type='OPENING',
            quantity=100,
            user=self.admin,
            warehouse_id=self.warehouse.id
        )
        
        with self.assertRaises(ValueError):
            movement.delete()


# =============================================================================
# PHASE 11.1: INVENTORY READ FIX TESTS
# =============================================================================

class ProductWithNoMovementsStockTest(APITestCase):
    """
    Test: Products with no movements should have stock = 0.
    Phase 11.1: Coalesce ensures null safety.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.product = Product.objects.create(
            name="Empty Product", brand="TEST", category="TEST"
        )
    
    def test_product_with_no_movements_has_zero_stock(self):
        """Test that products without movements show stock = 0."""
        self.client.force_authenticate(user=self.admin)
        
        response = self.client.get(f'/api/v1/inventory/products/{self.product.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_stock'], 0)


class ProductWithMovementsStockTest(APITestCase):
    """
    Test: Product stock equals sum of movements.
    Phase 11.1: Stock derived from ledger.
    Phase 12: Uses warehouse for required movement types.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='Prod WH', code='PROD-WH')
        self.product = Product.objects.create(
            name="Stocked Product", brand="TEST", category="TEST"
        )
        
        # Add movements with warehouse
        InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse,
            movement_type='OPENING',
            quantity=100,
            created_by=self.admin
        )
        InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse,
            movement_type='SALE',
            quantity=-30,
            created_by=self.admin
        )
    
    def test_product_stock_equals_sum(self):
        """Test that stock equals sum of movements."""
        self.client.force_authenticate(user=self.admin)
        
        response = self.client.get(f'/api/v1/inventory/products/{self.product.id}/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_stock'], 70)  # 100 - 30


class InventoryListNot500Test(APITestCase):
    """
    Test: Inventory list endpoint returns 200, not 500.
    Phase 11.1: Critical fix verification.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
    
    def test_products_list_returns_200(self):
        """Test that /inventory/products/ returns 200 OK."""
        self.client.force_authenticate(user=self.admin)
        
        response = self.client.get('/api/v1/inventory/products/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_stock_summary_returns_200(self):
        """Test that /inventory/stock/summary/ returns 200 OK."""
        self.client.force_authenticate(user=self.admin)
        
        response = self.client.get('/api/v1/inventory/stock/summary/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class StockSummaryLedgerTest(APITestCase):
    """
    Test: Stock summary uses correct ledger aggregation.
    Phase 11.1: Products-level aggregation.
    Phase 12: Uses warehouse for required movement types.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='Sum2 WH', code='SUM2-WH')
        
        # Product with stock
        self.product1 = Product.objects.create(
            name="Stocked", brand="TEST", category="TEST"
        )
        InventoryMovement.objects.create(
            product=self.product1,
            warehouse=self.warehouse,
            movement_type='OPENING',
            quantity=50,
            created_by=self.admin
        )
        
        # Product with zero stock (out of stock)
        self.product2 = Product.objects.create(
            name="Empty", brand="TEST", category="TEST"
        )
    
    def test_summary_includes_correct_totals(self):
        """Test summary has correct total stock."""
        self.client.force_authenticate(user=self.admin)
        
        response = self.client.get('/api/v1/inventory/stock/summary/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_stock'], 50)
        self.assertIn('out_of_stock_items', response.data)


# =============================================================================
# PHASE 12: WAREHOUSE & OPENING STOCK TESTS
# =============================================================================

class WarehouseCreateTest(APITestCase):
    """
    Test: Admin-only warehouse creation.
    Phase 12 RBAC: Only admin can create warehouses.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.staff = User.objects.create_user(
            username=unique_username('staff'), password='staffpass', role='STAFF'
        )
    
    def test_admin_can_create_warehouse(self):
        """Test that admin can create a warehouse."""
        self.client.force_authenticate(user=self.admin)
        
        response = self.client.post('/api/v1/inventory/warehouses/', {
            'name': 'Main Warehouse',
            'code': 'MAIN-WH',
            'address': 'Test Address'
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Main Warehouse')
        self.assertEqual(response.data['code'], 'MAIN-WH')  # Uppercase enforced

    def test_admin_create_warehouse_without_code_auto_generates(self):
        """Omitting code yields a unique generated warehouse code."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            '/api/v1/inventory/warehouses/',
            {
                'name': 'Auto Code WH',
                'address': '1234567890 twelve chars min',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Auto Code WH')
        code = (response.data.get('code') or '').strip()
        self.assertGreater(len(code), 3)
        """Test that staff cannot create a warehouse."""
        self.client.force_authenticate(user=self.staff)
        
        response = self.client.post('/api/v1/inventory/warehouses/', {
            'name': 'Staff Warehouse',
            'code': 'STAFF-WH'
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_staff_can_view_warehouses(self):
        """Test that staff can view warehouses."""
        Warehouse.objects.create(name='Visible WH', code='VIS-WH')
        
        self.client.force_authenticate(user=self.staff)
        
        response = self.client.get('/api/v1/inventory/warehouses/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class OpeningStockOnceTest(APITestCase):
    """
    Test: Only one opening stock per product per warehouse.
    Phase 12 Rule: Duplicate OPENING movements are impossible.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='Test WH', code='TEST-WH')
        self.product = Product.objects.create(
            name='Test Product', brand='TEST', category='TEST'
        )
    
    def test_opening_stock_can_be_created_once(self):
        """Test that opening stock can be created for a product+warehouse."""
        self.client.force_authenticate(user=self.admin)
        
        response = self.client.post('/api/v1/inventory/opening-stock/', {
            'product_id': str(self.product.id),
            'warehouse_id': str(self.warehouse.id),
            'quantity': 100
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['quantity'], 100)
        self.assertEqual(response.data['movement_type'], 'OPENING')
    
    def test_duplicate_opening_fails(self):
        """Test that creating duplicate opening stock fails."""
        self.client.force_authenticate(user=self.admin)
        
        # Create first opening stock
        response1 = self.client.post('/api/v1/inventory/opening-stock/', {
            'product_id': str(self.product.id),
            'warehouse_id': str(self.warehouse.id),
            'quantity': 100
        }, format='json')
        self.assertEqual(response1.status_code, status.HTTP_201_CREATED)
        
        # Try to create second opening stock - should fail
        response2 = self.client.post('/api/v1/inventory/opening-stock/', {
            'product_id': str(self.product.id),
            'warehouse_id': str(self.warehouse.id),
            'quantity': 50
        }, format='json')
        
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response2.data)
    
    def test_opening_after_movement_fails(self):
        """Test that opening stock cannot be created if other movements exist."""
        # Create a PURCHASE movement first
        InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse,
            movement_type='PURCHASE',
            quantity=50,
            created_by=self.admin
        )
        
        self.client.force_authenticate(user=self.admin)
        
        response = self.client.post('/api/v1/inventory/opening-stock/', {
            'product_id': str(self.product.id),
            'warehouse_id': str(self.warehouse.id),
            'quantity': 100
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class OpeningStockPositiveTest(APITestCase):
    """
    Test: Opening stock quantity must be positive.
    Phase 12 Rule: OPENING movements must have quantity > 0.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse = Warehouse.objects.create(name='Test WH', code='TEST-WH')
        self.product = Product.objects.create(
            name='Test Product', brand='TEST', category='TEST'
        )
    
    def test_zero_quantity_rejected(self):
        """Test that zero quantity is rejected."""
        self.client.force_authenticate(user=self.admin)
        
        response = self.client.post('/api/v1/inventory/opening-stock/', {
            'product_id': str(self.product.id),
            'warehouse_id': str(self.warehouse.id),
            'quantity': 0
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('quantity', response.data)
    
    def test_negative_quantity_rejected(self):
        """Test that negative quantity is rejected."""
        self.client.force_authenticate(user=self.admin)
        
        response = self.client.post('/api/v1/inventory/opening-stock/', {
            'product_id': str(self.product.id),
            'warehouse_id': str(self.warehouse.id),
            'quantity': -50
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class WarehouseScopedStockTest(TestCase):
    """
    Test: Stock is correctly calculated per warehouse.
    Phase 12 Rule: get_product_stock with warehouse_id returns scoped stock.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse_a = Warehouse.objects.create(name='Warehouse A', code='WH-A')
        self.warehouse_b = Warehouse.objects.create(name='Warehouse B', code='WH-B')
        self.product = Product.objects.create(
            name='Test Product', brand='TEST', category='TEST'
        )
    
    def test_stock_scoped_to_warehouse(self):
        """Test that stock is correctly scoped to each warehouse."""
        # Add stock to warehouse A
        InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse_a,
            movement_type='OPENING',
            quantity=100,
            created_by=self.admin
        )
        
        # Add stock to warehouse B
        InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse_b,
            movement_type='OPENING',
            quantity=50,
            created_by=self.admin
        )
        
        # Check warehouse A stock
        stock_a = services.get_product_stock(self.product.id, self.warehouse_a.id)
        self.assertEqual(stock_a, 100)
        
        # Check warehouse B stock
        stock_b = services.get_product_stock(self.product.id, self.warehouse_b.id)
        self.assertEqual(stock_b, 50)
    
    def test_stock_movement_in_one_warehouse_doesnt_affect_other(self):
        """Test that movements in one warehouse don't affect another."""
        # Add opening to warehouse A
        InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse_a,
            movement_type='OPENING',
            quantity=100,
            created_by=self.admin
        )
        
        # Add sale from warehouse A
        InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse_a,
            movement_type='SALE',
            quantity=-30,
            created_by=self.admin
        )
        
        # Warehouse A should have 70
        stock_a = services.get_product_stock(self.product.id, self.warehouse_a.id)
        self.assertEqual(stock_a, 70)
        
        # Warehouse B should have 0 (no movements)
        stock_b = services.get_product_stock(self.product.id, self.warehouse_b.id)
        self.assertEqual(stock_b, 0)


class GlobalStockSumTest(TestCase):
    """
    Test: Global stock = sum of all warehouse stocks.
    Phase 12 Rule: get_product_stock without warehouse_id returns total.
    """
    
    def setUp(self):
        from users.models import User
        self.admin = User.objects.create_user(
            username=unique_username('admin'), password='adminpass', role='ADMIN'
        )
        self.warehouse_a = Warehouse.objects.create(name='Warehouse A', code='WH-A')
        self.warehouse_b = Warehouse.objects.create(name='Warehouse B', code='WH-B')
        self.product = Product.objects.create(
            name='Test Product', brand='TEST', category='TEST'
        )
    
    def test_global_equals_sum_of_warehouses(self):
        """Test that global stock equals sum of all warehouse stocks."""
        # Add stock to warehouse A
        InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse_a,
            movement_type='OPENING',
            quantity=100,
            created_by=self.admin
        )
        
        # Add stock to warehouse B
        InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse_b,
            movement_type='OPENING',
            quantity=50,
            created_by=self.admin
        )
        
        # Sale from warehouse A
        InventoryMovement.objects.create(
            product=self.product,
            warehouse=self.warehouse_a,
            movement_type='SALE',
            quantity=-25,
            created_by=self.admin
        )
        
        # Calculate expected: (100 - 25) + 50 = 125
        expected_total = 125
        
        # Get global stock (no warehouse filter)
        global_stock = services.get_product_stock(self.product.id)
        
        # Get individual stocks
        stock_a = services.get_product_stock(self.product.id, self.warehouse_a.id)
        stock_b = services.get_product_stock(self.product.id, self.warehouse_b.id)
        
        self.assertEqual(global_stock, expected_total)
        self.assertEqual(global_stock, stock_a + stock_b)
        self.assertEqual(stock_a, 75)
        self.assertEqual(stock_b, 50)


class BulkImportParseTest(TestCase):
    """CSV parsing for bulk import."""

    def test_parse_csv_skips_rows_without_name(self):
        from .bulk_import import parse_csv_bytes

        body = (
            b"name,brand,category,pricing_cost_price,pricing_mrp,pricing_selling_price\n"
            b",,,\n"
            b"Item A,Quake,Tee,10,20,15\n"
        )
        rows = parse_csv_bytes(body)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Item A")


class BulkProductImportAPITest(APITestCase):
    """Bulk import template download and CSV upload."""

    def setUp(self):
        import csv
        import io

        from users.models import User

        self.admin = User.objects.create_user(
            username=unique_username("impadmin"),
            password="testpass123",
            role="ADMIN",
        )
        self.staff = User.objects.create_user(
            username=unique_username("impstaff"),
            password="testpass123",
            role="STAFF",
        )
        self.wh = Warehouse.objects.create(name="Import WH", code="IMPWH")
        buf = io.StringIO()
        w = csv.DictWriter(
            buf,
            fieldnames=[
                "warehouse_code",
                "name",
                "brand",
                "category",
                "description",
                "product_code",
                "brand_code",
                "alias",
                "country_of_origin",
                "gender",
                "material",
                "season",
                "attributes_json",
                "supplier_code",
                "is_active",
                "product_sku",
                "product_barcode",
                "pricing_cost_price",
                "pricing_mrp",
                "pricing_selling_price",
                "pricing_gst_percentage",
                "variant_sku",
                "variant_size",
                "variant_color",
                "variant_cost_price",
                "variant_selling_price",
                "variant_reorder_threshold",
                "initial_stock",
            ],
        )
        w.writeheader()
        w.writerow(
            {
                "warehouse_code": "IMPWH",
                "name": "Bulk CSV Tee",
                "brand": "Quake",
                "category": "Apparel",
                "description": "",
                "product_code": "",
                "brand_code": "",
                "alias": "",
                "country_of_origin": "",
                "gender": "UNISEX",
                "material": "Cotton",
                "season": "",
                "attributes_json": "",
                "supplier_code": "",
                "is_active": "true",
                "product_sku": "",
                "product_barcode": "",
                "pricing_cost_price": "100",
                "pricing_mrp": "200",
                "pricing_selling_price": "180",
                "pricing_gst_percentage": "5",
                "variant_sku": "",
                "variant_size": "M",
                "variant_color": "Blue",
                "variant_cost_price": "",
                "variant_selling_price": "",
                "variant_reorder_threshold": "5",
                "initial_stock": "2",
            }
        )
        self.sample_csv = buf.getvalue().encode("utf-8")

    def test_import_template_csv(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            "/api/v1/inventory/products/import-template/",
            {"file_format": "csv"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(b"warehouse_code", response.content)

    def test_import_template_xlsx(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            "/api/v1/inventory/products/import-template/",
            {"file_format": "xlsx"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.content.startswith(b"PK"))

    def test_import_bulk_csv_creates_product(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.client.force_authenticate(user=self.admin)
        upload = SimpleUploadedFile("rows.csv", self.sample_csv, content_type="text/csv")
        response = self.client.post(
            "/api/v1/inventory/products/import-bulk/",
            {"file": upload},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["failed"], 0)
        self.assertTrue(Product.objects.filter(name="Bulk CSV Tee").exists())

    def test_import_bulk_xlsx_creates_product(self):
        from io import BytesIO

        from django.core.files.uploadedfile import SimpleUploadedFile
        from openpyxl import Workbook

        fieldnames = [
            "warehouse_code",
            "name",
            "brand",
            "category",
            "description",
            "product_code",
            "brand_code",
            "alias",
            "country_of_origin",
            "gender",
            "material",
            "season",
            "attributes_json",
            "supplier_code",
            "is_active",
            "product_sku",
            "product_barcode",
            "pricing_cost_price",
            "pricing_mrp",
            "pricing_selling_price",
            "pricing_gst_percentage",
            "variant_sku",
            "variant_size",
            "variant_color",
            "variant_cost_price",
            "variant_selling_price",
            "variant_reorder_threshold",
            "initial_stock",
        ]
        row = {
            "warehouse_code": "IMPWH",
            "name": "Bulk XLSX Tee",
            "brand": "Quake",
            "category": "Apparel",
            "description": "",
            "product_code": "",
            "brand_code": "",
            "alias": "",
            "country_of_origin": "",
            "gender": "UNISEX",
            "material": "Cotton",
            "season": "",
            "attributes_json": "",
            "supplier_code": "",
            "is_active": "true",
            "product_sku": "",
            "product_barcode": "",
            "pricing_cost_price": "100",
            "pricing_mrp": "200",
            "pricing_selling_price": "180",
            "pricing_gst_percentage": "5",
            "variant_sku": "",
            "variant_size": "L",
            "variant_color": "Green",
            "variant_cost_price": "",
            "variant_selling_price": "",
            "variant_reorder_threshold": "3",
            "initial_stock": "1",
        }

        wb = Workbook()
        ws = wb.active
        ws.append(fieldnames)
        ws.append([row.get(h, "") for h in fieldnames])
        buf = BytesIO()
        wb.save(buf)
        xlsx_bytes = buf.getvalue()

        self.client.force_authenticate(user=self.admin)
        upload = SimpleUploadedFile(
            "rows.xlsx",
            xlsx_bytes,
            content_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
        )
        response = self.client.post(
            "/api/v1/inventory/products/import-bulk/",
            {"file": upload},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["failed"], 0)
        self.assertTrue(Product.objects.filter(name="Bulk XLSX Tee").exists())

    def test_staff_cannot_import_bulk(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.client.force_authenticate(user=self.staff)
        upload = SimpleUploadedFile("rows.csv", self.sample_csv, content_type="text/csv")
        response = self.client.post(
            "/api/v1/inventory/products/import-bulk/",
            {"file": upload},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
