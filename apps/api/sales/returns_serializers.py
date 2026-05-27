"""
Returns Serializers for Quake Inventory System.

PHASE 15: RETURNS, REFUNDS & ADJUSTMENTS
"""

from rest_framework import serializers
from decimal import Decimal

from sales.models import Return, ReturnItem


class ReturnItemSerializer(serializers.ModelSerializer):
    """Serializer for ReturnItem (read-only)."""
    
    product_name = serializers.CharField(
        source='sale_item.product.name',
        read_only=True
    )
    sale_item_id = serializers.UUIDField(source='sale_item.id', read_only=True)
    
    class Meta:
        model = ReturnItem
        fields = [
            'id', 'sale_item_id', 'product_name',
            'quantity', 'line_refund', 'gst_refund'
        ]
        read_only_fields = fields


class ReturnSerializer(serializers.ModelSerializer):
    """Serializer for Return (read-only)."""
    
    items = ReturnItemSerializer(many=True, read_only=True)
    original_invoice_number = serializers.CharField(
        source='original_sale.invoice_number',
        read_only=True
    )
    warehouse_name = serializers.CharField(
        source='warehouse.name',
        read_only=True
    )
    created_by_username = serializers.CharField(
        source='created_by.username',
        read_only=True
    )
    
    class Meta:
        model = Return
        fields = [
            'id', 'original_sale', 'original_invoice_number',
            'warehouse', 'warehouse_name',
            'reason', 'refund_subtotal', 'refund_gst', 'refund_amount',
            'status', 'created_by', 'created_by_username', 'created_at',
            'items'
        ]
        read_only_fields = fields


class ReturnListSerializer(serializers.ModelSerializer):
    """Compact serializer for return list."""
    
    original_invoice_number = serializers.CharField(
        source='original_sale.invoice_number',
        read_only=True
    )
    
    class Meta:
        model = Return
        fields = [
            'id', 'original_invoice_number', 'refund_amount',
            'reason', 'status', 'created_at'
        ]
        read_only_fields = fields


class ReturnItemInputSerializer(serializers.Serializer):
    """Input serializer for return item."""
    
    sale_item_id = serializers.UUIDField(
        required=True,
        help_text="UUID of the sale item to return"
    )
    quantity = serializers.IntegerField(
        min_value=1,
        required=True,
        help_text="Quantity to return"
    )


class CreateReturnSerializer(serializers.Serializer):
    """Serializer for creating a return."""
    
    sale_id = serializers.UUIDField(
        required=True,
        help_text="UUID of the original sale"
    )
    warehouse_id = serializers.UUIDField(
        required=True,
        help_text="UUID of the warehouse"
    )
    items = ReturnItemInputSerializer(
        many=True,
        required=True,
        help_text="List of items to return"
    )
    reason = serializers.CharField(
        required=True,
        min_length=5,
        max_length=500,
        help_text="Reason for return"
    )
    
    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required")
        return value


class CreateReturnResponseSerializer(serializers.Serializer):
    """Response serializer for return creation."""
    
    success = serializers.BooleanField()
    return_id = serializers.CharField()
    refund_subtotal = serializers.CharField()
    refund_gst = serializers.CharField()
    refund_amount = serializers.CharField()
    message = serializers.CharField()


class StockAdjustmentSerializer(serializers.Serializer):
    """Serializer for creating a stock adjustment."""
    
    product_id = serializers.UUIDField(
        required=True,
        help_text="UUID of the product"
    )
    warehouse_id = serializers.UUIDField(
        required=True,
        help_text="UUID of the warehouse"
    )
    quantity = serializers.IntegerField(
        required=True,
        help_text="Adjustment amount (positive or negative, but not zero)"
    )
    reason = serializers.CharField(
        required=True,
        min_length=5,
        max_length=500,
        help_text="Reason for adjustment"
    )
    
    def validate_quantity(self, value):
        if value == 0:
            raise serializers.ValidationError("Quantity cannot be zero")
        return value


class StockAdjustmentResponseSerializer(serializers.Serializer):
    """Response serializer for stock adjustment."""
    
    success = serializers.BooleanField()
    movement_id = serializers.CharField()
    product_name = serializers.CharField()
    warehouse_name = serializers.CharField()
    quantity = serializers.IntegerField()
    new_stock = serializers.IntegerField()
    message = serializers.CharField()
