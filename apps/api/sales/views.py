"""
Sales Views for Quake Inventory System.

PHASE 13: POS ENGINE (LEDGER-BACKED)
=====================================

POS-GRADE API:
- Barcode scan for validation
- Atomic sale creation with multi-payment
- Sales history (read-only)
- Credit payment tracking and repayment

RBAC:
- Admin/Staff: Create sales, view sales, record credit payments
- No one: Edit/delete sales (immutable)
"""

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiParameter
from decimal import Decimal

from .models import Sale, SaleItem, CreditPayment
from .serializers import (
    SaleSerializer,
    SaleListSerializer,
    BarcodeScanSerializer,
    BarcodeScanResponseSerializer,
    CheckoutSerializer,
    CheckoutResponseSerializer,
    CreditPaymentSerializer,
    CreditPaymentInputSerializer,
    CreditSaleListSerializer,
)
from . import services
from core.pagination import StandardResultsSetPagination
from users.permissions import IsStaffOrAdmin
from users.organization import filter_queryset_for_user


class BarcodeScanView(APIView):
    """
    Validate a barcode scan for POS operations.
    Returns product info and stock availability.
    """
    permission_classes = [IsStaffOrAdmin]
    
    @extend_schema(
        summary="Scan barcode",
        description="Validate a barcode and check stock availability for POS.",
        request=BarcodeScanSerializer,
        responses={
            200: BarcodeScanResponseSerializer,
            400: {"type": "object", "properties": {"error": {"type": "string"}}},
            404: {"type": "object", "properties": {"error": {"type": "string"}}},
        },
        tags=['POS Operations']
    )
    def post(self, request):
        serializer = BarcodeScanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            result = services.scan_barcode(
                barcode=serializer.validated_data['barcode'],
                warehouse_id=str(serializer.validated_data['warehouse_id']),
                quantity=serializer.validated_data.get('quantity', 1)
            )
            return Response(result, status=status.HTTP_200_OK)
        
        except services.InvalidBarcodeError as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except services.InactiveProductError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except services.WarehouseNotFoundError as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except services.SaleError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PosSearchView(APIView):
    """
    Text search for POS: products (name/SKU/barcode/etc.) and service catalog.
    Requires warehouse_id; optional q and limit (1–50, default 20).
    """

    permission_classes = [IsStaffOrAdmin]

    @extend_schema(
        summary="POS text search",
        description=(
            "Search active products and service items for POS, scoped to a warehouse "
            "(for stock on product rows). Empty q returns empty product and service lists."
        ),
        parameters=[
            OpenApiParameter(
                name="q",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Search string (trimmed); empty or whitespace yields no hits",
            ),
            OpenApiParameter(
                name="warehouse_id",
                type=str,
                location=OpenApiParameter.QUERY,
                required=True,
                description="Warehouse UUID",
            ),
            OpenApiParameter(
                name="limit",
                type=int,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Max rows per bucket (1–50, default 20)",
            ),
        ],
        responses={
            200: {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "warehouse_id": {"type": "string", "format": "uuid"},
                    "limit": {"type": "integer"},
                    "products": {"type": "array", "items": {"type": "object"}},
                    "services": {"type": "array", "items": {"type": "object"}},
                },
            },
            400: {"type": "object", "properties": {"error": {"type": "string"}}},
            404: {"type": "object", "properties": {"error": {"type": "string"}}},
        },
        tags=["POS Operations"],
    )
    def get(self, request):
        warehouse_id = request.query_params.get("warehouse_id")
        if not warehouse_id or not str(warehouse_id).strip():
            return Response(
                {"error": "warehouse_id query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        q = request.query_params.get("q", "") or ""
        raw_limit = request.query_params.get("limit")
        if raw_limit is None or raw_limit == "":
            limit_val = 20
        else:
            limit_val = raw_limit

        try:
            result = services.pos_search(
                str(warehouse_id).strip(),
                q,
                limit=limit_val,
            )
            return Response(result, status=status.HTTP_200_OK)
        except services.WarehouseNotFoundError as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)


class CheckoutView(APIView):
    """
    Complete a sale transaction atomically.
    
    PHASE 13 FEATURES:
    - Multi-payment support
    - Discount support (PERCENT or FLAT)
    - Barcode-first product resolution
    - Stock validation via inventory ledger
    - Atomic transaction with rollback
    
    IDEMPOTENCY:
    - Must include idempotency_key (UUID v4)
    - If sale exists with same key and is COMPLETED: return existing sale
    - Prevents duplicate checkouts on network retry
    
    ATOMIC OPERATION:
    - If any item fails, entire sale is rolled back
    - Inventory movements created for each item
    - Payments must sum to total exactly
    """
    permission_classes = [IsStaffOrAdmin]
    
    @extend_schema(
        summary="Create sale (checkout)",
        description="""
Process a complete sale with atomic transaction and idempotency protection.

**REQUIRED FLOW:**
1. Start DB transaction
2. Resolve products by barcode
3. For each item: validate stock availability
4. Calculate subtotal, discount, total
5. Validate payments sum == total
6. Create Sale, SaleItems, Payments
7. Create inventory movements (SALE type)
8. Commit transaction

**FAILURE MODES:**
- Insufficient stock → reject entire sale
- Invalid barcode → reject entire sale
- Payment mismatch → reject entire sale
- Any error → rollback everything

**IDEMPOTENCY:**
- Include unique `idempotency_key` (UUID v4)
- Duplicate requests return existing sale
        """,
        request=CheckoutSerializer,
        responses={
            200: CheckoutResponseSerializer,
            201: CheckoutResponseSerializer,
            400: {"type": "object", "properties": {"error": {"type": "string"}}},
            404: {"type": "object", "properties": {"error": {"type": "string"}}},
        },
        tags=['POS Operations']
    )
    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        idempotency_key = serializer.validated_data['idempotency_key']
        
        # Check if this is a duplicate request
        existing_before = services._check_existing_sale(idempotency_key)
        
        try:
            sale = services.process_sale(
                idempotency_key=idempotency_key,
                warehouse_id=str(serializer.validated_data['warehouse_id']),
                items=serializer.validated_data['items'],
                payments=serializer.validated_data['payments'],
                user=request.user,
                discount_type=serializer.validated_data.get('discount_type'),
                discount_value=serializer.validated_data.get('discount_value', Decimal('0.00')),
                customer_name=serializer.validated_data.get('customer_name', ''),
                customer_id=serializer.validated_data.get('customer_id'),
                customer_mobile=serializer.validated_data.get('customer_mobile', ''),
                customer_email=serializer.validated_data.get('customer_email', ''),
                customer_address=serializer.validated_data.get('customer_address', ''),
                apply_automatic_gst=serializer.validated_data.get(
                    'apply_automatic_gst', False
                ),
                store_id=(
                    str(serializer.validated_data['store_id'])
                    if serializer.validated_data.get('store_id')
                    else None
                ),
            )
            
            is_duplicate = existing_before is not None
            http_status = status.HTTP_200_OK if is_duplicate else status.HTTP_201_CREATED
            
            return Response({
                'success': sale.status == Sale.Status.COMPLETED,
                'idempotency_key': str(sale.idempotency_key),
                'is_duplicate': is_duplicate,
                'sale_id': str(sale.id),
                'invoice_number': sale.invoice_number,
                'subtotal': str(sale.subtotal),
                'discount_type': sale.discount_type,
                'discount_value': str(sale.discount_value),
                'discount_amount': str(sale.discount_amount),
                'total_gst': str(sale.total_gst),
                'total': str(sale.total),
                'total_items': sale.total_items,
                'status': sale.status,
                'message': 'Existing sale returned (idempotent)' if is_duplicate else 'Sale completed successfully',
                # Invoice info if generated
                'invoice_id': str(getattr(sale, '_generated_invoice', None).id) if getattr(sale, '_generated_invoice', None) else None,
                'pdf_url': getattr(getattr(sale, '_generated_invoice', None), 'pdf_url', None),
            }, status=http_status)
        
        except services.InvalidBarcodeError as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except services.InactiveProductError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except services.InsufficientStockError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except services.PaymentMismatchError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except services.InvalidDiscountError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except services.WarehouseNotFoundError as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except services.SaleError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class SaleViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet for sales.
    
    IMMUTABILITY:
    - Sales cannot be created through this endpoint (use /checkout/)
    - Sales cannot be updated
    - Sales cannot be deleted
    """
    queryset = Sale.objects.select_related(
        'warehouse', 'store', 'customer', 'created_by'
    ).prefetch_related(
        'items__product',
        'payments',
        'credit_payments',
    ).all()
    permission_classes = [IsStaffOrAdmin]
    pagination_class = StandardResultsSetPagination
    
    def get_serializer_class(self):
        if self.action == 'list':
            return SaleListSerializer
        return SaleSerializer
    
    def get_queryset(self):
        queryset = filter_queryset_for_user(super().get_queryset(), self.request.user)
        
        # Optional filters
        warehouse_id = self.request.query_params.get('warehouse_id')
        store_id = self.request.query_params.get('store_id')
        status_filter = self.request.query_params.get('status')
        
        if warehouse_id:
            queryset = queryset.filter(warehouse_id=warehouse_id)
        if store_id:
            queryset = queryset.filter(store_id=store_id)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset


# =============================================================================
# CREDIT PAYMENT VIEWS
# =============================================================================

class CreditSalesListView(APIView):
    """
    List all credit sales with pending or partial payments.
    
    Use this to see all customers who owe money (credit balance > 0).
    """
    permission_classes = [IsStaffOrAdmin]
    
    @extend_schema(
        summary="List credit sales",
        description="""
List all sales with pending or partial credit payments.

Returns sales where:
- is_credit_sale = True
- credit_status is PENDING or PARTIAL

Useful for:
- Tracking outstanding customer credit
- Following up on unpaid balances
- Credit collection workflow
        """,
        parameters=[
            OpenApiParameter(
                name='warehouse_id',
                description='Filter by warehouse',
                required=False,
                type=str
            ),
            OpenApiParameter(
                name='credit_status',
                description='Filter by credit status (PENDING, PARTIAL, PAID)',
                required=False,
                type=str
            ),
        ],
        responses={
            200: CreditSaleListSerializer(many=True),
        },
        tags=['Credit Payments']
    )
    def get(self, request):
        queryset = Sale.objects.filter(
            is_credit_sale=True,
            status=Sale.Status.COMPLETED,
        ).select_related('warehouse').order_by('-created_at')
        
        # Filter by warehouse
        warehouse_id = request.query_params.get('warehouse_id')
        if warehouse_id:
            queryset = queryset.filter(warehouse_id=warehouse_id)
        
        # Filter by credit status (default: show all - PENDING, PARTIAL, PAID)
        credit_status = request.query_params.get('credit_status')
        if credit_status:
            queryset = queryset.filter(credit_status=credit_status)
        # If no filter specified, show all credit sales (PENDING, PARTIAL, PAID)
        # This allows users to track full credit sale history
        
        serializer = CreditSaleListSerializer(queryset, many=True)
        return Response(serializer.data)


class RecordCreditPaymentView(APIView):
    """
    Record a payment against a credit sale.
    
    When a customer returns to pay off their credit balance (partial or full),
    use this endpoint to record the payment. The system will:
    1. Validate the sale is a credit sale
    2. Validate payment doesn't exceed balance
    3. Create a CreditPayment record
    4. Update the sale's credit_balance and credit_status
    """
    permission_classes = [IsStaffOrAdmin]
    
    @extend_schema(
        summary="Record credit payment",
        description="""
Record a payment against an existing credit sale.

**Flow:**
1. Customer comes to pay off credit balance
2. Look up their credit sale by invoice number or customer name
3. Record partial or full payment
4. System automatically updates balance and status

**Payment Status Updates:**
- If new balance = 0: credit_status → PAID
- If new balance > 0: credit_status → PARTIAL

**Immutability:**
- Credit payments cannot be modified or deleted
- To correct errors, record adjustments as separate transactions
        """,
        request=CreditPaymentInputSerializer,
        responses={
            201: {
                "type": "object",
                "properties": {
                    "success": {"type": "boolean"},
                    "payment_id": {"type": "string"},
                    "sale_id": {"type": "string"},
                    "invoice_number": {"type": "string"},
                    "amount_paid": {"type": "string"},
                    "previous_balance": {"type": "string"},
                    "new_balance": {"type": "string"},
                    "credit_status": {"type": "string"},
                    "is_fully_paid": {"type": "boolean"},
                    "message": {"type": "string"},
                }
            },
            400: {"type": "object", "properties": {"error": {"type": "string"}}},
            404: {"type": "object", "properties": {"error": {"type": "string"}}},
        },
        tags=['Credit Payments']
    )
    def post(self, request):
        serializer = CreditPaymentInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        sale_id = serializer.validated_data['sale_id']
        amount = serializer.validated_data['amount']
        method = serializer.validated_data['method']
        notes = serializer.validated_data.get('notes', '')
        
        # Get the sale
        try:
            sale = Sale.objects.get(id=sale_id)
        except Sale.DoesNotExist:
            return Response(
                {'error': f'Sale with ID {sale_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate it's a credit sale
        if not sale.is_credit_sale:
            return Response(
                {'error': f'Sale {sale.invoice_number} is not a credit sale'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate sale is completed
        if sale.status != Sale.Status.COMPLETED:
            return Response(
                {'error': f'Sale {sale.invoice_number} is not completed (status: {sale.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate balance
        if sale.credit_balance <= Decimal('0.00'):
            return Response(
                {'error': f'Sale {sale.invoice_number} has no outstanding balance'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if amount > sale.credit_balance:
            return Response(
                {'error': f'Payment amount (₹{amount}) exceeds credit balance (₹{sale.credit_balance})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        previous_balance = sale.credit_balance
        
        try:
            # Create credit payment (model handles balance update)
            credit_payment = CreditPayment.objects.create(
                sale=sale,
                amount=amount,
                method=method,
                received_by=request.user,
                notes=notes
            )
            
            # Refresh sale to get updated balance
            sale.refresh_from_db()
            
            return Response({
                'success': True,
                'payment_id': str(credit_payment.id),
                'sale_id': str(sale.id),
                'invoice_number': sale.invoice_number,
                'customer_name': sale.customer_name,
                'amount_paid': str(amount),
                'previous_balance': str(previous_balance),
                'new_balance': str(sale.credit_balance),
                'credit_status': sale.credit_status,
                'is_fully_paid': sale.credit_balance <= Decimal('0.00'),
                'message': 'Credit fully cleared!' if sale.credit_balance <= Decimal('0.00') else f'₹{sale.credit_balance} remaining'
            }, status=status.HTTP_201_CREATED)
            
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': f'Failed to record payment: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )


class CreditPaymentHistoryView(APIView):
    """
    Get payment history for a specific credit sale.
    """
    permission_classes = [IsStaffOrAdmin]
    
    @extend_schema(
        summary="Get credit payment history",
        description="Get all payments recorded against a credit sale.",
        parameters=[
            OpenApiParameter(
                name='sale_id',
                description='UUID of the sale',
                required=True,
                type=str
            ),
        ],
        responses={
            200: {
                "type": "object",
                "properties": {
                    "sale_id": {"type": "string"},
                    "invoice_number": {"type": "string"},
                    "customer_name": {"type": "string"},
                    "original_credit": {"type": "string"},
                    "current_balance": {"type": "string"},
                    "credit_status": {"type": "string"},
                    "payments": {"type": "array"},
                }
            },
            404: {"type": "object", "properties": {"error": {"type": "string"}}},
        },
        tags=['Credit Payments']
    )
    def get(self, request):
        sale_id = request.query_params.get('sale_id')
        
        if not sale_id:
            return Response(
                {'error': 'sale_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            sale = Sale.objects.prefetch_related('credit_payments').get(id=sale_id)
        except Sale.DoesNotExist:
            return Response(
                {'error': f'Sale with ID {sale_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if not sale.is_credit_sale:
            return Response(
                {'error': f'Sale {sale.invoice_number} is not a credit sale'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        payments = CreditPaymentSerializer(sale.credit_payments.all(), many=True).data
        
        return Response({
            'sale_id': str(sale.id),
            'invoice_number': sale.invoice_number,
            'customer_name': sale.customer_name,
            'customer_mobile': sale.customer_mobile,
            'original_credit': str(sale.credit_amount),
            'current_balance': str(sale.credit_balance),
            'credit_status': sale.credit_status,
            'total_paid': str(sale.credit_amount - sale.credit_balance),
            'payments': payments
        })
