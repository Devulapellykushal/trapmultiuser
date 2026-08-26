"""
Revenue Analytics Service.
Read-only analytics for revenue insights.

RULES:
- All queries are read-only
- Never mutate invoice data
- Use database aggregations
- Support time-range filtering
"""

from datetime import date, timedelta
from typing import Optional, List, Dict, Any
from decimal import Decimal
from django.db.models import Sum, Count, F
from django.db.models.functions import Coalesce
from django.utils import timezone

from analytics.org_scope import scope_by_org
from invoices.models import Invoice, InvoiceItem


def get_date_range(start_date: Optional[str] = None, end_date: Optional[str] = None) -> tuple:
    """Parse date range or return default (last 30 days)."""
    if end_date:
        end = date.fromisoformat(end_date)
    else:
        end = timezone.localdate()
    
    if start_date:
        start = date.fromisoformat(start_date)
    else:
        start = end - timedelta(days=30)
    
    return start, end


def get_revenue_overview(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None, organization_id=None
) -> Dict[str, Any]:
    """
    Get revenue overview for dashboard.
    
    Returns:
        - total_invoices: Number of invoices
        - gross_revenue: Sum of subtotals (before discounts)
        - total_discounts: Sum of discount amounts
        - net_revenue: Sum of final totals (after discounts)
        - discount_rate: Discount as percentage of gross
    """
    start, end = get_date_range(start_date, end_date)
    
    invoices = Invoice.objects.filter(
        invoice_date__gte=start,
        invoice_date__lte=end
    )
    invoices = scope_by_org(invoices, organization_id, field="sale__organization_id")
    
    if warehouse_id:
        invoices = invoices.filter(warehouse_id=warehouse_id)
    
    aggregates = invoices.aggregate(
        total_invoices=Count('id'),
        gross_revenue=Coalesce(Sum('subtotal_amount'), Decimal('0.00')),
        total_discounts=Coalesce(Sum('discount_amount'), Decimal('0.00')),
        net_revenue=Coalesce(Sum('total_amount'), Decimal('0.00'))
    )
    
    gross = aggregates['gross_revenue']
    discount_rate = (aggregates['total_discounts'] / gross * 100) if gross > 0 else Decimal('0.00')
    
    return {
        'period': {
            'start_date': start.isoformat(),
            'end_date': end.isoformat()
        },
        'total_invoices': aggregates['total_invoices'],
        'gross_revenue': str(aggregates['gross_revenue']),
        'total_discounts': str(aggregates['total_discounts']),
        'net_revenue': str(aggregates['net_revenue']),
        'discount_rate': str(round(discount_rate, 2))
    }


def get_revenue_by_product(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    limit: int = 10, organization_id=None
) -> List[Dict[str, Any]]:
    """
    Get revenue breakdown by product.
    """
    start, end = get_date_range(start_date, end_date)
    
    items = InvoiceItem.objects.filter(
        invoice__invoice_date__gte=start,
        invoice__invoice_date__lte=end
    )
    items = scope_by_org(items, organization_id, field="invoice__sale__organization_id")
    
    if warehouse_id:
        items = items.filter(invoice__warehouse_id=warehouse_id)
    
    products = items.values('product_name').annotate(
        total_quantity=Sum('quantity'),
        total_revenue=Sum('line_total'),
        invoice_count=Count('invoice', distinct=True)
    ).order_by('-total_revenue')[:limit]
    
    result = []
    for idx, item in enumerate(products, 1):
        result.append({
            'rank': idx,
            'product_name': item['product_name'],
            'total_quantity': item['total_quantity'],
            'total_revenue': str(item['total_revenue']),
            'invoice_count': item['invoice_count']
        })
    
    return result


def get_revenue_by_warehouse(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    organization_id=None,
) -> Dict[str, Any]:
    """
    Get revenue breakdown by warehouse.
    """
    start, end = get_date_range(start_date, end_date)
    
    invoices = Invoice.objects.filter(
        invoice_date__gte=start,
        invoice_date__lte=end
    )
    invoices = scope_by_org(invoices, organization_id, field="sale__organization_id")

    warehouses = invoices.values(
        'warehouse__id',
        'warehouse__name',
        'warehouse__code'
    ).annotate(
        invoice_count=Count('id'),
        gross_revenue=Sum('subtotal_amount'),
        net_revenue=Sum('total_amount'),
        total_discounts=Sum('discount_amount')
    ).order_by('-net_revenue')
    
    labels = []
    gross_data = []
    net_data = []
    discount_data = []
    
    result = []
    for item in warehouses:
        labels.append(item['warehouse__name'])
        gross_data.append(str(item['gross_revenue']))
        net_data.append(str(item['net_revenue']))
        discount_data.append(str(item['total_discounts']))
        
        result.append({
            'warehouse_id': str(item['warehouse__id']),
            'warehouse_name': item['warehouse__name'],
            'warehouse_code': item['warehouse__code'],
            'invoice_count': item['invoice_count'],
            'gross_revenue': str(item['gross_revenue']),
            'net_revenue': str(item['net_revenue']),
            'total_discounts': str(item['total_discounts'])
        })
    
    return {
        'period': {
            'start_date': start.isoformat(),
            'end_date': end.isoformat()
        },
        'labels': labels,
        'datasets': {
            'gross_revenue': gross_data,
            'net_revenue': net_data,
            'discounts': discount_data
        },
        'data': result
    }
