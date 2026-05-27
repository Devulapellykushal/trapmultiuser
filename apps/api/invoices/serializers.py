"""
Invoice Serializers for Quake Inventory System.

PHASE 14: INVOICE PDFs & COMPLIANCE
====================================
- GST breakdown per line item
- Invoice snapshot from Sale data
- Immutable after creation
"""

from decimal import Decimal
from rest_framework import serializers
from .models import Invoice, InvoiceItem, BusinessSettings


class InvoiceItemSerializer(serializers.ModelSerializer):
    """
    Serializer for InvoiceItem (read-only).
    
    PHASE 14: Includes GST breakdown fields.
    """
    
    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'product_name', 'sku', 'variant_details',
            'quantity', 'unit_price', 'line_total',
            'taxable_amount', 'gst_percentage', 'gst_amount', 'line_total_with_gst'
        ]
        read_only_fields = fields


class InvoiceSerializer(serializers.ModelSerializer):
    """
    Serializer for Invoice (read-only).
    
    PHASE 14: Includes GST total and full breakdown.
    """
    
    items = InvoiceItemSerializer(many=True, read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    warehouse_address = serializers.CharField(source='warehouse.address', read_only=True)
    warehouse_email = serializers.CharField(source='warehouse.email', read_only=True)
    warehouse_phone = serializers.CharField(source='warehouse.phone', read_only=True)
    warehouse_seller_image_url = serializers.SerializerMethodField()
    warehouse_bank_name = serializers.CharField(source='warehouse.bank_name', read_only=True)
    warehouse_bank_account_number = serializers.CharField(
        source='warehouse.bank_account_number', read_only=True
    )
    warehouse_bank_ifsc = serializers.CharField(source='warehouse.bank_ifsc', read_only=True)
    sale_invoice_number = serializers.CharField(source='sale.invoice_number', read_only=True)
    sale_status = serializers.CharField(source='sale.status', read_only=True)
    sale_payment_status = serializers.CharField(source='sale.payment_status', read_only=True)
    sale_is_credit_sale = serializers.BooleanField(source='sale.is_credit_sale', read_only=True)
    sale_due_amount = serializers.DecimalField(
        source='sale.due_amount', max_digits=12, decimal_places=2, read_only=True, coerce_to_string=True
    )
    sale_created_at = serializers.DateTimeField(source='sale.created_at', read_only=True)
    sale_created_by = serializers.SerializerMethodField()
    sale_payments = serializers.SerializerMethodField()
    sale_customer_email = serializers.CharField(source='sale.customer_email', read_only=True)
    sale_customer_address = serializers.CharField(source='sale.customer_address', read_only=True)
    
    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'sale', 'sale_invoice_number',
            'warehouse', 'warehouse_name', 'warehouse_address',
            'warehouse_email', 'warehouse_phone', 'warehouse_seller_image_url',
            'warehouse_bank_name', 'warehouse_bank_account_number', 'warehouse_bank_ifsc',
            'subtotal_amount', 'discount_type', 'discount_value',
            'discount_amount', 'gst_total', 'total_amount',
            'billing_name', 'billing_phone', 'billing_gstin',
            'sale_customer_email', 'sale_customer_address',
            'invoice_date', 'pdf_url', 'created_at', 'items',
            'sale_status', 'sale_payment_status', 'sale_is_credit_sale', 'sale_due_amount',
            'sale_created_at',
            'sale_created_by', 'sale_payments'
        ]
        read_only_fields = fields
    
    def get_warehouse_seller_image_url(self, obj):
        wh = obj.warehouse
        if not wh or not getattr(wh, 'seller_image', None):
            return None
        try:
            url = wh.seller_image.url
        except ValueError:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_sale_created_by(self, obj):
        if obj.sale and obj.sale.created_by:
            return {
                'id': str(obj.sale.created_by.id),
                'username': obj.sale.created_by.username,
                'name': obj.sale.created_by.get_full_name() or obj.sale.created_by.username,
            }
        return None
    
    def get_sale_payments(self, obj):
        if obj.sale:
            return [
                {'method': p.method, 'amount': str(p.amount)}
                for p in obj.sale.payments.all()
            ]
        return []


class InvoiceListSerializer(serializers.ModelSerializer):
    """Compact serializer for invoice list with payment info."""

    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)

    sale_invoice_number = serializers.CharField(source='sale.invoice_number', read_only=True)
    sale_id = serializers.UUIDField(read_only=True)
    sale_status = serializers.CharField(source='sale.status', read_only=True)
    sale_payment_status = serializers.CharField(source='sale.payment_status', read_only=True)
    sale_is_credit_sale = serializers.BooleanField(source='sale.is_credit_sale', read_only=True)
    sale_due_amount = serializers.DecimalField(
        source='sale.due_amount', max_digits=12, decimal_places=2, read_only=True, coerce_to_string=True
    )
    sale_created_at = serializers.DateTimeField(source='sale.created_at', read_only=True)
    sale_payments = serializers.SerializerMethodField()
    sale_created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'sale_id', 'sale_invoice_number',
            'warehouse_name',
            'total_amount', 'subtotal_amount', 'gst_total', 'discount_type', 'discount_amount',
            'billing_name', 'billing_phone', 'invoice_date', 'created_at',
            'sale_status', 'sale_payment_status', 'sale_is_credit_sale', 'sale_due_amount',
            'sale_created_at',
            'sale_payments', 'sale_created_by_name'
        ]
        read_only_fields = fields
    
    def get_sale_payments(self, obj):
        """Get payment methods from the associated sale."""
        if obj.sale:
            return [
                {'method': p.method, 'amount': str(p.amount)}
                for p in obj.sale.payments.all()
            ]
        return []
    
    def get_sale_created_by_name(self, obj):
        """Get the cashier name from the sale."""
        if obj.sale and obj.sale.created_by:
            return obj.sale.created_by.get_full_name() or obj.sale.created_by.username
        return 'Admin'


class GenerateInvoiceSerializer(serializers.Serializer):
    """
    Serializer for invoice generation request.
    
    PHASE 14: Simplified - discount comes from Sale, not invoice generation.
    """
    
    sale_id = serializers.UUIDField(
        required=True,
        help_text="UUID of the completed sale"
    )
    billing_name = serializers.CharField(
        max_length=200,
        required=False,
        allow_blank=True,
        help_text="Customer name for invoice (defaults to sale.customer_name)"
    )
    billing_phone = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True,
        help_text="Customer phone number"
    )
    billing_gstin = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True,
        help_text="Customer GSTIN (optional)"
    )


class GenerateInvoiceResponseSerializer(serializers.Serializer):
    """Serializer for invoice generation response."""
    
    success = serializers.BooleanField()
    invoice_id = serializers.CharField()
    invoice_number = serializers.CharField()
    sale_invoice_number = serializers.CharField()
    subtotal_amount = serializers.CharField()
    discount_type = serializers.CharField()
    discount_value = serializers.CharField(allow_null=True)
    discount_amount = serializers.CharField()
    gst_total = serializers.CharField()
    total_amount = serializers.CharField()
    pdf_url = serializers.CharField(allow_null=True)
    message = serializers.CharField()
    already_existed = serializers.BooleanField()


class DiscountSettingsSerializer(serializers.ModelSerializer):
    """
    Serializer for discount configuration settings.
    Used by admin to configure available discounts.
    """
    
    class Meta:
        model = BusinessSettings
        fields = [
            'discount_enabled',
            'staff_max_discount_percent',
            'admin_max_discount_percent',
            'available_discounts',
        ]
    
    def validate_available_discounts(self, value):
        """Validate the discount presets structure."""
        if not isinstance(value, list):
            raise serializers.ValidationError("available_discounts must be a list")
        
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Each discount must be an object")
            
            if 'type' not in item or item['type'] not in ['PERCENTAGE', 'FLAT']:
                raise serializers.ValidationError(
                    "Each discount must have 'type' as 'PERCENTAGE' or 'FLAT'"
                )
            
            if 'value' not in item or not isinstance(item['value'], (int, float)):
                raise serializers.ValidationError(
                    "Each discount must have a numeric 'value'"
                )
            
            if 'label' not in item or not isinstance(item['label'], str):
                raise serializers.ValidationError(
                    "Each discount must have a 'label' string"
                )
        
        return value


class POSDiscountOptionsSerializer(serializers.Serializer):
    """
    Serializer for POS discount options response.
    Returns available discounts based on user role.
    """
    discount_enabled = serializers.BooleanField()
    max_discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    available_discounts = serializers.ListField()
