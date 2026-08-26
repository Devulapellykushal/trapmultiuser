"""
Performance Analytics Service.
Read-only analytics for operational performance insights.

RULES:
- All queries are read-only
- Never mutate any data
- Use database aggregations
- Support time-range filtering
"""

from datetime import date, timedelta
from typing import Optional, Dict, Any
from decimal import Decimal
from django.db.models import Sum, Count, Avg, F
from django.db.models.functions import Coalesce, ExtractHour, TruncDate
from django.utils import timezone

from sales.models import Sale
from inventory.models import StockLedger, StockSnapshot
from analytics.org_scope import scope_by_org


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


def get_performance_overview(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None, organization_id=None
) -> Dict[str, Any]:
    """
    Get operational performance metrics.
    
    Returns:
        - sales_per_day: Average sales per day
        - avg_checkout_size: Average items per checkout
        - avg_transaction_value: Average sale amount
        - peak_hours: Top hours by sales count
        - stock_turnover: Stock turnover rate
    """
    start, end = get_date_range(start_date, end_date)
    days_in_period = (end - start).days + 1
    
    sales = Sale.objects.filter(
        status=Sale.Status.COMPLETED,
        created_at__date__gte=start,
        created_at__date__lte=end
    )
    sales = scope_by_org(sales, organization_id)
    
    if warehouse_id:
        sales = sales.filter(warehouse_id=warehouse_id)
    
    # Basic aggregates
    aggregates = sales.aggregate(
        total_sales=Count('id'),
        total_units=Coalesce(Sum('total_items'), 0),
        total_revenue=Coalesce(Sum('total'), Decimal('0.00'))
    )
    
    total_sales = aggregates['total_sales']
    total_units = aggregates['total_units']
    
    sales_per_day = total_sales / days_in_period if days_in_period > 0 else 0
    avg_checkout_size = total_units / total_sales if total_sales > 0 else 0
    avg_transaction = aggregates['total_revenue'] / total_sales if total_sales > 0 else Decimal('0.00')
    
    # Peak hours
    peak_hours = get_peak_selling_hours(
        start_date, end_date, warehouse_id, organization_id=organization_id
    )
    
    return {
        'period': {
            'start_date': start.isoformat(),
            'end_date': end.isoformat(),
            'days': days_in_period
        },
        'metrics': {
            'total_sales': total_sales,
            'sales_per_day': round(sales_per_day, 2),
            'avg_checkout_size': round(avg_checkout_size, 2),
            'avg_transaction_value': str(round(avg_transaction, 2)),
            'total_units_sold': total_units
        },
        'peak_hours': peak_hours
    }


def get_peak_selling_hours(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    limit: int = 5,
    organization_id=None,
) -> list:
    """
    Get peak selling hours.
    """
    start, end = get_date_range(start_date, end_date)
    
    sales = Sale.objects.filter(
        status=Sale.Status.COMPLETED,
        created_at__date__gte=start,
        created_at__date__lte=end
    )
    sales = scope_by_org(sales, organization_id)
    
    if warehouse_id:
        sales = sales.filter(warehouse_id=warehouse_id)
    
    hours = sales.annotate(
        hour=ExtractHour('created_at')
    ).values('hour').annotate(
        sales_count=Count('id'),
        revenue=Sum('total')
    ).order_by('-sales_count')[:limit]
    
    result = []
    for item in hours:
        hour = item['hour']
        result.append({
            'hour': hour,
            'hour_label': f"{hour:02d}:00 - {hour + 1:02d}:00",
            'sales_count': item['sales_count'],
            'revenue': str(item['revenue'])
        })
    
    return result


def get_daily_performance(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None, organization_id=None
) -> Dict[str, Any]:
    """
    Get daily sales performance breakdown.
    """
    start, end = get_date_range(start_date, end_date)
    
    sales = Sale.objects.filter(
        status=Sale.Status.COMPLETED,
        created_at__date__gte=start,
        created_at__date__lte=end
    )
    sales = scope_by_org(sales, organization_id)
    
    if warehouse_id:
        sales = sales.filter(warehouse_id=warehouse_id)
    
    daily = sales.annotate(
        date=TruncDate('created_at')
    ).values('date').annotate(
        sales_count=Count('id'),
        units_sold=Sum('total_items'),
        revenue=Sum('total')
    ).order_by('date')
    
    labels = []
    sales_data = []
    units_data = []
    revenue_data = []
    
    for item in daily:
        labels.append(item['date'].isoformat())
        sales_data.append(item['sales_count'])
        units_data.append(item['units_sold'])
        revenue_data.append(str(item['revenue']))
    
    return {
        'period': {
            'start_date': start.isoformat(),
            'end_date': end.isoformat()
        },
        'labels': labels,
        'datasets': {
            'sales_count': sales_data,
            'units_sold': units_data,
            'revenue': revenue_data
        }
    }


def get_stock_turnover(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None, organization_id=None
) -> Dict[str, Any]:
    """
    Calculate stock turnover rate.
    
    Turnover = Units Sold / Average Stock
    """
    start, end = get_date_range(start_date, end_date)
    
    # Get units sold from ledger (SALE events)
    ledger = StockLedger.objects.filter(
        event_type=StockLedger.EventType.SALE,
        created_at__date__gte=start,
        created_at__date__lte=end
    )
    
    if warehouse_id:
        ledger = ledger.filter(warehouse_id=warehouse_id)
    
    # Sum absolute values of sale quantities (they are negative)
    units_sold = abs(ledger.aggregate(
        total=Coalesce(Sum('quantity'), 0)
    )['total'])
    
    # Get current stock
    snapshots = StockSnapshot.objects.all()
    if warehouse_id:
        snapshots = snapshots.filter(warehouse_id=warehouse_id)
    
    current_stock = snapshots.aggregate(
        total=Coalesce(Sum('quantity'), 0)
    )['total']
    
    # Calculate turnover (assuming average stock ≈ current stock for simplicity)
    # In production, you'd want historical averages
    avg_stock = current_stock if current_stock > 0 else 1
    turnover_rate = units_sold / avg_stock
    
    return {
        'period': {
            'start_date': start.isoformat(),
            'end_date': end.isoformat()
        },
        'units_sold': units_sold,
        'current_stock': current_stock,
        'turnover_rate': round(turnover_rate, 2),
        'note': 'Turnover = Units Sold / Current Stock (simplified)'
    }


def get_dashboard_overview(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    warehouse_id: Optional[str] = None, organization_id=None
) -> Dict[str, Any]:
    """
    Get unified dashboard metrics matching frontend PerformanceOverview interface.
    
    Returns:
        - kpis: Key performance indicators with deltas
        - inventory_health: Stock status breakdown
        - discount_metrics: Discount usage stats
        - top_products: Best selling products
        - low_performers: Low selling products
    """
    from . import sales, inventory, discounts
    
    start, end = get_date_range(start_date, end_date)
    prev_start = start - (end - start + timedelta(days=1))
    prev_end = start - timedelta(days=1)
    
    # Current period sales
    current_sales = Sale.objects.filter(
        status=Sale.Status.COMPLETED,
        created_at__date__gte=start,
        created_at__date__lte=end
    )
    current_sales = scope_by_org(current_sales, organization_id)
    if warehouse_id:
        current_sales = current_sales.filter(warehouse_id=warehouse_id)
    
    # Note: Sale model doesn't have discount_amount field
    # Profit calculation simplified to revenue-based estimate
    current_agg = current_sales.aggregate(
        total_sales=Count('id'),
        total_revenue=Coalesce(Sum('total'), Decimal('0.00')),
        avg_order_value=Coalesce(Avg('total'), Decimal('0.00'))
    )
    
    # Previous period for deltas
    prev_sales = Sale.objects.filter(
        status=Sale.Status.COMPLETED,
        created_at__date__gte=prev_start,
        created_at__date__lte=prev_end
    )
    prev_sales = scope_by_org(prev_sales, organization_id)
    if warehouse_id:
        prev_sales = prev_sales.filter(warehouse_id=warehouse_id)
    
    prev_agg = prev_sales.aggregate(
        total_sales=Count('id'),
        total_revenue=Coalesce(Sum('total'), Decimal('0.00')),
        avg_order_value=Coalesce(Avg('total'), Decimal('0.00'))
    )
    
    def calc_delta(current, previous):
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return round(((float(current) - float(previous)) / float(previous)) * 100, 1)
    
    total_revenue = float(current_agg['total_revenue'])
    # Simplified profit estimate (assumes ~30% margin, can be refined later)
    profit = total_revenue * 0.30
    prev_revenue = float(prev_agg['total_revenue'])
    prev_profit = prev_revenue * 0.30
    
    # Inventory health
    inv_data = inventory.get_inventory_overview(
        warehouse_id=warehouse_id, organization_id=organization_id
    )
    
    # Top products
    top_prods = sales.get_top_selling_products(
        start_date, end_date, warehouse_id, limit=5, organization_id=organization_id
    )
    top_products = [
        {
            'id': p.get('variant_id', 0),
            'name': p.get('product_name', ''),
            'sku': p.get('sku', ''),
            'units_sold': p.get('total_quantity', 0),
            'revenue': float(p.get('total_revenue', 0))
        }
        for p in top_prods
    ]
    
    # Low performers (bottom 5)
    low_prods = sales.get_low_performers(
        start_date, end_date, warehouse_id, limit=5, organization_id=organization_id
    )
    low_performers = [
        {
            'id': p.get('variant_id', 0),
            'name': p.get('product_name', ''),
            'sku': p.get('sku', ''),
            'units_sold': p.get('total_quantity', 0),
            'revenue': float(p.get('total_revenue', 0))
        }
        for p in low_prods
    ]
    
    # Discount metrics from discounts service
    disc_data = discounts.get_discount_overview(
        start_date, end_date, warehouse_id, organization_id=organization_id
    )
    
    return {
        'kpis': {
            'total_revenue': total_revenue,
            'revenue_delta': calc_delta(current_agg['total_revenue'], prev_agg['total_revenue']),
            'total_sales': current_agg['total_sales'],
            'sales_delta': calc_delta(current_agg['total_sales'], prev_agg['total_sales']),
            'avg_order_value': float(current_agg['avg_order_value']),
            'aov_delta': calc_delta(current_agg['avg_order_value'], prev_agg['avg_order_value']),
            'profit': profit,
            'profit_delta': calc_delta(profit, prev_profit)
        },
        'inventory_health': {
            'in_stock': inv_data.get('in_stock', 0),
            'low_stock': inv_data.get('low_stock', 0),
            'out_of_stock': inv_data.get('out_of_stock', 0)
        },
        'discount_metrics': {
            'discounted_sales': disc_data.get('discounted_sales', 0),
            'regular_sales': disc_data.get('regular_sales', 0),
            'total_discount_amount': float(disc_data.get('total_discount_amount', 0))
        },
        'top_products': top_products,
        'low_performers': low_performers
    }
