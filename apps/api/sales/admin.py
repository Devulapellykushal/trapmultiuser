"""
Sales Admin Configuration.

PHASE 13: POS ENGINE
====================

IMMUTABILITY: Sales, SaleItems, and Payments are read-only in admin.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models import Sale, SaleItem, Payment


class SaleItemInline(admin.TabularInline):
    """Inline display of sale items."""
    model = SaleItem
    extra = 0
    readonly_fields = [
        'id', 'product', 'quantity', 'selling_price', 'line_total'
    ]
    fields = ['product', 'quantity', 'selling_price', 'line_total']
    
    def has_add_permission(self, request, obj=None):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


class PaymentInline(admin.TabularInline):
    """Inline display of payments."""
    model = Payment
    extra = 0
    readonly_fields = ['id', 'method', 'amount', 'created_at']
    fields = ['method', 'amount', 'created_at']
    
    def has_add_permission(self, request, obj=None):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    """
    Read-only admin for Sales.
    
    IMMUTABILITY:
    - No add permission
    - No change permission
    - No delete permission
    """
    list_display = [
        'invoice_number', 'warehouse', 'store', 'total_display',
        'total_items', 'status_badge', 'created_at'
    ]
    list_filter = ['status', 'warehouse', 'store', 'created_at']
    search_fields = ['invoice_number', 'customer_name']
    readonly_fields = [
        'id', 'idempotency_key', 'invoice_number', 'warehouse', 'store',
        'customer_name', 'subtotal', 'discount_type', 'discount_value',
        'total', 'total_items', 'status', 'failure_reason',
        'created_by', 'created_at'
    ]
    date_hierarchy = 'created_at'
    ordering = ['-created_at']
    inlines = [SaleItemInline, PaymentInline]
    
    @admin.display(description='Total')
    def total_display(self, obj):
        return format_html('₹{:,.2f}', obj.total)
    
    @admin.display(description='Status')
    def status_badge(self, obj):
        colors = {
            Sale.Status.COMPLETED: 'green',
            Sale.Status.PENDING: 'orange',
            Sale.Status.FAILED: 'red',
            Sale.Status.CANCELLED: 'gray',
        }
        color = colors.get(obj.status, 'black')
        return format_html(
            '<span style="color: {};">{}</span>',
            color, obj.get_status_display()
        )
    
    def has_add_permission(self, request):
        """Prevent adding sales through admin."""
        return False
    
    def has_change_permission(self, request, obj=None):
        """Prevent editing sales through admin."""
        return False
    
    def has_delete_permission(self, request, obj=None):
        """Prevent deleting sales through admin."""
        return False


@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):
    """Read-only admin for SaleItems."""
    list_display = [
        'sale', 'product', 'quantity', 'selling_price', 'line_total'
    ]
    list_filter = ['sale__status', 'sale__created_at']
    search_fields = ['sale__invoice_number', 'product__sku']
    readonly_fields = [
        'id', 'sale', 'product', 'quantity', 'selling_price', 'line_total'
    ]
    
    def has_add_permission(self, request):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    """Read-only admin for Payments."""
    list_display = ['sale', 'method', 'amount', 'created_at']
    list_filter = ['method', 'created_at']
    search_fields = ['sale__invoice_number']
    readonly_fields = ['id', 'sale', 'method', 'amount', 'created_at']
    
    def has_add_permission(self, request):
        return False
    
    def has_change_permission(self, request, obj=None):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


