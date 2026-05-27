"""
Inventory Models for Quake Inventory System.
Implements ledger-based stock management with immutable audit trail.
"""

import uuid
from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


class Category(models.Model):
    """
    Product category managed by admins (taxonomy is vertical-agnostic).

    Examples: groceries, OTC pharmacy, cosmetics, fasteners, beverages,
    apparel, footwear, electronics, etc.—whatever fits the business.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Categories'

    def __str__(self):
        return self.name


class ServiceItem(models.Model):
    """
    Billable service catalog (alignment, balancing, wash, nitrogen, etc.).
    Sold at POS via product linkage or future SaleItem.service_item FK.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_name = models.CharField(max_length=200)
    default_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    gst_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('18.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    hsn_code = models.CharField(max_length=20, blank=True, default='')
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['service_name']
        verbose_name = 'Service item'
        verbose_name_plural = 'Service items'

    def __str__(self):
        return self.service_name


class Warehouse(models.Model):
    """
    Represents a physical warehouse or storage location.
    
    Phase 12 Rules:
    - name must be unique
    - code must be uppercase, human-readable (e.g. BLR-MAIN)
    - No deletes (only deactivate via is_active=False)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    address = models.TextField(blank=True)
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    seller_image = models.ImageField(
        upload_to="warehouse_seller/",
        blank=True,
        null=True,
        help_text="16:9 horizontal banner for printed invoice seller block.",
    )
    bank_name = models.CharField(max_length=200, blank=True, default="")
    bank_account_number = models.CharField(max_length=64, blank=True, default="")
    bank_ifsc = models.CharField(max_length=20, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Warehouses'

    def __str__(self):
        return f"{self.name} ({self.code})"
    
    def save(self, *args, **kwargs):
        """Enforce uppercase code."""
        if self.code:
            self.code = self.code.upper().strip()
        super().save(*args, **kwargs)


class SKUSequence(models.Model):
    """
    Atomic sequence counter for deterministic SKU generation.
    
    Phase 10.1: Retail-grade SKU format: {BRAND}-{CATEGORY}-{SEQUENCE:06d}
    
    Uses SELECT FOR UPDATE for concurrency safety.
    One row per brand+category combination.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    brand = models.CharField(max_length=100, db_index=True)
    category = models.CharField(max_length=100, db_index=True)
    last_sequence = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['brand', 'category']
        verbose_name = 'SKU Sequence'
        verbose_name_plural = 'SKU Sequences'

    def __str__(self):
        return f"{self.brand}-{self.category}: {self.last_sequence}"
    
    @classmethod
    def get_next_sequence(cls, brand: str, category: str) -> int:
        """
        Get the next sequence number atomically.
        Uses SELECT FOR UPDATE for concurrency safety.
        """
        from django.db import transaction
        
        # Normalize brand and category
        brand_norm = brand.upper().strip()[:100]
        category_norm = category.upper().strip()[:100]
        
        with transaction.atomic():
            # Get or create with row-level lock
            seq, created = cls.objects.select_for_update().get_or_create(
                brand=brand_norm,
                category=category_norm,
                defaults={'last_sequence': 0}
            )
            seq.last_sequence += 1
            seq.save(update_fields=['last_sequence', 'updated_at'])
            return seq.last_sequence


class Product(models.Model):
    """
    Represents a product in the inventory.
    Products can have multiple variants (size, color, etc.)
    
    PHASE 10A - PRODUCT MASTER UPGRADE:
    - SKU: Unique product identifier (auto-generated if not provided)
    - barcode_value: Code128 barcode (auto-generated, immutable)
    - attributes: Flexible JSONB for apparel data (sizes, colors, etc.)
    - is_deleted: Soft delete flag (separate from is_active)
    
    APPAREL ATTRIBUTES:
    - gender: Target gender for the product
    - material: Primary material/fabric
    - season: Season collection (optional)
    """
    
    class Gender(models.TextChoices):
        MENS = 'MENS', "Men's"
        WOMENS = 'WOMENS', "Women's"
        UNISEX = 'UNISEX', 'Unisex'
        KIDS = 'KIDS', 'Kids'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    
    # Phase 10A: SKU and Barcode at product level
    sku = models.CharField(
        max_length=100,
        unique=True,
        blank=True,
        null=True,
        db_index=True,
        help_text="Unique product SKU (auto-generated if not provided)"
    )
    barcode_value = models.CharField(
        max_length=128,
        unique=True,
        blank=True,
        null=True,
        db_index=True,
        help_text="Code128 barcode value (auto-generated, immutable)"
    )
    barcode_image_url = models.TextField(
        blank=True,
        null=True,
        help_text="URL to barcode SVG image"
    )
    
    # Brand and Category (keep existing CharFields, add optional UUID refs for future)
    brand = models.CharField(max_length=100)
    brand_id = models.UUIDField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Optional reference to Brand entity"
    )
    category = models.CharField(max_length=100)
    category_id = models.UUIDField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Optional reference to Category entity"
    )
    
    description = models.TextField(blank=True, null=True)
    product_code = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Human-readable product code (shown in label as [code] after product name and beneath barcode bars)"
    )
    brand_code = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Brand's internal article/style code for this product (printed on barcode label)"
    )
    alias = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Alternative name or style identifier (printed on barcode label if provided)"
    )
    country_of_origin = models.CharField(max_length=100, blank=True)
    
    # Phase 10A: Flexible JSONB attributes for apparel
    attributes = models.JSONField(
        default=dict,
        blank=True,
        help_text="Flexible attributes: sizes, colors, pattern, fit, material, season, etc."
    )
    
    # Apparel-specific fields (kept for backward compatibility)
    gender = models.CharField(
        max_length=50,
        choices=Gender.choices,
        default=Gender.UNISEX,
        blank=True,
        null=True,
        help_text="Target gender for the product"
    )
    material = models.CharField(
        max_length=100,
        blank=True,
        help_text="Primary material/fabric (e.g., 100% Cotton, Cotton/Polyester Blend)"
    )
    season = models.CharField(
        max_length=50,
        blank=True,
        help_text="Season collection (e.g., SS24, FW23)"
    )
    
    # Supplier tracking - set when first received via Purchase Order
    supplier = models.ForeignKey(
        'Supplier',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='products',
        help_text="Supplier from whom this product was first received"
    )
    
    # Status flags
    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Soft delete flag. Deleted products hidden from POS, visible in admin."
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['is_active', 'is_deleted']),
            models.Index(fields=['brand', 'category']),
        ]

    def __str__(self):
        return f"{self.brand} - {self.name}"
    
    def save(self, *args, **kwargs):
        """
        Override save to:
        1. Auto-generate SKU if not provided (Phase 10.1: deterministic format)
        2. Auto-generate barcode with supplier prefix if not provided
        3. Prevent barcode modification after creation
        4. Prevent SKU modification after creation
        """
        from .barcode_utils import generate_retail_sku, generate_barcode_value, generate_barcode_svg
        
        is_new = self._state.adding
        
        # Auto-generate SKU on creation if not provided
        # Phase 10.1: Use deterministic retail-grade format
        if not self.sku:
            self.sku = generate_retail_sku(self.brand, self.category)
        
        # Prevent SKU modification after creation (Phase 10.1)
        elif not is_new:
            try:
                old_instance = Product.objects.get(pk=self.pk)
                if old_instance.sku and self.sku != old_instance.sku:
                    raise ValueError("SKU cannot be modified after creation.")
            except Product.DoesNotExist:
                pass
        
        # Auto-generate barcode on creation if not provided
        # Use supplier name prefix if supplier is set
        if is_new and not self.barcode_value:
            supplier_name = self.supplier.name if self.supplier_id else None
            self.barcode_value = generate_barcode_value(supplier_name=supplier_name)
            # Ensure uniqueness
            while Product.objects.filter(barcode_value=self.barcode_value).exists():
                self.barcode_value = generate_barcode_value(supplier_name=supplier_name)
            
            # Generate barcode SVG image
            try:
                self.barcode_image_url = generate_barcode_svg(self.barcode_value)
            except Exception:
                pass  # Barcode image generation is optional
        
        # Prevent barcode modification after creation
        elif not is_new:
            try:
                old_instance = Product.objects.get(pk=self.pk)
                if old_instance.barcode_value and self.barcode_value != old_instance.barcode_value:
                    raise ValueError("Barcode cannot be modified after creation.")
            except Product.DoesNotExist:
                pass
        
        super().save(*args, **kwargs)
    
    def regenerate_barcode_with_supplier(self, supplier):
        """
        Regenerate barcode with supplier prefix when first received via PO.
        
        This should only be called once - when the product is first received.
        After that, the barcode becomes immutable.
        
        Args:
            supplier: Supplier instance
        """
        from .barcode_utils import generate_barcode_value, generate_barcode_svg
        
        # Only regenerate if no supplier was set before
        if self.supplier_id is not None:
            return  # Already has a supplier, don't change barcode
        
        # Set supplier
        self.supplier = supplier
        
        # Generate new barcode with supplier prefix
        new_barcode = generate_barcode_value(supplier_name=supplier.name)
        while Product.objects.filter(barcode_value=new_barcode).exists():
            new_barcode = generate_barcode_value(supplier_name=supplier.name)
        
        self.barcode_value = new_barcode
        
        # Generate barcode SVG
        try:
            self.barcode_image_url = generate_barcode_svg(self.barcode_value)
        except Exception:
            pass
        
        # Save without triggering immutability check
        Product.objects.filter(pk=self.pk).update(
            supplier=supplier,
            barcode_value=self.barcode_value,
            barcode_image_url=self.barcode_image_url
        )


class ProductVariant(models.Model):
    """
    Represents a specific variant of a product (e.g., size/color combination).
    Stock is NOT stored here - it's calculated from StockLedger.
    
    BARCODE RULES:
    - Each variant has a unique barcode
    - Barcode is auto-generated on creation
    - Barcode is immutable (cannot be changed after creation)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='variants'
    )
    sku = models.CharField(max_length=50, unique=True)
    barcode = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        blank=True,
        null=True,
        help_text="Unique barcode for POS scanning. Auto-generated on creation."
    )
    size = models.CharField(max_length=20, blank=True, null=True)
    color = models.CharField(max_length=50, blank=True, null=True)
    cost_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))]
    )
    selling_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))]
    )
    reorder_threshold = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sku']

    def __str__(self):
        variant_info = []
        if self.size:
            variant_info.append(self.size)
        if self.color:
            variant_info.append(self.color)
        variant_str = " / ".join(variant_info) if variant_info else "Default"
        return f"{self.product.name} - {variant_str} ({self.sku})"

    def save(self, *args, **kwargs):
        """Auto-generate SKU and barcode on creation."""
        is_new = self._state.adding
        
        # Auto-generate SKU if missing
        if is_new and not self.sku:
            base_sku = self.product.sku
            parts = [base_sku]
            if self.size:
                parts.append(self.size.upper().replace(" ", ""))
            if self.color:
                parts.append(self.color.upper().replace(" ", ""))
            
            # If no attributes, append a counter or random string to ensure uniqueness
            # But normally variants have attributes. 
            # If duplicates exist (e.g. same size/color), this will fail uniqueness, which is correct.
            self.sku = "-".join(parts)
            
        if is_new and not self.barcode:
            # Auto-generate barcode on creation
            self.barcode = self._generate_barcode()
        elif not is_new:
            # Check if barcode is being changed
            try:
                old_instance = ProductVariant.objects.get(pk=self.pk)
                if old_instance.barcode and old_instance.barcode != self.barcode:
                    raise ValueError("Barcode cannot be modified after creation.")
            except ProductVariant.DoesNotExist:
                pass
        
        super().save(*args, **kwargs)
    
    def _generate_barcode(self):
        """
        Generate a unique EAN-13 style barcode.
        Format: 2 (internal) + 11 random digits + check digit = 13 digits
        """
        import random
        import time
        
        # Use timestamp + random for uniqueness
        timestamp_part = str(int(time.time() * 1000))[-6:]
        random_part = ''.join([str(random.randint(0, 9)) for _ in range(5)])
        
        # EAN-13 prefix "2" indicates internal use (12 digits before check)
        base = f"2{timestamp_part}{random_part}"
        
        # Calculate EAN-13 check digit
        check_digit = self._calculate_ean13_check_digit(base)
        barcode = f"{base}{check_digit}"
        
        # Ensure uniqueness
        while ProductVariant.objects.filter(barcode=barcode).exists():
            random_part = ''.join([str(random.randint(0, 9)) for _ in range(5)])
            base = f"2{timestamp_part}{random_part}"
            check_digit = self._calculate_ean13_check_digit(base)
            barcode = f"{base}{check_digit}"
        
        return barcode
    
    @staticmethod
    def _calculate_ean13_check_digit(code):
        """Calculate EAN-13 check digit."""
        total = 0
        for i, digit in enumerate(code[:12]):
            if i % 2 == 0:
                total += int(digit)
            else:
                total += int(digit) * 3
        check_digit = (10 - (total % 10)) % 10
        return str(check_digit)

    def get_total_stock(self):
        """Get total stock across all warehouses from snapshot."""
        from django.db.models import Sum
        result = self.stock_snapshots.aggregate(total=Sum('quantity'))
        return result['total'] or 0
    
    def get_stock_in_warehouse(self, warehouse):
        """Get stock for a specific warehouse."""
        try:
            from .models import StockSnapshot
            snapshot = StockSnapshot.objects.get(variant=self, warehouse=warehouse)
            return snapshot.quantity
        except StockSnapshot.DoesNotExist:
            return 0


class StockLedger(models.Model):
    """
    Immutable ledger for all stock movements.
    Stock = SUM of ledger events, not a field to edit.
    
    RULES:
    - Entries are APPEND-ONLY
    - NO updates allowed
    - NO deletes allowed
    - Corrections happen via new adjustment events
    """
    
    class EventType(models.TextChoices):
        PURCHASE = 'PURCHASE', 'Purchase'
        SALE = 'SALE', 'Sale'
        RETURN = 'RETURN', 'Return'
        ADJUSTMENT = 'ADJUSTMENT', 'Adjustment'
    
    class ReferenceType(models.TextChoices):
        PURCHASE = 'purchase', 'Purchase Order'
        SALE = 'sale', 'Sales Order'
        ADJUSTMENT = 'adjustment', 'Stock Adjustment'
        RETURN = 'return', 'Return'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.ForeignKey(
        ProductVariant,
        on_delete=models.PROTECT,
        related_name='ledger_entries'
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='ledger_entries'
    )
    event_type = models.CharField(
        max_length=20,
        choices=EventType.choices
    )
    quantity = models.IntegerField(
        help_text="Positive for additions, negative for deductions"
    )
    reference_type = models.CharField(
        max_length=20,
        choices=ReferenceType.choices
    )
    reference_id = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Stock Ledger Entry'
        verbose_name_plural = 'Stock Ledger Entries'
        # Prevent any modifications - this is enforced at DB level
        indexes = [
            models.Index(fields=['variant', 'warehouse']),
            models.Index(fields=['event_type']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        sign = '+' if self.quantity > 0 else ''
        return f"{self.variant.sku} | {self.event_type} | {sign}{self.quantity} @ {self.warehouse.code}"

    def save(self, *args, **kwargs):
        """Override save to prevent updates on existing entries."""
        if self.pk:
            # Check if this is an existing record
            existing = StockLedger.objects.filter(pk=self.pk).exists()
            if existing:
                raise ValueError("StockLedger entries cannot be modified. Create a new adjustment entry instead.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Override delete to prevent deletion."""
        raise ValueError("StockLedger entries cannot be deleted. Create a new adjustment entry instead.")


class StockSnapshot(models.Model):
    """
    Performance cache for current stock levels.
    This is DERIVED from StockLedger - never edit directly.
    Updated automatically when ledger entries are created.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.ForeignKey(
        ProductVariant,
        on_delete=models.CASCADE,
        related_name='stock_snapshots'
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name='stock_snapshots'
    )
    quantity = models.IntegerField(default=0)
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['variant', 'warehouse']
        ordering = ['variant__sku', 'warehouse__code']
        verbose_name = 'Stock Snapshot'
        verbose_name_plural = 'Stock Snapshots'

    def __str__(self):
        return f"{self.variant.sku} @ {self.warehouse.code}: {self.quantity}"

    @classmethod
    def recalculate(cls, variant, warehouse):
        """
        Recalculate snapshot from ledger entries.
        This is the source of truth calculation.
        """
        from django.db.models import Sum
        
        total = StockLedger.objects.filter(
            variant=variant,
            warehouse=warehouse
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        snapshot, created = cls.objects.update_or_create(
            variant=variant,
            warehouse=warehouse,
            defaults={'quantity': total}
        )
        return snapshot


# =============================================================================
# PHASE 10A: PRODUCT MASTER MODELS
# =============================================================================

class ProductPricing(models.Model):
    """
    Separate pricing table for products.
    
    RULES:
    - OneToOne relationship with Product
    - margin_percentage is READ-ONLY computed property
    - GST percentage stored for tax calculations
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.OneToOneField(
        Product,
        on_delete=models.CASCADE,
        related_name='pricing'
    )
    cost_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Cost price / purchase price"
    )
    mrp = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Maximum Retail Price"
    )
    selling_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Actual selling price"
    )
    gst_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="GST percentage (e.g., 5.00, 12.00, 18.00)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Product Pricing'
        verbose_name_plural = 'Product Pricing'

    def __str__(self):
        return f"{self.product.name} - ₹{self.selling_price}"
    
    @property
    def margin_percentage(self) -> Decimal:
        """
        Computed margin percentage.
        READ-ONLY: Cannot be set directly.
        Formula: ((selling_price - cost_price) / cost_price) * 100
        """
        q = Decimal('0.01')
        try:
            if not self.cost_price or self.cost_price <= 0:
                return Decimal('0.00')
            margin = ((self.selling_price - self.cost_price) / self.cost_price) * Decimal(100)
            return margin.quantize(q, rounding=ROUND_HALF_UP)
        except InvalidOperation:
            return Decimal('0.00')
    
    @property
    def profit_amount(self) -> Decimal:
        """Computed profit per unit."""
        q = Decimal('0.01')
        try:
            return (self.selling_price - self.cost_price).quantize(q, rounding=ROUND_HALF_UP)
        except InvalidOperation:
            return Decimal('0.00')
    
    @property
    def gst_amount(self) -> Decimal:
        """Computed GST amount based on selling price."""
        q = Decimal('0.01')
        try:
            if not self.gst_percentage or self.gst_percentage <= 0:
                return Decimal('0.00')
            denom = Decimal(100) + self.gst_percentage
            if denom <= 0:
                return Decimal('0.00')
            gst = (self.selling_price * self.gst_percentage) / denom
            return gst.quantize(q, rounding=ROUND_HALF_UP)
        except InvalidOperation:
            return Decimal('0.00')


class ProductImage(models.Model):
    """
    Product images with support for primary image flag.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='images'
    )
    image_url = models.TextField(
        help_text="URL to the product image"
    )
    is_primary = models.BooleanField(
        default=False,
        help_text="Is this the primary/main product image?"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-is_primary', '-created_at']
        verbose_name = 'Product Image'
        verbose_name_plural = 'Product Images'

    def __str__(self):
        primary = " (Primary)" if self.is_primary else ""
        return f"{self.product.name} - Image{primary}"
    
    def save(self, *args, **kwargs):
        """Ensure only one primary image per product."""
        if self.is_primary:
            # Set all other images for this product to non-primary
            ProductImage.objects.filter(
                product=self.product,
                is_primary=True
            ).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)


# =============================================================================
# PHASE 11 + 12: INVENTORY LEDGER
# =============================================================================

class InventoryMovement(models.Model):
    """
    Immutable ledger for all inventory movements at the PRODUCT level.
    
    CORE PRINCIPLE:
        Stock = SUM(inventory_movements.quantity)
    
    RULES:
    - Entries are APPEND-ONLY
    - NO updates allowed
    - NO deletes allowed
    - Corrections happen via new ADJUSTMENT movements
    - Every movement has a reason (movement_type) and user (created_by)
    
    PHASE 12:
    - Warehouse is now a ForeignKey (normalized)
    - Warehouse is REQUIRED for: OPENING, PURCHASE, SALE, TRANSFER_IN, TRANSFER_OUT
    - Opening stock = First OPENING movement per product+warehouse
    """
    
    class MovementType(models.TextChoices):
        OPENING = 'OPENING', 'Opening Stock'
        PURCHASE = 'PURCHASE', 'Purchase'
        SALE = 'SALE', 'Sale'
        RETURN = 'RETURN', 'Return'
        RETURN_INWARD = 'RETURN_INWARD', 'Return Inward (Customer Return)'
        RETURN_OUTWARD = 'RETURN_OUTWARD', 'Return Outward (Supplier Return)'
        ADJUSTMENT = 'ADJUSTMENT', 'Adjustment'
        DAMAGE = 'DAMAGE', 'Damage'
        TRANSFER_IN = 'TRANSFER_IN', 'Transfer In'
        TRANSFER_OUT = 'TRANSFER_OUT', 'Transfer Out'
    
    # Movement type -> quantity sign rule
    # Positive: OPENING, PURCHASE, RETURN, RETURN_INWARD, TRANSFER_IN
    # Negative: SALE, RETURN_OUTWARD, DAMAGE, TRANSFER_OUT
    # Either: ADJUSTMENT
    POSITIVE_ONLY_TYPES = {'OPENING', 'PURCHASE', 'RETURN', 'RETURN_INWARD', 'TRANSFER_IN'}
    NEGATIVE_ONLY_TYPES = {'SALE', 'RETURN_OUTWARD', 'DAMAGE', 'TRANSFER_OUT'}
    
    # Phase 12: Movement types that require a warehouse
    WAREHOUSE_REQUIRED_TYPES = {'OPENING', 'PURCHASE', 'RETURN_OUTWARD', 'TRANSFER_OUT'}
    # TRANSFER_IN can be to warehouse or store, SALE can be at warehouse or store

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='inventory_movements',
        help_text="Product this movement applies to"
    )
    
    # Phase 12: Normalized to ForeignKey
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='inventory_movements',
        help_text="Warehouse for this movement (required for OPENING, PURCHASE, SALE, TRANSFER)"
    )
    
    # Store-level inventory tracking (for TRANSFER_IN, SALE at store)
    store = models.ForeignKey(
        'Store',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='inventory_movements',
        help_text="Store for this movement (for store-level inventory tracking)"
    )
    
    movement_type = models.CharField(
        max_length=20,
        choices=MovementType.choices,
        db_index=True
    )
    
    quantity = models.IntegerField(
        help_text="Positive for additions, negative for deductions"
    )
    
    reference_type = models.CharField(
        max_length=50,
        blank=True,
        help_text="Type of reference document (e.g., 'purchase_order', 'sale', 'adjustment')"
    )
    
    reference_id = models.UUIDField(
        null=True,
        blank=True,
        help_text="UUID of the reference document"
    )
    
    remarks = models.TextField(
        blank=True,
        help_text="Additional notes about this movement"
    )
    
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='inventory_movements',
        help_text="User who created this movement (null for system-generated)"
    )
    
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Inventory Movement'
        verbose_name_plural = 'Inventory Movements'
        indexes = [
            models.Index(fields=['product']),
            models.Index(fields=['movement_type']),
            models.Index(fields=['created_at']),
            models.Index(fields=['product', 'warehouse']),
        ]

    def __str__(self):
        sign = '+' if self.quantity > 0 else ''
        wh = f" @ {self.warehouse.code}" if self.warehouse else ""
        return f"{self.product.sku} | {self.movement_type} | {sign}{self.quantity}{wh}"

    def clean(self):
        """Validate quantity sign and warehouse requirement based on movement type."""
        from django.core.exceptions import ValidationError
        
        movement_type = self.movement_type
        quantity = self.quantity
        
        # Quantity sign validation
        if movement_type in self.POSITIVE_ONLY_TYPES and quantity <= 0:
            raise ValidationError({
                'quantity': f'{movement_type} movements must have positive quantity'
            })
        
        if movement_type in self.NEGATIVE_ONLY_TYPES and quantity >= 0:
            raise ValidationError({
                'quantity': f'{movement_type} movements must have negative quantity'
            })
        
        if quantity == 0:
            raise ValidationError({
                'quantity': 'Quantity cannot be zero'
            })
        
        # Phase 12: Warehouse requirement validation
        if movement_type in self.WAREHOUSE_REQUIRED_TYPES and not self.warehouse:
            raise ValidationError({
                'warehouse': f'{movement_type} movements require a warehouse'
            })
        
        # Special case: TRANSFER_IN requires either warehouse or store
        if movement_type == 'TRANSFER_IN' and not self.warehouse and not self.store:
            raise ValidationError({
                'warehouse': 'TRANSFER_IN movements require either a warehouse or store'
            })

    def save(self, *args, **kwargs):
        """Override save to prevent updates on existing entries."""
        if self.pk:
            existing = InventoryMovement.objects.filter(pk=self.pk).exists()
            if existing:
                raise ValueError(
                    "InventoryMovement entries cannot be modified. "
                    "Create a new ADJUSTMENT movement instead."
                )
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Override delete to prevent deletion."""
        raise ValueError(
            "InventoryMovement entries cannot be deleted. "
            "Create a new ADJUSTMENT movement instead."
        )


# =============================================================================
# SUPPLIER MODEL
# =============================================================================

class Supplier(models.Model):
    """
    Represents a supplier/vendor from whom products are purchased.
    
    RULES:
    - Suppliers can be deactivated but not deleted
    - Used in Purchase Orders to track source of inventory
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    name = models.CharField(
        max_length=255,
        unique=True,
        help_text="Supplier/vendor name"
    )
    
    code = models.CharField(
        max_length=20,
        unique=True,
        blank=True,
        help_text="Short code for supplier (auto-generated if blank)"
    )
    
    contact_person = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Primary contact person"
    )
    
    phone = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text="Phone number"
    )
    
    email = models.EmailField(
        blank=True,
        default='',
        help_text="Email address"
    )
    
    address = models.TextField(
        blank=True,
        default='',
        help_text="Full address"
    )
    
    gst_number = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text="GST registration number"
    )
    
    notes = models.TextField(
        blank=True,
        default='',
        help_text="Additional notes about the supplier"
    )
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Supplier'
        verbose_name_plural = 'Suppliers'

    def __str__(self):
        return f"{self.code} - {self.name}"
    
    def save(self, *args, **kwargs):
        """Auto-generate code if not provided."""
        if not self.code:
            # Generate code from first 3 letters of name + 3 random digits
            import random
            base = ''.join(c for c in self.name.upper() if c.isalnum())[:3]
            suffix = str(random.randint(100, 999))
            self.code = f"{base}{suffix}"
        self.code = self.code.upper()
        super().save(*args, **kwargs)


# =============================================================================
# STORE MODEL
# =============================================================================

class Store(models.Model):
    """
    Represents a retail store where products are sold.
    
    RULES:
    - Stores receive stock from warehouses via StockTransfer
    - Each store has its own inventory tracked via InventoryMovement
    - Stores can be deactivated but not deleted
    - Each store has an operator (manager in charge)
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    name = models.CharField(
        max_length=150,
        unique=True,
        help_text="Store name"
    )
    
    code = models.CharField(
        max_length=20,
        unique=True,
        blank=True,
        help_text="Short code for store (auto-generated if blank)"
    )
    
    # Address details
    address = models.TextField(
        help_text="Full street address"
    )
    
    city = models.CharField(
        max_length=100,
        help_text="City"
    )
    
    state = models.CharField(
        max_length=100,
        help_text="State/Province"
    )
    
    pincode = models.CharField(
        max_length=10,
        help_text="Postal/ZIP code"
    )
    
    # Contact details
    phone = models.CharField(
        max_length=20,
        help_text="Store phone number"
    )
    
    email = models.EmailField(
        blank=True,
        default='',
        help_text="Store email address"
    )
    
    # Operator (store manager)
    operator = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_stores',
        help_text="Store operator/manager in charge"
    )
    
    operator_phone = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text="Operator's personal phone number"
    )
    
    # Configuration
    low_stock_threshold = models.PositiveIntegerField(
        default=10,
        help_text="Alert when product stock falls below this level"
    )
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Store'
        verbose_name_plural = 'Stores'
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['city']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"
    
    def save(self, *args, **kwargs):
        """Auto-generate code if not provided."""
        if not self.code:
            # Generate code: STR-{CITY[:3]}-{3 random digits}
            import random
            city_code = ''.join(c for c in self.city.upper() if c.isalnum())[:3]
            suffix = str(random.randint(100, 999))
            self.code = f"STR-{city_code}{suffix}"
        self.code = self.code.upper()
        super().save(*args, **kwargs)
    
    def get_stock(self, product_id=None):
        """
        Get current stock levels for this store.
        Derived from InventoryMovement ledger.
        """
        from django.db.models import Sum
        
        queryset = InventoryMovement.objects.filter(store=self)
        
        if product_id:
            queryset = queryset.filter(product_id=product_id)
            total = queryset.aggregate(total=Sum('quantity'))['total']
            return total or 0
        
        # Return stock per product
        return queryset.values('product_id', 'product__name', 'product__sku').annotate(
            stock=Sum('quantity')
        ).filter(stock__gt=0)
    
    def get_low_stock_products(self):
        """Get products below the low stock threshold."""
        from django.db.models import Sum
        
        stock_by_product = InventoryMovement.objects.filter(
            store=self
        ).values('product_id', 'product__name', 'product__sku').annotate(
            stock=Sum('quantity')
        ).filter(stock__gt=0, stock__lt=self.low_stock_threshold)
        
        return list(stock_by_product)


# =============================================================================
# STOCK TRANSFER MODELS
# =============================================================================

class StockTransfer(models.Model):
    """
    Represents a stock transfer from warehouse to store.
    
    LIFECYCLE:
    - PENDING: Transfer created, awaiting dispatch
    - IN_TRANSIT: Dispatched from warehouse
    - COMPLETED: Received at store
    - CANCELLED: Transfer cancelled
    
    LEDGER INTEGRATION:
    - On dispatch: Creates TRANSFER_OUT movement in warehouse ledger
    - On receive: Creates TRANSFER_IN movement in store ledger
    """
    
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        IN_TRANSIT = 'IN_TRANSIT', 'In Transit'
        COMPLETED = 'COMPLETED', 'Completed'
        CANCELLED = 'CANCELLED', 'Cancelled'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    transfer_number = models.CharField(
        max_length=50,
        unique=True,
        help_text="Transfer reference number: TRF-YYYY-NNNNNN"
    )
    
    source_warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='outgoing_transfers',
        help_text="Warehouse from which stock is transferred"
    )
    
    destination_store = models.ForeignKey(
        Store,
        on_delete=models.PROTECT,
        related_name='incoming_transfers',
        help_text="Store receiving the stock"
    )
    
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )
    
    transfer_date = models.DateField(
        help_text="Date transfer was initiated"
    )
    
    dispatch_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date stock was dispatched from warehouse"
    )
    
    received_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date stock was received at store"
    )
    
    notes = models.TextField(
        blank=True,
        default='',
        help_text="Additional notes"
    )
    
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='created_transfers',
        help_text="User who created this transfer"
    )
    
    dispatched_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='dispatched_transfers',
        help_text="User who dispatched this transfer"
    )
    
    received_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='received_transfers',
        help_text="User who received this transfer at store"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Stock Transfer'
        verbose_name_plural = 'Stock Transfers'
        indexes = [
            models.Index(fields=['transfer_number']),
            models.Index(fields=['status']),
            models.Index(fields=['source_warehouse']),
            models.Index(fields=['destination_store']),
            models.Index(fields=['transfer_date']),
        ]

    def __str__(self):
        return f"{self.transfer_number} - {self.source_warehouse.code} → {self.destination_store.code} ({self.status})"
    
    def save(self, *args, **kwargs):
        """Auto-generate transfer number if not provided."""
        if not self.transfer_number:
            self.transfer_number = self._generate_transfer_number()
        super().save(*args, **kwargs)
    
    @staticmethod
    def _generate_transfer_number():
        """Generate sequential transfer number."""
        import datetime
        from django.db import transaction
        
        current_year = datetime.datetime.now().year
        prefix = f"TRF-{current_year}-"
        
        with transaction.atomic():
            last_transfer = StockTransfer.objects.filter(
                transfer_number__startswith=prefix
            ).order_by('-transfer_number').first()
            
            if last_transfer:
                try:
                    last_num = int(last_transfer.transfer_number.split('-')[-1])
                    next_num = last_num + 1
                except (ValueError, IndexError):
                    next_num = 1
            else:
                next_num = 1
            
            return f"{prefix}{next_num:06d}"


class StockTransferItem(models.Model):
    """
    Represents an item within a Stock Transfer.
    
    Tracks quantity requested vs received.
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    transfer = models.ForeignKey(
        StockTransfer,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='transfer_items'
    )
    
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Quantity to transfer"
    )
    
    received_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Quantity actually received at store"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Stock Transfer Item'
        verbose_name_plural = 'Stock Transfer Items'
        constraints = [
            models.UniqueConstraint(
                fields=['transfer', 'product'],
                name='unique_product_per_transfer'
            )
        ]

    def __str__(self):
        return f"{self.product.name} ({self.quantity} units)"

    @property
    def pending_quantity(self):
        """Calculate remaining quantity to be received."""
        return max(0, self.quantity - self.received_quantity)

    @property
    def is_fully_received(self):
        """Check if item has been fully received."""
        return self.received_quantity >= self.quantity


# =============================================================================
# PURCHASE ORDER MODELS
# =============================================================================

class PurchaseOrder(models.Model):
    """
    Represents a purchase order for acquiring inventory from a supplier.
    
    LIFECYCLE:
    - DRAFT: Created, can be edited
    - SUBMITTED: Sent to supplier, awaiting delivery
    - PARTIAL: Some items received
    - RECEIVED: All items received
    - CANCELLED: Order cancelled
    
    RULES:
    - PurchaseOrderItems capture ordered items
    - On receiving, creates PURCHASE movement in InventoryMovement ledger
    - PO number is auto-generated: PO-YYYY-NNNNNN
    """
    
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        SUBMITTED = 'SUBMITTED', 'Submitted'
        PARTIAL = 'PARTIAL', 'Partially Received'
        RECEIVED = 'RECEIVED', 'Received'
        CANCELLED = 'CANCELLED', 'Cancelled'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    po_number = models.CharField(
        max_length=50,
        unique=True,
        help_text="Purchase order number: PO-YYYY-NNNNNN"
    )
    
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='purchase_orders',
        help_text="Supplier for this order"
    )
    
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='purchase_orders',
        help_text="Destination warehouse for received goods"
    )
    
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )
    
    order_date = models.DateField(
        help_text="Date order was placed"
    )
    
    expected_date = models.DateField(
        null=True,
        blank=True,
        help_text="Expected delivery date"
    )
    
    received_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date order was fully received"
    )
    
    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Sum of all line items"
    )
    
    tax_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Total tax amount"
    )
    
    total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Final total including tax"
    )
    
    notes = models.TextField(
        blank=True,
        default='',
        help_text="Additional notes"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Purchase Order'
        verbose_name_plural = 'Purchase Orders'
        indexes = [
            models.Index(fields=['po_number']),
            models.Index(fields=['status']),
            models.Index(fields=['supplier']),
            models.Index(fields=['order_date']),
        ]

    def __str__(self):
        return f"{self.po_number} - {self.supplier.name} ({self.status})"
    
    def save(self, *args, **kwargs):
        """Auto-generate PO number if not provided."""
        if not self.po_number:
            self.po_number = self._generate_po_number()
        super().save(*args, **kwargs)
    
    @staticmethod
    def _generate_po_number():
        """Generate sequential PO number."""
        import datetime
        from django.db import transaction
        
        current_year = datetime.datetime.now().year
        prefix = f"PO-{current_year}-"
        
        with transaction.atomic():
            last_po = PurchaseOrder.objects.filter(
                po_number__startswith=prefix
            ).order_by('-po_number').first()
            
            if last_po:
                try:
                    last_num = int(last_po.po_number.split('-')[-1])
                    next_num = last_num + 1
                except (ValueError, IndexError):
                    next_num = 1
            else:
                next_num = 1
            
            return f"{prefix}{next_num:06d}"
    
    def recalculate_totals(self):
        """Recalculate subtotal and total from items."""
        from django.db.models import Sum, F, DecimalField
        from django.db.models.functions import Coalesce
        
        aggregates = self.items.aggregate(
            calc_subtotal=Coalesce(
                Sum(F('quantity') * F('unit_price'), output_field=DecimalField()),
                Decimal('0.00')
            ),
            calc_tax=Coalesce(
                Sum(F('tax_amount'), output_field=DecimalField()),
                Decimal('0.00')
            )
        )
        
        self.subtotal = aggregates['calc_subtotal']
        self.tax_amount = aggregates['calc_tax']
        self.total = self.subtotal + self.tax_amount
        self.save(update_fields=['subtotal', 'tax_amount', 'total'])


class PurchaseOrderItem(models.Model):
    """
    Represents a line item in a purchase order.
    
    Tracks ordered quantity vs received quantity for partial receiving.
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='purchase_order_items'
    )
    
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Ordered quantity"
    )
    
    received_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Quantity received so far"
    )
    
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Price per unit (cost price)"
    )
    
    tax_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('18.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Tax percentage (GST)"
    )
    
    tax_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Calculated tax amount"
    )
    
    line_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Quantity × Unit Price"
    )

    class Meta:
        ordering = ['id']
        verbose_name = 'Purchase Order Item'
        verbose_name_plural = 'Purchase Order Items'

    def __str__(self):
        return f"{self.purchase_order.po_number} - {self.product.name} ({self.received_quantity}/{self.quantity})"
    
    def save(self, *args, **kwargs):
        """Calculate line total and tax on save."""
        self.line_total = Decimal(self.quantity) * self.unit_price
        self.tax_amount = self.line_total * (self.tax_percentage / Decimal('100'))
        super().save(*args, **kwargs)
    
    @property
    def is_fully_received(self):
        return self.received_quantity >= self.quantity
    
    @property
    def pending_quantity(self):
        return max(0, self.quantity - self.received_quantity)


# =============================================================================
# DEBIT/CREDIT NOTES (RETURNS MANAGEMENT)
# =============================================================================

class CreditNoteSequence(models.Model):
    """
    Atomic sequence counter for Credit Note numbers.
    Format: CR-YYYY-NNNNNN
    """
    year = models.PositiveIntegerField(unique=True, primary_key=True)
    last_number = models.PositiveIntegerField(default=0)
    
    class Meta:
        verbose_name = 'Credit Note Sequence'
        verbose_name_plural = 'Credit Note Sequences'
    
    @classmethod
    def get_next_credit_note_number(cls):
        """Generate next credit note number atomically."""
        import datetime
        from django.db import transaction
        
        current_year = datetime.datetime.now().year
        
        with transaction.atomic():
            sequence, _ = cls.objects.select_for_update().get_or_create(
                year=current_year,
                defaults={'last_number': 0}
            )
            sequence.last_number += 1
            sequence.save()
            return f"CR-{current_year}-{sequence.last_number:06d}"


class DebitNoteSequence(models.Model):
    """
    Atomic sequence counter for Debit Note numbers.
    Format: DR-YYYY-NNNNNN
    """
    year = models.PositiveIntegerField(unique=True, primary_key=True)
    last_number = models.PositiveIntegerField(default=0)
    
    class Meta:
        verbose_name = 'Debit Note Sequence'
        verbose_name_plural = 'Debit Note Sequences'
    
    @classmethod
    def get_next_debit_note_number(cls):
        """Generate next debit note number atomically."""
        import datetime
        from django.db import transaction
        
        current_year = datetime.datetime.now().year
        
        with transaction.atomic():
            sequence, _ = cls.objects.select_for_update().get_or_create(
                year=current_year,
                defaults={'last_number': 0}
            )
            sequence.last_number += 1
            sequence.save()
            return f"DR-{current_year}-{sequence.last_number:06d}"


class CreditNote(models.Model):
    """
    Credit Note for customer returns.
    
    BUSINESS LOGIC:
    - Customer returns products → stock increases
    - Links to original Sale transaction
    - Creates RETURN_INWARD inventory movement
    - Tracks refund amount and reason
    
    STATUS FLOW:
    - DRAFT: Being prepared
    - ISSUED: Sent to customer
    - SETTLED: Customer refunded
    - CANCELLED: Note cancelled
    """
    
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        ISSUED = 'ISSUED', 'Issued'
        SETTLED = 'SETTLED', 'Settled'
        CANCELLED = 'CANCELLED', 'Cancelled'
    
    class ReturnReason(models.TextChoices):
        DEFECTIVE = 'DEFECTIVE', 'Defective Product'
        WRONG_ITEM = 'WRONG_ITEM', 'Wrong Item Delivered'
        SIZE_ISSUE = 'SIZE_ISSUE', 'Size Issue'
        COLOR_ISSUE = 'COLOR_ISSUE', 'Color Issue'
        CUSTOMER_DISSATISFACTION = 'CUSTOMER_DISSATISFACTION', 'Customer Dissatisfaction'
        DAMAGE_IN_TRANSIT = 'DAMAGE_IN_TRANSIT', 'Damage in Transit'
        EXPIRED = 'EXPIRED', 'Expired Product'
        OTHER = 'OTHER', 'Other'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    credit_note_number = models.CharField(
        max_length=50,
        unique=True,
        help_text="Credit note number: CR-YYYY-NNNNNN"
    )
    
    # Link to original sale
    original_sale = models.ForeignKey(
        'sales.Sale',
        on_delete=models.PROTECT,
        related_name='credit_notes',
        help_text="Original sale transaction"
    )
    
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='credit_notes',
        help_text="Warehouse where stock is returned"
    )
    
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )
    
    return_reason = models.CharField(
        max_length=30,
        choices=ReturnReason.choices,
        help_text="Primary reason for return"
    )
    
    notes = models.TextField(
        blank=True,
        default='',
        help_text="Additional notes about the return"
    )
    
    # Financial details
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Total refund amount"
    )
    
    refund_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Actual amount refunded to customer"
    )
    
    # Dates
    return_date = models.DateField(
        help_text="Date customer returned the items"
    )
    
    issue_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date credit note was issued"
    )
    
    settlement_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date customer was refunded"
    )
    
    # Audit
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='credit_notes_created'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Credit Note'
        verbose_name_plural = 'Credit Notes'
        indexes = [
            models.Index(fields=['credit_note_number']),
            models.Index(fields=['status']),
            models.Index(fields=['return_date']),
            models.Index(fields=['original_sale']),
        ]
    
    def __str__(self):
        return f"{self.credit_note_number} - ₹{self.total_amount} ({self.status})"
    
    def save(self, *args, **kwargs):
        """Auto-generate credit note number if not provided."""
        if not self.credit_note_number:
            self.credit_note_number = CreditNoteSequence.get_next_credit_note_number()
        super().save(*args, **kwargs)


class CreditNoteItem(models.Model):
    """
    Individual items in a credit note.
    Links to original sale item.
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    credit_note = models.ForeignKey(
        CreditNote,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    # Link to original sale item
    original_sale_item = models.ForeignKey(
        'sales.SaleItem',
        on_delete=models.PROTECT,
        related_name='credit_note_items',
        help_text="Original sale item being returned"
    )
    
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='credit_note_items'
    )
    
    quantity_returned = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Quantity being returned"
    )
    
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Original unit price"
    )
    
    line_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Total for this line (calculated)"
    )
    
    condition = models.CharField(
        max_length=20,
        choices=[
            ('GOOD', 'Good Condition'),
            ('DAMAGED', 'Damaged'),
            ('DEFECTIVE', 'Defective'),
            ('EXPIRED', 'Expired'),
        ],
        default='GOOD',
        help_text="Condition of returned item"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
        verbose_name = 'Credit Note Item'
        verbose_name_plural = 'Credit Note Items'
    
    def save(self, *args, **kwargs):
        """Calculate line total on save."""
        self.line_total = self.quantity_returned * self.unit_price
        super().save(*args, **kwargs)


class DebitNote(models.Model):
    """
    Debit Note for supplier returns.
    
    BUSINESS LOGIC:
    - Return products to supplier → stock decreases
    - Links to original PurchaseOrder
    - Creates RETURN_OUTWARD inventory movement
    - Tracks return amount and reason
    
    STATUS FLOW:
    - DRAFT: Being prepared
    - ISSUED: Sent to supplier
    - ACCEPTED: Supplier accepted return
    - SETTLED: Amount adjusted/refunded
    - REJECTED: Supplier rejected return
    """
    
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        ISSUED = 'ISSUED', 'Issued'
        ACCEPTED = 'ACCEPTED', 'Accepted by Supplier'
        SETTLED = 'SETTLED', 'Settled'
        REJECTED = 'REJECTED', 'Rejected'
    
    class ReturnReason(models.TextChoices):
        DEFECTIVE_RECEIVED = 'DEFECTIVE_RECEIVED', 'Defective Items Received'
        WRONG_ITEMS = 'WRONG_ITEMS', 'Wrong Items Delivered'
        EXCESS_STOCK = 'EXCESS_STOCK', 'Excess Stock'
        EXPIRED = 'EXPIRED', 'Expired Products'
        DAMAGE_IN_TRANSIT = 'DAMAGE_IN_TRANSIT', 'Damage in Transit'
        QUALITY_ISSUES = 'QUALITY_ISSUES', 'Quality Issues'
        ORDER_CANCELLATION = 'ORDER_CANCELLATION', 'Order Cancellation'
        OTHER = 'OTHER', 'Other'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    debit_note_number = models.CharField(
        max_length=50,
        unique=True,
        help_text="Debit note number: DR-YYYY-NNNNNN"
    )
    
    # Link to original purchase order
    original_purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.PROTECT,
        related_name='debit_notes',
        help_text="Original purchase order"
    )
    
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='debit_notes',
        help_text="Supplier to return items to"
    )
    
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='debit_notes',
        help_text="Warehouse from which stock is returned"
    )
    
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )
    
    return_reason = models.CharField(
        max_length=30,
        choices=ReturnReason.choices,
        help_text="Primary reason for return"
    )
    
    notes = models.TextField(
        blank=True,
        default='',
        help_text="Additional notes about the return"
    )
    
    # Financial details
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Total return amount"
    )
    
    adjustment_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Amount adjusted by supplier"
    )
    
    # Dates
    return_date = models.DateField(
        help_text="Date items were returned to supplier"
    )
    
    issue_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date debit note was issued"
    )
    
    settlement_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date supplier settled the return"
    )
    
    # Audit
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='debit_notes_created'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Debit Note'
        verbose_name_plural = 'Debit Notes'
        indexes = [
            models.Index(fields=['debit_note_number']),
            models.Index(fields=['status']),
            models.Index(fields=['return_date']),
            models.Index(fields=['original_purchase_order']),
        ]
    
    def __str__(self):
        return f"{self.debit_note_number} - ₹{self.total_amount} ({self.status})"
    
    def save(self, *args, **kwargs):
        """Auto-generate debit note number if not provided."""
        if not self.debit_note_number:
            self.debit_note_number = DebitNoteSequence.get_next_debit_note_number()
        super().save(*args, **kwargs)


class DebitNoteItem(models.Model):
    """
    Individual items in a debit note.
    Links to original purchase order item.
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    debit_note = models.ForeignKey(
        DebitNote,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    # Link to original purchase order item
    original_purchase_order_item = models.ForeignKey(
        PurchaseOrderItem,
        on_delete=models.PROTECT,
        related_name='debit_note_items',
        help_text="Original purchase order item being returned"
    )
    
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='debit_note_items'
    )
    
    quantity_returned = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Quantity being returned"
    )
    
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Original unit price"
    )
    
    line_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Total for this line (calculated)"
    )
    
    condition = models.CharField(
        max_length=20,
        choices=[
            ('GOOD', 'Good Condition'),
            ('DAMAGED', 'Damaged'),
            ('DEFECTIVE', 'Defective'),
            ('EXPIRED', 'Expired'),
        ],
        default='GOOD',
        help_text="Condition of returned item"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
        verbose_name = 'Debit Note Item'
        verbose_name_plural = 'Debit Note Items'
    
    def save(self, *args, **kwargs):
        """Calculate line total on save."""
        self.line_total = self.quantity_returned * self.unit_price
        super().save(*args, **kwargs)
