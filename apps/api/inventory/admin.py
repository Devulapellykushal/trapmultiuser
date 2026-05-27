"""
Inventory Admin Configuration.

HARDENING RULES:
- No hard delete for business entities
- StockLedger and StockSnapshot are read-only
- Inactive items shown with clear visual indicators
- Phase 10A: Deleted products visible with is_deleted filter
"""

from django.contrib import admin
from django.utils.html import format_html
from .models import (
    ServiceItem,
    Warehouse, Product, ProductVariant, StockLedger, StockSnapshot,
    ProductPricing, ProductImage
)


class NoDeleteMixin:
    """
    Mixin to disable delete in admin.
    Items should be deactivated (is_active=False), not deleted.
    """
    
    def has_delete_permission(self, request, obj=None):
        """Prevent hard deletion through admin."""
        return False
    
    actions = None  # Disable bulk actions including delete


@admin.register(ServiceItem)
class ServiceItemAdmin(NoDeleteMixin, admin.ModelAdmin):
    list_display = [
        'service_name', 'default_price', 'gst_percent', 'hsn_code',
        'active', 'created_at',
    ]
    list_filter = ['active']
    search_fields = ['service_name', 'hsn_code']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(Warehouse)
class WarehouseAdmin(NoDeleteMixin, admin.ModelAdmin):
    """
    Admin for Warehouse.
    HARDENING: Delete disabled - use is_active=False instead.
    """
    list_display = ['name', 'code', 'status_badge', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name', 'code']
    readonly_fields = ['id', 'created_at', 'updated_at']
    list_editable = []
    
    @admin.display(description='Status')
    def status_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: green; font-weight: bold;">✓ Active</span>')
        return format_html('<span style="color: red; font-weight: bold;">✗ Inactive</span>')


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0
    readonly_fields = ['id', 'created_at', 'current_stock']
    fields = ['sku', 'size', 'color', 'cost_price', 'selling_price', 'reorder_threshold', 'is_active', 'current_stock']
    
    @admin.display(description='Current Stock')
    def current_stock(self, obj):
        if obj.pk:
            stock = obj.get_total_stock()
            if stock > obj.reorder_threshold:
                return format_html('<span style="color: green;">{}</span>', stock)
            elif stock > 0:
                return format_html('<span style="color: orange;">{} (Low)</span>', stock)
            return format_html('<span style="color: red;">0 (Out of Stock)</span>')
        return '-'
    
    def has_delete_permission(self, request, obj=None):
        """Prevent deletion of variants through admin."""
        return False


@admin.register(Product)
class ProductAdmin(NoDeleteMixin, admin.ModelAdmin):
    """
    Admin for Product.
    HARDENING: Delete disabled - use is_active=False instead.
    """
    list_display = ['name', 'brand', 'category', 'status_badge', 'variant_count', 'total_stock', 'created_at']
    list_filter = ['brand', 'category', 'is_active']
    search_fields = ['name', 'brand', 'category']
    readonly_fields = ['id', 'created_at', 'updated_at']
    inlines = [ProductVariantInline]
    
    @admin.display(description='Status')
    def status_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: green; font-weight: bold;">✓ Active</span>')
        return format_html('<span style="color: red; font-weight: bold;">✗ Inactive</span>')
    
    @admin.display(description='Variants')
    def variant_count(self, obj):
        return obj.variants.filter(is_active=True).count()
    
    @admin.display(description='Total Stock')
    def total_stock(self, obj):
        total = sum(v.get_total_stock() for v in obj.variants.all())
        return total


@admin.register(ProductVariant)
class ProductVariantAdmin(NoDeleteMixin, admin.ModelAdmin):
    """
    Admin for ProductVariant.
    HARDENING: Delete disabled - use is_active=False instead.
    """
    list_display = ['sku', 'product', 'size', 'color', 'cost_price', 'selling_price', 'status_badge', 'current_stock']
    list_filter = ['product__brand', 'product__category', 'is_active']
    search_fields = ['sku', 'product__name']
    readonly_fields = ['id', 'created_at', 'updated_at', 'current_stock_display']
    
    fieldsets = (
        ('Basic Info', {
            'fields': ('id', 'product', 'sku', 'size', 'color', 'is_active')
        }),
        ('Pricing', {
            'fields': ('cost_price', 'selling_price'),
            'description': 'WARNING: Price changes are blocked if stock exists.'
        }),
        ('Stock Settings', {
            'fields': ('reorder_threshold', 'current_stock_display')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    @admin.display(description='Status')
    def status_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: green; font-weight: bold;">✓ Active</span>')
        return format_html('<span style="color: red; font-weight: bold;">✗ Inactive</span>')
    
    @admin.display(description='Current Stock')
    def current_stock(self, obj):
        stock = obj.get_total_stock()
        if stock > obj.reorder_threshold:
            return format_html('<span style="color: green;">{}</span>', stock)
        elif stock > 0:
            return format_html('<span style="color: orange;">{} (Low)</span>', stock)
        return format_html('<span style="color: red;">0</span>')
    
    @admin.display(description='Current Stock')
    def current_stock_display(self, obj):
        if obj.pk:
            return self.current_stock(obj)
        return '-'


@admin.register(StockLedger)
class StockLedgerAdmin(admin.ModelAdmin):
    """
    Read-only admin for StockLedger.
    
    HARDENING: Ledger entries are IMMUTABLE.
    - No add permission
    - No change permission
    - No delete permission
    Corrections must be made via ADJUSTMENT entries through the API.
    """
    list_display = ['created_at', 'variant_sku', 'warehouse_code', 'event_type', 'quantity_display', 'reference_type', 'created_by']
    list_filter = ['event_type', 'reference_type', 'warehouse', 'created_at']
    search_fields = ['variant__sku', 'reference_id', 'notes']
    readonly_fields = [
        'id', 'variant', 'warehouse', 'event_type', 'quantity',
        'reference_type', 'reference_id', 'notes', 'created_by', 'created_at'
    ]
    date_hierarchy = 'created_at'
    ordering = ['-created_at']
    
    @admin.display(description='SKU')
    def variant_sku(self, obj):
        return obj.variant.sku
    
    @admin.display(description='Warehouse')
    def warehouse_code(self, obj):
        return obj.warehouse.code
    
    @admin.display(description='Quantity')
    def quantity_display(self, obj):
        if obj.quantity > 0:
            return format_html('<span style="color: green;">+{}</span>', obj.quantity)
        return format_html('<span style="color: red;">{}</span>', obj.quantity)
    
    def has_add_permission(self, request):
        """Prevent adding ledger entries through admin."""
        return False
    
    def has_change_permission(self, request, obj=None):
        """Prevent editing ledger entries through admin."""
        return False
    
    def has_delete_permission(self, request, obj=None):
        """Prevent deleting ledger entries through admin."""
        return False


@admin.register(StockSnapshot)
class StockSnapshotAdmin(admin.ModelAdmin):
    """
    Read-only admin for StockSnapshot.
    
    HARDENING: Snapshots are DERIVED from ledger entries.
    - No add permission
    - No change permission  
    - No delete permission
    Snapshots are updated automatically when ledger entries are created.
    """
    list_display = ['variant_sku', 'warehouse_code', 'quantity_display', 'last_updated']
    list_filter = ['warehouse']
    search_fields = ['variant__sku']
    readonly_fields = ['id', 'variant', 'warehouse', 'quantity', 'last_updated']
    
    @admin.display(description='SKU')
    def variant_sku(self, obj):
        return obj.variant.sku
    
    @admin.display(description='Warehouse')
    def warehouse_code(self, obj):
        return obj.warehouse.code
    
    @admin.display(description='Quantity')
    def quantity_display(self, obj):
        if obj.quantity > 0:
            return format_html('<span style="color: green;">{}</span>', obj.quantity)
        elif obj.quantity < 0:
            return format_html('<span style="color: red;">{}</span>', obj.quantity)
        return format_html('<span style="color: gray;">0</span>')
    
    def has_add_permission(self, request):
        """Prevent adding snapshots through admin."""
        return False
    
    def has_change_permission(self, request, obj=None):
        """Prevent editing snapshots through admin."""
        return False
    
    def has_delete_permission(self, request, obj=None):
        """Prevent deleting snapshots through admin."""
        return False


# =============================================================================
# PHASE 10A: PRODUCT MASTER ADMIN
# =============================================================================

class ProductPricingInline(admin.StackedInline):
    """Inline for ProductPricing in Product admin."""
    model = ProductPricing
    extra = 0
    max_num = 1
    readonly_fields = ['id', 'created_at', 'updated_at', 'margin_display', 'profit_display']
    fields = ['cost_price', 'mrp', 'selling_price', 'gst_percentage', 'margin_display', 'profit_display']
    
    @admin.display(description='Margin %')
    def margin_display(self, obj):
        if obj.pk:
            return f"{obj.margin_percentage:.2f}%"
        return '-'
    
    @admin.display(description='Profit')
    def profit_display(self, obj):
        if obj.pk:
            return f"₹{obj.profit_amount:.2f}"
        return '-'


class ProductImageInline(admin.TabularInline):
    """Inline for ProductImage in Product admin."""
    model = ProductImage
    extra = 0
    readonly_fields = ['id', 'created_at']
    fields = ['image_url', 'is_primary', 'created_at']


@admin.register(ProductPricing)
class ProductPricingAdmin(admin.ModelAdmin):
    """Admin for ProductPricing."""
    list_display = ['product', 'cost_price', 'mrp', 'selling_price', 'gst_percentage', 'margin_display']
    list_filter = ['gst_percentage']
    search_fields = ['product__name', 'product__sku']
    readonly_fields = ['id', 'created_at', 'updated_at', 'margin_display', 'profit_display']
    
    @admin.display(description='Margin %')
    def margin_display(self, obj):
        return f"{obj.margin_percentage:.2f}%"
    
    @admin.display(description='Profit')
    def profit_display(self, obj):
        return f"₹{obj.profit_amount:.2f}"


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    """Admin for ProductImage."""
    list_display = ['product', 'is_primary', 'image_url_short', 'created_at']
    list_filter = ['is_primary']
    search_fields = ['product__name', 'product__sku']
    readonly_fields = ['id', 'created_at']
    
    @admin.display(description='Image URL')
    def image_url_short(self, obj):
        if len(obj.image_url) > 50:
            return f"{obj.image_url[:50]}..."
        return obj.image_url
