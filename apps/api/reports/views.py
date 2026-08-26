"""
Reports Views for Quake Inventory System.

PHASE 16: REPORTS & ANALYTICS (DECISION-GRADE)
===============================================

API Endpoints:
- GET /api/v1/reports/inventory/current/
- GET /api/v1/reports/inventory/aging/
- GET /api/v1/reports/inventory/movements/
- GET /api/v1/reports/sales/summary/
- GET /api/v1/reports/sales/by-product/
- GET /api/v1/reports/sales/trends/
- GET /api/v1/reports/returns/
- GET /api/v1/reports/adjustments/
- GET /api/v1/reports/profit/
- GET /api/v1/reports/tax/gst/

RBAC:
- Inventory/Sales (most): Admin or Manager (legacy)
- Sales summary & trends: Staff may read (dashboard / POS context)
- Profit/Audit: Admin only
"""

from datetime import datetime, time
from django.conf import settings
from django.utils import timezone as dj_tz
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from users.permissions import HasReportsService, IsAdmin, IsStaffOrAdmin
from . import services


def _org_id(request):
    return getattr(request.user, "organization_id", None)


def _aware(dt: datetime) -> datetime:
    """Attach default timezone when USE_TZ is on and dt is naive."""
    if getattr(settings, "USE_TZ", False) and dj_tz.is_naive(dt):
        return dj_tz.make_aware(dt, dj_tz.get_current_timezone())
    return dt


def parse_date(date_str):
    """Parse ISO date/datetime to datetime (start of day for date-only)."""
    if not date_str:
        return None
    try:
        return _aware(datetime.fromisoformat(date_str.replace('Z', '+00:00')))
    except (ValueError, AttributeError):
        try:
            return _aware(datetime.strptime(date_str, '%Y-%m-%d'))
        except (ValueError, AttributeError):
            return None


def parse_date_to(date_str):
    """
    Parse end date. Date-only values include the full calendar day
    (23:59:59.999999) so \"today\" / range filters stay accurate.
    """
    if not date_str:
        return None
    raw = str(date_str).strip()
    dt = parse_date(raw)
    if dt is None:
        return None
    # YYYY-MM-DD (no time component) → end of that day
    if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
        end = datetime.combine(dt.date(), time(23, 59, 59, 999999))
        return _aware(end)
    return dt


class IsManagerOrAdmin(IsAuthenticated):
    """Permission for manager or admin users (not STAFF)."""
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        user = request.user
        return user.is_superuser or getattr(user, 'role', None) in ['ADMIN', 'MANAGER']


class IsStaffManagerOrAdmin(IsAuthenticated):
    """STAFF, MANAGER (legacy), ADMIN, or superuser — for read-only sales aggregates used on dashboard."""
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        user = request.user
        return user.is_superuser or getattr(user, 'role', None) in (
            'ADMIN',
            'MANAGER',
            'STAFF',
        )


# =============================================================================
# A. INVENTORY REPORTS
# =============================================================================

class CurrentStockReportView(APIView):
    """
    Current Stock Report.
    
    Derived from SUM(InventoryMovement.quantity) per product/warehouse.
    """
    permission_classes = [IsManagerOrAdmin, HasReportsService]
    
    @extend_schema(
        summary="Current Stock Report",
        description="Get current stock levels derived from inventory ledger.",
        parameters=[
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
            OpenApiParameter('product_id', OpenApiTypes.UUID, description='Filter by product'),
            OpenApiParameter('category', OpenApiTypes.STR, description='Filter by category'),
            OpenApiParameter('brand', OpenApiTypes.STR, description='Filter by brand'),
            OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
            OpenApiParameter('page_size', OpenApiTypes.INT, description='Items per page'),
        ],
        tags=['Reports - Inventory']
    )
    def get(self, request):
        result = services.get_current_stock_report(
            warehouse_id=request.query_params.get('warehouse_id'),
            product_id=request.query_params.get('product_id'),
            category=request.query_params.get('category'),
            brand=request.query_params.get('brand'),
            page=int(request.query_params.get('page', 1)),
            page_size=int(request.query_params.get('page_size', 50)),
            organization_id=_org_id(request),
        )
        return Response(result)


class StockAgingReportView(APIView):
    """
    Stock Aging Report.
    
    Buckets products by days since last movement.
    """
    permission_classes = [IsManagerOrAdmin, HasReportsService]
    
    @extend_schema(
        summary="Stock Aging Report",
        description="Identify dead/slow stock by days since last movement.",
        parameters=[
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
        ],
        tags=['Reports - Inventory']
    )
    def get(self, request):
        result = services.get_stock_aging_report(
            warehouse_id=request.query_params.get('warehouse_id'),
            organization_id=_org_id(request),
        )
        return Response(result)


class StockMovementReportView(APIView):
    """
    Stock Movement Report.
    
    List all inventory movements with filters.
    """
    permission_classes = [IsManagerOrAdmin, HasReportsService]
    
    @extend_schema(
        summary="Stock Movement Report",
        description="List all inventory movements.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('movement_type', OpenApiTypes.STR, description='Movement type filter'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
            OpenApiParameter('product_id', OpenApiTypes.UUID, description='Filter by product'),
            OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
            OpenApiParameter('page_size', OpenApiTypes.INT, description='Items per page'),
        ],
        tags=['Reports - Inventory']
    )
    def get(self, request):
        result = services.get_stock_movement_report(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            movement_type=request.query_params.get('movement_type'),
            warehouse_id=request.query_params.get('warehouse_id'),
            product_id=request.query_params.get('product_id'),
            page=int(request.query_params.get('page', 1)),
            page_size=int(request.query_params.get('page_size', 50)),
            organization_id=_org_id(request),
        )
        return Response(result)


# =============================================================================
# B. SALES REPORTS
# =============================================================================

class SalesSummaryView(APIView):
    """
    Sales Summary Report.
    
    Aggregate totals: sales, discount, GST, invoice count.
    """
    permission_classes = [IsStaffManagerOrAdmin, HasReportsService]

    @extend_schema(
        summary="Sales Summary",
        description="Get sales totals for a period.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
        ],
        tags=['Reports - Sales']
    )
    def get(self, request):
        result = services.get_sales_summary(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            organization_id=getattr(request.user, 'organization_id', None),
        )
        return Response(result)


class ProductSalesReportView(APIView):
    """
    Product Sales Report.
    
    Sales aggregated per product.
    """
    permission_classes = [IsManagerOrAdmin, HasReportsService]
    
    @extend_schema(
        summary="Product Sales Report",
        description="Sales breakdown by product.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
            OpenApiParameter('product_id', OpenApiTypes.UUID, description='Filter by product'),
            OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
            OpenApiParameter('page_size', OpenApiTypes.INT, description='Items per page'),
        ],
        tags=['Reports - Sales']
    )
    def get(self, request):
        result = services.get_product_sales_report(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            product_id=request.query_params.get('product_id'),
            page=int(request.query_params.get('page', 1)),
            page_size=int(request.query_params.get('page_size', 50)),
            organization_id=_org_id(request),
        )
        return Response(result)


class SalesTrendsView(APIView):
    """
    Sales Trends Report.
    
    Daily/monthly sales for charts.
    """
    permission_classes = [IsStaffManagerOrAdmin, HasReportsService]

    @extend_schema(
        summary="Sales Trends",
        description="Sales grouped by day or month for charting.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
            OpenApiParameter('group_by', OpenApiTypes.STR, description='Group by: day or month'),
        ],
        tags=['Reports - Sales']
    )
    def get(self, request):
        group_by = request.query_params.get('group_by', 'day')
        if group_by not in ['day', 'month']:
            return Response(
                {'error': "group_by must be 'day' or 'month'"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        result = services.get_sales_trends(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            group_by=group_by,
            organization_id=_org_id(request),
        )
        return Response(result)


# =============================================================================
# C. RETURNS & ADJUSTMENTS REPORTS
# =============================================================================

class ReturnsSummaryView(APIView):
    """
    Returns Summary Report.
    
    Refund totals and top returned products.
    """
    permission_classes = [IsManagerOrAdmin, HasReportsService]
    
    @extend_schema(
        summary="Returns Summary",
        description="Summary of returns and refunds.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
        ],
        tags=['Reports - Returns']
    )
    def get(self, request):
        result = services.get_returns_summary(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            organization_id=_org_id(request),
        )
        return Response(result)


class AdjustmentsReportView(APIView):
    """
    Adjustments Report (Audit).
    
    Admin only - shows all stock adjustments.
    """
    permission_classes = [IsAdmin, HasReportsService]
    
    @extend_schema(
        summary="Adjustments Report",
        description="Audit log of all stock adjustments.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
            OpenApiParameter('product_id', OpenApiTypes.UUID, description='Filter by product'),
            OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
            OpenApiParameter('page_size', OpenApiTypes.INT, description='Items per page'),
        ],
        tags=['Reports - Audit']
    )
    def get(self, request):
        result = services.get_adjustments_report(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            product_id=request.query_params.get('product_id'),
            page=int(request.query_params.get('page', 1)),
            page_size=int(request.query_params.get('page_size', 50)),
            organization_id=_org_id(request),
        )
        return Response(result)


# =============================================================================
# D. PROFIT & TAX REPORTS
# =============================================================================

class GrossProfitReportView(APIView):
    """
    Gross Profit Report.
    
    Admin only - shows profit margins.
    """
    permission_classes = [IsAdmin, HasReportsService]
    
    @extend_schema(
        summary="Gross Profit Report",
        description="Profit calculated from stored sale prices (no recalculation).",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
            OpenApiParameter('product_id', OpenApiTypes.UUID, description='Filter by product'),
            OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
            OpenApiParameter('page_size', OpenApiTypes.INT, description='Items per page'),
        ],
        tags=['Reports - Financial']
    )
    def get(self, request):
        result = services.get_gross_profit_report(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            product_id=request.query_params.get('product_id'),
            page=int(request.query_params.get('page', 1)),
            page_size=int(request.query_params.get('page_size', 50)),
            organization_id=_org_id(request),
        )
        return Response(result)


class GSTSummaryReportView(APIView):
    """
    GST Summary Report.
    
    Admin only - GST collected, refunded, net liability.
    """
    permission_classes = [IsAdmin, HasReportsService]
    
    @extend_schema(
        summary="GST Summary Report",
        description="GST liability from sales minus refunds.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
        ],
        tags=['Reports - Financial']
    )
    def get(self, request):
        result = services.get_gst_summary_report(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            organization_id=_org_id(request),
        )
        return Response(result)


# =============================================================================
# E. DIMENSION REPORTS (Category, Brand, Size, Supplier, Warehouse)
# =============================================================================

class CategoryWiseSalesView(APIView):
    """
    Category-wise Sales Report.
    
    Sales aggregated by product category.
    """
    permission_classes = [IsManagerOrAdmin, HasReportsService]
    
    @extend_schema(
        summary="Category-wise Sales Report",
        description="Sales breakdown by product category.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
            OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
            OpenApiParameter('page_size', OpenApiTypes.INT, description='Items per page'),
        ],
        tags=['Reports - Dimensions']
    )
    def get(self, request):
        result = services.get_category_wise_sales_report(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            page=int(request.query_params.get('page', 1)),
            page_size=int(request.query_params.get('page_size', 50)),
            organization_id=_org_id(request),
        )
        return Response(result)


class BrandWiseSalesView(APIView):
    """
    Brand-wise Sales Report.
    
    Sales aggregated by product brand.
    """
    permission_classes = [IsManagerOrAdmin, HasReportsService]
    
    @extend_schema(
        summary="Brand-wise Sales Report",
        description="Sales breakdown by product brand.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
            OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
            OpenApiParameter('page_size', OpenApiTypes.INT, description='Items per page'),
        ],
        tags=['Reports - Dimensions']
    )
    def get(self, request):
        result = services.get_brand_wise_sales_report(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            page=int(request.query_params.get('page', 1)),
            page_size=int(request.query_params.get('page_size', 50)),
            organization_id=_org_id(request),
        )
        return Response(result)


class SizeWiseSalesView(APIView):
    """
    Size-wise Sales Report.
    
    Sales aggregated by product size.
    """
    permission_classes = [IsManagerOrAdmin, HasReportsService]
    
    @extend_schema(
        summary="Size-wise Sales Report",
        description="Sales breakdown by product size.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
            OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
            OpenApiParameter('page_size', OpenApiTypes.INT, description='Items per page'),
        ],
        tags=['Reports - Dimensions']
    )
    def get(self, request):
        result = services.get_size_wise_sales_report(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            page=int(request.query_params.get('page', 1)),
            page_size=int(request.query_params.get('page_size', 50)),
            organization_id=_org_id(request),
        )
        return Response(result)


class SupplierWiseReportView(APIView):
    """
    Supplier-wise Purchase Report.
    
    Purchases aggregated by supplier.
    """
    permission_classes = [IsManagerOrAdmin, HasReportsService]
    
    @extend_schema(
        summary="Supplier-wise Report",
        description="Purchase breakdown by supplier.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
            OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
            OpenApiParameter('page_size', OpenApiTypes.INT, description='Items per page'),
        ],
        tags=['Reports - Dimensions']
    )
    def get(self, request):
        result = services.get_supplier_wise_report(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            page=int(request.query_params.get('page', 1)),
            page_size=int(request.query_params.get('page_size', 50)),
            organization_id=_org_id(request),
        )
        return Response(result)


class WarehouseWiseSalesView(APIView):
    """
    Warehouse-wise Sales Report.
    
    Sales aggregated by warehouse/store.
    """
    permission_classes = [IsManagerOrAdmin, HasReportsService]
    
    @extend_schema(
        summary="Warehouse-wise Sales Report",
        description="Sales breakdown by warehouse/store.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
            OpenApiParameter('page_size', OpenApiTypes.INT, description='Items per page'),
        ],
        tags=['Reports - Dimensions']
    )
    def get(self, request):
        result = services.get_warehouse_wise_sales_report(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            page=int(request.query_params.get('page', 1)),
            page_size=int(request.query_params.get('page_size', 50)),
            organization_id=_org_id(request),
        )
        return Response(result)


class SupplierSalesReportView(APIView):
    """
    Supplier-wise Sales Report.
    
    Shows which suppliers' products are in high demand.
    Aggregates sales by supplier to help identify top performing suppliers.
    """
    permission_classes = [IsManagerOrAdmin, HasReportsService]
    
    @extend_schema(
        summary="Supplier Sales Report",
        description="Sales breakdown by supplier. Shows which suppliers' products are selling best.",
        parameters=[
            OpenApiParameter('date_from', OpenApiTypes.DATE, description='Start date'),
            OpenApiParameter('date_to', OpenApiTypes.DATE, description='End date'),
            OpenApiParameter('warehouse_id', OpenApiTypes.UUID, description='Filter by warehouse'),
            OpenApiParameter('page', OpenApiTypes.INT, description='Page number'),
            OpenApiParameter('page_size', OpenApiTypes.INT, description='Items per page'),
        ],
        tags=['Reports - Dimensions']
    )
    def get(self, request):
        result = services.get_supplier_sales_report(
            date_from=parse_date(request.query_params.get('date_from')),
            date_to=parse_date_to(request.query_params.get('date_to')),
            warehouse_id=request.query_params.get('warehouse_id'),
            page=int(request.query_params.get('page', 1)),
            page_size=int(request.query_params.get('page_size', 50)),
            organization_id=_org_id(request),
        )
        return Response(result)
