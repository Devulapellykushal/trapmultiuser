"""
Analytics Views for Quake Inventory System.

READ-ONLY ANALYTICS API:
- Inventory insights
- Sales metrics
- Revenue analytics
- Discount analysis
- Performance KPIs

All endpoints are read-only and support time-range filtering.
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from .services import inventory, sales, revenue, discounts, performance, summary
from users.permissions import IsAdmin


# Common parameters for all analytics endpoints
DATE_PARAMS = [
    OpenApiParameter(
        name='start_date',
        description='Start date (YYYY-MM-DD). Default: 30 days ago',
        required=False,
        type=OpenApiTypes.DATE
    ),
    OpenApiParameter(
        name='end_date',
        description='End date (YYYY-MM-DD). Default: today',
        required=False,
        type=OpenApiTypes.DATE
    ),
    OpenApiParameter(
        name='warehouse_id',
        description='Filter by warehouse UUID',
        required=False,
        type=OpenApiTypes.UUID
    ),
]


# =================== INVENTORY ANALYTICS ===================

class InventoryOverviewView(APIView):
    """Get inventory overview metrics."""
    permission_classes = [IsAdmin]  # TODO: IsAdminUser
    
    @extend_schema(
        summary="Inventory Overview",
        description="Get overall inventory metrics including stock counts and values.",
        parameters=DATE_PARAMS,
        tags=['Analytics - Inventory']
    )
    def get(self, request):
        result = inventory.get_inventory_overview(
            warehouse_id=request.query_params.get('warehouse_id'),
            start_date=request.query_params.get('start_date'),
            end_date=request.query_params.get('end_date')
        )
        return Response(result)


class LowStockView(APIView):
    """Get low stock items."""
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Low Stock Items",
        description="Get items with stock below threshold (default: 10 units).",
        parameters=DATE_PARAMS + [
            OpenApiParameter(
                name='threshold',
                description='Low stock threshold (default: 10)',
                required=False,
                type=OpenApiTypes.INT
            ),
        ],
        tags=['Analytics - Inventory']
    )
    def get(self, request):
        threshold = int(request.query_params.get('threshold', 10))
        result = inventory.get_low_stock_items(
            warehouse_id=request.query_params.get('warehouse_id'),
            threshold=threshold
        )
        return Response({'items': result, 'threshold': threshold, 'count': len(result)})


class DeadStockView(APIView):
    """Get dead stock items."""
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Dead Stock Items",
        description="Get items with no movement in X days (default: 30 days).",
        parameters=DATE_PARAMS + [
            OpenApiParameter(
                name='days',
                description='Days of inactivity (default: 30)',
                required=False,
                type=OpenApiTypes.INT
            ),
        ],
        tags=['Analytics - Inventory']
    )
    def get(self, request):
        days = int(request.query_params.get('days', 30))
        result = inventory.get_dead_stock_items(
            days_threshold=days,
            warehouse_id=request.query_params.get('warehouse_id')
        )
        return Response({'items': result, 'days_inactive': days, 'count': len(result)})


# =================== SALES ANALYTICS ===================

class SalesSummaryView(APIView):
    """Get sales summary."""
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Sales Summary",
        description="Get sales metrics including count, units, and revenue.",
        parameters=DATE_PARAMS,
        tags=['Analytics - Sales']
    )
    def get(self, request):
        result = sales.get_sales_summary(
            start_date=request.query_params.get('start_date'),
            end_date=request.query_params.get('end_date'),
            warehouse_id=request.query_params.get('warehouse_id')
        )
        return Response(result)


class SalesTrendsView(APIView):
    """Get sales trends."""
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Sales Trends",
        description="Get sales trends by day/week/month. Returns chart-ready data.",
        parameters=DATE_PARAMS + [
            OpenApiParameter(
                name='granularity',
                description='Aggregation: day, week, or month (default: day)',
                required=False,
                type=OpenApiTypes.STR
            ),
        ],
        tags=['Analytics - Sales']
    )
    def get(self, request):
        result = sales.get_sales_trends(
            start_date=request.query_params.get('start_date'),
            end_date=request.query_params.get('end_date'),
            granularity=request.query_params.get('granularity', 'day'),
            warehouse_id=request.query_params.get('warehouse_id')
        )
        return Response(result)


class TopProductsView(APIView):
    """Get top selling products."""
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Top Selling Products",
        description="Get top selling products by quantity.",
        parameters=DATE_PARAMS + [
            OpenApiParameter(
                name='limit',
                description='Number of products to return (default: 10)',
                required=False,
                type=OpenApiTypes.INT
            ),
        ],
        tags=['Analytics - Sales']
    )
    def get(self, request):
        limit = int(request.query_params.get('limit', 10))
        result = sales.get_top_selling_products(
            start_date=request.query_params.get('start_date'),
            end_date=request.query_params.get('end_date'),
            warehouse_id=request.query_params.get('warehouse_id'),
            limit=limit
        )
        return Response({'products': result, 'count': len(result)})


# =================== REVENUE ANALYTICS ===================

class RevenueOverviewView(APIView):
    """Get revenue overview."""
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Revenue Overview",
        description="Get revenue metrics including gross, discounts, and net.",
        parameters=DATE_PARAMS,
        tags=['Analytics - Revenue']
    )
    def get(self, request):
        result = revenue.get_revenue_overview(
            start_date=request.query_params.get('start_date'),
            end_date=request.query_params.get('end_date'),
            warehouse_id=request.query_params.get('warehouse_id')
        )
        return Response(result)


class RevenueByProductView(APIView):
    """Get revenue by product."""
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Revenue by Product",
        description="Get revenue breakdown by product.",
        parameters=DATE_PARAMS + [
            OpenApiParameter(
                name='limit',
                description='Number of products to return (default: 10)',
                required=False,
                type=OpenApiTypes.INT
            ),
        ],
        tags=['Analytics - Revenue']
    )
    def get(self, request):
        limit = int(request.query_params.get('limit', 10))
        result = revenue.get_revenue_by_product(
            start_date=request.query_params.get('start_date'),
            end_date=request.query_params.get('end_date'),
            warehouse_id=request.query_params.get('warehouse_id'),
            limit=limit
        )
        return Response({'products': result, 'count': len(result)})


class RevenueByWarehouseView(APIView):
    """Get revenue by warehouse."""
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Revenue by Warehouse",
        description="Get revenue breakdown by warehouse. Returns chart-ready data.",
        parameters=[
            OpenApiParameter(
                name='start_date',
                description='Start date (YYYY-MM-DD)',
                required=False,
                type=OpenApiTypes.DATE
            ),
            OpenApiParameter(
                name='end_date',
                description='End date (YYYY-MM-DD)',
                required=False,
                type=OpenApiTypes.DATE
            ),
        ],
        tags=['Analytics - Revenue']
    )
    def get(self, request):
        result = revenue.get_revenue_by_warehouse(
            start_date=request.query_params.get('start_date'),
            end_date=request.query_params.get('end_date')
        )
        return Response(result)


# =================== DISCOUNT ANALYTICS ===================

class DiscountOverviewView(APIView):
    """Get discount analytics."""
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Discount Overview",
        description=(
            "Get discount analytics including total amounts, "
            "type breakdown, and impact on revenue."
        ),
        parameters=DATE_PARAMS,
        tags=['Analytics - Discounts']
    )
    def get(self, request):
        result = discounts.get_discount_overview(
            start_date=request.query_params.get('start_date'),
            end_date=request.query_params.get('end_date'),
            warehouse_id=request.query_params.get('warehouse_id')
        )
        return Response(result)


# =================== PERFORMANCE ANALYTICS ===================

class PerformanceOverviewView(APIView):
    """Get unified dashboard performance metrics."""
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Performance Overview",
        description=(
            "Get unified dashboard KPIs including revenue, sales, profit, "
            "inventory health, discount metrics, and top/low performing products."
        ),
        parameters=DATE_PARAMS,
        tags=['Analytics - Performance']
    )
    def get(self, request):
        result = performance.get_dashboard_overview(
            start_date=request.query_params.get('start_date'),
            end_date=request.query_params.get('end_date'),
            warehouse_id=request.query_params.get('warehouse_id')
        )
        return Response(result)


# =================== ANALYTICS SUMMARY ===================

class AnalyticsSummaryView(APIView):
    """Get unified analytics summary for dashboard."""
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Analytics Summary",
        description=(
            "Get aggregated dashboard metrics in a single call.\n\n"
            "**Returns:**\n"
            "- `totalProducts`: Active product count\n"
            "- `todaySalesAmount`: Today's total sales (numeric)\n"
            "- `pendingInvoices`: Invoices created today\n"
            "- `monthlyRevenue`: Current month revenue (numeric)\n"
            "- `trends`: Percentage changes vs previous period\n\n"
            "All values are numeric (no formatting). Frontend handles display."
        ),
        parameters=[
            OpenApiParameter(
                name='warehouse_id',
                description='Filter by warehouse UUID',
                required=False,
                type=OpenApiTypes.UUID
            ),
        ],
        tags=['Analytics - Summary']
    )
    def get(self, request):
        result = summary.get_analytics_summary(
            warehouse_id=request.query_params.get('warehouse_id')
        )
        return Response(result)
