"""
Analytics Summary Service.
Provides aggregated dashboard metrics from a single endpoint.
"""

from datetime import date, timedelta
from decimal import Decimal
from django.db.models import Sum, Count
from django.utils import timezone

from inventory.models import Product, ProductVariant
from sales.models import Sale
from invoices.models import Invoice


def get_analytics_summary(warehouse_id=None, organization_id=None):
    """
    Get aggregated analytics summary for dashboard.
    
    Returns:
        dict: {
            "totalProducts": int,
            "todaySalesAmount": number,
            "pendingInvoices": int,
            "monthlyRevenue": number,
            "trends": {
                "productsChangePct": number,
                "salesChangePct": number,
                "invoicesChangePct": number,
                "revenueChangePct": number
            },
            "meta": {
                "generatedAt": str,
                "warehouseId": str | None
            }
        }
    """
    today = timezone.localdate()
    start_of_month = today.replace(day=1)
    start_of_last_month = (start_of_month - timedelta(days=1)).replace(day=1)
    
    # Base querysets — always scoped to caller's organization when provided
    products_qs = Product.objects.filter(is_active=True)
    sales_qs = Sale.objects.filter(status='COMPLETED')
    invoices_qs = Invoice.objects.all()

    if organization_id is not None:
        products_qs = products_qs.filter(organization_id=organization_id)
        sales_qs = sales_qs.filter(organization_id=organization_id)
        invoices_qs = invoices_qs.filter(sale__organization_id=organization_id)
    else:
        products_qs = products_qs.none()
        sales_qs = sales_qs.none()
        invoices_qs = invoices_qs.none()
    
    if warehouse_id:
        sales_qs = sales_qs.filter(warehouse_id=warehouse_id)
        invoices_qs = invoices_qs.filter(warehouse_id=warehouse_id)
    
    # Total products
    total_products = products_qs.count()
    
    # Today's sales
    today_sales = sales_qs.filter(created_at__date=today)
    today_sales_amount = today_sales.aggregate(
        total=Sum('total')
    )['total'] or Decimal('0')
    
    # Pending invoices (invoices without PDF or from today)
    pending_invoices = invoices_qs.filter(
        created_at__date=today
    ).count()
    
    # Monthly revenue
    monthly_sales = sales_qs.filter(created_at__date__gte=start_of_month)
    monthly_revenue = monthly_sales.aggregate(
        total=Sum('total')
    )['total'] or Decimal('0')
    
    # Previous month for comparison
    last_month_sales = sales_qs.filter(
        created_at__date__gte=start_of_last_month,
        created_at__date__lt=start_of_month
    )
    last_month_revenue = last_month_sales.aggregate(
        total=Sum('total')
    )['total'] or Decimal('0')
    
    # Yesterday for sales comparison
    yesterday = today - timedelta(days=1)
    yesterday_sales_amount = sales_qs.filter(
        created_at__date=yesterday
    ).aggregate(total=Sum('total'))['total'] or Decimal('0')
    
    # Calculate trends (percentage changes)
    def calc_pct_change(current, previous):
        if previous == 0:
            return 0 if current == 0 else 100
        return round(((current - previous) / previous) * 100)
    
    revenue_change_pct = calc_pct_change(
        float(monthly_revenue), 
        float(last_month_revenue)
    )
    sales_change_pct = calc_pct_change(
        float(today_sales_amount),
        float(yesterday_sales_amount)
    )
    
    return {
        "totalProducts": total_products,
        "todaySalesAmount": float(today_sales_amount),
        "pendingInvoices": pending_invoices,
        "monthlyRevenue": float(monthly_revenue),
        "trends": {
            "productsChangePct": 0,  # Products rarely change day-to-day
            "salesChangePct": sales_change_pct,
            "invoicesChangePct": 0,
            "revenueChangePct": revenue_change_pct
        },
        "meta": {
            "generatedAt": timezone.now().isoformat(),
            "warehouseId": str(warehouse_id) if warehouse_id else None
        }
    }
