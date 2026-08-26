"""
Invoice Models for Quake Inventory System.
Implements immutable invoices with optional discounts.

INVOICE RULES:
- One Sale → One Invoice
- Invoice data is fully snapshotted
- Invoice numbers are unique & sequential
- Invoices are IMMUTABLE (no update/delete)
- Discounts are optional (NONE, PERCENTAGE, FLAT)
- Final amount = subtotal − discount
"""

import uuid
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal

from sales.models import Sale
from inventory.models import Warehouse


class InvoiceSequence(models.Model):
    """
    Manages sequential invoice numbering.
    Uses select_for_update() for concurrency safety.
    """
    prefix = models.CharField(max_length=20, default='Quake/INV')
    current_number = models.PositiveIntegerField(default=0)
    year = models.PositiveIntegerField()
    
    class Meta:
        unique_together = ['prefix', 'year']

    # Prefix for POS Sale.invoice_number (INV-YYYY-NNNNNN); separate from PDF Quake/INV/…
    SALE_INVOICE_PREFIX = "INV-SALE"

    def __str__(self):
        return f"{self.prefix}/{self.year} - Current: {self.current_number}"
    
    @classmethod
    def get_next_invoice_number(cls, prefix='Quake/INV'):
        """
        Get next sequential invoice number (concurrency-safe).
        Format: PREFIX/YYYY/NNNN (e.g., Quake/INV/2026/0001)
        """
        from django.utils import timezone
        from django.db import transaction
        
        current_year = timezone.now().year
        
        with transaction.atomic():
            sequence, created = cls.objects.select_for_update().get_or_create(
                prefix=prefix,
                year=current_year,
                defaults={'current_number': 0}
            )
            sequence.current_number += 1
            sequence.save()
            
            return f"{prefix}/{current_year}/{sequence.current_number:04d}"

    @classmethod
    def get_next_sale_invoice_number(cls):
        """
        Next immutable sale invoice number (POS checkout).

        Format: INV-YYYY-NNNNNN (e.g. INV-2026-000001).
        Uses its own prefix row so PDF invoice numbering (Quake/INV/...) stays independent.
        Concurrency-safe via select_for_update.
        """
        from django.utils import timezone
        from django.db import transaction

        current_year = timezone.now().year
        prefix = cls.SALE_INVOICE_PREFIX

        with transaction.atomic():
            sequence, _ = cls.objects.select_for_update().get_or_create(
                prefix=prefix,
                year=current_year,
                defaults={"current_number": 0},
            )
            sequence.current_number += 1
            sequence.save()
            return f"INV-{current_year}-{sequence.current_number:06d}"


class BusinessSettings(models.Model):
    """
    Singleton model for business/store settings used in invoices.
    Also includes discount configuration for POS operations.
    """

    class InventoryLocationMode(models.TextChoices):
        # One counter / shop — stock lives on a single warehouse row; UI never says "warehouse".
        SINGLE_SHOP = "SINGLE_SHOP", "One shop only"
        # Central godown (warehouse) plus retail shops (stores) with transfers.
        GODOWN_AND_SHOPS = "GODOWN_AND_SHOPS", "Godown and shops"

    class ShopStockMode(models.TextChoices):
        # Current: send stock godown → each shop; sell from that shop's stock.
        TRANSFER = "TRANSFER", "Send stock to each shop"
        # All shops sell from the same godown pool; sales +/- godown directly.
        SHARED_GODOWN = "SHARED_GODOWN", "All shops use godown stock"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'users.Organization',
        on_delete=models.PROTECT,
        related_name='business_settings',
        null=True,
        blank=True,
        help_text='Business workspace these settings belong to',
    )
    business_name = models.CharField(max_length=200, default="Quake")
    tagline = models.CharField(max_length=200, blank=True, default="")
    address_line1 = models.CharField(max_length=200, blank=True)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=10, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.CharField(max_length=100, blank=True)
    website = models.CharField(max_length=100, blank=True)
    gstin = models.CharField(max_length=20, blank=True, help_text="GST Identification Number (optional)")
    footer_text = models.TextField(blank=True, default="Thank you for shopping with us!")
    terms_text = models.TextField(blank=True, default="All items are non-refundable. Exchange within 7 days with receipt.")

    inventory_location_mode = models.CharField(
        max_length=32,
        choices=InventoryLocationMode.choices,
        default=InventoryLocationMode.SINGLE_SHOP,
        help_text=(
            "SINGLE_SHOP: one shop UI (no godown/shop split). "
            "GODOWN_AND_SHOPS: godown + shops + transfers."
        ),
    )

    shop_stock_mode = models.CharField(
        max_length=32,
        choices=ShopStockMode.choices,
        default=ShopStockMode.TRANSFER,
        help_text=(
            "Only for Godown + shops. "
            "TRANSFER: move stock to each shop before selling. "
            "SHARED_GODOWN: every shop sells from the same godown stock."
        ),
    )

    # When True: auto-create barcodes and show POS scan. When False: barcodes optional.
    barcode_enabled = models.BooleanField(
        default=True,
        help_text=(
            "If True, every product gets a barcode and POS shows scan. "
            "If False, barcodes are optional — sell by search/tap."
        ),
    )

    # When False: hide GST on product forms and POS; sales use 0% tax.
    gst_enabled = models.BooleanField(
        default=True,
        help_text=(
            "If True, products can set a GST slab and POS can calculate GST. "
            "If False, tax is off for this business (inventory + billing)."
        ),
    )
    
    # Discount Configuration
    discount_enabled = models.BooleanField(
        default=True,
        help_text="Whether discounts can be applied at POS"
    )
    staff_max_discount_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('10.00'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        help_text="Maximum discount percentage STAFF can apply"
    )
    admin_max_discount_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('50.00'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        help_text="Maximum discount percentage ADMIN can apply"
    )
    available_discounts = models.JSONField(
        default=list,
        blank=True,
        help_text="List of preset discounts: [{type: 'PERCENTAGE'|'FLAT', value: number, label: string}]"
    )
    
    class Meta:
        verbose_name = "Business Settings"
        verbose_name_plural = "Business Settings"
    
    def __str__(self):
        return self.business_name
    
    @classmethod
    def get_settings(cls, organization=None):
        """Get or create settings for an organization (falls back to legacy singleton)."""
        if organization is not None:
            org_id = getattr(organization, "id", organization)
            settings = cls.objects.filter(organization_id=org_id).order_by("id").first()
            created = False
            if settings is None:
                settings = cls.objects.create(
                    organization_id=org_id,
                    business_name="Quake",
                )
                created = True
        else:
            settings, created = cls.objects.get_or_create(
                pk="00000000-0000-0000-0000-000000000001"
            )
        if created or not settings.available_discounts:
            settings.available_discounts = [
                {"type": "PERCENTAGE", "value": 5, "label": "5% Off"},
                {"type": "PERCENTAGE", "value": 10, "label": "10% Off"},
                {"type": "PERCENTAGE", "value": 15, "label": "15% Off"},
                {"type": "FLAT", "value": 100, "label": "₹100 Off"},
                {"type": "FLAT", "value": 500, "label": "₹500 Off"},
            ]
            settings.save()
        return settings


class Invoice(models.Model):
    """
    Represents an immutable invoice for a completed sale.
    
    IMMUTABILITY RULES:
    - Cannot be updated after creation
    - Cannot be deleted
    - Corrections require new sale + invoice
    
    DISCOUNT TYPES:
    - NONE: No discount applied
    - PERCENTAGE: Percentage off subtotal (0-100%)
    - FLAT: Fixed amount off subtotal
    """
    
    class DiscountType(models.TextChoices):
        NONE = 'NONE', 'No Discount'
        PERCENTAGE = 'PERCENTAGE', 'Percentage Discount'
        FLAT = 'FLAT', 'Flat Discount'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Sequential invoice number (e.g., Quake/INV/2026/0001)"
    )
    sale = models.OneToOneField(
        Sale,
        on_delete=models.PROTECT,
        related_name='invoice'
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='invoices'
    )
    
    # Amount fields (all snapshotted)
    subtotal_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Sum of all line items (before discount)"
    )
    
    # Discount fields
    discount_type = models.CharField(
        max_length=20,
        choices=DiscountType.choices,
        default=DiscountType.NONE
    )
    discount_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Discount percentage (0-100) or flat amount"
    )
    discount_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Calculated discount amount"
    )
    
    # Phase 14: GST total
    gst_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Total GST amount (sum of all line GST)"
    )
    
    # Final total
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Final payable amount (subtotal - discount + GST)"
    )
    
    # Billing information
    billing_name = models.CharField(max_length=200)
    billing_phone = models.CharField(max_length=20, blank=True)
    billing_gstin = models.CharField(max_length=20, blank=True, help_text="Customer GSTIN (optional)")
    
    # Metadata
    invoice_date = models.DateField(auto_now_add=True)
    pdf_url = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Invoice'
        verbose_name_plural = 'Invoices'
        indexes = [
            models.Index(fields=['invoice_number']),
            models.Index(fields=['invoice_date']),
        ]

    def __str__(self):
        return f"{self.invoice_number} - ₹{self.total_amount}"

    def save(self, *args, **kwargs):
        """Prevent updates on existing invoices."""
        if self.pk:
            existing = Invoice.objects.filter(pk=self.pk).exists()
            if existing:
                raise ValueError(
                    "Invoice records cannot be modified. "
                    "Create a new sale and invoice if correction is needed."
                )
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Prevent deletion of invoices."""
        raise ValueError(
            "Invoice records cannot be deleted. "
            "They are permanent financial records."
        )


class InvoiceItem(models.Model):
    """
    Represents a line item in an invoice.
    All data is SNAPSHOTTED - no dynamic references.
    
    PHASE 14: GST COMPLIANCE
    - gst_percentage: GST rate snapshotted from SaleItem
    - gst_amount: GST amount snapshotted from SaleItem
    - taxable_amount: Amount after pro-rata discount, before GST
    - line_total_with_gst: Final line amount including GST
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.PROTECT,
        related_name='items'
    )
    
    # Snapshotted product data (NO FK to Product/Variant)
    product_name = models.CharField(max_length=300)
    sku = models.CharField(max_length=100, blank=True, help_text="Product SKU snapshot")
    variant_details = models.CharField(
        max_length=100,
        blank=True,
        help_text="Size/color snapshot (e.g., 'M / Blue')"
    )
    
    # Line item details
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Unit price at time of sale (exclusive of GST)"
    )
    line_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="quantity × unit_price (before discount/GST)"
    )
    
    # Phase 14: GST Compliance fields
    taxable_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Amount after pro-rata discount, before GST"
    )
    gst_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="GST percentage at time of sale (snapshotted)"
    )
    gst_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="GST amount for this line (snapshotted)"
    )
    line_total_with_gst = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Final line amount including GST"
    )

    class Meta:
        ordering = ['id']
        verbose_name = 'Invoice Item'
        verbose_name_plural = 'Invoice Items'

    def __str__(self):
        return f"{self.invoice.invoice_number} - {self.product_name} × {self.quantity}"

    def save(self, *args, **kwargs):
        """Calculate line total and prevent updates."""
        if self.pk:
            existing = InvoiceItem.objects.filter(pk=self.pk).exists()
            if existing:
                raise ValueError("InvoiceItem records cannot be modified.")
        
        # Calculate line total (before discount/GST)
        self.line_total = self.quantity * self.unit_price
        
        # If taxable_amount not set, default to line_total
        if self.taxable_amount == Decimal('0.00'):
            self.taxable_amount = self.line_total
        
        # If line_total_with_gst not set, calculate it
        if self.line_total_with_gst == Decimal('0.00'):
            self.line_total_with_gst = self.taxable_amount + self.gst_amount
        
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Prevent deletion of invoice items."""
        raise ValueError("InvoiceItem records cannot be deleted.")

