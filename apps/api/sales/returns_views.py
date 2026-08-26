"""
Returns Views for Quake Inventory System.

PHASE 15: RETURNS, REFUNDS & ADJUSTMENTS (LEDGER-SAFE)
=======================================================

RBAC:
- Create return: Admin only
- View returns: Admin only
- Create adjustment: Admin only

API Endpoints:
- POST /api/v1/returns/
- GET /api/v1/returns/
- GET /api/v1/returns/{id}/
- GET /api/v1/returns/sale/{sale_id}/returnable/
"""

from rest_framework import viewsets, status
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


class CreateReturnView(APIView):
    """
    Create a return for a completed sale.
    
    PHASE 15 RULES:
    - Original sale must be COMPLETED
    - Return quantities cannot exceed sold quantities
    - Refund amounts derived from stored sale data
    - Creates RETURN inventory movements
    - Admin only
    """
    permission_classes = [IsAdmin]
    
    @extend_schema(
        summary="Create a return",
        description=(
            "Process a return for a completed sale.\\n\\n"
            "**PHASE 15 RULES:**\\n"
            "- Refund amounts derived from stored sale data (no recalculation)\\n"
            "- Creates RETURN inventory movements (+stock)\\n"
            "- Original sale/invoice is never modified\\n"
            "- Partial returns allowed\\n\\n"
            "**EXAMPLE:**\\n"
            "```json\\n"
            "{\\n"
            "  \\\"sale_id\\\": \\\"uuid\\\",\\n"
            "  \\\"warehouse_id\\\": \\\"uuid\\\",\\n"
            "  \\\"items\\\": [\\n"
            "    {\\\"sale_item_id\\\": \\\"uuid\\\", \\\"quantity\\\": 1}\\n"
            "  ],\\n"
            "  \\\"reason\\\": \\\"Size issue\\\"\\n"
            "}\\n"
            "```"
        ),
        request=CreateReturnSerializer,
        responses={
            201: CreateReturnResponseSerializer,
            400: {"type": "object", "properties": {"error": {"type": "string"}}},
            403: {"type": "object", "properties": {"error": {"type": "string"}}},
            404: {"type": "object", "properties": {"error": {"type": "string"}}},
        },
        tags=['Returns']
    )
    def post(self, request):
        serializer = CreateReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            return_record = returns_service.process_return(
                sale_id=str(serializer.validated_data['sale_id']),
                warehouse_id=str(serializer.validated_data['warehouse_id']),
                items=serializer.validated_data['items'],
                reason=serializer.validated_data['reason'],
                user=request.user
            )
            
            return Response({
                'success': True,
                'return_id': str(return_record.id),
                'refund_subtotal': str(return_record.refund_subtotal),
                'refund_gst': str(return_record.refund_gst),
                'refund_amount': str(return_record.refund_amount),
                'message': 'Return processed successfully'
            }, status=status.HTTP_201_CREATED)
        
        except returns_service.SaleNotFoundError as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except returns_service.SaleNotCompletedError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except returns_service.InvalidReturnQuantityError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except returns_service.SaleItemNotFoundError as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except returns_service.NoItemsToReturnError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except returns_service.ReturnError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema_view(
    list=extend_schema(
        summary="List returns",
        description="View all returns (Admin only).",
        tags=['Returns']
    ),
    retrieve=extend_schema(
        summary="Get return details",
        description="View complete return with all items (Admin only).",
        tags=['Returns']
    ),
)
class ReturnViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet for returns.
    
    Admin only access.
    """
    queryset = Return.objects.prefetch_related(
        'items__sale_item__product',
        'original_sale',
        'warehouse',
        'created_by'
    ).all()
    permission_classes = [IsAdmin]
    pagination_class = StandardResultsSetPagination
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ReturnListSerializer
        return ReturnSerializer
    
    @extend_schema(
        summary="Get returnable items for a sale",
        description="Get list of items that can still be returned for a sale.",
        responses={200: {"type": "array"}},
        tags=['Returns']
    )
    @action(detail=False, methods=['get'], url_path='sale/(?P<sale_id>[^/.]+)/returnable')
    def returnable_items(self, request, sale_id=None):
        """Get returnable items for a sale."""
        try:
            returnable = returns_service.get_sale_returnable_items(sale_id)
            return Response(returnable)
        except returns_service.SaleNotFoundError as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)


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
            "- Reason is mandatory\\n\\n"
            "**EXAMPLE:**\\n"
            "```json\\n"
            "{\\n"
            "  \\\"product_id\\\": \\\"uuid\\\",\\n"
            "  \\\"warehouse_id\\\": \\\"uuid\\\",\\n"
            "  \\\"quantity\\\": -2,\\n"
            "  \\\"reason\\\": \\\"Damaged during transport\\\"\\n"
            "}\\n"
            "```"
        ),
        request=StockAdjustmentSerializer,
        responses={
            201: StockAdjustmentResponseSerializer,
            400: {"type": "object", "properties": {"error": {"type": "string"}}},
        },
        tags=['Inventory']
    )
    def post(self, request):
        from inventory import services as inventory_services
        
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            movement = inventory_services.create_stock_adjustment(
                product_id=str(serializer.validated_data['product_id']),
                warehouse_id=str(serializer.validated_data['warehouse_id']),
                quantity=serializer.validated_data['quantity'],
                reason=serializer.validated_data['reason'],
                user=request.user
            )
            
            # Get new stock level
            new_stock = inventory_services.get_product_stock(
                movement.product_id,
                movement.warehouse_id
            )
            
            return Response({
                'success': True,
                'movement_id': str(movement.id),
                'product_name': movement.product.name,
                'warehouse_name': movement.warehouse.name,
                'quantity': movement.quantity,
                'new_stock': new_stock,
                'message': 'Stock adjustment created successfully'
            }, status=status.HTTP_201_CREATED)
        
        except inventory_services.InvalidAdjustmentError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except inventory_services.InsufficientStockError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
