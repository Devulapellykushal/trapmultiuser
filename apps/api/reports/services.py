"""
Reports Services for Quake Inventory System.

PHASE 16: REPORTS & ANALYTICS (DECISION-GRADE)
===============================================

CORE PRINCIPLE: All reports derive from source-of-truth tables only.

ALLOWED SOURCES:
- InventoryMovement
- Sale, SaleItem
- Payment
- Return, ReturnItem
- Product, Warehouse

NO:
- Cached totals
- Stored analytics tables
- Recomputation of prices
"""

from decimal import Decimal
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from django.db import models
from django.db.models import Sum, Count, Avg, F, Q, Max, Min
from django.db.models.functions import TruncDate, TruncMonth, Coalesce
from django.utils import timezone

from inventory.models import InventoryMovement, Product, Warehouse
from sales.models import Sale, SaleItem, Return, ReturnItem


# =============================================================================
# A. INVENTORY REPORTS
# =============================================================================

def get_current_stock_report(
    warehouse_id: Optional[str] = None,
    product_id: Optional[str] = None,
    category: Optional[str] = None,
    brand: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Current Stock Report.
    
    Derived from: SUM(InventoryMovement.quantity) per product/warehouse.
    
    Returns:
        - product_id, product_name, sku, category, brand
        - warehouse, available_stock
    """
    queryset = InventoryMovement.objects.filter(
        product__is_deleted=False
    )
    
    if warehouse_id:
        queryset = queryset.filter(warehouse_id=warehouse_id)
    if product_id:
        queryset = queryset.filter(product_id=product_id)
    if category:
        queryset = queryset.filter(product__category__icontains=category)
    if brand:
        queryset = queryset.filter(product__brand__icontains=brand)
    
    # Aggregate by product + warehouse
    stock_data = queryset.values(
        'product_id',
        'product__name',
        'product__sku',
        'product__category',
        'product__brand',
        'warehouse_id',
        'warehouse__name'
    ).annotate(
        available_stock=Sum('quantity')
    ).order_by('product__name', 'warehouse__name')
    
    # Pagination
    total = stock_data.count()
    start = (page - 1) * page_size
    end = start + page_size
    results = list(stock_data[start:end])
    
    # Format response
    items = []
    for item in results:
        items.append({
            'product_id': str(item['product_id']),
            'product_name': item['product__name'],
            'sku': item['product__sku'],
            'category': item['product__category'],
            'brand': item['product__brand'],
            'warehouse_id': str(item['warehouse_id']) if item['warehouse_id'] else None,
            'warehouse_name': item['warehouse__name'],
            'available_stock': item['available_stock'] or 0
        })
    
    return {
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': items
    }


def get_stock_aging_report(
    warehouse_id: Optional[str] = None,
    date_as_of: Optional[datetime] = None
) -> Dict[str, Any]:
    """
    Stock Aging Report.
    
    Logic: Last movement date per product, bucket into age ranges.
    
    Buckets:
    - 0-30 days
    - 31-60 days
    - 61-90 days
    - 90+ days
    """
    if not date_as_of:
        date_as_of = timezone.now()
    
    queryset = InventoryMovement.objects.filter(
        product__is_deleted=False
    )
    
    if warehouse_id:
        queryset = queryset.filter(warehouse_id=warehouse_id)
    
    # Get last movement date and current stock per product
    product_data = queryset.values(
        'product_id',
        'product__name',
        'product__sku'
    ).annotate(
        last_movement_date=Max('created_at'),
        current_stock=Sum('quantity')
    ).filter(current_stock__gt=0)
    
    # Bucket into age ranges
    buckets = {
        '0-30 days': [],
        '31-60 days': [],
        '61-90 days': [],
        '90+ days': []
    }
    
    bucket_totals = {
        '0-30 days': {'count': 0, 'total_stock': 0},
        '31-60 days': {'count': 0, 'total_stock': 0},
        '61-90 days': {'count': 0, 'total_stock': 0},
        '90+ days': {'count': 0, 'total_stock': 0}
    }
    
    for item in product_data:
        if item['last_movement_date']:
            days_old = (date_as_of - item['last_movement_date']).days
            
            if days_old <= 30:
                bucket = '0-30 days'
            elif days_old <= 60:
                bucket = '31-60 days'
            elif days_old <= 90:
                bucket = '61-90 days'
            else:
                bucket = '90+ days'
            
            buckets[bucket].append({
                'product_id': str(item['product_id']),
                'product_name': item['product__name'],
                'sku': item['product__sku'],
                'last_movement_date': item['last_movement_date'].isoformat(),
                'days_since_movement': days_old,
                'current_stock': item['current_stock']
            })
            
            bucket_totals[bucket]['count'] += 1
            bucket_totals[bucket]['total_stock'] += item['current_stock']
    
    return {
        'as_of_date': date_as_of.isoformat(),
        'summary': bucket_totals,
        'details': buckets
    }


def get_stock_movement_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    movement_type: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    product_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Stock Movement Report.
    
    Lists all inventory movements with filters.
    """
    queryset = InventoryMovement.objects.select_related(
        'product', 'warehouse', 'created_by'
    ).filter(product__is_deleted=False)
    
    if date_from:
        queryset = queryset.filter(created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(created_at__lte=date_to)
    if movement_type:
        queryset = queryset.filter(movement_type=movement_type)
    if warehouse_id:
        queryset = queryset.filter(warehouse_id=warehouse_id)
    if product_id:
        queryset = queryset.filter(product_id=product_id)
    
    queryset = queryset.order_by('-created_at')
    
    # Pagination
    total = queryset.count()
    start = (page - 1) * page_size
    end = start + page_size
    results = queryset[start:end]
    
    items = []
    for m in results:
        items.append({
            'id': str(m.id),
            'product_id': str(m.product_id),
            'product_name': m.product.name,
            'product_sku': m.product.sku,
            'product_category': m.product.category if m.product.category else '',
            'product_brand': m.product.brand if m.product.brand else '',
            'warehouse_id': str(m.warehouse_id) if m.warehouse_id else None,
            'warehouse_name': m.warehouse.name if m.warehouse else None,
            'movement_type': m.movement_type,
            'quantity': m.quantity,
            'reference_type': m.reference_type,
            'reference_id': m.reference_id,
            'remarks': m.remarks,
            'created_by': m.created_by.username if m.created_by else None,
            'created_at': m.created_at.isoformat()
        })
    
    return {
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': items
    }


# =============================================================================
# B. SALES REPORTS
# =============================================================================

def get_sales_summary(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sales Summary Report.
    
    Metrics:
    - Total sales amount
    - Total quantity sold
    - Number of invoices
    - GST collected
    """
    queryset = Sale.objects.filter(status=Sale.Status.COMPLETED)
    
    if date_from:
        queryset = queryset.filter(created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(created_at__lte=date_to)
    if warehouse_id:
        queryset = queryset.filter(warehouse_id=warehouse_id)
    
    # Aggregate totals - using actual model fields
    summary = queryset.aggregate(
        total_sales=Coalesce(Sum('total'), Decimal('0.00')),
        total_subtotal=Coalesce(Sum('subtotal'), Decimal('0.00')),
        total_gst=Coalesce(Sum('total_gst'), Decimal('0.00')),
        invoice_count=Count('id'),
        total_items=Coalesce(Sum('total_items'), 0)
    )
    
    # Calculate discount as subtotal - (total - gst)
    total_discount = summary['total_subtotal'] - (summary['total_sales'] - summary['total_gst'])
    
    return {
        'period': {
            'from': date_from.isoformat() if date_from else None,
            'to': date_to.isoformat() if date_to else None
        },
        'total_sales': str(summary['total_sales']),
        'total_subtotal': str(summary['total_subtotal']),
        'total_discount': str(total_discount),
        'total_gst': str(summary['total_gst']),
        'invoice_count': summary['invoice_count'],
        'total_items_sold': summary['total_items']
    }


def get_product_sales_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None,
    product_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Product Sales Report.
    
    Derived from SaleItem aggregation.
    
    Returns per product:
    - quantity sold
    - revenue
    - gst_collected
    """
    queryset = SaleItem.objects.filter(
        sale__status=Sale.Status.COMPLETED
    )
    
    if date_from:
        queryset = queryset.filter(sale__created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(sale__created_at__lte=date_to)
    if warehouse_id:
        queryset = queryset.filter(sale__warehouse_id=warehouse_id)
    if product_id:
        queryset = queryset.filter(product_id=product_id)
    
    product_data = queryset.values(
        'product_id',
        'product__name',
        'product__sku',
        'product__category',
        'product__brand'
    ).annotate(
        quantity_sold=Sum('quantity'),
        revenue=Sum('line_total_with_gst'),
        gst_collected=Sum('gst_amount'),
        order_count=Count('sale', distinct=True)
    ).order_by('-revenue')
    
    # Pagination
    total = product_data.count()
    start = (page - 1) * page_size
    end = start + page_size
    results = list(product_data[start:end])
    
    items = []
    for item in results:
        items.append({
            'product_id': str(item['product_id']),
            'product_name': item['product__name'],
            'sku': item['product__sku'],
            'category': item['product__category'],
            'brand': item['product__brand'],
            'quantity_sold': item['quantity_sold'] or 0,
            'revenue': str(item['revenue'] or Decimal('0.00')),
            'gst_collected': str(item['gst_collected'] or Decimal('0.00')),
            'order_count': item['order_count']
        })
    
    return {
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': items
    }


def get_sales_trends(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None,
    group_by: str = 'day'  # 'day' or 'month'
) -> Dict[str, Any]:
    """
    Daily/Monthly Sales Trend.
    
    Group sales by day or month for charts.
    """
    queryset = Sale.objects.filter(status=Sale.Status.COMPLETED)
    
    if date_from:
        queryset = queryset.filter(created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(created_at__lte=date_to)
    if warehouse_id:
        queryset = queryset.filter(warehouse_id=warehouse_id)
    
    # Group by day or month
    if group_by == 'month':
        trunc_func = TruncMonth('created_at')
    else:
        trunc_func = TruncDate('created_at')
    
    trend_data = queryset.annotate(
        period=trunc_func
    ).values('period').annotate(
        total_sales=Sum('total'),
        invoice_count=Count('id'),
        total_items=Sum('total_items')
    ).order_by('period')
    
    results = []
    for item in trend_data:
        results.append({
            'period': item['period'].isoformat() if item['period'] else None,
            'total_sales': str(item['total_sales'] or Decimal('0.00')),
            'invoice_count': item['invoice_count'],
            'total_items': item['total_items'] or 0
        })
    
    return {
        'group_by': group_by,
        'results': results
    }


# =============================================================================
# C. RETURNS & ADJUSTMENTS REPORTS
# =============================================================================

def get_returns_summary(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Returns Summary Report.
    
    Metrics:
    - Returned quantity
    - Refund amount
    - Products with highest returns
    """
    queryset = Return.objects.filter(status=Return.Status.COMPLETED)
    
    if date_from:
        queryset = queryset.filter(created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(created_at__lte=date_to)
    if warehouse_id:
        queryset = queryset.filter(warehouse_id=warehouse_id)
    
    # Summary totals
    summary = queryset.aggregate(
        total_refund=Coalesce(Sum('refund_amount'), Decimal('0.00')),
        total_refund_gst=Coalesce(Sum('refund_gst'), Decimal('0.00')),
        return_count=Count('id')
    )
    
    # Top returned products
    return_items = ReturnItem.objects.filter(
        return_record__status=Return.Status.COMPLETED
    )
    if date_from:
        return_items = return_items.filter(return_record__created_at__gte=date_from)
    if date_to:
        return_items = return_items.filter(return_record__created_at__lte=date_to)
    if warehouse_id:
        return_items = return_items.filter(return_record__warehouse_id=warehouse_id)
    
    top_products = return_items.values(
        'sale_item__product_id',
        'sale_item__product__name',
        'sale_item__product__sku'
    ).annotate(
        total_returned=Sum('quantity'),
        total_refund=Sum('line_refund')
    ).order_by('-total_returned')[:10]
    
    top_list = []
    for item in top_products:
        top_list.append({
            'product_id': str(item['sale_item__product_id']),
            'product_name': item['sale_item__product__name'],
            'sku': item['sale_item__product__sku'],
            'total_returned': item['total_returned'],
            'total_refund': str(item['total_refund'] or Decimal('0.00'))
        })
    
    return {
        'summary': {
            'total_refund_amount': str(summary['total_refund']),
            'total_refund_gst': str(summary['total_refund_gst']),
            'return_count': summary['return_count']
        },
        'top_returned_products': top_list
    }


def get_adjustments_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None,
    product_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Adjustments Report (Audit).
    
    Shows all ADJUSTMENT movements.
    """
    queryset = InventoryMovement.objects.filter(
        movement_type='ADJUSTMENT'
    ).select_related('product', 'warehouse', 'created_by')
    
    if date_from:
        queryset = queryset.filter(created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(created_at__lte=date_to)
    if warehouse_id:
        queryset = queryset.filter(warehouse_id=warehouse_id)
    if product_id:
        queryset = queryset.filter(product_id=product_id)
    
    queryset = queryset.order_by('-created_at')
    
    # Summary
    summary = queryset.aggregate(
        total_adjustments=Count('id'),
        total_positive=Coalesce(Sum('quantity', filter=Q(quantity__gt=0)), 0),
        total_negative=Coalesce(Sum('quantity', filter=Q(quantity__lt=0)), 0)
    )
    
    # Pagination
    total = queryset.count()
    start = (page - 1) * page_size
    end = start + page_size
    results = queryset[start:end]
    
    items = []
    for m in results:
        items.append({
            'id': str(m.id),
            'product_id': str(m.product_id),
            'product_name': m.product.name,
            'product_sku': m.product.sku,
            'warehouse_name': m.warehouse.name if m.warehouse else None,
            'quantity': m.quantity,
            'reason': m.remarks,
            'created_by': m.created_by.username if m.created_by else None,
            'created_at': m.created_at.isoformat()
        })
    
    return {
        'summary': {
            'total_adjustments': summary['total_adjustments'],
            'total_positive_qty': summary['total_positive'],
            'total_negative_qty': summary['total_negative']
        },
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': items
    }


# =============================================================================
# D. PROFIT & TAX REPORTS
# =============================================================================

def get_gross_profit_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None,
    product_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Gross Profit Report.
    
    Derived as: (selling_price - cost_price) × quantity
    
    RULES:
    - Uses selling_price from SaleItem (stored at sale time)
    - Uses cost_price from ProductVariant (current - for estimation)
    
    NOTE: Ideally cost_price should be snapshotted at sale time.
    This uses current cost_price as an approximation.
    """
    from inventory.models import ProductVariant
    from django.db.models import Subquery, OuterRef
    
    queryset = SaleItem.objects.filter(
        sale__status=Sale.Status.COMPLETED
    ).select_related('product')
    
    if date_from:
        queryset = queryset.filter(sale__created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(sale__created_at__lte=date_to)
    if warehouse_id:
        queryset = queryset.filter(sale__warehouse_id=warehouse_id)
    if product_id:
        queryset = queryset.filter(product_id=product_id)
    
    # Get cost price from ProductVariant (first variant per product)
    cost_subquery = ProductVariant.objects.filter(
        product_id=OuterRef('product_id')
    ).values('cost_price')[:1]
    
    # Annotate with cost price
    queryset = queryset.annotate(
        variant_cost=Subquery(cost_subquery)
    )
    
    # Calculate profits - using Python since subquery aggregation is complex
    product_profits = {}
    total_revenue = Decimal('0.00')
    total_cost = Decimal('0.00')
    
    for item in queryset:
        pid = str(item.product_id)
        cost = item.variant_cost or Decimal('0.00')
        revenue = item.selling_price * item.quantity
        cost_total = cost * item.quantity
        profit = revenue - cost_total
        
        if pid not in product_profits:
            product_profits[pid] = {
                'product_id': pid,
                'product_name': item.product.name,
                'sku': item.product.sku,
                'quantity_sold': 0,
                'total_revenue': Decimal('0.00'),
                'total_cost': Decimal('0.00'),
                'gross_profit': Decimal('0.00')
            }
        
        product_profits[pid]['quantity_sold'] += item.quantity
        product_profits[pid]['total_revenue'] += revenue
        product_profits[pid]['total_cost'] += cost_total
        product_profits[pid]['gross_profit'] += profit
        
        total_revenue += revenue
        total_cost += cost_total
    
    # Sort by profit descending
    sorted_products = sorted(
        product_profits.values(),
        key=lambda x: x['gross_profit'],
        reverse=True
    )
    
    # Pagination
    total = len(sorted_products)
    start = (page - 1) * page_size
    end = start + page_size
    results = sorted_products[start:end]
    
    # Format results
    items = []
    for item in results:
        revenue = item['total_revenue']
        profit = item['gross_profit']
        margin = (profit / revenue * 100) if revenue > 0 else Decimal('0.00')
        
        items.append({
            'product_id': item['product_id'],
            'product_name': item['product_name'],
            'sku': item['sku'],
            'quantity_sold': item['quantity_sold'],
            'total_revenue': str(revenue),
            'total_cost': str(item['total_cost']),
            'gross_profit': str(profit),
            'margin_percent': str(margin.quantize(Decimal('0.01')))
        })
    
    gross_profit = total_revenue - total_cost
    overall_margin = Decimal('0.00')
    if total_revenue > 0:
        overall_margin = (gross_profit / total_revenue * 100)
    
    return {
        'summary': {
            'total_revenue': str(total_revenue),
            'total_cost': str(total_cost),
            'gross_profit': str(gross_profit),
            'overall_margin_percent': str(overall_margin.quantize(Decimal('0.01')))
        },
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': items
    }


def get_gst_summary_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    GST Summary Report.
    
    Returns:
    - GST collected (from sales)
    - GST refunded (from returns)
    - Net GST liability
    
    Derived from:
    - SaleItem.gst_amount
    - Return records (refund_gst)
    """
    # GST Collected (from completed sales)
    sales_queryset = Sale.objects.filter(status=Sale.Status.COMPLETED)
    if date_from:
        sales_queryset = sales_queryset.filter(created_at__gte=date_from)
    if date_to:
        sales_queryset = sales_queryset.filter(created_at__lte=date_to)
    if warehouse_id:
        sales_queryset = sales_queryset.filter(warehouse_id=warehouse_id)
    
    gst_collected = sales_queryset.aggregate(
        total=Coalesce(Sum('total_gst'), Decimal('0.00'))
    )['total']
    
    # GST Refunded (from returns)
    returns_queryset = Return.objects.filter(status=Return.Status.COMPLETED)
    if date_from:
        returns_queryset = returns_queryset.filter(created_at__gte=date_from)
    if date_to:
        returns_queryset = returns_queryset.filter(created_at__lte=date_to)
    if warehouse_id:
        returns_queryset = returns_queryset.filter(warehouse_id=warehouse_id)
    
    gst_refunded = returns_queryset.aggregate(
        total=Coalesce(Sum('refund_gst'), Decimal('0.00'))
    )['total']
    
    # Net GST
    net_gst = gst_collected - gst_refunded
    
    # GST by rate (breakdown)
    gst_by_rate = SaleItem.objects.filter(
        sale__status=Sale.Status.COMPLETED
    )
    if date_from:
        gst_by_rate = gst_by_rate.filter(sale__created_at__gte=date_from)
    if date_to:
        gst_by_rate = gst_by_rate.filter(sale__created_at__lte=date_to)
    if warehouse_id:
        gst_by_rate = gst_by_rate.filter(sale__warehouse_id=warehouse_id)
    
    rate_breakdown = gst_by_rate.values('gst_percentage').annotate(
        taxable_amount=Sum(F('line_total_with_gst') - F('gst_amount')),
        gst_amount=Sum('gst_amount')
    ).order_by('gst_percentage')
    
    breakdown = []
    for item in rate_breakdown:
        breakdown.append({
            'gst_rate': str(item['gst_percentage']),
            'taxable_amount': str(item['taxable_amount'] or Decimal('0.00')),
            'gst_amount': str(item['gst_amount'] or Decimal('0.00'))
        })
    
    return {
        'period': {
            'from': date_from.isoformat() if date_from else None,
            'to': date_to.isoformat() if date_to else None
        },
        'gst_collected': str(gst_collected),
        'gst_refunded': str(gst_refunded),
        'net_gst_liability': str(net_gst),
        'breakdown_by_rate': breakdown
    }


# =============================================================================
# E. DIMENSION REPORTS (Category, Brand, Size, Supplier, Warehouse)
# =============================================================================

def get_category_wise_sales_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Category-wise Sales Report.
    
    Aggregates sales by product category.
    """
    queryset = SaleItem.objects.filter(
        sale__status=Sale.Status.COMPLETED
    )
    
    if date_from:
        queryset = queryset.filter(sale__created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(sale__created_at__lte=date_to)
    if warehouse_id:
        queryset = queryset.filter(sale__warehouse_id=warehouse_id)
    
    category_data = queryset.values(
        'product__category'
    ).annotate(
        quantity_sold=Sum('quantity'),
        revenue=Sum('line_total_with_gst'),
        gst_collected=Sum('gst_amount'),
        order_count=Count('sale', distinct=True),
        product_count=Count('product', distinct=True)
    ).order_by('-revenue')
    
    # Pagination
    total = category_data.count()
    start = (page - 1) * page_size
    end = start + page_size
    results = list(category_data[start:end])
    
    # Total summary
    summary = queryset.aggregate(
        total_revenue=Coalesce(Sum('line_total_with_gst'), Decimal('0.00')),
        total_quantity=Coalesce(Sum('quantity'), 0),
        total_orders=Count('sale', distinct=True)
    )
    
    items = []
    for item in results:
        items.append({
            'category': item['product__category'] or 'Uncategorized',
            'quantity_sold': item['quantity_sold'] or 0,
            'revenue': str(item['revenue'] or Decimal('0.00')),
            'gst_collected': str(item['gst_collected'] or Decimal('0.00')),
            'order_count': item['order_count'],
            'product_count': item['product_count']
        })
    
    return {
        'summary': {
            'total_revenue': str(summary['total_revenue']),
            'total_quantity': summary['total_quantity'],
            'total_orders': summary['total_orders'],
            'category_count': total
        },
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': items
    }


def get_brand_wise_sales_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Brand-wise Sales Report.
    
    Aggregates sales by product brand.
    """
    queryset = SaleItem.objects.filter(
        sale__status=Sale.Status.COMPLETED
    )
    
    if date_from:
        queryset = queryset.filter(sale__created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(sale__created_at__lte=date_to)
    if warehouse_id:
        queryset = queryset.filter(sale__warehouse_id=warehouse_id)
    
    brand_data = queryset.values(
        'product__brand'
    ).annotate(
        quantity_sold=Sum('quantity'),
        revenue=Sum('line_total_with_gst'),
        gst_collected=Sum('gst_amount'),
        order_count=Count('sale', distinct=True),
        product_count=Count('product', distinct=True)
    ).order_by('-revenue')
    
    # Pagination
    total = brand_data.count()
    start = (page - 1) * page_size
    end = start + page_size
    results = list(brand_data[start:end])
    
    # Total summary
    summary = queryset.aggregate(
        total_revenue=Coalesce(Sum('line_total_with_gst'), Decimal('0.00')),
        total_quantity=Coalesce(Sum('quantity'), 0),
        total_orders=Count('sale', distinct=True)
    )
    
    items = []
    for item in results:
        items.append({
            'brand': item['product__brand'] or 'Unbranded',
            'quantity_sold': item['quantity_sold'] or 0,
            'revenue': str(item['revenue'] or Decimal('0.00')),
            'gst_collected': str(item['gst_collected'] or Decimal('0.00')),
            'order_count': item['order_count'],
            'product_count': item['product_count']
        })
    
    return {
        'summary': {
            'total_revenue': str(summary['total_revenue']),
            'total_quantity': summary['total_quantity'],
            'total_orders': summary['total_orders'],
            'brand_count': total
        },
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': items
    }


def get_size_wise_sales_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Size-wise Sales Report.
    
    Since SaleItem links to Product (not ProductVariant), we aggregate 
    using the product's variants to get size distribution. This shows
    which sizes are sold most based on the products that were sold.
    """
    from inventory.models import ProductVariant
    
    queryset = SaleItem.objects.filter(
        sale__status=Sale.Status.COMPLETED
    )
    
    if date_from:
        queryset = queryset.filter(sale__created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(sale__created_at__lte=date_to)
    if warehouse_id:
        queryset = queryset.filter(sale__warehouse_id=warehouse_id)
    
    # Get product IDs sold and their sales data
    product_sales = queryset.values(
        'product_id'
    ).annotate(
        quantity_sold=Sum('quantity'),
        revenue=Sum('line_total_with_gst'),
        gst_collected=Sum('gst_amount'),
        order_count=Count('sale', distinct=True)
    )
    
    # Get size data from ProductVariant for sold products
    sold_product_ids = [p['product_id'] for p in product_sales]
    
    # Get variants with sizes for sold products
    variant_sizes = ProductVariant.objects.filter(
        product_id__in=sold_product_ids,
        size__isnull=False
    ).exclude(size='').values('product_id', 'size')
    
    # Create a mapping of product_id to sizes
    product_size_map = {}
    for v in variant_sizes:
        pid = v['product_id']
        if pid not in product_size_map:
            product_size_map[pid] = set()
        product_size_map[pid].add(v['size'])
    
    # Aggregate by size
    size_totals = {}
    for ps in product_sales:
        pid = ps['product_id']
        sizes = product_size_map.get(pid, {'No Size'})
        
        # Distribute sales across sizes (in case a product has multiple sizes)
        # For simplicity, we count the full sale for each size the product has
        for size in sizes:
            if size not in size_totals:
                size_totals[size] = {
                    'quantity_sold': 0,
                    'revenue': Decimal('0.00'),
                    'gst_collected': Decimal('0.00'),
                    'order_count': 0,
                    'product_count': 0
                }
            size_totals[size]['quantity_sold'] += ps['quantity_sold'] or 0
            size_totals[size]['revenue'] += ps['revenue'] or Decimal('0.00')
            size_totals[size]['gst_collected'] += ps['gst_collected'] or Decimal('0.00')
            size_totals[size]['order_count'] += ps['order_count'] or 0
            size_totals[size]['product_count'] += 1
    
    # Convert to sorted list
    size_list = []
    for size, totals in size_totals.items():
        size_list.append({
            'size': size,
            'quantity_sold': totals['quantity_sold'],
            'revenue': totals['revenue'],
            'gst_collected': totals['gst_collected'],
            'order_count': totals['order_count'],
            'product_count': totals['product_count']
        })
    
    # Sort by revenue descending
    size_list.sort(key=lambda x: x['revenue'], reverse=True)
    
    # Pagination
    total = len(size_list)
    start = (page - 1) * page_size
    end = start + page_size
    results = size_list[start:end]
    
    # Total summary
    summary = queryset.aggregate(
        total_revenue=Coalesce(Sum('line_total_with_gst'), Decimal('0.00')),
        total_quantity=Coalesce(Sum('quantity'), 0),
        total_orders=Count('sale', distinct=True)
    )
    
    items = []
    for item in results:
        items.append({
            'size': item['size'] or 'No Size',
            'quantity_sold': item['quantity_sold'] or 0,
            'revenue': str(item['revenue'] or Decimal('0.00')),
            'gst_collected': str(item['gst_collected'] or Decimal('0.00')),
            'order_count': item['order_count'],
            'product_count': item['product_count']
        })
    
    return {
        'summary': {
            'total_revenue': str(summary['total_revenue']),
            'total_quantity': summary['total_quantity'],
            'total_orders': summary['total_orders'],
            'size_count': total
        },
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': items
    }


def get_supplier_wise_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Supplier-wise Purchase Report.
    
    Aggregates purchase orders by supplier.
    """
    from inventory.models import PurchaseOrder, PurchaseOrderItem
    
    queryset = PurchaseOrderItem.objects.filter(
        purchase_order__status__in=['RECEIVED', 'PARTIALLY_RECEIVED', 'COMPLETED']
    )
    
    if date_from:
        queryset = queryset.filter(purchase_order__created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(purchase_order__created_at__lte=date_to)
    if warehouse_id:
        queryset = queryset.filter(purchase_order__warehouse_id=warehouse_id)
    
    supplier_data = queryset.values(
        'purchase_order__supplier_id',
        'purchase_order__supplier__name',
        'purchase_order__supplier__code'
    ).annotate(
        quantity_ordered=Sum('quantity'),
        quantity_received=Sum('received_quantity'),
        total_amount=Sum(F('quantity') * F('unit_price')),
        order_count=Count('purchase_order', distinct=True),
        product_count=Count('product', distinct=True)
    ).order_by('-total_amount')
    
    # Pagination
    total = supplier_data.count()
    start = (page - 1) * page_size
    end = start + page_size
    results = list(supplier_data[start:end])
    
    # Total summary
    summary = queryset.aggregate(
        total_amount=Coalesce(Sum(F('quantity') * F('unit_price')), Decimal('0.00')),
        total_quantity=Coalesce(Sum('quantity'), 0),
        total_orders=Count('purchase_order', distinct=True)
    )
    
    items = []
    for item in results:
        items.append({
            'supplier_id': str(item['purchase_order__supplier_id']) if item['purchase_order__supplier_id'] else None,
            'supplier_name': item['purchase_order__supplier__name'] or 'Unknown Supplier',
            'supplier_code': item['purchase_order__supplier__code'] or '',
            'quantity_ordered': item['quantity_ordered'] or 0,
            'quantity_received': item['quantity_received'] or 0,
            'total_amount': str(item['total_amount'] or Decimal('0.00')),
            'order_count': item['order_count'],
            'product_count': item['product_count']
        })
    
    return {
        'summary': {
            'total_amount': str(summary['total_amount']),
            'total_quantity': summary['total_quantity'],
            'total_orders': summary['total_orders'],
            'supplier_count': total
        },
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': items
    }


def get_warehouse_wise_sales_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Warehouse-wise Sales Report.
    
    Aggregates sales by warehouse/store location.
    """
    queryset = Sale.objects.filter(status=Sale.Status.COMPLETED)
    
    if date_from:
        queryset = queryset.filter(created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(created_at__lte=date_to)
    
    warehouse_data = queryset.values(
        'warehouse_id',
        'warehouse__name',
        'warehouse__code'
    ).annotate(
        total_sales=Sum('total'),
        total_gst=Sum('total_gst'),
        invoice_count=Count('id'),
        total_items=Sum('total_items')
    ).order_by('-total_sales')
    
    # Pagination
    total = warehouse_data.count()
    start = (page - 1) * page_size
    end = start + page_size
    results = list(warehouse_data[start:end])
    
    # Total summary
    summary = queryset.aggregate(
        total_sales=Coalesce(Sum('total'), Decimal('0.00')),
        total_gst=Coalesce(Sum('total_gst'), Decimal('0.00')),
        invoice_count=Count('id'),
        total_items=Coalesce(Sum('total_items'), 0)
    )
    
    items = []
    for item in results:
        items.append({
            'warehouse_id': str(item['warehouse_id']) if item['warehouse_id'] else None,
            'warehouse_name': item['warehouse__name'] or 'Unknown Warehouse',
            'warehouse_code': item['warehouse__code'] or '',
            'total_sales': str(item['total_sales'] or Decimal('0.00')),
            'total_gst': str(item['total_gst'] or Decimal('0.00')),
            'invoice_count': item['invoice_count'],
            'total_items': item['total_items'] or 0
        })
    
    return {
        'summary': {
            'total_sales': str(summary['total_sales']),
            'total_gst': str(summary['total_gst']),
            'invoice_count': summary['invoice_count'],
            'total_items': summary['total_items'],
            'warehouse_count': total
        },
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': items
    }


def get_supplier_sales_report(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    warehouse_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    """
    Supplier-wise Sales Report.
    
    Shows which suppliers' products are selling best.
    Aggregates sales by supplier based on SaleItem.supplier field.
    
    This report helps identify:
    - Top performing suppliers
    - Supplier product demand
    - Revenue contribution by supplier
    """
    from sales.models import SaleItem, Sale
    
    queryset = SaleItem.objects.filter(
        sale__status=Sale.Status.COMPLETED
    )
    
    if date_from:
        queryset = queryset.filter(sale__created_at__gte=date_from)
    if date_to:
        queryset = queryset.filter(sale__created_at__lte=date_to)
    if warehouse_id:
        queryset = queryset.filter(sale__warehouse_id=warehouse_id)
    
    # Aggregate by supplier
    supplier_data = queryset.values(
        'supplier_id',
        'supplier__name',
        'supplier__code'
    ).annotate(
        quantity_sold=Sum('quantity'),
        total_revenue=Sum('line_total_with_gst'),
        total_gst=Sum('gst_amount'),
        product_count=Count('product', distinct=True),
        sale_count=Count('sale', distinct=True)
    ).order_by('-total_revenue')
    
    # Pagination
    total = supplier_data.count()
    start = (page - 1) * page_size
    end = start + page_size
    results = list(supplier_data[start:end])
    
    # Total summary
    summary = queryset.aggregate(
        total_revenue=Coalesce(Sum('line_total_with_gst'), Decimal('0.00')),
        total_gst=Coalesce(Sum('gst_amount'), Decimal('0.00')),
        total_quantity=Coalesce(Sum('quantity'), 0),
        total_sales=Count('sale', distinct=True)
    )
    
    items = []
    for item in results:
        supplier_id = item['supplier_id']
        items.append({
            'supplier_id': str(supplier_id) if supplier_id else None,
            'supplier_name': item['supplier__name'] or 'Unknown Supplier',
            'supplier_code': item['supplier__code'] or '',
            'quantity_sold': item['quantity_sold'] or 0,
            'total_revenue': str(item['total_revenue'] or Decimal('0.00')),
            'total_gst': str(item['total_gst'] or Decimal('0.00')),
            'product_count': item['product_count'],
            'sale_count': item['sale_count']
        })
    
    return {
        'summary': {
            'total_revenue': str(summary['total_revenue']),
            'total_gst': str(summary['total_gst']),
            'total_quantity': summary['total_quantity'],
            'total_sales': summary['total_sales'],
            'supplier_count': total
        },
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': items
    }
