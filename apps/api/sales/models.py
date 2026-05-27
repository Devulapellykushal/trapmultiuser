"""
Sales Models for Quake Inventory System.
Implements POS-grade sales with immutable financial events.

PHASE 13: POS ENGINE (LEDGER-BACKED)
=====================================

PHASE 13.1: POS ACCOUNTING HARDENING
=====================================
- Sale lifecycle states (COMPLETED, CANCELLED, REFUNDED)
- GST breakdown per line item
- Explicit discount + tax calculation order
- Immutable financial records

CALCULATION ORDER (LOCKED):
1. subtotal = sum(line_totals)
2. discount_amount = apply discount on subtotal
3. discounted_subtotal = subtotal - discount_amount
4. GST calculated on discounted amounts
5. final_total = discounted_subtotal + total_gst

CORE PRINCIPLES:
- Sale is an atomic financial transaction
- Either everything happens — or nothing does
- Stock is derived from inventory ledger (never mutated directly)
- Prices and GST are snapshotted at time of sale
- Sales are IMMUTABLE - corrections are new records
- Invoice numbers are sequential and immutable

MODELS:
- Sale (Invoice Header): Customer, warehouse, discount, GST, totals
- SaleItem (Line Items): Product, quantity, price, GST per line
- Payment: Multi-payment support (CASH, CARD, UPI)
- InvoiceSequence (legacy): superseded by invoices.InvoiceSequence.get_next_sale_invoice_number()
"""

import uuid
from django.db import models, transaction
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal

from inventory.models import Warehouse, Product


# =============================================================================
# INVOICE SEQUENCE (CONCURRENCY-SAFE)
# =============================================================================

class InvoiceSequence(models.Model):
    """
    Legacy POS sale invoice counter (pre-unification).

    Deprecated: new sales use ``invoices.models.InvoiceSequence.get_next_sale_invoice_number()``.
    Table retained for migrations and historical rows; do not register new writers here.
    """
    year = models.PositiveIntegerField(unique=True, primary_key=True)
    last_number = models.PositiveIntegerField(default=0)
    
    class Meta:
        verbose_name = 'Invoice Sequence'
        verbose_name_plural = 'Invoice Sequences'
    
    def __str__(self):
        return f"InvoiceSequence({self.year}: {self.last_number})"
    
    @classmethod
    def get_next_invoice_number(cls):
        """
        Generate the next invoice number atomically.
        
        Uses SELECT FOR UPDATE to prevent race conditions.
        Must be called within a transaction.
        
        Returns:
            str: Invoice number in format INV-YYYY-NNNNNN
        """
        import datetime
        current_year = datetime.datetime.now().year
        
        with transaction.atomic():
            # Get or create sequence for current year with row lock
            sequence, created = cls.objects.select_for_update().get_or_create(
                year=current_year,
                defaults={'last_number': 0}
            )
            
            # Increment and save
            sequence.last_number += 1
            sequence.save()
            
            # Format: INV-YYYY-NNNNNN
            return f"INV-{current_year}-{sequence.last_number:06d}"


# =============================================================================
# SALE MODEL (INVOICE HEADER)
# =============================================================================

class Sale(models.Model):
    """
    Represents a completed sale transaction (Invoice Header).
    
    PHASE 13 RULES:
    - Sale is atomic: either everything happens or nothing
    - Invoice numbers are sequential and immutable
    - Prices are snapshotted at time of sale
    - Discounts apply to subtotal, not individual items
    - Payments must sum to total exactly
    
    IMMUTABILITY:
    - Cannot be updated after creation (except status transitions)
    - Cannot be deleted
    - Corrections via returns workflow (future phase)
    
    IDEMPOTENCY:
    - Each checkout must have a unique idempotency_key
    - Duplicate key returns existing sale (no double processing)
    """
    
    class DiscountType(models.TextChoices):
        PERCENT = 'PERCENT', 'Percent'
        FLAT = 'FLAT', 'Flat'
    
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'
        CANCELLED = 'CANCELLED', 'Cancelled'
        REFUNDED = 'REFUNDED', 'Refunded'  # Phase 13.1

    # Primary key
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Idempotency for duplicate prevention
    idempotency_key = models.UUIDField(
        unique=True,
        db_index=True,
        default=uuid.uuid4,
        help_text="Client-provided key to prevent duplicate checkouts"
    )
    
    # Invoice number (sequential, immutable)
    invoice_number = models.CharField(
        max_length=50,
        unique=True,
        help_text="Sequential invoice number: INV-YYYY-NNNNNN"
    )
    
    # Warehouse (required for stock validation)
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='sales'
    )
    
    # Customer info (optional)
    customer_name = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Optional customer name"
    )
    
    customer_mobile = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text="Customer mobile number for marketing"
    )
    
    customer_email = models.EmailField(
        blank=True,
        default='',
        help_text="Customer email for marketing"
    )
    
    customer_address = models.TextField(
        blank=True,
        default='',
        help_text="Customer address for delivery/billing"
    )

    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales',
        help_text="Optional linked customer record (POS / CRM)",
    )
    
    # Financials
    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Sum of all line totals before discount"
    )
    
    discount_type = models.CharField(
        max_length=10,
        choices=DiscountType.choices,
        null=True,
        blank=True,
        help_text="PERCENT or FLAT"
    )
    
    discount_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Discount amount or percentage"
    )
    
    total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Final total after discount and GST"
    )
    
    # Phase 13.1: GST totals
    total_gst = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Total GST amount for the sale (sum of all line GST)"
    )
    
    total_items = models.PositiveIntegerField(
        default=0,
        help_text="Total quantity of items sold"
    )
    
    # Status lifecycle
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )
    
    failure_reason = models.TextField(
        blank=True,
        null=True,
        help_text="Reason for FAILED status"
    )
    
    # Audit
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sales_created',
        help_text="User who created the sale"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Credit tracking (for pay-later sales)
    is_credit_sale = models.BooleanField(
        default=False,
        help_text="Whether this sale includes a credit/pay-later component"
    )
    credit_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Original credit amount (pay later portion)"
    )
    credit_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Remaining balance due from customer"
    )
    
    class CreditStatus(models.TextChoices):
        NONE = 'NONE', 'No Credit'
        PENDING = 'PENDING', 'Pending'
        PARTIAL = 'PARTIAL', 'Partially Paid'
        PAID = 'PAID', 'Fully Paid'
    
    credit_status = models.CharField(
        max_length=10,
        choices=CreditStatus.choices,
        default=CreditStatus.NONE,
        help_text="Current status of credit payment"
    )

    class PaymentStatus(models.TextChoices):
        UNPAID = 'UNPAID', 'Unpaid'
        PARTIAL = 'PARTIAL', 'Partially paid'
        PAID = 'PAID', 'Paid'

    payment_status = models.CharField(
        max_length=12,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PAID,
        help_text="Cash vs credit settlement snapshot at checkout (updated on collections)",
    )
    paid_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Non-CREDIT payments received at checkout (counter money)",
    )
    due_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Opening balance owed after checkout (mirrors initial credit_balance when on account)",
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Sale'
        verbose_name_plural = 'Sales'
        indexes = [
            models.Index(fields=['invoice_number']),
            models.Index(fields=['created_at']),
            models.Index(fields=['status']),
            models.Index(fields=['idempotency_key']),
            models.Index(fields=['warehouse', 'created_at']),
            models.Index(fields=['is_credit_sale', 'credit_status']),
        ]

    def __str__(self):
        return f"{self.invoice_number} - ₹{self.total} ({self.status})"

    def save(self, *args, **kwargs):
        """
        Control save behavior based on status transitions.
        
        ALLOWED:
        - New record creation
        - PENDING → COMPLETED transition
        - PENDING → FAILED transition
        - Credit field updates (credit_balance, credit_status) on COMPLETED sales
        
        NOT ALLOWED:
        - Any other modification on existing records
        """
        if self.pk:
            try:
                existing = Sale.objects.get(pk=self.pk)
                
                # Allow credit field updates on COMPLETED sales
                # Check if update_fields is specified and only includes credit fields
                update_fields = kwargs.get('update_fields')
                if update_fields and existing.status == self.Status.COMPLETED:
                    allowed_credit_fields = {
                        'credit_balance', 'credit_status',
                        'paid_amount', 'due_amount', 'payment_status',
                    }
                    if set(update_fields).issubset(allowed_credit_fields):
                        # Allow this credit payment update
                        super().save(*args, **kwargs)
                        return
                
                # Allow credit field updates without update_fields if only credit fields changed
                if existing.status == self.Status.COMPLETED and self.status == self.Status.COMPLETED:
                    # Check if only credit-related fields are being updated
                    post_completion_changed = (
                        existing.credit_balance != self.credit_balance or
                        existing.credit_status != self.credit_status or
                        existing.paid_amount != self.paid_amount or
                        existing.due_amount != self.due_amount or
                        existing.payment_status != self.payment_status
                    )
                    # Ensure no other fields are being modified
                    other_fields_same = (
                        existing.status == self.status and
                        existing.total == self.total and
                        existing.subtotal == self.subtotal and
                        existing.discount_amount == self.discount_amount and
                        existing.invoice_number == self.invoice_number and
                        existing.is_credit_sale == self.is_credit_sale and
                        existing.credit_amount == self.credit_amount
                    )
                    if post_completion_changed and other_fields_same:
                        # Allow this credit payment update
                        super().save(*args, **kwargs)
                        return
                
                # Only allow status transitions from PENDING
                if existing.status == self.Status.PENDING:
                    if self.status in [self.Status.COMPLETED, self.Status.FAILED]:
                        # Allow this specific transition
                        super().save(*args, **kwargs)
                        return
                
                raise ValueError(
                    f"Sale records cannot be modified. "
                    f"Current status: {existing.status}"
                )
            except Sale.DoesNotExist:
                pass
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Prevent deletion of sales."""
        raise ValueError("Sale records cannot be deleted. Use cancellation or return workflow.")
    
    def mark_completed(self):
        """Transition sale to COMPLETED status."""
        if self.status != self.Status.PENDING:
            raise ValueError(f"Cannot complete sale: current status is {self.status}")
        self.status = self.Status.COMPLETED
        self.save()
    
    def mark_failed(self, reason: str = ""):
        """Transition sale to FAILED status."""
        if self.status != self.Status.PENDING:
            raise ValueError(f"Cannot fail sale: current status is {self.status}")
        self.status = self.Status.FAILED
        self.failure_reason = reason
        self.save()
    
    @property
    def discount_amount(self):
        """Calculate the actual discount amount."""
        if not self.discount_type or self.discount_value == 0:
            return Decimal('0.00')
        
        if self.discount_type == self.DiscountType.PERCENT:
            return (self.subtotal * self.discount_value / 100).quantize(Decimal('0.01'))
        else:  # FLAT
            return min(self.discount_value, self.subtotal)
    
    @property
    def payments_total(self):
        """Sum of all payments for this sale."""
        return self.payments.aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0.00')
    
    @property
    def is_fully_paid(self):
        """Check if payments equal total."""
        return self.payments_total == self.total


# =============================================================================
# SALE ITEM MODEL (LINE ITEMS)
# =============================================================================

class SaleItem(models.Model):
    """
    Represents a line item in a sale.
    
    PHASE 13 CHANGES:
    - Uses Product (not ProductVariant) to match inventory ledger
    - selling_price is snapshotted at time of sale
    - line_total is auto-calculated
    
    PHASE 13.1: GST BREAKDOWN
    - gst_percentage: GST rate locked at sale time
    - gst_amount: GST calculated on discounted line amount
    - line_total_with_gst: Final line total including GST
    
    IMMUTABILITY:
    - Cannot be modified after creation
    - Cannot be deleted
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    sale = models.ForeignKey(
        Sale,
        on_delete=models.PROTECT,
        related_name='items'
    )
    
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='sale_items',
        help_text="Product sold (Phase 13: product-level, not variant)"
    )
    
    # Supplier tracking for sales analytics
    # Snapshotted from product.supplier at time of sale
    supplier = models.ForeignKey(
        'inventory.Supplier',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sale_items',
        help_text="Supplier of this product (snapshotted at sale time)"
    )
    
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Quantity sold"
    )
    
    selling_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text="Price at time of sale (snapshotted, exclusive of GST)"
    )
    
    line_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="quantity × selling_price (before GST)"
    )
    
    # Phase 13.1: GST breakdown per line item
    gst_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        help_text="GST percentage applied (0-100, locked at sale time)"
    )
    
    gst_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="GST amount: calculated on discounted line amount"
    )

    purchase_price_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Unit cost (from pricing) at sale time for margin reporting",
    )
    cgst_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="CGST component (intra-state split of gst_amount)",
    )
    sgst_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="SGST component (intra-state; sgst = gst_amount - cgst_amount)",
    )
    
    line_total_with_gst = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Final line total including GST"
    )

    class Meta:
        ordering = ['id']
        verbose_name = 'Sale Item'
        verbose_name_plural = 'Sale Items'
        indexes = [
            models.Index(fields=['supplier']),  # For supplier sales reports
        ]

    def __str__(self):
        return f"{self.sale.invoice_number} - {self.product.sku} × {self.quantity}"

    def save(self, *args, **kwargs):
        """Calculate line total, snapshot supplier, and prevent updates."""
        if self.pk:
            existing = SaleItem.objects.filter(pk=self.pk).exists()
            if existing:
                raise ValueError("SaleItem records cannot be modified.")
        
        # Snapshot supplier from product at time of sale
        if not self.supplier_id and self.product_id:
            self.supplier_id = self.product.supplier_id
        
        # Calculate line total (before GST)
        self.line_total = self.quantity * self.selling_price
        
        # line_total_with_gst is set by the service layer after discount calculation
        # If not set, default to line_total + gst_amount
        if self.line_total_with_gst == Decimal('0.00') and self.gst_amount > 0:
            self.line_total_with_gst = self.line_total + self.gst_amount
        
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Prevent deletion of sale items."""
        raise ValueError("SaleItem records cannot be deleted.")


# =============================================================================
# PAYMENT MODEL (MULTI-PAYMENT SUPPORT)
# =============================================================================

class Payment(models.Model):
    """
    Represents a payment for a sale.
    
    PHASE 13 RULES:
    - A sale can have multiple payments
    - Sum of payments MUST equal sale total
    - Payments are immutable after creation
    
    SUPPORTED METHODS:
    - CASH
    - CARD
    - UPI
    """
    
    class PaymentMethod(models.TextChoices):
        CASH = 'CASH', 'Cash'
        CARD = 'CARD', 'Card'
        UPI = 'UPI', 'UPI'
        CREDIT = 'CREDIT', 'Credit (Pay Later)'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name='payments'
    )
    
    method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices
    )
    
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text="Payment amount"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Payment'
        verbose_name_plural = 'Payments'

    def __str__(self):
        return f"{self.sale.invoice_number} - {self.method}: ₹{self.amount}"
    
    def save(self, *args, **kwargs):
        """Prevent updates to payments."""
        if self.pk:
            existing = Payment.objects.filter(pk=self.pk).exists()
            if existing:
                raise ValueError("Payment records cannot be modified.")
        super().save(*args, **kwargs)
    
    def delete(self, *args, **kwargs):
        """Prevent deletion of payments."""
        raise ValueError("Payment records cannot be deleted.")


# =============================================================================
# CREDIT PAYMENT TRACKING (FOR PAY-LATER SALES)
# =============================================================================

class CreditPayment(models.Model):
    """
    Tracks payments received against a credit sale (pay-later).
    
    When a customer pays part or all of their credit balance, a CreditPayment
    record is created. This automatically updates the Sale's credit_balance
    and credit_status.
    
    RULES:
    - Can only be added to sales with is_credit_sale=True
    - Payment amount cannot exceed credit_balance
    - Updates Sale.credit_balance and Sale.credit_status on save
    - Immutable after creation
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    sale = models.ForeignKey(
        Sale,
        on_delete=models.PROTECT,
        related_name='credit_payments',
        help_text="The credit sale this payment is against"
    )
    
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text="Amount paid towards credit balance"
    )
    
    method = models.CharField(
        max_length=20,
        choices=Payment.PaymentMethod.choices,
        help_text="Payment method used"
    )
    
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='credit_payments_received',
        help_text="User who received this payment"
    )
    
    notes = models.TextField(
        blank=True,
        default='',
        help_text="Optional notes about this payment"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Credit Payment'
        verbose_name_plural = 'Credit Payments'

    def __str__(self):
        return f"{self.sale.invoice_number} - Credit: ₹{self.amount} ({self.method})"
    
    def save(self, *args, **kwargs):
        """
        Validate and save credit payment, updating sale credit balance.
        """
        # Prevent updates
        if self.pk:
            existing = CreditPayment.objects.filter(pk=self.pk).exists()
            if existing:
                raise ValueError("Credit payment records cannot be modified.")
        
        # Validate sale is credit sale
        if not self.sale.is_credit_sale:
            raise ValueError("Can only add credit payments to credit sales.")
        
        # Validate payment doesn't exceed balance
        if self.amount > self.sale.credit_balance:
            raise ValueError(
                f"Payment amount (₹{self.amount}) exceeds credit balance (₹{self.sale.credit_balance})."
            )
        
        with transaction.atomic():
            # Save the payment
            super().save(*args, **kwargs)
            
            # Update sale credit balance
            new_balance = self.sale.credit_balance - self.amount
            new_paid = self.sale.paid_amount + self.amount
            self.sale.credit_balance = new_balance
            self.sale.paid_amount = new_paid
            self.sale.due_amount = new_balance
            
            # Update credit status
            if new_balance <= Decimal('0.00'):
                self.sale.credit_status = Sale.CreditStatus.PAID
                self.sale.payment_status = Sale.PaymentStatus.PAID
            else:
                self.sale.credit_status = Sale.CreditStatus.PARTIAL
                if new_paid > Decimal('0.00'):
                    self.sale.payment_status = Sale.PaymentStatus.PARTIAL
                else:
                    self.sale.payment_status = Sale.PaymentStatus.UNPAID
            
            self.sale.save(
                update_fields=[
                    'credit_balance', 'credit_status',
                    'paid_amount', 'due_amount', 'payment_status',
                ]
            )
    
    def delete(self, *args, **kwargs):
        """Prevent deletion of credit payments."""
        raise ValueError("Credit payment records cannot be deleted.")


# =============================================================================
# PHASE 15: RETURNS (LEDGER-SAFE)
# =============================================================================

class Return(models.Model):
    """
    Represents a return/refund for a completed sale.
    
    PHASE 15 RULES:
    - Returns are additive records (never edit originals)
    - Refund amounts derived from stored sale data
    - Creates RETURN movements in inventory ledger
    - Multiple partial returns per sale allowed
    - Return quantity cannot exceed original sale quantity
    
    IMMUTABILITY:
    - Cannot be updated after creation
    - Cannot be deleted
    """
    
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Link to original sale (protected - cannot delete sale with returns)
    original_sale = models.ForeignKey(
        Sale,
        on_delete=models.PROTECT,
        related_name='returns'
    )
    
    # Warehouse for inventory movements
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='returns'
    )
    
    # Return details
    reason = models.TextField(help_text="Reason for return")
    
    # Refund amounts (derived from sale, not recalculated)
    refund_subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Refund subtotal (before GST)"
    )
    refund_gst = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Refund GST amount"
    )
    refund_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Total refund amount (subtotal + GST)"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.COMPLETED
    )
    
    # Audit fields
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='returns_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Return'
        verbose_name_plural = 'Returns'
        indexes = [
            models.Index(fields=['original_sale']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"Return for {self.original_sale.invoice_number} - ₹{self.refund_amount}"

    def save(self, *args, **kwargs):
        """Prevent updates to returns."""
        if self.pk:
            existing = Return.objects.filter(pk=self.pk).exists()
            if existing:
                raise ValueError(
                    "Return records cannot be modified after creation."
                )
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Prevent deletion of returns."""
        raise ValueError(
            "Return records cannot be deleted. "
            "They are permanent audit records."
        )


class ReturnItem(models.Model):
    """
    Represents a line item in a return.
    
    PHASE 15 RULES:
    - Links to original SaleItem
    - Refund derived from sale item prices
    - Quantity cannot exceed remaining returnable quantity
    - Creates RETURN inventory movement
    
    IMMUTABILITY:
    - Cannot be updated after creation
    - Cannot be deleted
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Link to return header
    return_record = models.ForeignKey(
        Return,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    # Link to original sale item (for price snapshot)
    sale_item = models.ForeignKey(
        SaleItem,
        on_delete=models.PROTECT,
        related_name='return_items'
    )
    
    # Returned quantity
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Quantity being returned"
    )
    
    # Refund amounts (derived from sale item)
    line_refund = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Line refund (based on original price)"
    )
    gst_refund = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="GST refund for this line"
    )

    class Meta:
        ordering = ['id']
        verbose_name = 'Return Item'
        verbose_name_plural = 'Return Items'

    def __str__(self):
        return f"{self.return_record} - {self.sale_item.product.name} × {self.quantity}"

    def save(self, *args, **kwargs):
        """Prevent updates to return items."""
        if self.pk:
            existing = ReturnItem.objects.filter(pk=self.pk).exists()
            if existing:
                raise ValueError("ReturnItem records cannot be modified.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Prevent deletion of return items."""
        raise ValueError("ReturnItem records cannot be deleted.")
