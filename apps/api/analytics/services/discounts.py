"""
Discount Analytics Service.
Read-only analytics for discount insights.

RULES:
- All queries are read-only
- Never mutate invoice data
- Use database aggregations
- Support time-range filtering
"""

from datetime import date, timedelta
from typing import Optional, Dict, Any
from decimal import Decimal
from django.db.models import Sum, Count, Case, When, F
from django.db.models.functions import Coalesce
from django.utils import timezone

from analytics.org_scope import scope_by_org
from invoices.models import Invoice


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


def get_discount_overview(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None, organization_id=None
) -> Dict[str, Any]:
    """
    Get discount analytics overview.
    
    Returns:
        - total_invoices: Total invoices in period
        - invoices_with_discount: Invoices with PERCENTAGE or FLAT discount
        - invoices_without_discount: Invoices with NONE discount
        - total_discount_amount: Sum of all discounts
        - discount_impact_percentage: Discount as % of gross revenue
        - breakdown_by_type: Counts for each discount type
    """
    start, end = get_date_range(start_date, end_date)
    
    invoices = Invoice.objects.filter(
        invoice_date__gte=start,
        invoice_date__lte=end
    )
    invoices = scope_by_org(invoices, organization_id, field="sale__organization_id")
    
    if warehouse_id:
        invoices = invoices.filter(warehouse_id=warehouse_id)
    
    # Overall aggregates
    aggregates = invoices.aggregate(
        total_invoices=Count('id'),
        total_gross=Coalesce(Sum('subtotal_amount'), Decimal('0.00')),
        total_discount=Coalesce(Sum('discount_amount'), Decimal('0.00')),
        invoices_with_discount=Count(
            Case(When(discount_type__in=['PERCENTAGE', 'FLAT'], then=1))
        ),
        invoices_no_discount=Count(
            Case(When(discount_type='NONE', then=1))
        )
    )
    
    # Breakdown by discount type
    type_breakdown = invoices.values('discount_type').annotate(
        count=Count('id'),
        total_amount=Coalesce(Sum('discount_amount'), Decimal('0.00')),
        avg_discount=Coalesce(Sum('discount_amount') / Count('id'), Decimal('0.00'))
    ).order_by('discount_type')
    
    breakdown = {}
    for item in type_breakdown:
        breakdown[item['discount_type']] = {
            'count': item['count'],
            'total_amount': str(item['total_amount']),
            'avg_discount': str(round(item['avg_discount'], 2))
        }
    
    # Calculate impact percentage
    gross = aggregates['total_gross']
    discount_impact = (aggregates['total_discount'] / gross * 100) if gross > 0 else Decimal('0.00')
    
    # Chart data
    labels = list(breakdown.keys())
    counts = [breakdown[k]['count'] for k in labels]
    amounts = [breakdown[k]['total_amount'] for k in labels]
    
    return {
        'period': {
            'start_date': start.isoformat(),
            'end_date': end.isoformat()
        },
        'summary': {
            'total_invoices': aggregates['total_invoices'],
            'invoices_with_discount': aggregates['invoices_with_discount'],
            'invoices_without_discount': aggregates['invoices_no_discount'],
            'total_discount_amount': str(aggregates['total_discount']),
            'discount_impact_percentage': str(round(discount_impact, 2))
        },
        'by_type': breakdown,
        'chart': {
            'labels': labels,
            'counts': counts,
            'amounts': amounts
        }
    }


def get_discount_effectiveness(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    organization_id=None,
) -> Dict[str, Any]:
    """
    Compare revenue from discounted vs non-discounted invoices.
    """
    start, end = get_date_range(start_date, end_date)
    
    invoices = Invoice.objects.filter(
        invoice_date__gte=start,
        invoice_date__lte=end
    )
    invoices = scope_by_org(invoices, organization_id, field="sale__organization_id")
    
    # Discounted invoices
    discounted = invoices.exclude(discount_type='NONE').aggregate(
        count=Count('id'),
        total_revenue=Coalesce(Sum('total_amount'), Decimal('0.00')),
        avg_order_value=Coalesce(Sum('total_amount') / Count('id'), Decimal('0.00'))
    )
    
    # Non-discounted invoices
    no_discount = invoices.filter(discount_type='NONE').aggregate(
        count=Count('id'),
        total_revenue=Coalesce(Sum('total_amount'), Decimal('0.00')),
        avg_order_value=Coalesce(Sum('total_amount') / Count('id'), Decimal('0.00'))
    )
    
    return {
        'period': {
            'start_date': start.isoformat(),
            'end_date': end.isoformat()
        },
        'discounted': {
            'invoice_count': discounted['count'],
            'total_revenue': str(discounted['total_revenue']),
            'avg_order_value': str(round(discounted['avg_order_value'], 2))
        },
        'no_discount': {
            'invoice_count': no_discount['count'],
            'total_revenue': str(no_discount['total_revenue']),
            'avg_order_value': str(round(no_discount['avg_order_value'], 2))
        }
    }
