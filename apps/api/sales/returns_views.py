"""
Returns Views for Quake Inventory System.

PHASE 15: RETURNS, REFUNDS & ADJUSTMENTS (LEDGER-SAFE)
=======================================================

RBAC:
- Create return: Admin only
- View returns: Admin only
- Stock adjustment (sales path): Staff or Admin

API Endpoints:
- POST /api/v1/sales/returns/
- GET /api/v1/sales/returns/
- GET /api/v1/sales/returns/{id}/
- GET /api/v1/sales/returns/sale/{sale_id}/returnable/
"""

from rest_framework import mixins, status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from drf_spectacular.utils import extend_schema, extend_schema_view

from sales.models import Return
from sales import returns as returns_service
from sales.returns_serializers import (
    ReturnSerializer,
    ReturnListSerializer,
    CreateReturnSerializer,
    CreateReturnResponseSerializer,
    StockAdjustmentSerializer,
    StockAdjustmentResponseSerializer,
)
from core.pagination import StandardResultsSetPagination
from users.permissions import IsAdmin, IsStaffOrAdmin


@extend_schema_view(
    list=extend_schema(
        summary="List returns",
        description="View returns for the active business (Admin only).",
        tags=["Returns"],
    ),
    retrieve=extend_schema(
        summary="Get return details",
        description="View complete return with all items (Admin only).",
        tags=["Returns"],
    ),
    create=extend_schema(
        summary="Create a return",
        description=(
            "Process a return for a completed sale in the active business.\\n\\n"
            "**PHASE 15 RULES:**\\n"
            "- Refund amounts derived from stored sale data (no recalculation)\\n"
            "- Creates RETURN inventory movements (+stock)\\n"
            "- Original sale/invoice is never modified\\n"
            "- Partial returns allowed"
        ),
        request=CreateReturnSerializer,
        responses={
            201: CreateReturnResponseSerializer,
            400: {"type": "object", "properties": {"error": {"type": "string"}}},
            403: {"type": "object", "properties": {"error": {"type": "string"}}},
            404: {"type": "object", "properties": {"error": {"type": "string"}}},
        },
        tags=["Returns"],
    ),
)
class ReturnViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    Create / list / retrieve returns for the caller's active organization.
    Admin only.
    """

    permission_classes = [IsAdmin]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = Return.objects.prefetch_related(
            "items__sale_item__product",
            "original_sale",
            "warehouse",
            "created_by",
        )
        org_id = getattr(self.request.user, "organization_id", None)
        if not org_id:
            return qs.none()
        return qs.filter(original_sale__organization_id=org_id)

    def get_serializer_class(self):
        if self.action == "list":
            return ReturnListSerializer
        if self.action == "create":
            return CreateReturnSerializer
        return ReturnSerializer

    def create(self, request, *args, **kwargs):
        serializer = CreateReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            return_record = returns_service.process_return(
                sale_id=str(serializer.validated_data["sale_id"]),
                warehouse_id=str(serializer.validated_data["warehouse_id"]),
                items=serializer.validated_data["items"],
                reason=serializer.validated_data["reason"],
                user=request.user,
            )

            return Response(
                {
                    "success": True,
                    "return_id": str(return_record.id),
                    "refund_subtotal": str(return_record.refund_subtotal),
                    "refund_gst": str(return_record.refund_gst),
                    "refund_amount": str(return_record.refund_amount),
                    "message": "Return processed successfully",
                },
                status=status.HTTP_201_CREATED,
            )

        except returns_service.SaleNotFoundError as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except returns_service.SaleNotCompletedError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except returns_service.InvalidReturnQuantityError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except returns_service.SaleItemNotFoundError as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except returns_service.NoItemsToReturnError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except returns_service.ReturnError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        summary="Get returnable items for a sale",
        description="Get list of items that can still be returned for a sale.",
        responses={200: {"type": "array"}},
        tags=["Returns"],
    )
    @action(
        detail=False,
        methods=["get"],
        url_path="sale/(?P<sale_id>[^/.]+)/returnable",
    )
    def returnable_items(self, request, sale_id=None):
        """Get returnable items for a sale in the active organization."""
        try:
            returnable = returns_service.get_sale_returnable_items(
                sale_id,
                organization_id=getattr(request.user, "organization_id", None),
            )
            return Response(returnable)
        except returns_service.SaleNotFoundError as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)


# Backward-compatible name for older imports (ViewSet handles POST create now)
CreateReturnView = ReturnViewSet


class StockAdjustmentView(APIView):
    """
    Create a manual stock adjustment.

    PHASE 15 RULES:
    - Uses ADJUSTMENT inventory movement
    - Quantity can be + or -
    - Cannot result in negative stock
    - Reason is mandatory
    - Staff or admin (POS receive stock + corrections)
    """

    permission_classes = [IsStaffOrAdmin]

    @extend_schema(
        summary="Create stock adjustment",
        description=(
            "Create a manual stock adjustment.\\n\\n"
            "**PHASE 15 RULES:**\\n"
            "- Quantity can be positive or negative\\n"
            "- Cannot result in negative stock\\n"
            "- Creates ADJUSTMENT inventory movement\\n"
            "- Reason is mandatory"
        ),
        request=StockAdjustmentSerializer,
        responses={
            201: StockAdjustmentResponseSerializer,
            400: {"type": "object", "properties": {"error": {"type": "string"}}},
        },
        tags=["Inventory"],
    )
    def post(self, request):
        from inventory import services as inventory_services

        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            movement = inventory_services.create_stock_adjustment(
                product_id=str(serializer.validated_data["product_id"]),
                warehouse_id=str(serializer.validated_data["warehouse_id"]),
                quantity=serializer.validated_data["quantity"],
                reason=serializer.validated_data["reason"],
                user=request.user,
            )

            new_stock = inventory_services.get_product_stock(
                movement.product_id,
                movement.warehouse_id,
            )

            return Response(
                {
                    "success": True,
                    "movement_id": str(movement.id),
                    "product_name": movement.product.name,
                    "warehouse_name": movement.warehouse.name,
                    "quantity": movement.quantity,
                    "new_stock": new_stock,
                    "message": "Stock adjustment created successfully",
                },
                status=status.HTTP_201_CREATED,
            )

        except inventory_services.InvalidAdjustmentError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except inventory_services.InsufficientStockError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
