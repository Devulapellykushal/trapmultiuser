"""
Seed Demo Data Command for Quake Inventory System.

Creates warehouses, demo user, varied products (apparel + grocery + FMCG +
electronics basics), variants, ProductPricing (POS authoritative), and
product-level opening stock via the inventory movement ledger — the same path
checkout uses (`get_product_stock` / SALE movements).

Usage: python manage.py seed_demo_data

Idempotent: safe to run multiple times; skips stock/pricing rows that already exist.
"""

from decimal import Decimal
from collections import defaultdict

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from inventory.models import Product, ProductVariant, ProductPricing, Warehouse
from inventory.services import create_opening_stock, DuplicateOpeningStockError


User = get_user_model()

# -----------------------------------------------------------------------------
# Demo catalog (name + brand + category + GST% + variants with opening qty)
# opening_qty_per_variant is summed at PRODUCT level for one OPENING movement.
# -----------------------------------------------------------------------------
DEMO_PRODUCTS = [
    # --- Apparel (original set, expanded GST) ---
    {
        'name': 'Premium Cotton T-Shirt',
        'brand': 'Quake Essentials',
        'category': 'T-Shirts',
        'gst': Decimal('5.00'),
        'variants': [
            {'sku': 'TSH-001-WHT-M', 'size': 'M', 'color': 'White', 'cost': 650, 'sell': 1299, 'opening_qty': 45},
            {'sku': 'TSH-001-WHT-L', 'size': 'L', 'color': 'White', 'cost': 650, 'sell': 1299, 'opening_qty': 30},
            {'sku': 'TSH-001-BLK-M', 'size': 'M', 'color': 'Black', 'cost': 650, 'sell': 1299, 'opening_qty': 25},
        ],
    },
    {
        'name': 'Slim Fit Denim Jeans',
        'brand': 'Quake Denim',
        'category': 'Jeans',
        'gst': Decimal('5.00'),
        'variants': [
            {'sku': 'JNS-001-BLU-32', 'size': '32', 'color': 'Blue', 'cost': 1200, 'sell': 2499, 'opening_qty': 20},
            {'sku': 'JNS-001-BLU-34', 'size': '34', 'color': 'Blue', 'cost': 1200, 'sell': 2499, 'opening_qty': 15},
        ],
    },
    {
        'name': 'Classic Polo Shirt',
        'brand': 'Quake Essentials',
        'category': 'Shirts',
        'gst': Decimal('5.00'),
        'variants': [
            {'sku': 'POL-001-NAV-M', 'size': 'M', 'color': 'Navy', 'cost': 850, 'sell': 1799, 'opening_qty': 35},
            {'sku': 'POL-001-NAV-L', 'size': 'L', 'color': 'Navy', 'cost': 850, 'sell': 1799, 'opening_qty': 28},
        ],
    },
    {
        'name': 'Leather Biker Jacket',
        'brand': 'Quake Premium',
        'category': 'Jackets',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'JKT-001-BLK-M', 'size': 'M', 'color': 'Black', 'cost': 4500, 'sell': 8999, 'opening_qty': 8},
            {'sku': 'JKT-001-BRN-M', 'size': 'M', 'color': 'Brown', 'cost': 4500, 'sell': 8999, 'opening_qty': 5},
        ],
    },
    {
        'name': 'Canvas Sneakers',
        'brand': 'Quake Footwear',
        'category': 'Footwear',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'SNK-001-WHT-9', 'size': '9', 'color': 'White', 'cost': 1500, 'sell': 2999, 'opening_qty': 42},
            {'sku': 'SNK-001-BLK-10', 'size': '10', 'color': 'Black', 'cost': 1500, 'sell': 2999, 'opening_qty': 38},
        ],
    },
    {
        'name': 'Crew Neck Sweater',
        'brand': 'Quake Winter',
        'category': 'Sweaters',
        'gst': Decimal('5.00'),
        'variants': [
            {'sku': 'SWT-001-GRY-M', 'size': 'M', 'color': 'Grey', 'cost': 1100, 'sell': 2199, 'opening_qty': 22},
            {'sku': 'SWT-001-GRY-L', 'size': 'L', 'color': 'Grey', 'cost': 1100, 'sell': 2199, 'opening_qty': 18},
        ],
    },
    {
        'name': 'Chino Trousers',
        'brand': 'Quake Basics',
        'category': 'Trousers',
        'gst': Decimal('5.00'),
        'variants': [
            {'sku': 'CHN-001-KHK-32', 'size': '32', 'color': 'Khaki', 'cost': 900, 'sell': 1899, 'opening_qty': 50},
            {'sku': 'CHN-001-KHK-34', 'size': '34', 'color': 'Khaki', 'cost': 900, 'sell': 1899, 'opening_qty': 45},
        ],
    },
    {
        'name': 'Leather Wallet',
        'brand': 'Quake Accessories',
        'category': 'Accessories',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'WLT-001-BLK', 'size': None, 'color': 'Black', 'cost': 800, 'sell': 1599, 'opening_qty': 30},
            {'sku': 'WLT-001-BRN', 'size': None, 'color': 'Brown', 'cost': 800, 'sell': 1599, 'opening_qty': 25},
        ],
    },
    {
        'name': 'Aviator Sunglasses',
        'brand': 'Quake Eyewear',
        'category': 'Accessories',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'SNG-001-GLD', 'size': None, 'color': 'Gold', 'cost': 750, 'sell': 1499, 'opening_qty': 15},
        ],
    },
    {
        'name': 'Chelsea Boots',
        'brand': 'Quake Footwear',
        'category': 'Footwear',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'BTS-001-BLK-9', 'size': '9', 'color': 'Black', 'cost': 2700, 'sell': 5499, 'opening_qty': 12},
            {'sku': 'BTS-001-BRN-10', 'size': '10', 'color': 'Brown', 'cost': 2700, 'sell': 5499, 'opening_qty': 8},
        ],
    },
    {
        'name': 'Linen Summer Shirt',
        'brand': 'Quake Summer',
        'category': 'Shirts',
        'gst': Decimal('5.00'),
        'variants': [
            {'sku': 'LNS-001-WHT-M', 'size': 'M', 'color': 'White', 'cost': 950, 'sell': 1999, 'opening_qty': 18},
        ],
    },
    {
        'name': 'Cargo Shorts',
        'brand': 'Quake Casual',
        'category': 'Shorts',
        'gst': Decimal('5.00'),
        'variants': [
            {'sku': 'CRG-001-OLV-32', 'size': '32', 'color': 'Olive', 'cost': 700, 'sell': 1499, 'opening_qty': 55},
        ],
    },
    {
        'name': 'Running Shoes',
        'brand': 'Quake Active',
        'category': 'Footwear',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'RUN-001-BLU-9', 'size': '9', 'color': 'Blue', 'cost': 2000, 'sell': 3999, 'opening_qty': 4},
        ],
    },
    {
        'name': 'Baseball Cap',
        'brand': 'Quake Accessories',
        'category': 'Accessories',
        'gst': Decimal('5.00'),
        'variants': [
            {'sku': 'CAP-001-BLK', 'size': None, 'color': 'Black', 'cost': 300, 'sell': 599, 'opening_qty': 0},
        ],
    },
    {
        'name': 'Formal Dress Shirt',
        'brand': 'Quake Formal',
        'category': 'Shirts',
        'gst': Decimal('5.00'),
        'variants': [
            {'sku': 'FRM-001-WHT-M', 'size': 'M', 'color': 'White', 'cost': 800, 'sell': 1699, 'opening_qty': 3},
        ],
    },
    # --- Grocery & FMCG ---
    {
        'name': 'Basmati Rice 5kg',
        'brand': 'Bharat Grains',
        'category': 'Grocery',
        'gst': Decimal('5.00'),
        'variants': [
            {'sku': 'GRO-RICE-5KG', 'size': None, 'color': 'Standard', 'cost': 420, 'sell': 599, 'opening_qty': 80},
        ],
    },
    {
        'name': 'Toned Milk 1 Litre',
        'brand': 'FreshDaily Dairy',
        'category': 'Dairy',
        'gst': Decimal('5.00'),
        'variants': [
            {'sku': 'DAI-MILK-1L-TON', 'size': None, 'color': 'Pouch', 'cost': 48, 'sell': 64, 'opening_qty': 120},
        ],
    },
    {
        'name': 'Potato Chips Salted',
        'brand': 'TastyTreats',
        'category': 'Snacks',
        'gst': Decimal('12.00'),
        'variants': [
            {'sku': 'SNK-CHIP-052-SLT', 'size': '52g', 'color': None, 'cost': 15, 'sell': 20, 'opening_qty': 200},
        ],
    },
    {
        'name': 'Cola Soft Drink 600ml',
        'brand': 'ChillBrand',
        'category': 'Beverages',
        'gst': Decimal('28.00'),
        'variants': [
            {'sku': 'BEB-COLA-600', 'size': None, 'color': 'PET', 'cost': 22, 'sell': 40, 'opening_qty': 150},
        ],
    },
    {
        'name': 'Mineral Water 1 Litre',
        'brand': 'HydroPeak',
        'category': 'Beverages',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'BEB-H2O-1L', 'size': None, 'color': None, 'cost': 10, 'sell': 20, 'opening_qty': 300},
        ],
    },
    {
        'name': 'Instant Noodles Chicken',
        'brand': 'WokExpress',
        'category': 'Grocery',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'GRO-NDLS-CHK-70', 'size': '70g', 'color': None, 'cost': 12, 'sell': 20, 'opening_qty': 180},
        ],
    },
    {
        'name': 'Whole Wheat Biscuits',
        'brand': 'OvenBake',
        'category': 'Grocery',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'GRO-BISC-WW-200', 'size': '200g', 'color': None, 'cost': 45, 'sell': 75, 'opening_qty': 90},
        ],
    },
    {
        'name': 'Laundry Detergent 1kg',
        'brand': 'CleanCare',
        'category': 'Household',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'HH-DET-1KG-LAV', 'size': None, 'color': 'Liquid', 'cost': 180, 'sell': 249, 'opening_qty': 60},
        ],
    },
    # --- Hardware / electronics ---
    {
        'name': 'AA Alkaline Batteries 4-Pack',
        'brand': 'PowerPlus',
        'category': 'Hardware',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'HW-BAT-AA-4PK', 'size': None, 'color': None, 'cost': 120, 'sell': 199, 'opening_qty': 100},
        ],
    },
    {
        'name': 'USB-C Cable 1m',
        'brand': 'LinkGear',
        'category': 'Electronics',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'EL-CBL-USBC-1M', 'size': None, 'color': 'Black', 'cost': 150, 'sell': 349, 'opening_qty': 75},
        ],
    },
    {
        'name': 'Wireless Mouse',
        'brand': 'LinkGear',
        'category': 'Electronics',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'EL-MSE-WL-GRY', 'size': None, 'color': 'Grey', 'cost': 380, 'sell': 799, 'opening_qty': 40},
        ],
    },
    {
        'name': 'Kitchen Sponge Pack 6',
        'brand': 'ScrubMate',
        'category': 'Household',
        'gst': Decimal('18.00'),
        'variants': [
            {'sku': 'HH-SPONGE-6PK', 'size': None, 'color': 'Yellow', 'cost': 40, 'sell': 99, 'opening_qty': 70},
        ],
    },
]


class Command(BaseCommand):
    help = 'Seed the database with demo products, pricing, and product-level opening stock'

    def handle(self, *args, **options):
        self.stdout.write('\n🌱 Starting Quake Demo Data Seed...\n')

        with transaction.atomic():
            seed_user = self._ensure_seed_user()
            warehouses = self._create_warehouses()
            main_wh = warehouses[0]

            products, opening_totals, gst_by_product_id = self._ensure_products_and_variants()
            self._ensure_pricing(products, gst_by_product_id)
            self._ensure_opening_stock(products, opening_totals, main_wh, seed_user)

        self.stdout.write(self.style.SUCCESS('\n✅ Demo data seeded successfully!\n'))

    def _ensure_seed_user(self):
        """User required for audited inventory movements."""
        seed_user, created = User.objects.get_or_create(
            username='demo_seed',
            defaults={
                'email': 'demo_seed@localhost',
                'is_staff': True,
                'first_name': 'Demo',
                'last_name': 'Seed',
            },
        )
        if created:
            seed_user.set_unusable_password()
            seed_user.save()
            self.stdout.write('✔ User `demo_seed` created (staff, no login password)')
        else:
            self.stdout.write('✔ User `demo_seed` already exists')
        return seed_user

    def _create_warehouses(self):
        warehouses_data = [
            {'name': 'Main Warehouse', 'code': 'MAIN', 'address': '123 Fashion Street, Mumbai 400001'},
            {'name': 'Secondary Store', 'code': 'SEC', 'address': '456 Retail Lane, Mumbai 400002'},
        ]

        warehouses = []
        created_count = 0
        for data in warehouses_data:
            warehouse, created = Warehouse.objects.get_or_create(code=data['code'], defaults=data)
            warehouses.append(warehouse)
            if created:
                created_count += 1

        self.stdout.write(
            f'✔ Warehouses: {created_count} created, {len(warehouses) - created_count} existing'
        )
        return warehouses

    def _ensure_products_and_variants(self):
        """Create products & variants from DEMO_PRODUCTS."""
        products_in_order = []
        opening_totals = defaultdict(int)
        gst_by_product_id = {}
        products_created = 0
        variants_created = 0

        for block in DEMO_PRODUCTS:
            product, pc = Product.objects.get_or_create(
                name=block['name'],
                brand=block['brand'],
                defaults={'category': block['category'], 'is_active': True, 'is_deleted': False},
            )
            products_in_order.append(product)
            if pc:
                products_created += 1

            gst_by_product_id[product.id] = block.get('gst', Decimal('18.00'))

            for v in block['variants']:
                _, vc = ProductVariant.objects.get_or_create(
                    sku=v['sku'],
                    defaults={
                        'product': product,
                        'size': v['size'] or '',
                        'color': v['color'] or '',
                        'cost_price': Decimal(str(v['cost'])),
                        'selling_price': Decimal(str(v['sell'])),
                        'reorder_threshold': 5,
                    },
                )
                opening_totals[product.id] += int(v['opening_qty'] or 0)
                if vc:
                    variants_created += 1

        self.stdout.write(
            f'✔ Products: {products_created} new, variants created {variants_created} '
            f'(total catalogue {len(DEMO_PRODUCTS)} products)'
        )
        return products_in_order, opening_totals, gst_by_product_id

    def _ensure_pricing(self, products, gst_by_product_id):
        """ProductPricing drives POS totals; create/update from first variant of each product."""
        for product in Product.objects.filter(
            pk__in=[p.pk for p in products]
        ).prefetch_related('variants'):
            v0 = product.variants.order_by('sku').first()
            if not v0:
                continue
            gst = gst_by_product_id.get(product.id, Decimal('18.00'))
            mrp = (v0.selling_price * Decimal('1.10')).quantize(Decimal('0.01'))
            ProductPricing.objects.update_or_create(
                product=product,
                defaults={
                    'cost_price': v0.cost_price,
                    'mrp': mrp if mrp > v0.selling_price else v0.selling_price,
                    'selling_price': v0.selling_price,
                    'gst_percentage': gst,
                },
            )

        self.stdout.write('✔ ProductPricing: ensured rows for seeded products')

    def _ensure_opening_stock(self, products, opening_totals, warehouse, seed_user):
        """One OPENING movement per product × warehouse sum of variant demo quantities."""
        from inventory.models import InventoryMovement

        seeded = 0
        skipped = 0

        for product in products:
            total = opening_totals.get(product.id, 0)
            if total <= 0:
                skipped += 1
                continue

            if InventoryMovement.objects.filter(product_id=product.id, warehouse_id=warehouse.id).exists():
                skipped += 1
                continue

            try:
                create_opening_stock(str(product.id), str(warehouse.id), total, seed_user)
                seeded += 1
            except DuplicateOpeningStockError:
                skipped += 1

        self.stdout.write(
            f'✔ Product-level OPENING stock: {seeded} seeded at {warehouse.code}, '
            f'{skipped} skipped (zero qty or ledger already exists)'
        )
