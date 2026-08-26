"""
Inventory Views for Quake Inventory System.

HARDENING RULES:
- No hard delete for business entities (Product, Warehouse, Variant)
- Soft delete via is_deleted=True for Product (Phase 10A)
- Soft delete via is_active=False for legacy entities
- StockLedger is read-only (no create/update/delete via API)
- Barcode is immutable after creation
"""

from django.db import models
from django.http import HttpResponse
from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAdminUser
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from .models import (
    Warehouse, Product, ProductVariant, StockLedger, StockSnapshot,
    ProductPricing, ProductImage, CreditNote, DebitNote, Category
)
from .serializers import (
    WarehouseSerializer,
    ProductSerializer,
    ProductCreateSerializer,
    ProductUpdateSerializer,
    ProductVariantSerializer,
    ProductVariantUpdateSerializer,
    PurchaseStockSerializer,
    AdjustStockSerializer,
    StockLedgerSerializer,
    StockSummarySerializer,
    ProductPricingSerializer,
    ProductImageSerializer,
    CreditNoteSerializer,
    CreditNoteCreateSerializer,
    DebitNoteSerializer,
    DebitNoteCreateSerializer,
    CategorySerializer,
)
from . import services
from core.pagination import StandardResultsSetPagination
from users.permissions import IsAdmin, IsStaffOrAdmin, IsAdminOrReadOnly
from users.organization import filter_queryset_for_user


class SoftDeleteMixin:
    """
    Mixin to implement soft delete instead of hard delete.
    Sets is_active=False instead of deleting the record.
    """
    
    @extend_schema(
        summary="Deactivate (soft delete)",
        description="Marks the item as inactive instead of deleting. Data is preserved for audit purposes.",
        responses={
            200: {"type": "object", "properties": {"message": {"type": "string"}}},
            404: {"type": "object", "properties": {"error": {"type": "string"}}}
        }
    )
    def destroy(self, request, *args, **kwargs):
        """Soft delete - set is_active=False instead of deleting."""
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response(
            {"message": f"{instance.__class__.__name__} deactivated successfully"},
            status=status.HTTP_200_OK
        )


class IncludeInactiveMixin:
    """
    Mixin to optionally include inactive items via ?include_inactive=true
    """
    
    def get_queryset(self):
        queryset = super().get_queryset()
        include_inactive = self.request.query_params.get('include_inactive', 'false').lower()
        
        if include_inactive == 'true':
            # Return all items including inactive
            return self.queryset.model.objects.all()
        
        # Default: only active items
        return queryset


@extend_schema_view(
    list=extend_schema(
        summary="List warehouses",
        description="Returns active warehouses. Use ?include_inactive=true to include deactivated ones.",
        parameters=[
            OpenApiParameter(
                name='include_inactive',
                type=OpenApiTypes.BOOL,
                location=OpenApiParameter.QUERY,
                description='Include inactive warehouses',
                required=False
            )
        ],
        tags=['Warehouses']
    ),
    create=extend_schema(
        summary="Create a new warehouse",
        tags=['Warehouses']
    ),
    retrieve=extend_schema(
        summary="Get warehouse details",
        tags=['Warehouses']
    ),
    update=extend_schema(
        summary="Update warehouse",
        tags=['Warehouses']
    ),
    partial_update=extend_schema(
        summary="Partially update warehouse",
        tags=['Warehouses']
    ),
    destroy=extend_schema(
        summary="Deactivate warehouse (soft delete)",
        description="Marks warehouse as inactive. Cannot be hard deleted.",
        tags=['Warehouses']
    ),
)
class WarehouseViewSet(IncludeInactiveMixin, SoftDeleteMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing warehouses.
    
    HARDENING: Delete operations perform soft-delete (is_active=False).
    """

    queryset = Warehouse.objects.filter(is_active=True)
    serializer_class = WarehouseSerializer
    permission_classes = [IsAdminOrReadOnly]  # Read: any auth, Write: admin
    pagination_class = StandardResultsSetPagination
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        """
        List stays active-only unless ?include_inactive=true (see IncludeInactiveMixin).

        Retrieve/update/destroy must resolve inactive rows by id so admins can PATCH
        is_active=true to reactivate; otherwise inactive warehouses 404 on edit.
        """
        detail_actions = frozenset(("retrieve", "update", "partial_update", "destroy"))
        if getattr(self, "action", None) in detail_actions:
            qs = Warehouse.objects.all()
        else:
            qs = super().get_queryset()
        return filter_queryset_for_user(qs, self.request.user)

    def perform_create(self, serializer):
        serializer.save(organization_id=getattr(self.request.user, "organization_id", None))


@extend_schema_view(
    list=extend_schema(
        summary="List categories",
        description="Returns all active categories. Categories can be used for filtering products.",
        tags=['Categories']
    ),
    create=extend_schema(
        summary="Create a new category",
        description="Admin only: Create a new product category.",
        tags=['Categories']
    ),
    retrieve=extend_schema(
        summary="Get category details",
        tags=['Categories']
    ),
    update=extend_schema(
        summary="Update category",
        tags=['Categories']
    ),
    partial_update=extend_schema(
        summary="Partially update category",
        tags=['Categories']
    ),
    destroy=extend_schema(
        summary="Deactivate category (soft delete)",
        description="Marks category as inactive. Cannot be hard deleted.",
        tags=['Categories']
    ),
)
class CategoryViewSet(IncludeInactiveMixin, SoftDeleteMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing product categories.
    
    Categories are used for filtering products in inventory and POS.
    Admin can add custom categories for different product types like:
    - Apparels: T-Shirts, Jeans, Shirts, etc.
    - Footwear: Sneakers, Formal Shoes, etc.
    - Accessories: Handbags, Belts, etc.
    """
    queryset = Category.objects.filter(is_active=True)
    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrReadOnly]  # Read: any auth, Write: admin
    pagination_class = StandardResultsSetPagination


@extend_schema_view(
    list=extend_schema(
        summary="List products with stock",
        description="Returns products with variants, pricing, and stock levels. Phase 10A filters available.",
        parameters=[
            OpenApiParameter(
                name='include_inactive',
                type=OpenApiTypes.BOOL,
                location=OpenApiParameter.QUERY,
                description='Include inactive products',
                required=False
            ),
            OpenApiParameter(
                name='is_deleted',
                type=OpenApiTypes.BOOL,
                location=OpenApiParameter.QUERY,
                description='Filter by is_deleted flag (admin only)',
                required=False
            ),
            OpenApiParameter(
                name='price_min',
                type=OpenApiTypes.DECIMAL,
                location=OpenApiParameter.QUERY,
                description='Minimum selling price',
                required=False
            ),
            OpenApiParameter(
                name='price_max',
                type=OpenApiTypes.DECIMAL,
                location=OpenApiParameter.QUERY,
                description='Maximum selling price',
                required=False
            ),
        ],
        tags=['Products']
    ),
    create=extend_schema(
        summary="Create a new product",
        description="Create a product with optional variants, pricing, and images.",
        tags=['Products']
    ),
    retrieve=extend_schema(
        summary="Get product details",
        tags=['Products']
    ),
    update=extend_schema(
        summary="Update product",
        description="Update product details. Barcode cannot be changed after creation.",
        tags=['Products']
    ),
    partial_update=extend_schema(
        summary="Partially update product",
        description="Partial update. Barcode is immutable.",
        tags=['Products']
    ),
    destroy=extend_schema(
        summary="Soft delete product (sets is_deleted=True)",
        description="Marks product as deleted. Hidden from POS, visible in admin with is_deleted=true filter.",
        tags=['Products']
    ),
)
class ProductViewSet(IncludeInactiveMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing products and variants.

    PHASE 10A FEATURES:
    - SKU and barcode at product level (auto-generated, immutable)
    - JSONB attributes for flexible apparel data
    - Separate pricing table with computed margin
    - Product images
    - Soft delete via is_deleted flag (hidden from POS, visible to admin)

    HARDENING:
    - Barcode immutable after creation
    - Delete operations perform soft-delete (is_deleted=True)

    FILTERING:
    - search: Search by name, brand, SKU, or barcode
    - category: Filter by category (exact match)
    - brand: Filter by brand (exact match)
    - gender: Filter by gender (MENS, WOMENS, UNISEX, KIDS)
    - material: Filter by material (contains match)
    - season: Filter by season (exact match)
    - price_min/price_max: Filter by selling price range
    - is_deleted: Show deleted products (admin only)
    """

    # UUID-only detail routes so paths like /products/import-template/ are not
    # captured by /<pk>/ (default pk regex matches "import-template" → 404).
    lookup_value_regex = (
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    )

    queryset = Product.objects.prefetch_related(
        'variants', 'images'
    ).select_related('pricing').filter(is_active=True, is_deleted=False)
    permission_classes = [IsAdminOrReadOnly]  # Read: any auth, Write: admin
    pagination_class = StandardResultsSetPagination

    def _annotate_ledger_stock(self, queryset):
        """
        Annotate product-level ledger quantity (optionally scoped to ?warehouse=)
        and minimum positive variant reorder_threshold (matches web deriveRawStockStatus).
        """
        import uuid

        from django.db.models import OuterRef, Q, Subquery, Sum, Value
        from django.db.models.functions import Coalesce

        params = self.request.query_params
        warehouse_uuid = None
        wh = params.get('warehouse')
        if wh:
            try:
                warehouse_uuid = uuid.UUID(str(wh))
            except (ValueError, TypeError, AttributeError):
                warehouse_uuid = None

        move_filter = Q()
        if warehouse_uuid is not None:
            move_filter = Q(inventory_movements__warehouse_id=warehouse_uuid)

        reorder_subq = Subquery(
            ProductVariant.objects.filter(
                product_id=OuterRef('pk'),
                reorder_threshold__gt=0,
            )
            .order_by('reorder_threshold')
            .values('reorder_threshold')[:1],
            output_field=models.IntegerField(),
        )

        return queryset.annotate(
            available_stock=Coalesce(
                Sum('inventory_movements__quantity', filter=move_filter),
                Value(0),
            ),
            effective_reorder=Coalesce(reorder_subq, Value(0)),
        )

    def get_queryset(self):
        from django.db.models import F

        queryset = filter_queryset_for_user(super().get_queryset(), self.request.user)
        params = self.request.query_params

        # Phase 10A: is_deleted filter (admin only) — pick base queryset first
        is_deleted = params.get('is_deleted')
        if is_deleted is not None:
            if hasattr(self.request.user, 'role') and self.request.user.role == 'ADMIN':
                if is_deleted.lower() == 'true':
                    queryset = filter_queryset_for_user(
                        Product.objects.prefetch_related(
                            'variants', 'images'
                        ).select_related('pricing').filter(is_deleted=True),
                        self.request.user,
                    )
                elif is_deleted.lower() == 'false':
                    queryset = queryset.filter(is_deleted=False)

        queryset = self._annotate_ledger_stock(queryset)

        # stock_status: IN_STOCK | LOW_STOCK | OUT_OF_STOCK (accept snake_case from web)
        stock_param = (params.get('stock_status') or '').strip().upper().replace('-', '_')
        if stock_param not in ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'):
            stock_param = None
        if stock_param == 'OUT_OF_STOCK':
            queryset = queryset.filter(available_stock__lte=0)
        elif stock_param == 'LOW_STOCK':
            queryset = queryset.filter(
                available_stock__gt=0,
                effective_reorder__gt=0,
                available_stock__lte=F('effective_reorder'),
            )
        elif stock_param == 'IN_STOCK':
            queryset = queryset.filter(available_stock__gt=0).filter(
                models.Q(effective_reorder=0)
                | models.Q(available_stock__gt=F('effective_reorder'))
            )
        
        # Search filter - now includes SKU and barcode
        search = params.get('search')
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) |
                models.Q(brand__icontains=search) |
                models.Q(sku__icontains=search) |
                models.Q(barcode_value__icontains=search) |
                models.Q(variants__sku__icontains=search)
            ).distinct()
        
        # Category filter
        category = params.get('category')
        if category:
            queryset = queryset.filter(category__iexact=category)
        
        # Brand filter
        brand = params.get('brand')
        if brand:
            queryset = queryset.filter(brand__iexact=brand)
        
        # Gender filter
        gender = params.get('gender')
        if gender:
            queryset = queryset.filter(gender__iexact=gender)
        
        # Material filter (contains)
        material = params.get('material')
        if material:
            queryset = queryset.filter(material__icontains=material)
        
        # Season filter
        season = params.get('season')
        if season:
            queryset = queryset.filter(season__iexact=season)
        
        # Phase 10A: Price range filters
        price_min = params.get('price_min')
        if price_min:
            try:
                queryset = queryset.filter(pricing__selling_price__gte=float(price_min))
            except (ValueError, TypeError):
                pass
        
        price_max = params.get('price_max')
        if price_max:
            try:
                queryset = queryset.filter(pricing__selling_price__lte=float(price_max))
            except (ValueError, TypeError):
                pass

        # Stable ordering for pagination (avoids UnorderedObjectListWarning / flaky pages)
        return queryset.order_by('name', 'id')

    def perform_create(self, serializer):
        serializer.save(organization_id=getattr(self.request.user, "organization_id", None))
    
    def get_serializer_class(self):
        if self.action == 'create':
            return ProductCreateSerializer
        if self.action in ['update', 'partial_update']:
            return ProductUpdateSerializer
        return ProductSerializer
    
    def destroy(self, request, *args, **kwargs):
        """
        Soft delete product via is_deleted flag (Phase 10A).
        Also deactivates all variants.
        """
        instance = self.get_object()
        
        # Set is_deleted=True (Phase 10A soft delete)
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted', 'updated_at'])
        
        # Deactivate all variants
        instance.variants.update(is_active=False)
        
        return Response(
            {
                "message": "Product soft deleted successfully",
                "id": str(instance.id),
                "is_deleted": True
            },
            status=status.HTTP_200_OK
        )

    @extend_schema(
        summary="Download bulk product import template",
        description=(
            "Returns a CSV or XLSX file with all import columns and example rows. "
            "Use file_format=csv (default) or file_format=xlsx. "
            "Do not use the query name `format` — it is reserved by DRF for content negotiation."
        ),
        parameters=[
            OpenApiParameter(
                name="file_format",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description="csv or xlsx",
                required=False,
                enum=["csv", "xlsx"],
            ),
        ],
        responses={200: OpenApiTypes.BINARY},
        tags=["Products"],
    )
    @action(detail=False, methods=["get"], url_path="import-template")
    def import_template(self, request):
        from .bulk_import import build_template_csv, build_template_xlsx

        fmt = (request.query_params.get("file_format") or "csv").strip().lower()
        if fmt == "xlsx":
            body = build_template_xlsx()
            resp = HttpResponse(
                body,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            resp["Content-Disposition"] = (
                'attachment; filename="quake_product_import_template.xlsx"'
            )
            return resp
        body = build_template_csv()
        resp = HttpResponse(body, content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = 'attachment; filename="quake_product_import_template.csv"'
        return resp

    @extend_schema(
        summary="Bulk import products from CSV or XLSX",
        description=(
            "Admin only. One row = one product with one default variant, optional pricing and opening stock. "
            "Up to 200 data rows. Use GET import-template for column definitions."
        ),
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {
                    "file": {"type": "string", "format": "binary"},
                    "default_warehouse_id": {
                        "type": "string",
                        "format": "uuid",
                        "description": "Used when rows omit warehouse_code but have initial_stock > 0",
                    },
                },
                "required": ["file"],
            }
        },
        responses={
            200: {
                "type": "object",
                "properties": {
                    "created": {"type": "integer"},
                    "failed": {"type": "integer"},
                    "errors": {"type": "array", "items": {"type": "object"}},
                    "created_ids": {"type": "array", "items": {"type": "string"}},
                },
            },
            400: {"type": "object", "properties": {"detail": {"type": "string"}}},
        },
        tags=["Products"],
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="import-bulk",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_bulk(self, request):
        from .bulk_import import (
            import_products_from_rows,
            parse_csv_bytes,
            parse_xlsx_bytes,
        )

        upload = request.FILES.get("file")
        if not upload:
            return Response(
                {"detail": "Missing file"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        name = (upload.name or "").lower()
        blob = upload.read()
        try:
            if name.endswith(".xlsx"):
                rows = parse_xlsx_bytes(blob)
            else:
                rows = parse_csv_bytes(blob)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        default_wh = (
            request.POST.get("default_warehouse_id")
            or request.data.get("default_warehouse_id")
        )
        if isinstance(default_wh, str):
            default_wh = default_wh.strip() or None
        elif default_wh == "":
            default_wh = None

        result = import_products_from_rows(
            rows, request, default_warehouse_id=default_wh
        )
        return Response(result, status=status.HTTP_200_OK)


class PurchaseStockView(APIView):
    """
    Record a stock purchase (GRN equivalent).
    This creates a PURCHASE ledger entry and updates the snapshot.
    """
    permission_classes = [IsStaffOrAdmin]  # Staff can purchase stock
    
    @extend_schema(
        summary="Record stock purchase",
        description="Record a purchase of stock. Creates an immutable ledger entry.",
        request=PurchaseStockSerializer,
        responses={
            201: StockLedgerSerializer,
            400: {"type": "object", "properties": {"error": {"type": "string"}}}
        },
        tags=['Stock Operations']
    )
    def post(self, request):
        serializer = PurchaseStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            warehouse = Warehouse.objects.get(id=serializer.validated_data['warehouse_id'])
            variant = ProductVariant.objects.get(id=serializer.validated_data['variant_id'])
            
            ledger_entry = services.record_purchase(
                variant=variant,
                warehouse=warehouse,
                quantity=serializer.validated_data['quantity'],
                reference_id=serializer.validated_data.get('reference_id'),
                notes=serializer.validated_data.get('notes', ''),
                created_by=request.user.username if request.user.is_authenticated else 'system'
            )
            
            return Response(
                StockLedgerSerializer(ledger_entry).data,
                status=status.HTTP_201_CREATED
            )
        except services.InvalidEventError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdjustStockView(APIView):
    """
    Adjust stock levels (admin only).
    Used for corrections, inventory counts, etc.
    """
    permission_classes = [IsAdmin]  # Only admin can adjust stock
    
    @extend_schema(
        summary="Adjust stock (Admin only)",
        description="Adjust stock levels. Positive quantity adds stock, negative subtracts. Notes are required.",
        request=AdjustStockSerializer,
        responses={
            201: StockLedgerSerializer,
            400: {"type": "object", "properties": {"error": {"type": "string"}}},
            403: {"type": "object", "properties": {"error": {"type": "string"}}}
        },
        tags=['Stock Operations']
    )
    def post(self, request):
        serializer = AdjustStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            warehouse = Warehouse.objects.get(id=serializer.validated_data['warehouse_id'])
            variant = ProductVariant.objects.get(id=serializer.validated_data['variant_id'])
            
            ledger_entry = services.record_adjustment(
                variant=variant,
                warehouse=warehouse,
                quantity=serializer.validated_data['quantity'],
                notes=serializer.validated_data['notes'],
                created_by=request.user.username if request.user.is_authenticated else 'admin',
                allow_negative=serializer.validated_data.get('allow_negative', False)
            )
            
            return Response(
                StockLedgerSerializer(ledger_entry).data,
                status=status.HTTP_201_CREATED
            )
        except services.InsufficientStockError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except services.InvalidEventError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class StockSummaryView(APIView):
    """
    Get stock summary across all warehouses.
    """
    permission_classes = [IsStaffOrAdmin]
    
    @extend_schema(
        summary="Get stock summary",
        description="Returns total stock, low stock items, and out of stock items.",
        responses={200: StockSummarySerializer},
        tags=['Stock Operations']
    )
    def get(self, request):
        summary = services.get_stock_summary(
            organization_id=getattr(request.user, "organization_id", None),
        )
        serializer = StockSummarySerializer(summary)
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(
        summary="List ledger entries",
        description="View stock movement history. Read-only - entries cannot be modified or deleted.",
        tags=['Stock Ledger']
    ),
    retrieve=extend_schema(
        summary="Get ledger entry details",
        description="View a single ledger entry. Read-only.",
        tags=['Stock Ledger']
    ),
)
class StockLedgerViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet for viewing stock ledger entries.
    
    HARDENING: Ledger entries are IMMUTABLE.
    - Cannot be created through API (use stock operation endpoints)
    - Cannot be updated
    - Cannot be deleted
    - Corrections must be made via ADJUSTMENT entries
    """
    queryset = StockLedger.objects.select_related('variant', 'warehouse').all()
    serializer_class = StockLedgerSerializer
    permission_classes = [IsStaffOrAdmin]  # Any auth user can view ledger
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = filter_queryset_for_user(
            queryset, self.request.user, field="variant__product__organization_id"
        )
        
        # Optional filters
        warehouse_id = self.request.query_params.get('warehouse_id')
        variant_id = self.request.query_params.get('variant_id')
        event_type = self.request.query_params.get('event_type')
        
        if warehouse_id:
            queryset = queryset.filter(warehouse_id=warehouse_id)
        if variant_id:
            queryset = queryset.filter(variant_id=variant_id)
        if event_type:
            queryset = queryset.filter(event_type=event_type)
        
        return queryset


class BarcodeImageView(APIView):
    """
    Generate and serve barcode images as SVG.
    
    GET /api/v1/inventory/barcodes/{barcode}/image/
    """
    permission_classes = [AllowAny]  # Public for printing
    
    @extend_schema(
        summary="Get barcode image",
        description="Returns SVG image of the barcode for printing.",
        responses={
            200: {"type": "string", "format": "binary"},
            404: {"type": "object", "properties": {"error": {"type": "string"}}}
        },
        tags=['Barcodes']
    )
    def get(self, request, barcode):
        """Generate SVG barcode image."""
        from django.http import HttpResponse
        import io
        
        # Phase 10A: Try Product-level barcode first, then variant
        found = False
        try:
            product = Product.objects.get(barcode_value=barcode)
            found = True
        except Product.DoesNotExist:
            try:
                variant = ProductVariant.objects.select_related('product').get(barcode=barcode)
                found = True
            except ProductVariant.DoesNotExist:
                pass
        
        if not found:
            return Response(
                {"error": "Barcode not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            import barcode as barcode_lib
            from barcode.writer import SVGWriter
            
            # Generate EAN-13 or Code128 barcode
            # EAN-13 requires exactly 12 or 13 digits
            # Note: 'barcode' is the URL parameter, not the module
            barcode_value = str(barcode).strip()
            
            # Try EAN-13 first (if 13 digits)
            if len(barcode_value) == 13 and barcode_value.isdigit():
                ean = barcode_lib.get('ean13', barcode_value[:12], writer=SVGWriter())
            else:
                # Fall back to Code128 for non-standard barcodes
                ean = barcode_lib.get('code128', barcode_value, writer=SVGWriter())
            
            # Generate SVG to buffer
            buffer = io.BytesIO()
            ean.write(buffer, options={
                'module_width': 0.4,
                'module_height': 15.0,
                'font_size': 10,
                'text_distance': 5.0,
                'quiet_zone': 6.0,
            })
            buffer.seek(0)
            
            return HttpResponse(
                buffer.getvalue(),
                content_type='image/svg+xml',
                headers={
                    'Cache-Control': 'public, max-age=86400',  # Cache for 24 hours
                    'Content-Disposition': f'inline; filename="barcode-{barcode_value}.svg"'
                }
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to generate barcode: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class POSProductsView(APIView):
    """
    Get products formatted for POS - flattened variants as sellable units.
    
    Unlike /inventory/products/ which returns nested product->variants,
    this endpoint returns a flat list of variants for the POS product grid.
    Each item is a sellable unit with stock from StockSnapshot.
    
    VARIANT HANDLING:
    - Each size/color variant is a separate sellable unit
    - The variant barcode is used for checkout (resolves to product automatically)
    
    INVENTORY SOURCE:
    - warehouse_id: Get stock from warehouse inventory
    - store_id: Get stock from store inventory (transferred via StockTransfer)
    - Neither: Get total stock across all locations
    """
    permission_classes = [IsStaffOrAdmin]
    
    @extend_schema(
        summary="Get POS products",
        description=(
            "Returns a flattened list of product variants for POS.\n"
            "Each variant (size/color) is a separate sellable unit.\n"
            "Use this for the POS product grid instead of /products/.\n\n"
            "INVENTORY SOURCE:\n"
            "- warehouse_id: Stock from warehouse inventory\n"
            "- store_id: Stock from store inventory\n"
            "- Neither: Total stock across all locations"
        ),
        parameters=[
            OpenApiParameter(
                name='warehouse_id',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description='Filter by warehouse (optional - defaults to all warehouses)',
                required=False
            ),
            OpenApiParameter(
                name='store_id',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description='Filter by store - gets store-level inventory',
                required=False
            ),
            OpenApiParameter(
                name='search',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Search by name, SKU, or barcode',
                required=False
            ),
            OpenApiParameter(
                name='category',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Filter by category',
                required=False
            ),
            OpenApiParameter(
                name='in_stock_only',
                type=OpenApiTypes.BOOL,
                location=OpenApiParameter.QUERY,
                description='Only show items with stock > 0',
                required=False
            ),
        ],
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'results': {'type': 'array'},
                    'meta': {'type': 'object'}
                }
            }
        },
        tags=['POS Operations']
    )
    def get(self, request):
        from .serializers import POSVariantSerializer
        from django.db.models import Sum, Q
        
        # Get query params
        warehouse_id = request.query_params.get('warehouse_id')
        store_id = request.query_params.get('store_id')
        search = request.query_params.get('search', '').strip()
        category = request.query_params.get('category', '').strip()
        in_stock_only = request.query_params.get('in_stock_only', 'false').lower() == 'true'
        
        # Base queryset - active variants with active, non-deleted products
        # CRITICAL: scope to caller's organization — never leak other tenants' catalog
        org_id = getattr(request.user, "organization_id", None)
        variants = ProductVariant.objects.select_related(
            'product', 'product__pricing', 'product__supplier'
        ).filter(
            is_active=True,
            product__is_active=True,
            product__is_deleted=False
        )
        if org_id is None:
            variants = variants.none()
        else:
            variants = variants.filter(product__organization_id=org_id)
        
        # Apply search filter
        if search:
            variants = variants.filter(
                Q(product__name__icontains=search) |
                Q(sku__icontains=search) |
                Q(barcode__icontains=search) |
                Q(product__brand__icontains=search) |
                Q(product__barcode_value__icontains=search)
            )
        
        # Apply category filter
        if category:
            variants = variants.filter(product__category__iexact=category)
        
        # Build response with stock data
        results = []
        for variant in variants:
            # Get stock based on inventory source (warehouse or store)
            if store_id:
                # Store-level inventory
                stock = services.get_store_product_stock(variant.product_id, store_id)
            else:
                # Warehouse-level or total inventory
                stock = services.get_product_stock(variant.product_id, warehouse_id)
            
            # Skip out-of-stock if filter is on
            if in_stock_only and stock <= 0:
                continue
            
            # Determine stock status
            if stock <= 0:
                stock_status = 'OUT_OF_STOCK'
            elif stock <= variant.reorder_threshold:
                stock_status = 'LOW_STOCK'
            else:
                stock_status = 'IN_STOCK'
            
            # Build display name with variant attributes
            variant_parts = []
            if variant.size:
                variant_parts.append(variant.size)
            if variant.color:
                variant_parts.append(variant.color)
            variant_str = ' / '.join(variant_parts) if variant_parts else ''
            
            display_name = variant.product.name
            if variant_str:
                display_name = f"{display_name} ({variant_str})"
            
            # Build barcode image URL - prefer variant barcode
            barcode_value = variant.barcode or variant.product.barcode_value
            barcode_url = None
            if barcode_value:
                barcode_url = request.build_absolute_uri(
                    f'/api/v1/inventory/barcodes/{barcode_value}/image/'
                )
            
            # Get GST percentage and MRP from ProductPricing (related to Product)
            gst_percentage = '0'
            mrp = str(variant.selling_price)  # Default to selling price
            try:
                if hasattr(variant.product, 'pricing') and variant.product.pricing:
                    gst_percentage = str(variant.product.pricing.gst_percentage or 0)
                    mrp = str(variant.product.pricing.mrp or variant.selling_price)
            except Exception:
                pass
            
            # Primary product image (POS grid thumbnail) — values() avoids ORM/DB drift
            image_url = None
            try:
                from .models import ProductImage
                img_rows = list(
                    ProductImage.objects.filter(product_id=variant.product_id)
                    .order_by('-is_primary', '-created_at')
                    .values('image_url', 'is_primary')[:5]
                )
                chosen = next(
                    (r for r in img_rows if r.get('is_primary') and r.get('image_url')),
                    None,
                ) or next((r for r in img_rows if r.get('image_url')), None)
                if chosen and chosen.get('image_url'):
                    image_url = chosen['image_url']
                    if image_url.startswith('/') and not image_url.startswith('//'):
                        image_url = request.build_absolute_uri(image_url)
            except Exception:
                image_url = None

            results.append({
                'id': str(variant.id),
                'product_id': str(variant.product_id),
                'name': display_name,
                'product_name': variant.product.name,
                'brand': variant.product.brand,
                'category': variant.product.category,
                'description': variant.product.description or '',
                'sku': variant.sku,
                'barcode': barcode_value,  # Use variant barcode for checkout
                'size': variant.size,
                'color': variant.color,
                'selling_price': str(variant.selling_price),
                'cost_price': str(variant.cost_price),
                'mrp': mrp,
                'gst_percentage': gst_percentage,
                'stock': stock,
                'stock_status': stock_status,
                'reorder_threshold': variant.reorder_threshold,
                'barcode_image_url': barcode_url,
                'image_url': image_url,
                # Supplier tracking - shows which supplier this product came from
                'supplier_id': str(variant.product.supplier_id) if variant.product.supplier_id else None,
                'supplier_name': variant.product.supplier.name if variant.product.supplier else None,
                'supplier_code': variant.product.supplier.code if variant.product.supplier else None,
            })
        
        # Sort by name
        results.sort(key=lambda x: x['name'])
        
        return Response({
            'results': results,
            'meta': {
                'total': len(results),
                'page': 1,
                'pageSize': len(results),
                'hasNext': False,
                'hasPrev': False
            }
        })


# =============================================================================
# PHASE 11: INVENTORY LEDGER VIEWS
# =============================================================================

from .models import InventoryMovement
from .serializers import (
    InventoryMovementSerializer,
    InventoryMovementCreateSerializer,
    ProductStockSerializer,
)


@extend_schema_view(
    list=extend_schema(
        summary="List inventory movements",
        description="Returns inventory movement ledger entries. Admin only.",
        parameters=[
            OpenApiParameter(
                name='product_id',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description='Filter by product ID',
                required=False
            ),
            OpenApiParameter(
                name='movement_type',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Filter by movement type (OPENING, PURCHASE, SALE, etc.)',
                required=False
            ),
            OpenApiParameter(
                name='start_date',
                type=OpenApiTypes.DATE,
                location=OpenApiParameter.QUERY,
                description='Filter by start date (YYYY-MM-DD)',
                required=False
            ),
            OpenApiParameter(
                name='end_date',
                type=OpenApiTypes.DATE,
                location=OpenApiParameter.QUERY,
                description='Filter by end date (YYYY-MM-DD)',
                required=False
            ),
        ],
        tags=['Inventory Ledger']
    ),
    create=extend_schema(
        summary="Create inventory movement",
        description="""
        Create a new inventory movement record. Admin only.
        
        **Stock is DERIVED from movements, never stored directly.**
        
        Movement Types:
        - OPENING: Initial stock (positive only)
        - PURCHASE: Stock purchase (positive)
        - SALE: Sale deduction (negative)
        - RETURN: Customer return (positive)
        - ADJUSTMENT: Stock correction (positive or negative)
        - DAMAGE: Damaged stock (negative)
        - TRANSFER_IN: Transfer into location (positive)
        - TRANSFER_OUT: Transfer out of location (negative)
        
        Quantity MUST have correct sign based on movement type.
        Overselling is prevented - SALE/DAMAGE/TRANSFER_OUT will fail if insufficient stock.
        """,
        tags=['Inventory Ledger']
    ),
    retrieve=extend_schema(
        summary="Get inventory movement",
        description="Get details of a specific inventory movement. Admin only.",
        tags=['Inventory Ledger']
    ),
)
class InventoryMovementViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet
):
    """
    ViewSet for inventory movements (ledger entries).
    
    PHASE 11 CORE PRINCIPLE:
        Stock = SUM(inventory_movements.quantity)
    
    RULES:
    - Movements are APPEND-ONLY (no update, no delete)
    - Every movement has a reason (movement_type) and user (created_by)
    - RBAC: Admin only for create/view ledger
    """
    queryset = InventoryMovement.objects.select_related(
        'product', 'created_by'
    ).order_by('-created_at')
    permission_classes = [IsAdmin]
    pagination_class = StandardResultsSetPagination
    
    def get_serializer_class(self):
        if self.action == 'create':
            return InventoryMovementCreateSerializer
        return InventoryMovementSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params
        
        # Filter by product
        product_id = params.get('product_id')
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        
        # Filter by movement type
        movement_type = params.get('movement_type')
        if movement_type:
            queryset = queryset.filter(movement_type=movement_type.upper())
        
        # Filter by date range
        start_date = params.get('start_date')
        if start_date:
            queryset = queryset.filter(created_at__date__gte=start_date)
        
        end_date = params.get('end_date')
        if end_date:
            queryset = queryset.filter(created_at__date__lte=end_date)
        
        return queryset


@extend_schema(
    summary="Get product stock",
    description="""
    Get derived stock for a product.
    
    **Stock is calculated as SUM of all inventory movements, not stored as a field.**
    
    This endpoint reads from the ledger and returns the current available stock.
    """,
    parameters=[
        OpenApiParameter(
            name='product_id',
            type=OpenApiTypes.UUID,
            location=OpenApiParameter.QUERY,
            description='Product ID (required)',
            required=True
        ),
        OpenApiParameter(
            name='warehouse_id',
            type=OpenApiTypes.UUID,
            location=OpenApiParameter.QUERY,
            description='Warehouse ID (optional, for location-specific stock)',
            required=False
        ),
    ],
    responses={
        200: ProductStockSerializer,
        400: {"type": "object", "properties": {"error": {"type": "string"}}},
    },
    tags=['Inventory Ledger']
)
class ProductStockView(APIView):
    """
    API endpoint to get derived product stock.
    
    Stock = SUM(inventory_movements.quantity)
    
    RBAC: All authenticated users can view stock.
    """
    permission_classes = [IsStaffOrAdmin]
    
    def get(self, request):
        product_id = request.query_params.get('product_id')
        warehouse_id = request.query_params.get('warehouse_id')
        
        if not product_id:
            return Response(
                {'error': 'product_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Verify product exists
        if not Product.objects.filter(id=product_id, is_deleted=False).exists():
            return Response(
                {'error': 'Product not found or deleted'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get derived stock from ledger
        available_stock = services.get_product_stock(product_id, warehouse_id)
        
        return Response({
            'product_id': product_id,
            'available_stock': available_stock
        })


# =============================================================================
# PHASE 12: OPENING STOCK VIEW
# =============================================================================

from .serializers import OpeningStockSerializer


@extend_schema(
    summary="Create opening stock",
    description="""
    Create opening stock for a product in a warehouse.
    
    **PHASE 12 CORE RULE: Opening stock is not a field. It is a ledger entry.**
    
    RULES:
    - Only ONE opening stock per product per warehouse
    - Quantity MUST be positive
    - Cannot be created if any movement already exists for product+warehouse
    - Admin only operation
    
    This creates an OPENING movement in the inventory ledger.
    """,
    request=OpeningStockSerializer,
    responses={
        201: InventoryMovementSerializer,
        400: {"type": "object", "properties": {"detail": {"type": "string"}}},
        403: {"type": "object", "properties": {"detail": {"type": "string"}}},
    },
    tags=['Opening Stock']
)
class OpeningStockView(APIView):
    """
    API endpoint to create opening stock.
    
    PHASE 12:
    - Opening stock is an InventoryMovement with type=OPENING
    - Only one per product+warehouse combination
    - Admin only
    """
    permission_classes = [IsAdmin]
    
    def post(self, request):
        serializer = OpeningStockSerializer(
            data=request.data,
            context={'request': request}
        )
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            movement = serializer.save()
            return Response(
                InventoryMovementSerializer(movement).data,
                status=status.HTTP_201_CREATED
            )
        except Exception as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


# =============================================================================
# PURCHASE ORDER VIEWS
# =============================================================================

from .models import Supplier, PurchaseOrder, PurchaseOrderItem
from .serializers import (
    SupplierSerializer,
    SupplierListSerializer,
    PurchaseOrderSerializer,
    PurchaseOrderListSerializer,
    PurchaseOrderCreateSerializer,
    ReceivePurchaseOrderSerializer,
)


@extend_schema_view(
    list=extend_schema(
        summary="List suppliers",
        description="Returns paginated list of suppliers.",
        tags=['Suppliers']
    ),
    create=extend_schema(
        summary="Create supplier",
        description="Create a new supplier.",
        tags=['Suppliers']
    ),
    retrieve=extend_schema(
        summary="Get supplier details",
        description="Get details of a specific supplier.",
        tags=['Suppliers']
    ),
    update=extend_schema(
        summary="Update supplier",
        description="Update a supplier.",
        tags=['Suppliers']
    ),
    partial_update=extend_schema(
        summary="Partial update supplier",
        description="Partially update a supplier.",
        tags=['Suppliers']
    ),
    destroy=extend_schema(
        summary="Deactivate supplier",
        description="Soft delete a supplier by setting is_active=False.",
        tags=['Suppliers']
    ),
)
class SupplierViewSet(SoftDeleteMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing suppliers.
    
    HARDENING: Delete operations perform soft-delete (is_active=False).
    """
    queryset = Supplier.objects.filter(is_active=True)
    serializer_class = SupplierSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Include inactive if requested
        include_inactive = self.request.query_params.get('include_inactive')
        if include_inactive and include_inactive.lower() == 'true':
            queryset = Supplier.objects.all()
        
        # Search filter
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) |
                models.Q(code__icontains=search) |
                models.Q(contact_person__icontains=search)
            )
        
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'list':
            # Use list serializer if requested
            if self.request.query_params.get('minimal') == 'true':
                return SupplierListSerializer
        return SupplierSerializer


@extend_schema_view(
    list=extend_schema(
        summary="List purchase orders",
        description="Returns paginated list of purchase orders.",
        parameters=[
            OpenApiParameter(
                name='status',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Filter by status (DRAFT, SUBMITTED, PARTIAL, RECEIVED, CANCELLED)',
                required=False
            ),
            OpenApiParameter(
                name='supplier_id',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description='Filter by supplier UUID',
                required=False
            ),
        ],
        tags=['Purchase Orders']
    ),
    create=extend_schema(
        summary="Create purchase order",
        description="Create a new purchase order with items.",
        tags=['Purchase Orders']
    ),
    retrieve=extend_schema(
        summary="Get purchase order details",
        description="Get details of a specific purchase order with items.",
        tags=['Purchase Orders']
    ),
    update=extend_schema(
        summary="Update purchase order",
        description="Update a purchase order. Only DRAFT orders can be modified.",
        tags=['Purchase Orders']
    ),
    partial_update=extend_schema(
        summary="Partial update purchase order",
        description="Partially update a purchase order. Only DRAFT orders can be modified.",
        tags=['Purchase Orders']
    ),
)
class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing purchase orders.
    
    LIFECYCLE:
    - Create PO in DRAFT status
    - Submit to supplier (SUBMITTED)
    - Receive items (PARTIAL or RECEIVED)
    - Cancel if needed (CANCELLED)
    
    RECEIVING:
    - Use /purchase-orders/{id}/receive/ action to receive items
    - Creates PURCHASE inventory movements
    """
    queryset = PurchaseOrder.objects.select_related(
        'supplier', 'warehouse'
    ).prefetch_related('items__product')
    permission_classes = [IsStaffOrAdmin]
    pagination_class = StandardResultsSetPagination
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PurchaseOrderListSerializer
        if self.action == 'create':
            return PurchaseOrderCreateSerializer
        return PurchaseOrderSerializer
    
    def get_queryset(self):
        from django.db.models import Count, Q, Sum
        
        queryset = super().get_queryset()
        params = self.request.query_params
        
        # Annotate item count for list view
        queryset = queryset.annotate(
            item_count=Count('items')
        )
        
        # Search filter (PO number or supplier name)
        search = params.get('search')
        if search:
            queryset = queryset.filter(
                Q(po_number__icontains=search) |
                Q(supplier__name__icontains=search)
            )
        
        # Status filter
        status_filter = params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter.upper())
        
        # Filter for POs with received items (for debit notes)
        # This finds any PO that has at least one item with received_quantity > 0
        has_received_items = params.get('has_received_items')
        if has_received_items and has_received_items.lower() == 'true':
            queryset = queryset.annotate(
                total_received=Sum('items__received_quantity')
            ).filter(total_received__gt=0)
        
        # Supplier filter
        supplier_id = params.get('supplier_id')
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)
        
        # Date range filters
        start_date = params.get('start_date')
        if start_date:
            queryset = queryset.filter(order_date__gte=start_date)
        
        end_date = params.get('end_date')
        if end_date:
            queryset = queryset.filter(order_date__lte=end_date)
        
        return queryset
    
    def update(self, request, *args, **kwargs):
        """Only allow updating DRAFT orders."""
        instance = self.get_object()
        if instance.status != PurchaseOrder.Status.DRAFT:
            return Response(
                {'error': 'Only DRAFT orders can be modified'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().update(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        """Cancel a PO instead of deleting."""
        instance = self.get_object()
        if instance.status == PurchaseOrder.Status.RECEIVED:
            return Response(
                {'error': 'Cannot cancel a fully received order'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        instance.status = PurchaseOrder.Status.CANCELLED
        instance.save(update_fields=['status', 'updated_at'])
        
        return Response(
            {
                'message': 'Purchase order cancelled',
                'id': str(instance.id),
                'po_number': instance.po_number,
                'status': instance.status
            },
            status=status.HTTP_200_OK
        )
    
    @extend_schema(
        summary="Submit purchase order",
        description="Change PO status from DRAFT to SUBMITTED.",
        request=None,
        responses={200: PurchaseOrderSerializer},
        tags=['Purchase Orders']
    )
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit a draft PO."""
        instance = self.get_object()
        
        if instance.status != PurchaseOrder.Status.DRAFT:
            return Response(
                {'error': 'Only DRAFT orders can be submitted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        instance.status = PurchaseOrder.Status.SUBMITTED
        instance.save(update_fields=['status', 'updated_at'])
        
        return Response(PurchaseOrderSerializer(instance).data)
    
    @extend_schema(
        summary="Receive purchase order items",
        description="""
        Receive items from a purchase order.
        Creates PURCHASE inventory movements for received quantities.
        Updates PO status to PARTIAL or RECEIVED based on all items.
        """,
        request=ReceivePurchaseOrderSerializer,
        responses={
            200: {"type": "object"},
            400: {"type": "object", "properties": {"error": {"type": "string"}}},
        },
        tags=['Purchase Orders']
    )
    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        """Receive items from a purchase order."""
        instance = self.get_object()
        
        if instance.status == PurchaseOrder.Status.CANCELLED:
            return Response(
                {'error': 'Cannot receive items on a cancelled order'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if instance.status == PurchaseOrder.Status.RECEIVED:
            return Response(
                {'error': 'Order is already fully received'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = ReceivePurchaseOrderSerializer(
            data=request.data,
            context={'request': request, 'purchase_order': instance}
        )
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        result = serializer.save()
        return Response(result)


# =============================================================================
# STORE VIEWS
# =============================================================================

from .models import Store, StockTransfer, StockTransferItem
from .serializers import (
    StoreSerializer, StoreListSerializer, StoreCreateSerializer, StoreStockSerializer,
    StockTransferSerializer, StockTransferListSerializer, StockTransferCreateSerializer,
    DispatchTransferSerializer, ReceiveTransferSerializer
)


class StoreViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing Stores.
    
    Provides:
    - List all stores (GET /stores/)
    - Create store (POST /stores/)
    - Retrieve store (GET /stores/{id}/)
    - Update store (PUT/PATCH /stores/{id}/)
    - Delete (soft) store (DELETE /stores/{id}/)
    - Get store stock (GET /stores/{id}/stock/)
    - Get low stock alerts (GET /stores/low-stock-alerts/)
    """
    queryset = Store.objects.all()
    # Staff needs GET for POS store list; mutations remain admin-only
    permission_classes = [IsAdminOrReadOnly]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return StoreListSerializer
        elif self.action == 'create':
            return StoreCreateSerializer
        return StoreSerializer
    
    def get_queryset(self):
        queryset = filter_queryset_for_user(
            Store.objects.select_related('operator'),
            self.request.user,
        )
        
        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        # Filter by city
        city = self.request.query_params.get('city')
        if city:
            queryset = queryset.filter(city__icontains=city)
        
        # Search
        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(code__icontains=search) |
                Q(city__icontains=search)
            )
        
        return queryset
    
    def perform_create(self, serializer):
        serializer.save(organization_id=getattr(self.request.user, "organization_id", None))
    
    def destroy(self, request, *args, **kwargs):
        """Soft delete by setting is_active=False."""
        instance = self.get_object()
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    @extend_schema(
        responses={200: StoreStockSerializer(many=True)},
        description="Get stock levels for this store."
    )
    @action(detail=True, methods=['get'])
    def stock(self, request, pk=None):
        """Get stock levels for a store."""
        store = self.get_object()
        stock_data = list(store.get_stock())
        serializer = StoreStockSerializer(
            stock_data, many=True,
            context={'low_stock_threshold': store.low_stock_threshold}
        )
        return Response(serializer.data)
    
    @extend_schema(
        responses={200: dict},
        description="Get stores with low stock products and brand-level alerts."
    )
    @action(detail=False, methods=['get'], url_path='low-stock-alerts')
    def low_stock_alerts(self, request):
        """Get all stores with low stock products and brand-level (< 50 units) alerts."""
        from django.db.models import Sum

        stores = Store.objects.filter(is_active=True)
        alerts = []
        brand_alerts = []
        BRAND_THRESHOLD = 50

        for store in stores:
            # Product-level low stock
            low_stock_products = store.get_low_stock_products()
            if low_stock_products:
                alerts.append({
                    'store_id': str(store.id),
                    'store_name': store.name,
                    'store_code': store.code,
                    'low_stock_count': len(low_stock_products),
                    'products': low_stock_products
                })

            # Brand-level: brands whose total stock < 50 in this store
            brand_stock = (
                InventoryMovement.objects
                .filter(store=store)
                .values('product__brand')
                .annotate(total_stock=Sum('quantity'))
                .filter(total_stock__gt=0, total_stock__lt=BRAND_THRESHOLD)
            )
            for item in brand_stock:
                brand_alerts.append({
                    'store_id': str(store.id),
                    'store_name': store.name,
                    'store_code': store.code,
                    'brand': item['product__brand'] or 'Unbranded',
                    'total_stock': item['total_stock'],
                    'threshold': BRAND_THRESHOLD,
                })

        return Response({
            'total_alerts': len(alerts),
            'stores': alerts,
            'brand_alerts': brand_alerts,
            'total_brand_alerts': len(brand_alerts),
        })

    @extend_schema(
        responses={200: dict},
        description="Get detailed analytics for a store: products, purchase value, sales, and brand breakdown."
    )
    @action(detail=True, methods=['get'])
    def analytics(self, request, pk=None):
        """
        Get full analytics for a single store:
        - total_products / total_stock_quantity
        - total_purchase_value  (cost_price × current stock)
        - sales  (transactions, qty sold, revenue)
        - brands  (per-brand product count, stock, sizes, description)
        - low_brand_alerts  (brands with total stock < 50)
        """
        from django.db.models import Sum, Count
        from decimal import Decimal
        from inventory.models import ProductPricing, ProductVariant

        store = self.get_object()
        BRAND_THRESHOLD = 50

        # ── 1. Current stock per product ──────────────────────────────────
        stock_qs = list(
            InventoryMovement.objects
            .filter(store=store)
            .values(
                'product_id',
                'product__name',
                'product__brand',
                'product__category',
                'product__description',
            )
            .annotate(current_stock=Sum('quantity'))
            .filter(current_stock__gt=0)
        )

        product_ids = [item['product_id'] for item in stock_qs]
        total_products = len(product_ids)
        total_stock_quantity = sum(item['current_stock'] for item in stock_qs)

        # ── 2. Purchase value: cost_price × current_stock ─────────────────
        pricing_map = {
            str(p['product_id']): p['cost_price']
            for p in ProductPricing.objects.filter(
                product_id__in=product_ids
            ).values('product_id', 'cost_price')
        }

        total_purchase_value = Decimal('0.00')
        for item in stock_qs:
            cost = pricing_map.get(str(item['product_id']), Decimal('0.00'))
            total_purchase_value += Decimal(str(cost)) * item['current_stock']

        # ── 3. Sales info from InventoryMovement (SALE movements) ─────────
        sale_agg = (
            InventoryMovement.objects
            .filter(store=store, movement_type='SALE')
            .aggregate(
                total_qty=Sum('quantity'),
                total_txns=Count('reference_id', distinct=True),
            )
        )
        total_qty_sold = abs(sale_agg['total_qty'] or 0)
        total_transactions = sale_agg['total_txns'] or 0

        # Revenue from linked Sale records
        sale_ref_ids = list(
            InventoryMovement.objects
            .filter(store=store, movement_type='SALE')
            .exclude(reference_id__isnull=True)
            .values_list('reference_id', flat=True)
            .distinct()
        )
        total_revenue = Decimal('0.00')
        try:
            from sales.models import Sale
            rev = Sale.objects.filter(id__in=sale_ref_ids).aggregate(
                revenue=Sum('total')
            )['revenue']
            if rev:
                total_revenue = rev
        except Exception:
            pass

        # ── 4. Sizes per product (from ProductVariant) ────────────────────
        sizes_map: dict = {}
        for v in (
            ProductVariant.objects
            .filter(product_id__in=product_ids, is_active=True)
            .values('product_id', 'size')
            .exclude(size__isnull=True)
            .exclude(size='')
        ):
            pid = str(v['product_id'])
            sizes_map.setdefault(pid, set()).add(v['size'])

        # ── 5. Brand breakdown ────────────────────────────────────────────
        brand_map: dict = {}
        for item in stock_qs:
            brand = item['product__brand'] or 'Unbranded'
            pid = str(item['product_id'])
            stock = item['current_stock']

            if brand not in brand_map:
                brand_map[brand] = {
                    'brand': brand,
                    'product_count': 0,
                    'total_stock': 0,
                    'description': item['product__description'] or '',
                    'sizes': set(),
                    'categories': set(),
                }

            brand_map[brand]['product_count'] += 1
            brand_map[brand]['total_stock'] += stock
            if item['product__category']:
                brand_map[brand]['categories'].add(item['product__category'])
            if pid in sizes_map:
                brand_map[brand]['sizes'].update(sizes_map[pid])

        brands = []
        low_brand_alerts = []

        for brand_name, binfo in sorted(
            brand_map.items(), key=lambda x: -x[1]['total_stock']
        ):
            is_low = binfo['total_stock'] < BRAND_THRESHOLD
            brands.append({
                'brand': brand_name,
                'product_count': binfo['product_count'],
                'total_stock': binfo['total_stock'],
                'description': binfo['description'],
                'sizes': sorted(list(binfo['sizes'])),
                'categories': list(binfo['categories']),
                'is_low_brand_stock': is_low,
            })
            if is_low:
                low_brand_alerts.append({
                    'brand': brand_name,
                    'total_stock': binfo['total_stock'],
                    'threshold': BRAND_THRESHOLD,
                })

        return Response({
            'store_id': str(store.id),
            'store_name': store.name,
            'total_products': total_products,
            'total_stock_quantity': total_stock_quantity,
            'total_purchase_value': float(total_purchase_value),
            'sales': {
                'total_transactions': total_transactions,
                'total_qty_sold': total_qty_sold,
                'total_revenue': float(total_revenue),
            },
            'brands': brands,
            'low_brand_alerts': low_brand_alerts,
            'brand_alert_threshold': BRAND_THRESHOLD,
        })


class StockTransferViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing Stock Transfers.
    
    Provides:
    - List all transfers (GET /stock-transfers/)
    - Create transfer (POST /stock-transfers/)
    - Retrieve transfer (GET /stock-transfers/{id}/)
    - Dispatch transfer (POST /stock-transfers/{id}/dispatch/)
    - Receive transfer (POST /stock-transfers/{id}/receive/)
    """
    queryset = StockTransfer.objects.all()
    permission_classes = [IsAdmin]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return StockTransferListSerializer
        elif self.action == 'create':
            return StockTransferCreateSerializer
        return StockTransferSerializer
    
    def get_queryset(self):
        queryset = StockTransfer.objects.select_related(
            'source_warehouse', 'destination_store',
            'created_by', 'dispatched_by', 'received_by'
        ).prefetch_related('items__product')
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter.upper())
        
        # Filter by warehouse
        warehouse_id = self.request.query_params.get('warehouse')
        if warehouse_id:
            queryset = queryset.filter(source_warehouse_id=warehouse_id)
        
        # Filter by store
        store_id = self.request.query_params.get('store')
        if store_id:
            queryset = queryset.filter(destination_store_id=store_id)
        
        # Date range
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            queryset = queryset.filter(transfer_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(transfer_date__lte=end_date)
        
        return queryset
    
    @extend_schema(
        request=None,
        responses={200: StockTransferSerializer},
        description="Dispatch a transfer. Creates TRANSFER_OUT movements in warehouse."
    )
    @action(detail=True, methods=['post'], url_path='dispatch')
    def dispatch_transfer(self, request, pk=None):
        """Dispatch a transfer from warehouse."""
        instance = self.get_object()
        
        serializer = DispatchTransferSerializer(
            data={},
            context={'request': request, 'transfer': instance}
        )
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        transfer = serializer.save()
        return Response(StockTransferSerializer(transfer).data)
    
    @extend_schema(
        request=ReceiveTransferSerializer,
        responses={200: dict},
        description="Receive items at a store. Creates TRANSFER_IN movements."
    )
    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        """Receive a transfer at a store."""
        instance = self.get_object()
        
        serializer = ReceiveTransferSerializer(
            data=request.data,
            context={'request': request, 'transfer': instance}
        )
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        result = serializer.save()
        return Response(result)

# =============================================================================
# DEBIT/CREDIT NOTES - IMPORT FROM SEPARATE FILE
# =============================================================================
from .views_debit_credit import CreditNoteViewSet, DebitNoteViewSet
