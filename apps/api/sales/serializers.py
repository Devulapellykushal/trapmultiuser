"""
Sales Serializers for Quake Inventory System.

PHASE 13: POS ENGINE (LEDGER-BACKED)
=====================================

Serializers for:
- Sale (Invoice) with discount support
- SaleItem (line items) using Product-level resolution
- Payment (multi-payment support)
- Checkout request/response
- Barcode scanning
"""

from rest_framework import serializers
from decimal import Decimal

from .models import Sale, SaleItem, Payment, CreditPayment


# =============================================================================
# PAYMENT SERIALIZERS
# =============================================================================

class PaymentSerializer(serializers.ModelSerializer):
    """Serializer for Payment model (read-only)."""
    
    class Meta:
        model = Payment
        fields = ['id', 'method', 'amount', 'created_at']
        read_only_fields = fields


class PaymentInputSerializer(serializers.Serializer):
    """Serializer for payment input in checkout."""
    
    method = serializers.ChoiceField(choices=Payment.PaymentMethod.choices)
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal('0.01')
    )


# =============================================================================
# SALE ITEM SERIALIZERS
# =============================================================================

class SaleItemSerializer(serializers.ModelSerializer):
    """Serializer for SaleItem (read-only).
    
    Phase 17.1: Includes GST breakdown fields for invoice display.
    """
    
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_barcode = serializers.CharField(source='product.barcode_value', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    
    class Meta:
        model = SaleItem
        fields = [
            'id', 'product', 'product_sku', 'product_barcode', 'product_name',
            'quantity', 'selling_price', 'line_total',
            # Phase 17.1: GST breakdown fields
            'gst_percentage', 'gst_amount', 'line_total_with_gst',
            'purchase_price_snapshot', 'cgst_amount', 'sgst_amount',
        ]
        read_only_fields = fields


class SaleItemInputSerializer(serializers.Serializer):
    """Serializer for individual sale item input.

    Prefer barcode when present; product_id is used when barcodes are optional.
    """

    barcode = serializers.CharField(
        max_length=50, required=False, allow_blank=True, default=""
    )
    product_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    quantity = serializers.IntegerField(min_value=1, default=1)

    def validate(self, attrs):
        barcode = (attrs.get("barcode") or "").strip()
        product_id = attrs.get("product_id")
        if not barcode and not product_id:
            raise serializers.ValidationError(
                "Each item needs a barcode or product_id."
            )
        attrs["barcode"] = barcode
        return attrs


# =============================================================================
# SALE SERIALIZERS
# =============================================================================

class SaleSerializer(serializers.ModelSerializer):
    """Serializer for Sale (read-only, detailed view)."""
    
    items = SaleItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    credit_payments = serializers.SerializerMethodField()
    customer_id = serializers.SerializerMethodField()
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    store_id = serializers.SerializerMethodField()
    store_name = serializers.CharField(
        source='store.name', read_only=True, allow_null=True
    )
    store_code = serializers.CharField(
        source='store.code', read_only=True, allow_null=True
    )
    discount_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    is_fully_paid = serializers.BooleanField(read_only=True)
    created_by_username = serializers.CharField(
        source='created_by.username', read_only=True
    )
    
    class Meta:
        model = Sale
        fields = [
            'id', 'idempotency_key', 'invoice_number',
            'warehouse', 'warehouse_name', 'warehouse_code',
            'store_id', 'store_name', 'store_code',
            'customer_id',
            'customer_name', 'customer_mobile', 'customer_email', 'customer_address',
            'subtotal', 'discount_type', 'discount_value',
            'discount_amount', 'total', 'total_gst', 'total_items',
            'status', 'failure_reason', 'is_fully_paid',
            'payment_status', 'paid_amount', 'due_amount',
            'is_credit_sale', 'credit_amount', 'credit_balance', 'credit_status',
            'created_by', 'created_by_username', 'created_at',
            'items', 'payments', 'credit_payments'
        ]
        read_only_fields = fields
    
    def get_customer_id(self, obj):
        return str(obj.customer_id) if obj.customer_id else None

    def get_store_id(self, obj):
        return str(obj.store_id) if obj.store_id else None
    
    def get_credit_payments(self, obj):
        """Return credit payments for this sale."""
        if hasattr(obj, 'credit_payments'):
            return CreditPaymentSerializer(obj.credit_payments.all(), many=True).data
        return []


class SaleListSerializer(serializers.ModelSerializer):
    """Compact serializer for sale list."""
    
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    store_name = serializers.CharField(
        source='store.name', read_only=True, allow_null=True
    )
    store_code = serializers.CharField(
        source='store.code', read_only=True, allow_null=True
    )
    
    class Meta:
        model = Sale
        fields = [
            'id', 'invoice_number', 'warehouse_code',
            'store_name', 'store_code',
            'customer_name', 'customer_mobile',
            'subtotal', 'discount_type', 'discount_value', 'total',
            'total_items', 'status',
            'payment_status', 'paid_amount', 'due_amount',
            'is_credit_sale', 'credit_balance', 'credit_status', 'created_at'
        ]
        read_only_fields = fields


class CreditPaymentSerializer(serializers.ModelSerializer):
    """Serializer for CreditPayment model (read-only)."""
    
    received_by_username = serializers.CharField(source='received_by.username', read_only=True)
    
    class Meta:
        model = CreditPayment
        fields = ['id', 'amount', 'method', 'received_by', 'received_by_username', 'notes', 'created_at']
        read_only_fields = fields


class CreditPaymentInputSerializer(serializers.Serializer):
    """Serializer for recording credit payments."""
    
    sale_id = serializers.UUIDField(required=True)
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal('0.01')
    )
    method = serializers.ChoiceField(choices=Payment.PaymentMethod.choices)
    notes = serializers.CharField(required=False, default='', allow_blank=True)


class CreditSaleListSerializer(serializers.ModelSerializer):
    """Serializer for credit sales list (pending/partial payments)."""
    
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    days_pending = serializers.SerializerMethodField()
    
    class Meta:
        model = Sale
        fields = [
            'id', 'invoice_number', 'warehouse_code',
            'customer_name', 'customer_mobile', 'customer_email',
            'total', 'credit_amount', 'credit_balance', 'credit_status',
            'days_pending', 'created_at'
        ]
        read_only_fields = fields
    
    def get_days_pending(self, obj):
        """Calculate days since sale."""
        from django.utils import timezone
        delta = timezone.now() - obj.created_at
        return delta.days


# =============================================================================
# BARCODE SCAN SERIALIZERS
# =============================================================================

class BarcodeScanSerializer(serializers.Serializer):
    """Serializer for barcode scan request."""
    
    barcode = serializers.CharField(max_length=50)
    warehouse_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, default=1)


class BarcodeScanResponseSerializer(serializers.Serializer):
    """Serializer for barcode scan response."""
    
    product_id = serializers.CharField()
    barcode = serializers.CharField()
    sku = serializers.CharField()
    product_name = serializers.CharField()
    selling_price = serializers.CharField()
    available_stock = serializers.IntegerField()
    requested_quantity = serializers.IntegerField()
    can_fulfill = serializers.BooleanField()
    warehouse_id = serializers.CharField()
    warehouse_name = serializers.CharField()


# =============================================================================
# CHECKOUT SERIALIZERS
# =============================================================================

class CheckoutSerializer(serializers.Serializer):
    """
    Serializer for checkout request.
    
    PHASE 13 FEATURES:
    - Multi-payment support
    - Discount support (PERCENT or FLAT)
    - Customer name (optional)
    - Barcode-first item resolution
    
    IDEMPOTENCY:
    - idempotency_key is REQUIRED
    - Must be a valid UUID v4
    - Same key returns same sale (no duplicate processing)
    """
    
    idempotency_key = serializers.UUIDField(
        required=True,
        help_text=(
            "Client-generated UUID for idempotency. "
            "If a sale exists with this key, it will be returned instead of creating a new one."
        )
    )
    
    warehouse_id = serializers.UUIDField(required=True)

    store_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Shop counter that made this sale (attribution; stock still uses warehouse_id)",
    )
    
    items = SaleItemInputSerializer(many=True)
    
    customer_name = serializers.CharField(
        max_length=255,
        required=False,
        default='',
        allow_blank=True
    )
    
    customer_mobile = serializers.CharField(
        max_length=20,
        required=False,
        default='',
        allow_blank=True
    )
    
    customer_email = serializers.EmailField(
        required=False,
        default='',
        allow_blank=True
    )
    
    customer_address = serializers.CharField(
        required=False,
        default='',
        allow_blank=True
    )

    customer_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Optional linked Customer record (UUID)",
    )
    
    discount_type = serializers.ChoiceField(
        choices=Sale.DiscountType.choices,
        required=False,
        allow_null=True,
        default=None
    )
    
    discount_value = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal('0.00'),
        required=False,
        default=Decimal('0.00')
    )
    
    payments = PaymentInputSerializer(many=True)

    apply_automatic_gst = serializers.BooleanField(
        required=False,
        default=False,
        help_text=(
            "If true, GST is extracted from GST-inclusive line amounts (CGST/SGST). "
            "If false (default), sale lines store 0% GST; amount due is unchanged."
        ),
    )
    
    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required")
        return value
    
    def validate_payments(self, value):
        if not value:
            raise serializers.ValidationError("At least one payment is required")
        return value
    
    def validate_discount_value(self, value):
        """Validate discount value is non-negative."""
        if value < 0:
            raise serializers.ValidationError("Discount cannot be negative")
        return value
    
    def validate(self, data):
        """
        Cross-field validation.
        
        RULES:
        - If discount_type is PERCENT, discount_value must be 0-100
        - If discount_type is set, discount_value must be non-zero (optional check)
        """
        discount_type = data.get('discount_type')
        discount_value = data.get('discount_value', Decimal('0.00'))
        
        if discount_type == 'PERCENT' and discount_value > 100:
            raise serializers.ValidationError({
                'discount_value': 'Percentage discount cannot exceed 100'
            })
        
        return data


class CheckoutResponseSerializer(serializers.Serializer):
    """
    Serializer for checkout response.
    
    STATUS VALUES:
    - PENDING: Checkout in progress
    - COMPLETED: Checkout successful
    - FAILED: Checkout failed
    - CANCELLED: Voided (future)
    """
    
    success = serializers.BooleanField()
    idempotency_key = serializers.UUIDField()
    is_duplicate = serializers.BooleanField(
        help_text="True if this was an idempotent hit (existing sale returned)"
    )
    sale_id = serializers.CharField()
    invoice_number = serializers.CharField()
    subtotal = serializers.CharField()
    discount_type = serializers.CharField(allow_null=True)
    discount_value = serializers.CharField()
    discount_amount = serializers.CharField()
    total = serializers.CharField()
    total_items = serializers.IntegerField()
    status = serializers.CharField()
    message = serializers.CharField()
