"""
Invoice Admin Configuration.

IMMUTABILITY: Invoices are read-only in admin.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models import Invoice, InvoiceItem, InvoiceSequence, BusinessSettings


class InvoiceItemInline(admin.TabularInline):
    """Inline display of invoice items."""
    model = InvoiceItem
    extra = 0
    readonly_fields = [
        'id', 'product_name', 'variant_details',
        'quantity', 'unit_price', 'line_total'
    ]
    fields = ['product_name', 'variant_details', 'quantity', 'unit_price', 'line_total']
    
    def has_add_permission(self, request, obj=None):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    """
    Read-only admin for Invoices.
    
    IMMUTABILITY:
    - No add permission
    - No change permission
    - No delete permission
    """
    list_display = [
        'invoice_number', 'sale_number', 'billing_name',
        'subtotal_display', 'discount_display', 'total_display',
        'invoice_date'
    ]
    list_filter = ['discount_type', 'invoice_date', 'warehouse']
    search_fields = ['invoice_number', 'billing_name', 'billing_phone']
    readonly_fields = [
        'id', 'invoice_number', 'sale', 'warehouse',
        'subtotal_amount', 'discount_type', 'discount_value',
        'discount_amount', 'total_amount',
        'billing_name', 'billing_phone',
        'invoice_date', 'pdf_url', 'created_at'
    ]
    date_hierarchy = 'invoice_date'
    ordering = ['-created_at']
    inlines = [InvoiceItemInline]
    
    @admin.display(description='Sale')
    def sale_number(self, obj):
        return obj.sale.sale_number
    
    @admin.display(description='Subtotal')
    def subtotal_display(self, obj):
        return format_html('₹{:,.2f}', obj.subtotal_amount)
    
    @admin.display(description='Discount')
    def discount_display(self, obj):
        if obj.discount_type == 'NONE' or obj.discount_amount == 0:
            return '-'
        if obj.discount_type == 'PERCENTAGE':
            return format_html('{}% (₹{:,.2f})', obj.discount_value, obj.discount_amount)
        return format_html('₹{:,.2f}', obj.discount_amount)
    
    @admin.display(description='Total')
    def total_display(self, obj):
        return format_html('₹{:,.2f}', obj.total_amount)
    
    def has_add_permission(self, request):
        """Prevent adding invoices through admin."""
        return False
    
    def has_change_permission(self, request, obj=None):
        """Prevent editing invoices through admin."""
        return False
    
    def has_delete_permission(self, request, obj=None):
        """Prevent deleting invoices through admin."""
        return False


@admin.register(InvoiceItem)
class InvoiceItemAdmin(admin.ModelAdmin):
    """Read-only admin for InvoiceItems."""
    list_display = [
        'invoice_number', 'product_name', 'variant_details',
        'quantity', 'unit_price', 'line_total'
    ]
    list_filter = ['invoice__invoice_date']
    search_fields = ['invoice__invoice_number', 'product_name']
    readonly_fields = [
        'id', 'invoice', 'product_name', 'variant_details',
        'quantity', 'unit_price', 'line_total'
    ]
    
    @admin.display(description='Invoice')
    def invoice_number(self, obj):
        return obj.invoice.invoice_number
    
    def has_add_permission(self, request):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(InvoiceSequence)
class InvoiceSequenceAdmin(admin.ModelAdmin):
    """Admin for invoice sequence management."""
    list_display = ['prefix', 'year', 'current_number']
    readonly_fields = ['prefix', 'year', 'current_number']
    
    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(BusinessSettings)
class BusinessSettingsAdmin(admin.ModelAdmin):
    """
    Admin for business settings used in invoices.
    Singleton pattern - only one record allowed.
    """
    list_display = ['business_name', 'phone', 'email', 'city']
    fieldsets = (
        ('Business Identity', {
            'fields': ('business_name', 'tagline')
        }),
        ('Stock layout', {
            'fields': ('inventory_location_mode', 'shop_stock_mode', 'barcode_enabled', 'gst_enabled'),
            'description': (
                'One shop only hides godown/shop split. '
                'Godown + shops: TRANSFER sends stock to each shop; '
                'SHARED_GODOWN lets every shop sell from the same godown. '
                'barcode_enabled: auto barcodes + POS scan, or optional barcodes. '
                'gst_enabled: show GST on products/POS, or turn tax off entirely.'
            ),
        }),
        ('Address', {
            'fields': ('address_line1', 'address_line2', 'city', 'state', 'pincode')
        }),
        ('Contact', {
            'fields': ('phone', 'email', 'website')
        }),
        ('Tax Information', {
            'fields': ('gstin',),
            'classes': ('collapse',)
        }),
        ('Invoice Footer', {
            'fields': ('footer_text', 'terms_text')
        }),
    )
    
    def has_add_permission(self, request):
        # Only allow one instance
        return not BusinessSettings.objects.exists()
    
    def has_delete_permission(self, request, obj=None):
        return False
