"""Tests for notifications services (low stock, etc.)."""

from decimal import Decimal

from django.test import TestCase

from inventory.models import Product, ProductVariant, Warehouse
from notifications.services import LowStockService, _product_field_display, _variant_detail_join


class ProductFieldDisplayTest(TestCase):
    def test_string_brand_category(self):
        self.assertEqual(_product_field_display("  Acme  "), "Acme")
        self.assertIsNone(_product_field_display("   "))
        self.assertIsNone(_product_field_display(None))

    def test_object_with_name(self):
        class Named:
            name = "FromModel"

        self.assertEqual(_product_field_display(Named()), "FromModel")


class VariantDetailJoinTest(TestCase):
    def test_joins_non_empty(self):
        self.assertEqual(_variant_detail_join("M", "Blue"), "M · Blue")
        self.assertEqual(_variant_detail_join("10mm", None), "10mm")
        self.assertIsNone(_variant_detail_join(None, None))


class LowStockServiceTest(TestCase):
    def setUp(self):
        from users.models import Organization

        self.org = Organization.objects.create(name="Test Org", slug="test-org-notif")
        self.wh = Warehouse.objects.create(
            name="Main", code="MAIN", organization=self.org
        )
        self.product = Product.objects.create(
            name="Bolt M8",
            brand="FastCo",
            category="Hardware",
            organization=self.org,
        )
        self.variant = ProductVariant.objects.create(
            product=self.product,
            sku="FC-BOLT-M8",
            size="M8",
            color="Zinc",
            cost_price=Decimal("1.00"),
            selling_price=Decimal("2.00"),
            reorder_threshold=5,
        )

    def test_check_low_stock_serializes_string_brand_category(self):
        items = LowStockService.check_low_stock(
            str(self.wh.id),
            organization_id=self.org.id,
        )
        self.assertTrue(len(items) >= 1)
        match = next(
            (i for i in items if i["sku"] == "FC-BOLT-M8"), None
        )
        self.assertIsNotNone(match)
        self.assertEqual(match["brand"], "FastCo")
        self.assertEqual(match["category"], "Hardware")
        self.assertEqual(match["variant_details"], "M8 · Zinc")

    def test_check_low_stock_empty_without_org(self):
        items = LowStockService.check_low_stock(str(self.wh.id))
        self.assertEqual(items, [])
