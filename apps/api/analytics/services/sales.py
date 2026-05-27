"""
Sales Analytics Service.
Read-only analytics for sales insights.

RULES:
- All queries are read-only
- Never mutate sales data
- Use database aggregations
- Support time-range filtering
"""

from datetime import date, timedelta
from typing import Optional, List, Dict, Any
from decimal import Decimal
from django.db.models import Sum, Count, Avg, F
from django.db.models.functions import Coalesce, TruncDate, TruncWeek, TruncMonth
from django.utils import timezone

from sales.models import Sale, SaleItem


def get_date_range(start_date: Optional[str] = None, end_date: Optional[str] = None) -> tuple:
    """Parse date range or return default (last 30 days)."""
    if end_date:
        end = date.fromisoformat(end_date)
    else:
        end = timezone.now().date()
    
    if start_date:
        start = date.fromisoformat(start_date)
    else:
        start = end - timedelta(days=30)
    
    return start, end


def get_sales_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get sales summary metrics for dashboard.
    
    Returns:
        - total_sales: Number of completed sales
        - total_units: Total units sold
        - total_revenue: Gross revenue
        - average_order_value: Average sale amount
    """
    start, end = get_date_range(start_date, end_date)
    
    sales = Sale.objects.filter(
        status=Sale.Status.COMPLETED,
        created_at__date__gte=start,
        created_at__date__lte=end
    )
    
    if warehouse_id:
        sales = sales.filter(warehouse_id=warehouse_id)
    
    aggregates = sales.aggregate(
        total_sales=Count('id'),
        total_units=Coalesce(Sum('total_items'), 0),
        total_revenue=Coalesce(Sum('total'), Decimal('0.00')),
        average_order_value=Coalesce(Avg('total'), Decimal('0.00'))
    )
    
    return {
        'period': {
            'start_date': start.isoformat(),
            'end_date': end.isoformat()
        },
        'total_sales': aggregates['total_sales'],
        'total_units': aggregates['total_units'],
        'total_revenue': str(aggregates['total_revenue']),
        'average_order_value': str(round(aggregates['average_order_value'], 2))
    }


def get_sales_trends(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    granularity: str = 'day',
    warehouse_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get sales trends by time period.
    
    Args:
        granularity: 'day', 'week', or 'month'
    
    Returns:
        Chart-ready data with labels and values
    """
    start, end = get_date_range(start_date, end_date)
    
    sales = Sale.objects.filter(
        status=Sale.Status.COMPLETED,
        created_at__date__gte=start,
        created_at__date__lte=end
    )
    
    if warehouse_id:
        sales = sales.filter(warehouse_id=warehouse_id)
    
    # Choose truncation function
    if granularity == 'week':
        trunc_func = TruncWeek('created_at')
    elif granularity == 'month':
        trunc_func = TruncMonth('created_at')
    else:
        trunc_func = TruncDate('created_at')
    
    trends = sales.annotate(
        period=trunc_func
    ).values('period').annotate(
        sales_count=Count('id'),
        revenue=Sum('total'),
        units=Sum('total_items')
    ).order_by('period')
    
    labels = []
    sales_data = []
    revenue_data = []
    units_data = []
    
    for item in trends:
        labels.append(item['period'].isoformat() if item['period'] else '')
        sales_data.append(item['sales_count'])
        revenue_data.append(str(item['revenue']))
        units_data.append(item['units'])
    
    return {
        'period': {
            'start_date': start.isoformat(),
            'end_date': end.isoformat()
        },
        'granularity': granularity,
        'labels': labels,
        'datasets': {
            'sales_count': sales_data,
            'revenue': revenue_data,
            'units_sold': units_data
        }
    }


def get_top_selling_products(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Get top selling products by quantity.
    """
    start, end = get_date_range(start_date, end_date)
    
    items = SaleItem.objects.filter(
        sale__status=Sale.Status.COMPLETED,
        sale__created_at__date__gte=start,
        sale__created_at__date__lte=end
    ).select_related('product')
    
    if warehouse_id:
        items = items.filter(sale__warehouse_id=warehouse_id)
    
    # Aggregate by product (Phase 13: line items reference Product, not ProductVariant)
    top_products = items.values(
        'product__id',
        'product__sku',
        'product__name'
    ).annotate(
        total_quantity=Sum('quantity'),
        total_revenue=Sum('line_total')
    ).order_by('-total_quantity')[:limit]
    
    result = []
    for idx, item in enumerate(top_products, 1):
        sku = item['product__sku'] or ''
        result.append({
            'rank': idx,
            # Legacy key name kept for dashboard consumers; value is product UUID
            'variant_id': str(item['product__id']),
            'sku': sku,
            'product_name': item['product__name'],
            'total_quantity': item['total_quantity'],
            'total_revenue': str(item['total_revenue'])
        })
    
    return result


def get_low_performers(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    limit: int = 5
) -> List[Dict[str, Any]]:
    """
    Get low-performing products (least sold) in the period.
    """
    start, end = get_date_range(start_date, end_date)
    
    items = SaleItem.objects.filter(
        sale__status=Sale.Status.COMPLETED,
        sale__created_at__date__gte=start,
        sale__created_at__date__lte=end
    ).select_related('product')
    
    if warehouse_id:
        items = items.filter(sale__warehouse_id=warehouse_id)
    
    # Aggregate by product — ascending quantity for lowest performers
    low_products = items.values(
        'product__id',
        'product__sku',
        'product__name'
    ).annotate(
        total_quantity=Sum('quantity'),
        total_revenue=Sum('line_total')
    ).order_by('total_quantity')[:limit]
    
    result = []
    for idx, item in enumerate(low_products, 1):
        sku = item['product__sku'] or ''
        result.append({
            'rank': idx,
            'variant_id': str(item['product__id']),
            'sku': sku,
            'product_name': item['product__name'],
            'total_quantity': item['total_quantity'],
            'total_revenue': str(item['total_revenue'])
        })
    
    return result


def get_sales_by_payment_method(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get sales breakdown by payment method.
    """
    start, end = get_date_range(start_date, end_date)
    
    # Get payments breakdown instead of sales breakdown
    from sales.models import Payment
    payments = Payment.objects.filter(
        sale__status=Sale.Status.COMPLETED,
        sale__created_at__date__gte=start,
        sale__created_at__date__lte=end
    )
    
    if warehouse_id:
        payments = payments.filter(sale__warehouse_id=warehouse_id)
    
    breakdown = payments.values('method').annotate(
        count=Count('id'),
        total=Sum('amount')
    ).order_by('-count')
    
    labels = []
    counts = []
    amounts = []
    
    for item in breakdown:
        labels.append(item['method'])
        counts.append(item['count'])
        amounts.append(str(item['total']))
    
    return {
        'period': {
            'start_date': start.isoformat(),
            'end_date': end.isoformat()
        },
        'labels': labels,
        'datasets': {
            'count': counts,
            'amount': amounts
        }
    }
