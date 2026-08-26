"""
Inventory Serializers for Quake Inventory System.

HARDENING RULES:
- Price updates blocked if stock > 0
- StockLedger is read-only
- All fields properly validated
- Barcode is immutable after creation
- SKU is immutable after creation
- Margin percentage is computed, read-only
- Attributes must be a valid JSON object (Phase 10.1)
"""

from decimal import Decimal
from typing import Any
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import (
    Warehouse, Product, ProductVariant, StockLedger, StockSnapshot,
    ProductPricing, ProductImage, Store, StockTransfer, StockTransferItem,
    CreditNote, CreditNoteItem, DebitNote, DebitNoteItem,
    PurchaseOrder, PurchaseOrderItem, Supplier, Category
)


# =============================================================================
# CATEGORY SERIALIZER
# =============================================================================

class CategorySerializer(serializers.ModelSerializer):
    """Serializer for Category model."""
    
    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


# =============================================================================
# PHASE 10.1: ATTRIBUTE VALIDATION
# =============================================================================

def validate_product_attributes(attrs: Any) -> dict:
    """
    Validate the attributes field for a Product.
    
    Phase 10.1 Rules:
    - Must be a dict (JSON object)
    - Keys must be strings
    - Values must be: string, number, or list of strings
    - No nested objects
    - No mixed-type arrays
    - Null is NOT allowed (use empty dict instead)
    
    Valid Example:
        {
            "sizes": ["S", "M", "L"],
            "colors": ["Black", "White"],
            "pattern": "Solid",
            "fit": "Slim",
            "material": "Cotton"
        }
    
    Args:
        attrs: The attributes value to validate
    
    Returns:
        Validated attributes dict
    
    Raises:
        serializers.ValidationError: If validation fails
    """
    # Allow empty dict
    if attrs is None:
        raise serializers.ValidationError(
            "Invalid attributes format: null is not allowed. Use empty object {} instead."
        )
    
    # Must be a dict
    if not isinstance(attrs, dict):
        raise serializers.ValidationError(
            f"Invalid attributes format: expected object, got {type(attrs).__name__}. "
            "Attributes must be a JSON object like {\"sizes\": [\"S\", \"M\"], \"color\": \"Blue\"}."
        )
    
    # Validate each key-value pair
    for key, value in attrs.items():
        # Keys must be strings
        if not isinstance(key, str):
            raise serializers.ValidationError(
                f"Invalid attributes format: key '{key}' must be a string."
            )
        
        # Validate value type
        if value is None:
            # Allow null values for optional attributes
            continue
        elif isinstance(value, str):
            # String value - OK
            continue
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            # Number value - OK (but not bool which is subclass of int)
            continue
        elif isinstance(value, list):
            # Must be list of strings only
            if not value:
                # Empty list - OK
                continue
            
            # Check for mixed types
            first_type = type(value[0])
            for i, item in enumerate(value):
                if not isinstance(item, str):
                    raise serializers.ValidationError(
                        f"Invalid attributes format: '{key}' array must contain only strings. "
                        f"Found {type(item).__name__} at index {i}."
                    )
        elif isinstance(value, dict):
            # Nested objects not allowed
            raise serializers.ValidationError(
                f"Invalid attributes format: nested objects not allowed. "
                f"Key '{key}' contains an object."
            )
        else:
            raise serializers.ValidationError(
                f"Invalid attributes format: value for '{key}' must be string, number, or array of strings. "
                f"Got {type(value).__name__}."
            )
    
    return attrs


class WarehouseSerializer(serializers.ModelSerializer):
    """Serializer for Warehouse model."""

    MIN_ADDRESS_LEN = 10

    seller_image = serializers.ImageField(required=False, allow_null=True, write_only=True)
    seller_image_url = serializers.SerializerMethodField(read_only=True)
    is_active = serializers.BooleanField(default=True, required=False)

    class Meta:
        model = Warehouse
        fields = [
            'id', 'name', 'code', 'address', 'email', 'phone',
            'seller_image', 'seller_image_url',
            'bank_name', 'bank_account_number', 'bank_ifsc',
            'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'seller_image_url']
        extra_kwargs = {
            'code': {'required': False, 'allow_blank': True},
            'email': {'required': False, 'allow_blank': True},
            'phone': {'required': False, 'allow_blank': True},
        }

    def get_seller_image_url(self, obj):
        img = getattr(obj, 'seller_image', None)
        if not img:
            return None
        try:
            url = img.url
        except ValueError:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(url)
        return url

    def validate_address(self, value):
        text = (value or '').strip()
        if len(text) < self.MIN_ADDRESS_LEN:
            raise serializers.ValidationError(
                f'Address must be at least {self.MIN_ADDRESS_LEN} characters.'
            )
        return text

    def validate(self, attrs):
        if not self.partial:
            addr = (attrs.get('address') or '').strip()
            if len(addr) < self.MIN_ADDRESS_LEN:
                raise serializers.ValidationError({
                    'address': (
                        f'Address is required and must be at least '
                        f'{self.MIN_ADDRESS_LEN} characters.'
                    ),
                })
        return attrs

    @staticmethod
    def _generate_unique_code(name: str) -> str:
        import re
        from uuid import uuid4

        slug = re.sub(r'[^A-Z0-9]+', '-', (name or 'WH').upper()).strip('-')[:12] or 'WH'
        for _ in range(50):
            candidate = f"{slug}-{uuid4().hex[:4]}".upper()[:20]
            if not Warehouse.objects.filter(code=candidate).exists():
                return candidate
        return uuid4().hex[:20].upper()

    def create(self, validated_data):
        code = (validated_data.get('code') or '').strip()
        if not code:
            validated_data['code'] = self._generate_unique_code(validated_data.get('name') or 'WH')
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if 'code' in validated_data and not (str(validated_data.get('code') or '').strip()):
            validated_data.pop('code', None)
        return super().update(instance, validated_data)


class WarehouseStockSerializer(serializers.Serializer):
    """Serializer for warehouse stock breakdown."""
    warehouse_id = serializers.UUIDField()
    warehouse_name = serializers.CharField()
    warehouse_code = serializers.CharField()
    quantity = serializers.IntegerField()
    last_updated = serializers.DateTimeField()


class ProductVariantSerializer(serializers.ModelSerializer):
    """Serializer for ProductVariant with stock information."""
    
    total_stock = serializers.SerializerMethodField()
    warehouse_stock = serializers.SerializerMethodField()
    barcode_image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductVariant
        fields = [
            'id', 'sku', 'barcode', 'barcode_image_url', 'size', 'color', 'cost_price', 'selling_price',
            'reorder_threshold', 'is_active', 'total_stock', 'warehouse_stock',
            'created_at'
        ]
        read_only_fields = ['id', 'barcode', 'barcode_image_url', 'created_at', 'total_stock', 'warehouse_stock']
    
    @extend_schema_field(serializers.IntegerField())
    def get_total_stock(self, obj):
        """
        Get total stock from InventoryMovement ledger.
        Phase 11.2: Stock = SUM(inventory_movements.quantity)
        """
        from . import services
        return services.get_product_stock(obj.product_id)
    
    @extend_schema_field(WarehouseStockSerializer(many=True))
    def get_warehouse_stock(self, obj):
        """
        Warehouse-wise net quantity from the product ledger (same for all variants of a product).
        """
        from . import services
        return services.get_product_stock_breakdown_by_warehouse(obj.product_id)
    
    @extend_schema_field(serializers.CharField())
    def get_barcode_image_url(self, obj):
        """Get URL for barcode image."""
        if obj.barcode:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(f'/api/v1/inventory/barcodes/{obj.barcode}/image/')
            return f'/api/v1/inventory/barcodes/{obj.barcode}/image/'
        return None


class ProductVariantCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating ProductVariant with optional initial stock."""
    
    # Make SKU optional - will be auto-generated if not provided
    sku = serializers.CharField(required=False, allow_blank=True)

    reorder_threshold = serializers.IntegerField(
        required=False,
        default=0,
        min_value=0,
        help_text="Low stock alert threshold (0 disables alerts)"
    )
    
    initial_stock = serializers.IntegerField(
        required=False,
        default=0,
        min_value=0,
        help_text="Initial stock quantity to add (requires warehouse_id in parent)"
    )
    
    class Meta:
        model = ProductVariant
        fields = ['sku', 'size', 'color', 'cost_price', 'selling_price', 'reorder_threshold', 'initial_stock']
        extra_kwargs = {
            'cost_price': {'required': False},
            'selling_price': {'required': False},
        }


class ProductVariantUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating ProductVariant.
    
    HARDENING: Price changes blocked if stock exists.
    """
    
    class Meta:
        model = ProductVariant
        fields = ['sku', 'size', 'color', 'cost_price', 'selling_price', 'reorder_threshold', 'is_active']
    
    def validate(self, attrs):
        """
        Block price changes if stock exists.
        Phase 11.2: Uses ledger-derived stock.
        """
        instance = self.instance
        
        if instance:
            from . import services
            # Phase 11.2: Get stock from InventoryMovement ledger
            current_stock = services.get_product_stock(instance.product_id)
            
            # Check if price fields are being modified
            cost_price_changed = (
                'cost_price' in attrs and 
                attrs['cost_price'] != instance.cost_price
            )
            selling_price_changed = (
                'selling_price' in attrs and 
                attrs['selling_price'] != instance.selling_price
            )
            
            if current_stock > 0 and (cost_price_changed or selling_price_changed):
                raise serializers.ValidationError({
                    "error": "Cannot modify price while stock exists",
                    "current_stock": current_stock,
                    "message": "Reduce stock to 0 before changing prices, or create a new variant"
                })
        
        return attrs


# =============================================================================
# PHASE 10A: PRODUCT MASTER SERIALIZERS
# =============================================================================

class ProductPricingSerializer(serializers.ModelSerializer):
    """
    Serializer for ProductPricing.
    
    margin_percentage is READ-ONLY and computed from cost_price and selling_price.
    """
    margin_percentage = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
        help_text="Computed: ((selling_price - cost_price) / cost_price) * 100 (wide range for low cost bases)"
    )
    profit_amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True,
        help_text="Computed: selling_price - cost_price"
    )
    gst_amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True,
        help_text="Computed GST amount based on selling price"
    )
    
    class Meta:
        model = ProductPricing
        fields = [
            'id', 'cost_price', 'mrp', 'selling_price', 'gst_percentage',
            'margin_percentage', 'profit_amount', 'gst_amount',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'margin_percentage', 'profit_amount', 'gst_amount',
            'created_at', 'updated_at'
        ]


class ProductImageSerializer(serializers.ModelSerializer):
    """Serializer for ProductImage."""
    
    class Meta:
        model = ProductImage
        fields = ['id', 'image_url', 'is_primary', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProductSerializer(serializers.ModelSerializer):
    """
    Serializer for Product with nested variants, pricing, and images.
    
    Phase 10A includes:
    - SKU and barcode at product level
    - JSONB attributes for flexible apparel data
    - Nested pricing with computed margin
    - Product images
    - Soft delete via is_deleted flag
    - Days in inventory (from first purchase order)
    - Supplier tracking for barcode and sales analytics
    """
    
    variants = ProductVariantSerializer(many=True, read_only=True)
    pricing = ProductPricingSerializer(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    total_stock = serializers.SerializerMethodField()
    barcode_image_url = serializers.SerializerMethodField()
    days_in_inventory = serializers.SerializerMethodField()
    first_purchase_date = serializers.SerializerMethodField()
    warehouse_stock = serializers.SerializerMethodField()
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, allow_null=True)
    supplier_code = serializers.CharField(source='supplier.code', read_only=True, allow_null=True)
    
    class Meta:
        model = Product
        fields = [
            'id', 'name', 'sku', 'barcode_value', 'barcode_image_url',
            'brand', 'brand_id', 'category', 'category_id', 'description',
            'product_code', 'brand_code', 'alias',
            'country_of_origin', 'attributes',
            'gender', 'material', 'season',
            'supplier', 'supplier_name', 'supplier_code',
            'is_active', 'is_deleted',
            'pricing', 'images', 'variants', 'total_stock', 'warehouse_stock',
            'days_in_inventory', 'first_purchase_date',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'sku', 'barcode_value', 'barcode_image_url',
            'supplier', 'supplier_name', 'supplier_code',
            'created_at', 'updated_at', 'total_stock', 'warehouse_stock',
            'days_in_inventory', 'first_purchase_date'
        ]
    
    @extend_schema_field(serializers.IntegerField())
    def get_total_stock(self, obj):
        """
        Get total stock derived from InventoryMovement ledger.
        
        Phase 11.1: Stock = SUM(inventory_movements.quantity)
        
        Uses annotated field if available, otherwise queries ledger.
        """
        # Check for annotated field (from queryset annotation)
        if hasattr(obj, 'available_stock'):
            return obj.available_stock or 0
        
        # Fall back to service function
        from . import services
        return services.get_product_stock(obj.id)

    @extend_schema_field(WarehouseStockSerializer(many=True))
    def get_warehouse_stock(self, obj):
        """Per-warehouse net quantity from InventoryMovement (product-level ledger)."""
        from . import services
        return services.get_product_stock_breakdown_by_warehouse(obj.id)
    
    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_days_in_inventory(self, obj):
        """
        Calculate days product has been in inventory since first purchase order.
        
        Returns the number of days since the first RECEIVED purchase order
        that included this product.
        """
        from django.utils import timezone
        from .models import PurchaseOrderItem, PurchaseOrder
        
        # Find the first received purchase order item for this product
        first_po_item = PurchaseOrderItem.objects.filter(
            product=obj,
            purchase_order__status__in=['RECEIVED', 'PARTIAL']
        ).select_related('purchase_order').order_by(
            'purchase_order__received_date', 'purchase_order__order_date'
        ).first()
        
        if not first_po_item:
            return None
        
        # Use received_date if available, otherwise use order_date
        po = first_po_item.purchase_order
        reference_date = po.received_date or po.order_date
        
        if not reference_date:
            return None
        
        today = timezone.localdate()
        days = (today - reference_date).days
        return max(0, days)
    
    @extend_schema_field(serializers.DateField(allow_null=True))
    def get_first_purchase_date(self, obj):
        """
        Get the date of first purchase order for this product.
        """
        from .models import PurchaseOrderItem
        
        first_po_item = PurchaseOrderItem.objects.filter(
            product=obj,
            purchase_order__status__in=['RECEIVED', 'PARTIAL']
        ).select_related('purchase_order').order_by(
            'purchase_order__received_date', 'purchase_order__order_date'
        ).first()
        
        if not first_po_item:
            return None
        
        po = first_po_item.purchase_order
        return po.received_date or po.order_date
    
    @extend_schema_field(serializers.CharField())
    def get_barcode_image_url(self, obj):
        """Get URL for barcode image."""
        if obj.barcode_value:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(f'/api/v1/inventory/barcodes/{obj.barcode_value}/image/')
            return f'/api/v1/inventory/barcodes/{obj.barcode_value}/image/'
        return obj.barcode_image_url


class ProductCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a Product with variants and optional initial stock.
    
    To add initial stock on create:
    1. Include warehouse_id at the root level
    2. Include initial_stock in each variant
    """
    
    variants = ProductVariantCreateSerializer(many=True, required=False)
    warehouse_id = serializers.UUIDField(
        required=False,
        write_only=True,
        help_text="Warehouse to add initial stock to (required if any variant has initial_stock > 0)"
    )
    pricing = ProductPricingSerializer(required=False)
    
    class Meta:
        model = Product
        fields = [
            'name', 'brand', 'category', 'description',
            'product_code', 'brand_code', 'alias',
            'country_of_origin', 'attributes',
            'gender', 'material', 'season',
            'sku', 'barcode_value',
            'is_active', 'variants', 'warehouse_id', 'pricing'
        ]
        extra_kwargs = {
            'sku': {'required': False, 'allow_null': True},
            'barcode_value': {'required': False, 'allow_null': True},
        }
    
    def validate_attributes(self, value):
        """Phase 10.1: Validate attributes JSON structure."""
        if value is None:
            return {}
        return validate_product_attributes(value)
    
    def validate(self, attrs):
        """Validate that warehouse_id is provided if initial_stock is specified."""
        for key in ('sku', 'barcode_value'):
            v = attrs.get(key)
            if v is not None and str(v).strip() == '':
                attrs[key] = None

        variants_data = attrs.get('variants', [])
        warehouse_id = attrs.get('warehouse_id')
        
        has_initial_stock = any(
            v.get('initial_stock', 0) > 0 for v in variants_data
        )
        
        if has_initial_stock and not warehouse_id:
            raise serializers.ValidationError({
                'warehouse_id': 'Warehouse is required when adding initial stock'
            })
        
        if warehouse_id:
            try:
                Warehouse.objects.get(id=warehouse_id, is_active=True)
            except Warehouse.DoesNotExist:
                raise serializers.ValidationError({
                    'warehouse_id': 'Warehouse not found or inactive'
                })
        
        return attrs
    
    def create(self, validated_data):
        from . import services
        from .models import InventoryMovement
        
        variants_data = validated_data.pop('variants', [])
        warehouse_id = validated_data.pop('warehouse_id', None)
        pricing_data = validated_data.pop('pricing', None)
        product = Product.objects.create(**validated_data)
        
        # Create ProductPricing if pricing data provided
        if pricing_data:
            ProductPricing.objects.create(product=product, **pricing_data)
        
        warehouse = None
        if warehouse_id:
            warehouse = Warehouse.objects.get(id=warehouse_id)
        
        total_initial_stock = 0
        
        for variant_data in variants_data:
            initial_stock = variant_data.pop('initial_stock', 0)
            total_initial_stock += initial_stock
            variant = ProductVariant.objects.create(product=product, **variant_data)
        
        # Add initial stock at PRODUCT level using InventoryMovement ledger
        if total_initial_stock > 0 and warehouse:
            request = self.context.get('request')
            user = request.user if request and request.user.is_authenticated else None
            
            services.create_inventory_movement(
                product_id=product.id,
                movement_type=InventoryMovement.MovementType.OPENING,
                quantity=total_initial_stock,
                user=user,
                warehouse=warehouse,
                reference_type='PRODUCT_CREATION',
                reference_id=product.id,
                remarks=f"Initial stock on product creation: {total_initial_stock} units"
            )
        
        return product


class ProductUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating a Product.
    
    HARDENING:
    - Cannot update SKU or barcode (immutable)
    - Cannot update variants with stock through this serializer
    - Use the variant-specific endpoints for variant updates
    """
    
    pricing = ProductPricingSerializer(required=False)
    
    class Meta:
        model = Product
        fields = [
            'name', 'brand', 'brand_id', 'category', 'category_id', 'description',
            'product_code', 'brand_code', 'alias',
            'country_of_origin', 'attributes',
            'gender', 'material', 'season',
            'is_active', 'pricing'
        ]
    
    def validate_attributes(self, value):
        """Phase 10.1: Validate attributes JSON structure."""
        if value is None:
            return {}
        return validate_product_attributes(value)
    
    def validate(self, attrs):
        """
        Phase 10.1 validation:
        - SKU immutability enforced in model.save()
        - Barcode immutability enforced in model.save()
        """
        return attrs
    
    def update(self, instance, validated_data):
        """Handle nested pricing update."""
        pricing_data = validated_data.pop('pricing', None)
        
        # Update product fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update pricing if provided
        if pricing_data:
            pricing, created = ProductPricing.objects.get_or_create(
                product=instance,
                defaults=pricing_data
            )
            if not created:
                for attr, value in pricing_data.items():
                    setattr(pricing, attr, value)
                pricing.save()
        
        return instance


class PurchaseStockSerializer(serializers.Serializer):
    """Serializer for recording a stock purchase."""
    
    warehouse_id = serializers.UUIDField()
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    reference_id = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def _org_id(self):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        return getattr(user, "organization_id", None)
    
    def validate_warehouse_id(self, value):
        qs = Warehouse.objects.filter(id=value, is_active=True)
        org_id = self._org_id()
        if org_id:
            qs = qs.filter(organization_id=org_id)
        if not qs.exists():
            raise serializers.ValidationError("Warehouse not found or inactive")
        return value
    
    def validate_variant_id(self, value):
        qs = ProductVariant.objects.filter(id=value, is_active=True)
        org_id = self._org_id()
        if org_id:
            qs = qs.filter(product__organization_id=org_id)
        if not qs.exists():
            raise serializers.ValidationError("Product variant not found or inactive")
        return value
    
    def validate_quantity(self, value):
        if value == 0:
            raise serializers.ValidationError("Quantity cannot be zero")
        if value < 0:
            raise serializers.ValidationError("Quantity must be positive for purchases")
        return value

    def validate(self, attrs):
        warehouse = Warehouse.objects.get(id=attrs["warehouse_id"])
        variant = ProductVariant.objects.select_related("product").get(id=attrs["variant_id"])
        if (
            warehouse.organization_id
            and variant.product.organization_id
            and warehouse.organization_id != variant.product.organization_id
        ):
            raise serializers.ValidationError(
                "Warehouse and product variant must belong to the same business"
            )
        return attrs


class AdjustStockSerializer(serializers.Serializer):
    """Serializer for stock adjustment (admin only)."""
    
    warehouse_id = serializers.UUIDField()
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(
        help_text="Positive to add, negative to subtract"
    )
    notes = serializers.CharField(required=True, min_length=10)
    allow_negative = serializers.BooleanField(default=False)

    def _org_id(self):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        return getattr(user, "organization_id", None)
    
    def validate_warehouse_id(self, value):
        qs = Warehouse.objects.filter(id=value, is_active=True)
        org_id = self._org_id()
        if org_id:
            qs = qs.filter(organization_id=org_id)
        if not qs.exists():
            raise serializers.ValidationError("Warehouse not found or inactive")
        return value
    
    def validate_variant_id(self, value):
        qs = ProductVariant.objects.filter(id=value, is_active=True)
        org_id = self._org_id()
        if org_id:
            qs = qs.filter(product__organization_id=org_id)
        if not qs.exists():
            raise serializers.ValidationError("Product variant not found or inactive")
        return value
    
    def validate_quantity(self, value):
        if value == 0:
            raise serializers.ValidationError("Quantity cannot be zero")
        return value
    
    def validate_notes(self, value):
        if not value or len(value.strip()) < 10:
            raise serializers.ValidationError(
                "Notes are required for adjustments (minimum 10 characters)"
            )
        return value

    def validate(self, attrs):
        warehouse = Warehouse.objects.get(id=attrs["warehouse_id"])
        variant = ProductVariant.objects.select_related("product").get(id=attrs["variant_id"])
        if (
            warehouse.organization_id
            and variant.product.organization_id
            and warehouse.organization_id != variant.product.organization_id
        ):
            raise serializers.ValidationError(
                "Warehouse and product variant must belong to the same business"
            )
        return attrs


class StockLedgerSerializer(serializers.ModelSerializer):
    """
    Serializer for StockLedger entries.
    
    HARDENING: This serializer is READ-ONLY.
    - All fields are read-only
    - No create/update/delete operations allowed
    - Ledger entries are immutable
    """
    
    variant_sku = serializers.CharField(source='variant.sku', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    
    class Meta:
        model = StockLedger
        fields = [
            'id', 'variant', 'variant_sku', 'warehouse', 'warehouse_code',
            'event_type', 'quantity', 'reference_type', 'reference_id',
            'notes', 'created_by', 'created_at'
        ]
        read_only_fields = fields  # ALL fields are read-only
    
    def create(self, validated_data):
        """Block direct creation - use stock operation endpoints instead."""
        raise serializers.ValidationError(
            "Ledger entries cannot be created directly. Use /stock/purchase/ or /stock/adjust/"
        )
    
    def update(self, instance, validated_data):
        """Block updates - ledger is immutable."""
        raise serializers.ValidationError(
            "Ledger entries are immutable and cannot be updated. Create an ADJUSTMENT entry instead."
        )


class LowStockItemSerializer(serializers.Serializer):
    """Serializer for low/out of stock items (Phase 11.1: product-level)."""
    product_id = serializers.CharField()
    sku = serializers.CharField()
    product_name = serializers.CharField()
    quantity = serializers.IntegerField()
    threshold = serializers.IntegerField(required=False)


class StockSummarySerializer(serializers.Serializer):
    """
    Serializer for stock summary response.
    Phase 11.1: Stock derived from InventoryMovement ledger.
    """
    total_stock = serializers.IntegerField()
    total_products = serializers.IntegerField()
    low_stock_count = serializers.IntegerField()
    out_of_stock_count = serializers.IntegerField()
    low_stock_items = LowStockItemSerializer(many=True)
    out_of_stock_items = LowStockItemSerializer(many=True)


class POSVariantSerializer(serializers.Serializer):
    """
    Serializer for POS product grid - flattened variant view.
    Returns variants as sellable units with product info included.
    """
    id = serializers.UUIDField()
    name = serializers.CharField()  # Combined product name + variant info
    product_name = serializers.CharField()
    brand = serializers.CharField()
    category = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    sku = serializers.CharField()
    barcode = serializers.CharField()
    size = serializers.CharField(allow_null=True)
    color = serializers.CharField(allow_null=True)
    selling_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    cost_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    mrp = serializers.DecimalField(max_digits=10, decimal_places=2)
    gst_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, default='18.00')
    stock = serializers.IntegerField()  # Total stock across warehouses
    stock_status = serializers.CharField()  # IN_STOCK, LOW_STOCK, OUT_OF_STOCK
    reorder_threshold = serializers.IntegerField()
    barcode_image_url = serializers.CharField(allow_null=True)
    # Supplier tracking
    supplier_id = serializers.UUIDField(allow_null=True)
    supplier_name = serializers.CharField(allow_null=True)
    supplier_code = serializers.CharField(allow_null=True)


# =============================================================================
# PHASE 11: INVENTORY LEDGER SERIALIZERS
# =============================================================================

from .models import InventoryMovement


class InventoryMovementSerializer(serializers.ModelSerializer):
    """
    Read serializer for InventoryMovement.
    Used for listing and retrieving movement records.
    """
    product_id = serializers.UUIDField(source='product.id', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = InventoryMovement
        fields = [
            'id',
            'product_id',
            'product_name',
            'product_sku',
            'warehouse_id',
            'movement_type',
            'quantity',
            'reference_type',
            'reference_id',
            'remarks',
            'created_by',
            'created_by_name',
            'created_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at']
    
    @extend_schema_field(serializers.CharField)
    def get_created_by_name(self, obj) -> str:
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return ""


class InventoryMovementCreateSerializer(serializers.Serializer):
    """
    Write serializer for creating InventoryMovement records.
    Validates business rules and delegates to service layer.
    """
    product_id = serializers.UUIDField(required=True)
    warehouse_id = serializers.UUIDField(required=False, allow_null=True)
    movement_type = serializers.ChoiceField(
        choices=InventoryMovement.MovementType.choices,
        required=True
    )
    quantity = serializers.IntegerField(required=True)
    reference_type = serializers.CharField(required=False, allow_blank=True, default="")
    reference_id = serializers.UUIDField(required=False, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")
    
    def validate(self, data):
        """
        Validate movement type and quantity sign.
        """
        movement_type = data.get('movement_type')
        quantity = data.get('quantity')
        
        # Validate quantity sign based on movement type
        if movement_type in InventoryMovement.POSITIVE_ONLY_TYPES and quantity <= 0:
            raise serializers.ValidationError({
                'quantity': f'{movement_type} movements must have positive quantity'
            })
        
        if movement_type in InventoryMovement.NEGATIVE_ONLY_TYPES and quantity >= 0:
            raise serializers.ValidationError({
                'quantity': f'{movement_type} movements must have negative quantity'
            })
        
        if quantity == 0:
            raise serializers.ValidationError({
                'quantity': 'Quantity cannot be zero'
            })
        
        return data
    
    def create(self, validated_data):
        """
        Create movement using service layer.
        """
        from . import services
        
        user = self.context.get('request').user
        
        try:
            movement = services.create_inventory_movement(
                product_id=validated_data['product_id'],
                movement_type=validated_data['movement_type'],
                quantity=validated_data['quantity'],
                user=user,
                warehouse_id=validated_data.get('warehouse_id'),
                reference_type=validated_data.get('reference_type', ''),
                reference_id=validated_data.get('reference_id'),
                remarks=validated_data.get('remarks', '')
            )
            return movement
        except services.InvalidMovementError as e:
            raise serializers.ValidationError({'detail': str(e)})
        except services.InsufficientProductStockError as e:
            raise serializers.ValidationError({'detail': str(e)})


class ProductStockSerializer(serializers.Serializer):
    """
    Read serializer for derived product stock.
    Stock is calculated from sum of movements, not stored.
    """
    product_id = serializers.UUIDField()
    available_stock = serializers.IntegerField()


# =============================================================================
# PHASE 12: OPENING STOCK SERIALIZER
# =============================================================================

class OpeningStockSerializer(serializers.Serializer):
    """
    Serializer for creating opening stock.
    
    PHASE 12 CORE RULE:
        Opening stock is not a field. It is a ledger entry.
    
    RULES:
    - Only ONE opening stock per product per warehouse
    - Quantity MUST be positive
    - Cannot be created if any movement exists for product+warehouse
    """
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
        min_value=1,
        help_text="Opening stock quantity (must be positive)"
    )
    
    def validate_product_id(self, value):
        """Validate that product exists and is active."""
        from .models import Product
        
        try:
            product = Product.objects.get(pk=value)
            if not product.is_active:
                raise serializers.ValidationError("Product is not active")
            if product.is_deleted:
                raise serializers.ValidationError("Product is deleted")
        except Product.DoesNotExist:
            raise serializers.ValidationError("Product not found")
        
        return value
    
    def validate_warehouse_id(self, value):
        """Validate that warehouse exists and is active."""
        from .models import Warehouse
        
        try:
            warehouse = Warehouse.objects.get(pk=value)
            if not warehouse.is_active:
                raise serializers.ValidationError("Warehouse is not active")
        except Warehouse.DoesNotExist:
            raise serializers.ValidationError("Warehouse not found")
        
        return value
    
    def create(self, validated_data):
        """Create opening stock using service layer."""
        from . import services
        
        user = self.context.get('request').user
        
        try:
            movement = services.create_opening_stock(
                product_id=validated_data['product_id'],
                warehouse_id=validated_data['warehouse_id'],
                quantity=validated_data['quantity'],
                user=user
            )
            return movement
        except services.DuplicateOpeningStockError as e:
            raise serializers.ValidationError({'detail': str(e)})
        except services.InvalidMovementError as e:
            raise serializers.ValidationError({'detail': str(e)})


# =============================================================================
# PURCHASE ORDER SERIALIZERS
# =============================================================================

from .models import Supplier, PurchaseOrder, PurchaseOrderItem


class SupplierSerializer(serializers.ModelSerializer):
    """Serializer for Supplier model."""
    
    class Meta:
        model = Supplier
        fields = [
            'id', 'name', 'code', 'contact_person', 'phone', 'email',
            'address', 'gst_number', 'notes', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class SupplierListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for supplier dropdowns."""
    
    class Meta:
        model = Supplier
        fields = ['id', 'name', 'code', 'is_active']


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    """Serializer for PurchaseOrderItem."""
    
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    is_fully_received = serializers.BooleanField(read_only=True)
    pending_quantity = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = PurchaseOrderItem
        fields = [
            'id', 'product', 'product_name', 'product_sku',
            'quantity', 'received_quantity', 'pending_quantity',
            'unit_price', 'tax_percentage', 'tax_amount', 'line_total',
            'is_fully_received'
        ]
        read_only_fields = [
            'id', 'product_name', 'product_sku', 'tax_amount',
            'line_total', 'is_fully_received', 'pending_quantity'
        ]


class PurchaseOrderItemCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating PO items."""
    
    class Meta:
        model = PurchaseOrderItem
        fields = ['product', 'quantity', 'unit_price', 'tax_percentage']


class PurchaseOrderSerializer(serializers.ModelSerializer):
    """Full serializer for PurchaseOrder with nested items."""
    
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    
    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'supplier', 'supplier_name',
            'warehouse', 'warehouse_name', 'status',
            'order_date', 'expected_date', 'received_date',
            'subtotal', 'tax_amount', 'total', 'notes',
            'items', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'po_number', 'supplier_name', 'warehouse_name',
            'subtotal', 'tax_amount', 'total',
            'created_at', 'updated_at'
        ]


class PurchaseOrderListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for PO list view."""
    
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    item_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'supplier_name', 'warehouse_name',
            'status', 'order_date', 'expected_date', 'total',
            'item_count', 'created_at'
        ]


class PurchaseOrderCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new PurchaseOrder with items."""
    
    items = PurchaseOrderItemCreateSerializer(many=True)
    
    class Meta:
        model = PurchaseOrder
        fields = [
            'supplier', 'warehouse', 'order_date', 'expected_date', 'notes', 'items'
        ]
    
    def validate_items(self, value):
        if not value or len(value) == 0:
            raise serializers.ValidationError("At least one item is required")
        return value
    
    def create(self, validated_data):
        items_data = validated_data.pop('items')
        purchase_order = PurchaseOrder.objects.create(**validated_data)
        
        for item_data in items_data:
            PurchaseOrderItem.objects.create(
                purchase_order=purchase_order,
                **item_data
            )
        
        purchase_order.recalculate_totals()
        return purchase_order


class ReceiveItemSerializer(serializers.Serializer):
    """Serializer for receiving individual PO items."""
    
    item_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    
    def validate(self, data):
        try:
            item = PurchaseOrderItem.objects.get(id=data['item_id'])
            if item.is_fully_received:
                raise serializers.ValidationError({
                    'item_id': 'This item is already fully received'
                })
            if data['quantity'] > item.pending_quantity:
                raise serializers.ValidationError({
                    'quantity': f'Cannot receive more than pending quantity ({item.pending_quantity})'
                })
            data['item'] = item
        except PurchaseOrderItem.DoesNotExist:
            raise serializers.ValidationError({
                'item_id': 'Purchase order item not found'
            })
        return data


class ReceivePurchaseOrderSerializer(serializers.Serializer):
    """
    Serializer for receiving purchase order items.
    Creates inventory movements (PURCHASE type) for received items.
    """
    
    items = ReceiveItemSerializer(many=True)
    
    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item must be received")
        return value
    
    def create(self, validated_data):
        from . import services
        
        items_data = validated_data['items']
        purchase_order = self.context['purchase_order']
        user = self.context['request'].user
        supplier = purchase_order.supplier
        
        received_items = []
        
        for item_data in items_data:
            item = item_data['item']
            quantity = item_data['quantity']
            product = item.product
            
            # Update received quantity on item
            item.received_quantity += quantity
            item.save()
            
            # Regenerate barcode with supplier prefix if this is the first time
            # receiving this product (i.e., product has no supplier yet)
            if product.supplier_id is None:
                product.regenerate_barcode_with_supplier(supplier)
                # Refresh product instance to get updated barcode
                product.refresh_from_db()
            
            # Create PURCHASE inventory movement
            services.create_inventory_movement(
                product_id=item.product_id,
                movement_type=InventoryMovement.MovementType.PURCHASE,
                quantity=quantity,
                user=user,
                warehouse=purchase_order.warehouse,
                reference_type='PURCHASE_ORDER',
                reference_id=purchase_order.id,
                remarks=f"Received from PO {purchase_order.po_number}"
            )
            
            received_items.append({
                'product': product.name,
                'product_sku': product.sku,
                'barcode': product.barcode_value,
                'supplier': supplier.name,
                'quantity_received': quantity,
                'total_received': item.received_quantity,
                'pending': item.pending_quantity
            })
        
        # Update PO status - refresh from DB to get accurate received quantities
        purchase_order.refresh_from_db()
        all_items = list(purchase_order.items.all())  # Force evaluation with fresh data
        
        all_fully_received = all(item.is_fully_received for item in all_items)
        any_received = any(item.received_quantity > 0 for item in all_items)
        
        if all_fully_received:
            purchase_order.status = PurchaseOrder.Status.RECEIVED
            import datetime
            purchase_order.received_date = datetime.date.today()
        elif any_received:
            purchase_order.status = PurchaseOrder.Status.PARTIAL
        
        purchase_order.save(update_fields=['status', 'received_date', 'updated_at'])
        
        return {
            'purchase_order': purchase_order.po_number,
            'supplier': supplier.name,
            'status': purchase_order.status,
            'items_received': received_items
        }


# =============================================================================
# STORE SERIALIZERS
# =============================================================================

class StoreSerializer(serializers.ModelSerializer):
    """Full serializer for Store model."""
    
    operator_name = serializers.CharField(source='operator.username', read_only=True)
    stock_count = serializers.SerializerMethodField()
    low_stock_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Store
        fields = [
            'id', 'name', 'code', 'address', 'city', 'state', 'pincode',
            'phone', 'email', 'operator', 'operator_name', 'operator_phone',
            'low_stock_threshold', 'is_active', 'stock_count', 'low_stock_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'code', 'stock_count', 'low_stock_count', 'created_at', 'updated_at']
    
    @extend_schema_field(serializers.IntegerField)
    def get_stock_count(self, obj):
        """Get total distinct products in store."""
        from django.db.models import Sum
        from .models import InventoryMovement
        stock = InventoryMovement.objects.filter(store=obj).values('product_id').annotate(
            total=Sum('quantity')
        ).filter(total__gt=0).count()
        return stock
    
    @extend_schema_field(serializers.IntegerField)
    def get_low_stock_count(self, obj):
        """Get count of products below threshold."""
        return len(obj.get_low_stock_products())


class StoreListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for Store list views."""
    
    operator_name = serializers.CharField(source='operator.username', read_only=True)
    
    class Meta:
        model = Store
        fields = ['id', 'name', 'code', 'city', 'operator_name', 'is_active']


class StoreCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new Store."""
    
    class Meta:
        model = Store
        fields = [
            'name', 'address', 'city', 'state', 'pincode',
            'phone', 'email', 'operator', 'operator_phone',
            'low_stock_threshold'
        ]


class StoreStockSerializer(serializers.Serializer):
    """Serializer for store stock levels."""
    
    product_id = serializers.UUIDField()
    product_name = serializers.CharField(source='product__name')
    product_sku = serializers.CharField(source='product__sku')
    stock = serializers.IntegerField()
    is_low_stock = serializers.SerializerMethodField()
    
    @extend_schema_field(serializers.BooleanField)
    def get_is_low_stock(self, obj):
        threshold = self.context.get('low_stock_threshold', 10)
        return obj['stock'] < threshold


# =============================================================================
# STOCK TRANSFER SERIALIZERS
# =============================================================================

class StockTransferItemSerializer(serializers.ModelSerializer):
    """Serializer for StockTransferItem."""
    
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    pending_quantity = serializers.IntegerField(read_only=True)
    is_fully_received = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = StockTransferItem
        fields = [
            'id', 'product', 'product_name', 'product_sku',
            'quantity', 'received_quantity', 'pending_quantity', 'is_fully_received'
        ]
        read_only_fields = ['id', 'received_quantity', 'pending_quantity', 'is_fully_received']


class StockTransferItemCreateSerializer(serializers.Serializer):
    """Serializer for creating items within a transfer."""
    
    product = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class StockTransferSerializer(serializers.ModelSerializer):
    """Full serializer for StockTransfer with nested items."""
    
    items = StockTransferItemSerializer(many=True, read_only=True)
    source_warehouse_name = serializers.CharField(source='source_warehouse.name', read_only=True)
    destination_store_name = serializers.CharField(source='destination_store.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    dispatched_by_name = serializers.CharField(source='dispatched_by.username', read_only=True)
    received_by_name = serializers.CharField(source='received_by.username', read_only=True)
    
    class Meta:
        model = StockTransfer
        fields = [
            'id', 'transfer_number', 'source_warehouse', 'source_warehouse_name',
            'destination_store', 'destination_store_name', 'status',
            'transfer_date', 'dispatch_date', 'received_date', 'notes',
            'created_by', 'created_by_name', 'dispatched_by', 'dispatched_by_name',
            'received_by', 'received_by_name', 'items', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'transfer_number', 'status', 'dispatch_date', 'received_date',
            'created_by', 'dispatched_by', 'received_by', 'created_at', 'updated_at'
        ]


class StockTransferListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for StockTransfer list views."""
    
    source_warehouse_name = serializers.CharField(source='source_warehouse.name', read_only=True)
    destination_store_name = serializers.CharField(source='destination_store.name', read_only=True)
    item_count = serializers.SerializerMethodField()
    
    class Meta:
        model = StockTransfer
        fields = [
            'id', 'transfer_number', 'source_warehouse_name', 'destination_store_name',
            'status', 'transfer_date', 'item_count', 'created_at'
        ]
    
    @extend_schema_field(serializers.IntegerField)
    def get_item_count(self, obj):
        return obj.items.count()


class StockTransferCreateSerializer(serializers.Serializer):
    """Serializer for creating a new StockTransfer."""
    
    source_warehouse = serializers.UUIDField()
    destination_store = serializers.UUIDField()
    transfer_date = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    items = StockTransferItemCreateSerializer(many=True)
    
    def validate_items(self, value):
        if not value or len(value) == 0:
            raise serializers.ValidationError("At least one item is required")
        return value
    
    def validate(self, data):
        from .models import Warehouse
        
        # Validate warehouse exists
        warehouse_id = data.get('source_warehouse')
        if not Warehouse.objects.filter(id=warehouse_id, is_active=True).exists():
            raise serializers.ValidationError({
                'source_warehouse': 'Warehouse not found or inactive'
            })
        
        # Validate store exists
        store_id = data.get('destination_store')
        if not Store.objects.filter(id=store_id, is_active=True).exists():
            raise serializers.ValidationError({
                'destination_store': 'Store not found or inactive'
            })
        
        # Validate stock availability for each item
        from .services import get_product_stock
        items = data.get('items', [])
        for item in items:
            product_id = item['product']
            quantity = item['quantity']
            available = get_product_stock(product_id, warehouse_id)
            if available < quantity:
                raise serializers.ValidationError({
                    'items': f'Insufficient stock for product {product_id}. Available: {available}, Requested: {quantity}'
                })
        
        return data
    
    def create(self, validated_data):
        from .models import Warehouse
        from django.db import transaction
        
        items_data = validated_data.pop('items')
        user = self.context['request'].user
        
        with transaction.atomic():
            # Get warehouse and store
            warehouse = Warehouse.objects.get(id=validated_data['source_warehouse'])
            store = Store.objects.get(id=validated_data['destination_store'])
            
            # Create transfer
            transfer = StockTransfer.objects.create(
                source_warehouse=warehouse,
                destination_store=store,
                transfer_date=validated_data['transfer_date'],
                notes=validated_data.get('notes', ''),
                created_by=user,
                status=StockTransfer.Status.PENDING
            )
            
            # Create items
            for item_data in items_data:
                StockTransferItem.objects.create(
                    transfer=transfer,
                    product_id=item_data['product'],
                    quantity=item_data['quantity']
                )
            
            return transfer


class DispatchTransferSerializer(serializers.Serializer):
    """Serializer for dispatching a transfer."""
    
    def validate(self, data):
        transfer = self.context.get('transfer')
        if transfer.status != StockTransfer.Status.PENDING:
            raise serializers.ValidationError(
                f"Cannot dispatch transfer in {transfer.status} status"
            )
        return data
    
    def save(self):
        from .services import create_inventory_movement
        from .models import InventoryMovement
        from django.db import transaction
        import datetime
        
        transfer = self.context['transfer']
        user = self.context['request'].user
        
        with transaction.atomic():
            # Create TRANSFER_OUT movements for each item
            for item in transfer.items.all():
                create_inventory_movement(
                    product_id=item.product_id,
                    movement_type=InventoryMovement.MovementType.TRANSFER_OUT,
                    quantity=-item.quantity,
                    user=user,
                    warehouse=transfer.source_warehouse,
                    reference_type='STOCK_TRANSFER',
                    reference_id=transfer.id,
                    remarks=f"Transfer to {transfer.destination_store.code}"
                )
            
            # Update transfer status
            transfer.status = StockTransfer.Status.IN_TRANSIT
            transfer.dispatch_date = datetime.date.today()
            transfer.dispatched_by = user
            transfer.save()
        
        return transfer


class ReceiveTransferItemSerializer(serializers.Serializer):
    """Serializer for receiving an item."""
    
    item_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class ReceiveTransferSerializer(serializers.Serializer):
    """Serializer for receiving a transfer at a store."""
    
    items = ReceiveTransferItemSerializer(many=True)
    
    def validate(self, data):
        transfer = self.context.get('transfer')
        
        if transfer.status not in [StockTransfer.Status.IN_TRANSIT, StockTransfer.Status.PENDING]:
            raise serializers.ValidationError(
                f"Cannot receive transfer in {transfer.status} status"
            )
        
        # Validate each item
        items = data.get('items', [])
        valid_item_ids = set(str(item.id) for item in transfer.items.all())
        
        for item in items:
            item_id = str(item['item_id'])
            if item_id not in valid_item_ids:
                raise serializers.ValidationError({
                    'items': f"Item {item_id} not found in this transfer"
                })
            
            # Get the transfer item
            transfer_item = transfer.items.get(id=item['item_id'])
            if item['quantity'] > transfer_item.pending_quantity:
                raise serializers.ValidationError({
                    'items': f"Cannot receive more than pending quantity for {transfer_item.product.name}"
                })
        
        return data
    
    def save(self):
        from .services import create_inventory_movement
        from .models import InventoryMovement
        import datetime
        from django.db import transaction
        
        transfer = self.context['transfer']
        user = self.context['request'].user
        items_data = self.validated_data['items']
        
        received_items = []
        
        with transaction.atomic():
            for item_data in items_data:
                item = transfer.items.get(id=item_data['item_id'])
                quantity = item_data['quantity']
                
                # Update received quantity
                item.received_quantity += quantity
                item.save()
                
                # Create TRANSFER_IN movement in store ledger
                create_inventory_movement(
                    product_id=item.product_id,
                    movement_type=InventoryMovement.MovementType.TRANSFER_IN,
                    quantity=quantity,
                    user=user,
                    store=transfer.destination_store,  # Pass store instead of warehouse
                    reference_type='STOCK_TRANSFER',
                    reference_id=transfer.id,
                    remarks=f"Received from {transfer.source_warehouse.code}"
                )
                
                # No need to manually update store - it's handled in create_inventory_movement
                
                received_items.append({
                    'product': item.product.name,
                    'quantity_received': quantity,
                    'total_received': item.received_quantity,
                    'pending': item.pending_quantity
                })
            
            # Update transfer status
            all_items = transfer.items.all()
            if all(item.is_fully_received for item in all_items):
                transfer.status = StockTransfer.Status.COMPLETED
                transfer.received_date = datetime.date.today()
            
            transfer.received_by = user
            transfer.save()
        
        return {
            'transfer_number': transfer.transfer_number,
            'status': transfer.status,
            'items_received': received_items
        }


# =============================================================================
# CREDIT NOTES (CUSTOMER RETURNS)
# =============================================================================

class CreditNoteItemSerializer(serializers.ModelSerializer):
    """
    Credit Note Item serializer for customer returns.
    """
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    original_sale_invoice = serializers.CharField(
        source='original_sale_item.sale.invoice_number', 
        read_only=True
    )
    
    class Meta:
        model = CreditNoteItem
        fields = [
            'id', 'original_sale_item', 'product', 'product_name', 'product_sku',
            'quantity_returned', 'unit_price', 'line_total', 'condition',
            'original_sale_invoice', 'created_at'
        ]
        read_only_fields = ['id', 'line_total', 'created_at']
    
    def validate_quantity_returned(self, value):
        """Ensure returned quantity doesn't exceed original quantity."""
        if hasattr(self, 'instance') and self.instance:
            original_sale_item = self.instance.original_sale_item
        else:
            original_sale_item = self.initial_data.get('original_sale_item')
            if original_sale_item:
                from sales.models import SaleItem
                try:
                    original_sale_item = SaleItem.objects.get(id=original_sale_item)
                except SaleItem.DoesNotExist:
                    raise serializers.ValidationError("Invalid sale item reference")
        
        if original_sale_item:
            # Get total quantity already returned
            existing_returns = CreditNoteItem.objects.filter(
                original_sale_item=original_sale_item
            ).exclude(id=getattr(self.instance, 'id', None))
            
            total_returned = sum(item.quantity_returned for item in existing_returns)
            
            if total_returned + value > original_sale_item.quantity:
                raise serializers.ValidationError(
                    f"Cannot return {value} items. Only {original_sale_item.quantity - total_returned} remaining."
                )
        
        return value


class CreditNoteSerializer(serializers.ModelSerializer):
    """
    Credit Note serializer for customer returns.
    """
    items = CreditNoteItemSerializer(many=True, required=False)
    customer_name = serializers.CharField(source='original_sale.customer_name', read_only=True)
    original_invoice_number = serializers.CharField(source='original_sale.invoice_number', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = CreditNote
        fields = [
            'id', 'credit_note_number', 'original_sale', 'original_invoice_number',
            'warehouse', 'warehouse_name', 'status', 'return_reason', 'notes',
            'total_amount', 'refund_amount', 'return_date', 'issue_date',
            'settlement_date', 'customer_name', 'created_by', 'created_by_name',
            'created_at', 'updated_at', 'items'
        ]
        read_only_fields = [
            'id', 'credit_note_number', 'total_amount', 'created_by',
            'created_at', 'updated_at'
        ]
    
    def create(self, validated_data):
        """Create credit note with items."""
        items_data = validated_data.pop('items', [])
        validated_data['created_by'] = self.context['request'].user
        
        credit_note = CreditNote.objects.create(**validated_data)
        
        total_amount = Decimal('0.00')
        for item_data in items_data:
            item = CreditNoteItem.objects.create(
                credit_note=credit_note,
                **item_data
            )
            total_amount += item.line_total
        
        credit_note.total_amount = total_amount
        credit_note.save()
        
        return credit_note
    
    def update(self, instance, validated_data):
        """Update credit note and recalculate totals."""
        items_data = validated_data.pop('items', None)
        
        # Update main fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        if items_data is not None:
            # Clear existing items
            instance.items.all().delete()
            
            # Create new items
            total_amount = Decimal('0.00')
            for item_data in items_data:
                item = CreditNoteItem.objects.create(
                    credit_note=instance,
                    **item_data
                )
                total_amount += item.line_total
            
            instance.total_amount = total_amount
        
        instance.save()
        return instance


class CreditNoteCreateSerializer(serializers.Serializer):
    """
    Simplified serializer for creating credit notes from sales.
    """
    original_sale = serializers.UUIDField()
    warehouse = serializers.UUIDField()
    return_reason = serializers.ChoiceField(choices=CreditNote.ReturnReason.choices)
    notes = serializers.CharField(required=False, allow_blank=True)
    return_date = serializers.DateField()
    
    items = serializers.ListField(
        child=serializers.DictField(child=serializers.CharField()),
        min_length=1
    )
    
    def validate_original_sale(self, value):
        """Validate sale exists and can have returns."""
        from sales.models import Sale
        try:
            sale = Sale.objects.get(id=value)
            if sale.status != Sale.Status.COMPLETED:
                raise serializers.ValidationError("Can only return from completed sales")
            return sale
        except Sale.DoesNotExist:
            raise serializers.ValidationError("Sale not found")
    
    def validate_warehouse(self, value):
        """Validate warehouse exists."""
        try:
            return Warehouse.objects.get(id=value)
        except Warehouse.DoesNotExist:
            raise serializers.ValidationError("Warehouse not found")
    
    def create(self, validated_data):
        """Create credit note and generate inventory movements."""
        from .services import create_inventory_movement
        from django.db import transaction
        
        items_data = validated_data.pop('items')
        original_sale = validated_data.pop('original_sale')
        warehouse = validated_data.pop('warehouse')
        
        with transaction.atomic():
            # Create credit note
            credit_note = CreditNote.objects.create(
                original_sale=original_sale,
                warehouse=warehouse,
                created_by=self.context['request'].user,
                **validated_data
            )
            
            total_amount = Decimal('0.00')
            
            for item_data in items_data:
                from sales.models import SaleItem
                sale_item = SaleItem.objects.get(id=item_data['original_sale_item'])
                
                # Create credit note item
                credit_item = CreditNoteItem.objects.create(
                    credit_note=credit_note,
                    original_sale_item=sale_item,
                    product=sale_item.product,
                    quantity_returned=int(item_data['quantity_returned']),
                    unit_price=sale_item.selling_price,
                    condition=item_data.get('condition', 'GOOD')
                )
                
                total_amount += credit_item.line_total
                
                # Create inventory movement (stock increase)
                create_inventory_movement(
                    product_id=str(sale_item.product.id),
                    movement_type='RETURN_INWARD',
                    quantity=credit_item.quantity_returned,
                    warehouse=warehouse,
                    reference_type='CreditNote',
                    reference_id=str(credit_note.id),
                    remarks=f"Customer return via {credit_note.credit_note_number}",
                    user=self.context['request'].user
                )
            
            credit_note.total_amount = total_amount
            credit_note.save()
            
        return credit_note


# =============================================================================
# DEBIT NOTES (SUPPLIER RETURNS)
# =============================================================================

class DebitNoteItemSerializer(serializers.ModelSerializer):
    """
    Debit Note Item serializer for supplier returns.
    """
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    original_po_number = serializers.CharField(
        source='original_purchase_order_item.purchase_order.po_number', 
        read_only=True
    )
    
    class Meta:
        model = DebitNoteItem
        fields = [
            'id', 'original_purchase_order_item', 'product', 'product_name', 
            'product_sku', 'quantity_returned', 'unit_price', 'line_total', 
            'condition', 'original_po_number', 'created_at'
        ]
        read_only_fields = ['id', 'line_total', 'created_at']
    
    def validate_quantity_returned(self, value):
        """Ensure returned quantity doesn't exceed original quantity."""
        if hasattr(self, 'instance') and self.instance:
            original_po_item = self.instance.original_purchase_order_item
        else:
            original_po_item = self.initial_data.get('original_purchase_order_item')
            if original_po_item:
                try:
                    original_po_item = PurchaseOrderItem.objects.get(id=original_po_item)
                except PurchaseOrderItem.DoesNotExist:
                    raise serializers.ValidationError("Invalid purchase order item reference")
        
        if original_po_item:
            # Get total quantity already returned
            existing_returns = DebitNoteItem.objects.filter(
                original_purchase_order_item=original_po_item
            ).exclude(id=getattr(self.instance, 'id', None))
            
            total_returned = sum(item.quantity_returned for item in existing_returns)
            
            if total_returned + value > original_po_item.received_quantity:
                raise serializers.ValidationError(
                    f"Cannot return {value} items. Only {original_po_item.received_quantity - total_returned} available."
                )
        
        return value


class DebitNoteSerializer(serializers.ModelSerializer):
    """
    Debit Note serializer for supplier returns.
    """
    items = DebitNoteItemSerializer(many=True, required=False)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    original_po_number = serializers.CharField(source='original_purchase_order.po_number', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = DebitNote
        fields = [
            'id', 'debit_note_number', 'original_purchase_order', 'original_po_number',
            'supplier', 'supplier_name', 'warehouse', 'warehouse_name', 
            'status', 'return_reason', 'notes', 'total_amount', 'adjustment_amount',
            'return_date', 'issue_date', 'settlement_date', 'created_by', 
            'created_by_name', 'created_at', 'updated_at', 'items'
        ]
        read_only_fields = [
            'id', 'debit_note_number', 'total_amount', 'supplier',
            'created_by', 'created_at', 'updated_at'
        ]
    
    def create(self, validated_data):
        """Create debit note with items."""
        items_data = validated_data.pop('items', [])
        validated_data['created_by'] = self.context['request'].user
        
        # Set supplier from purchase order
        purchase_order = validated_data['original_purchase_order']
        validated_data['supplier'] = purchase_order.supplier
        
        debit_note = DebitNote.objects.create(**validated_data)
        
        total_amount = Decimal('0.00')
        for item_data in items_data:
            item = DebitNoteItem.objects.create(
                debit_note=debit_note,
                **item_data
            )
            total_amount += item.line_total
        
        debit_note.total_amount = total_amount
        debit_note.save()
        
        return debit_note


class DebitNoteCreateSerializer(serializers.Serializer):
    """
    Simplified serializer for creating debit notes from purchase orders.
    """
    original_purchase_order = serializers.UUIDField()
    warehouse = serializers.UUIDField()
    return_reason = serializers.ChoiceField(choices=DebitNote.ReturnReason.choices)
    notes = serializers.CharField(required=False, allow_blank=True)
    return_date = serializers.DateField()
    
    items = serializers.ListField(
        child=serializers.DictField(child=serializers.CharField()),
        min_length=1
    )
    
    def validate_original_purchase_order(self, value):
        """Validate purchase order exists and has received items."""
        try:
            po = PurchaseOrder.objects.get(id=value)
            if po.status not in [PurchaseOrder.Status.PARTIAL, PurchaseOrder.Status.RECEIVED]:
                raise serializers.ValidationError("Can only return from orders that have received items")
            return po
        except PurchaseOrder.DoesNotExist:
            raise serializers.ValidationError("Purchase order not found")
    
    def validate_warehouse(self, value):
        """Validate warehouse exists."""
        try:
            return Warehouse.objects.get(id=value)
        except Warehouse.DoesNotExist:
            raise serializers.ValidationError("Warehouse not found")
    
    def create(self, validated_data):
        """Create debit note and generate inventory movements."""
        from .services import create_inventory_movement
        from django.db import transaction
        
        items_data = validated_data.pop('items')
        original_purchase_order = validated_data.pop('original_purchase_order')
        warehouse = validated_data.pop('warehouse')
        
        with transaction.atomic():
            # Create debit note
            debit_note = DebitNote.objects.create(
                original_purchase_order=original_purchase_order,
                supplier=original_purchase_order.supplier,
                warehouse=warehouse,
                created_by=self.context['request'].user,
                **validated_data
            )
            
            total_amount = Decimal('0.00')
            
            for item_data in items_data:
                po_item = PurchaseOrderItem.objects.get(id=item_data['original_purchase_order_item'])
                
                # Create debit note item
                debit_item = DebitNoteItem.objects.create(
                    debit_note=debit_note,
                    original_purchase_order_item=po_item,
                    product=po_item.product,
                    quantity_returned=int(item_data['quantity_returned']),
                    unit_price=po_item.unit_price,
                    condition=item_data.get('condition', 'GOOD')
                )
                
                total_amount += debit_item.line_total
                
                # Create inventory movement (stock decrease)
                create_inventory_movement(
                    product_id=str(po_item.product.id),
                    movement_type='RETURN_OUTWARD',
                    quantity=-debit_item.quantity_returned,
                    warehouse=warehouse,
                    reference_type='DebitNote',
                    reference_id=str(debit_note.id),
                    remarks=f"Supplier return via {debit_note.debit_note_number}",
                    user=self.context['request'].user
                )
            
            debit_note.total_amount = total_amount
            debit_note.save()
            
        return debit_note
