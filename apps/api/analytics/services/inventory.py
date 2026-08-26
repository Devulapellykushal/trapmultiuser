"""
Inventory Analytics Service.
Read-only analytics for inventory insights.

RULES:
- All queries are read-only
- Never mutate inventory data
- Use database aggregations
- Support time-range filtering
"""

from datetime import date, timedelta
from typing import Optional, List, Dict, Any
from decimal import Decimal
from django.db.models import Sum, Count, F, Q, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from inventory.models import StockSnapshot, StockLedger, ProductVariant, Warehouse
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


def get_inventory_overview(
    warehouse_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    organization_id=None,
) -> Dict[str, Any]:
    """
    Get overall inventory metrics.
    
    Returns:
        - total_variants: Total number of product variants
        - total_stock: Total units across all warehouses
        - total_cost_value: Sum of (quantity × cost_price)
        - total_selling_value: Sum of (quantity × selling_price)
        - out_of_stock_count: Variants with 0 stock
        - low_stock_count: Variants below 10 units
    """
    snapshots = StockSnapshot.objects.select_related('variant', 'warehouse')
    snapshots = scope_by_org(snapshots, organization_id, field='warehouse__organization_id')
    
    if warehouse_id:
        snapshots = snapshots.filter(warehouse_id=warehouse_id)
    
    # Aggregate metrics
    aggregates = snapshots.aggregate(
        total_stock=Coalesce(Sum('quantity'), 0),
        total_cost_value=Coalesce(
            Sum(F('quantity') * F('variant__cost_price')),
            Decimal('0.00')
        ),
        total_selling_value=Coalesce(
            Sum(F('quantity') * F('variant__selling_price')),
            Decimal('0.00')
        )
    )
    
    # Count variants
    variants = ProductVariant.objects.filter(is_active=True)
    variants = scope_by_org(variants, organization_id, field='product__organization_id')
    total_variants = variants.count()
    
    # Out of stock (quantity = 0 or no snapshot)
    out_of_stock_count = snapshots.filter(quantity=0).count()
    
    # Low stock (quantity < 10 but > 0)
    low_stock_count = snapshots.filter(quantity__gt=0, quantity__lt=10).count()
    
    return {
        'total_variants': total_variants,
        'total_stock': aggregates['total_stock'],
        'total_cost_value': str(aggregates['total_cost_value']),
        'total_selling_value': str(aggregates['total_selling_value']),
        'out_of_stock_count': out_of_stock_count,
        'low_stock_count': low_stock_count,
        'potential_profit': str(
            aggregates['total_selling_value'] - aggregates['total_cost_value']
        )
    }


def get_low_stock_items(
    warehouse_id: Optional[str] = None,
    threshold: int = 10,
    limit: int = 50,
    organization_id=None,
) -> List[Dict[str, Any]]:
    """
    Get items with low stock (below threshold).
    """
    snapshots = StockSnapshot.objects.select_related(
        'variant__product', 'warehouse'
    ).filter(
        quantity__gt=0,
        quantity__lt=threshold,
        variant__is_active=True
    )
    snapshots = scope_by_org(snapshots, organization_id, field='warehouse__organization_id')
    
    if warehouse_id:
        snapshots = snapshots.filter(warehouse_id=warehouse_id)
    
    snapshots = snapshots.order_by('quantity')[:limit]
    
    items = []
    for snap in snapshots:
        items.append({
            'variant_id': str(snap.variant.id),
            'sku': snap.variant.sku,
            'product_name': snap.variant.product.name,
            'warehouse_name': snap.warehouse.name,
            'current_stock': snap.quantity,
            'threshold': threshold,
            'selling_price': str(snap.variant.selling_price)
        })
    
    return items


def get_out_of_stock_items(
    warehouse_id: Optional[str] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Get items with zero stock.
    """
    snapshots = StockSnapshot.objects.select_related(
        'variant__product', 'warehouse'
    ).filter(
        quantity=0,
        variant__is_active=True
    )
    
    if warehouse_id:
        snapshots = snapshots.filter(warehouse_id=warehouse_id)
    
    snapshots = snapshots[:limit]
    
    items = []
    for snap in snapshots:
        items.append({
            'variant_id': str(snap.variant.id),
            'sku': snap.variant.sku,
            'product_name': snap.variant.product.name,
            'warehouse_name': snap.warehouse.name
        })
    
    return items


def get_dead_stock_items(
    days_threshold: int = 30,
    warehouse_id: Optional[str] = None,
    limit: int = 50,
    organization_id=None,
) -> List[Dict[str, Any]]:
    """
    Get items with no movement in X days (dead stock).
    """
    cutoff_date = timezone.now() - timedelta(days=days_threshold)
    
    # Get variants with stock but no recent ledger activity
    snapshots = StockSnapshot.objects.select_related(
        'variant__product', 'warehouse'
    ).filter(
        quantity__gt=0,
        variant__is_active=True
    )
    snapshots = scope_by_org(snapshots, organization_id, field='warehouse__organization_id')
    
    if warehouse_id:
        snapshots = snapshots.filter(warehouse_id=warehouse_id)
    
    # Check for recent activity
    dead_items = []
    for snap in snapshots[:limit * 2]:  # Get more to filter
        recent_activity = StockLedger.objects.filter(
            variant=snap.variant,
            warehouse=snap.warehouse,
            created_at__gte=cutoff_date
        ).exists()
        
        if not recent_activity:
            dead_items.append({
                'variant_id': str(snap.variant.id),
                'sku': snap.variant.sku,
                'product_name': snap.variant.product.name,
                'warehouse_name': snap.warehouse.name,
                'current_stock': snap.quantity,
                'days_inactive': days_threshold,
                'stock_value': str(snap.quantity * snap.variant.cost_price)
            })
            
            if len(dead_items) >= limit:
                break
    
    return dead_items


def get_stock_by_warehouse() -> List[Dict[str, Any]]:
    """
    Get stock aggregated by warehouse.
    """
    warehouses = Warehouse.objects.filter(is_active=True)
    
    result = []
    for warehouse in warehouses:
        aggregates = StockSnapshot.objects.filter(
            warehouse=warehouse
        ).aggregate(
            total_stock=Coalesce(Sum('quantity'), 0),
            total_value=Coalesce(
                Sum(F('quantity') * F('variant__selling_price')),
                Decimal('0.00')
            )
        )
        
        result.append({
            'warehouse_id': str(warehouse.id),
            'warehouse_name': warehouse.name,
            'warehouse_code': warehouse.code,
            'total_stock': aggregates['total_stock'],
            'total_value': str(aggregates['total_value'])
        })
    
    return result
