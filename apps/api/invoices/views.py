"""
Invoice Views for Quake Inventory System.

INVOICE API:
- Generate invoice for completed sale
- View invoice details
- Download invoice PDF
- Discount settings management
"""

from django.http import FileResponse, Http404
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.decorators import action
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter

import os
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Count, Q, Sum
from django.utils import timezone

from sales.models import Sale, Payment

from .models import Invoice, InvoiceItem, BusinessSettings
from .serializers import (
    InvoiceSerializer,
    InvoiceListSerializer,
    GenerateInvoiceSerializer,
    GenerateInvoiceResponseSerializer,
    DiscountSettingsSerializer,
    POSDiscountOptionsSerializer,
)
from . import services
from .pdf.write_pdf import is_valid_invoice_pdf
from core.pagination import StandardResultsSetPagination
from users.permissions import IsStaffOrAdmin, IsAdmin


class DiscountSettingsView(APIView):
    """
    Get or update discount configuration settings.
    
    GET: View current discount settings (Staff or Admin)
    PATCH: Update discount settings (Admin only)
    """
    
    def get_permissions(self):
        if self.request.method == 'PATCH':
            return [IsAdmin()]
        return [IsStaffOrAdmin()]
    
    @extend_schema(
        summary="Get discount settings",
        description="View current discount configuration.",
        responses={200: DiscountSettingsSerializer},
        tags=['Settings']
    )
    def get(self, request):
        settings = BusinessSettings.get_settings()
        serializer = DiscountSettingsSerializer(settings)
        return Response(serializer.data)
    
    @extend_schema(
        summary="Update discount settings",
        description="Update discount configuration (Admin only).",
        request=DiscountSettingsSerializer,
        responses={200: DiscountSettingsSerializer},
        tags=['Settings']
    )
    def patch(self, request):
        settings_obj = BusinessSettings.get_settings()
        serializer = DiscountSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class POSDiscountOptionsView(APIView):
    """
    Get available discount options for POS based on user role.
    
    Returns:
    - discount_enabled: whether discounts are allowed
    - max_discount_percent: max discount % the current user can apply
    - available_discounts: list of preset discounts
    """
    permission_classes = [IsStaffOrAdmin]
    
    @extend_schema(
        summary="Get POS discount options",
        description="Get available discounts for POS based on user role.",
        responses={200: POSDiscountOptionsSerializer},
        tags=['POS']
    )
    def get(self, request):
        settings = BusinessSettings.get_settings()
        
        # Determine max discount based on role
        user = request.user
        is_admin = user.role == 'ADMIN' if hasattr(user, 'role') else user.is_superuser
        
        max_discount = (
            settings.admin_max_discount_percent if is_admin
            else settings.staff_max_discount_percent
        )
        
        # Filter available discounts to those within user's limit
        # CRITICAL: Map PERCENTAGE -> PERCENT to match Sale.DiscountType
        filtered_discounts = []
        for discount in settings.available_discounts or []:
            discount_type = discount.get('type', '')
            # Map PERCENTAGE to PERCENT to match backend Sale.DiscountType
            if discount_type == 'PERCENTAGE':
                discount_type = 'PERCENT'
            
            if discount_type == 'PERCENT':
                if discount.get('value', 0) <= float(max_discount):
                    filtered_discounts.append({
                        'type': discount_type,
                        'value': discount.get('value'),
                        'label': discount.get('label'),
                    })
            else:
                # FLAT discounts are always available
                filtered_discounts.append({
                    'type': discount_type,
                    'value': discount.get('value'),
                    'label': discount.get('label'),
                })
        
        return Response({
            'discountEnabled': settings.discount_enabled,
            'maxDiscountPercent': str(max_discount),
            'availableDiscounts': filtered_discounts,
        })


class GenerateInvoiceView(APIView):
    """
    Generate an invoice for a completed sale.
    
    PHASE 14 RULES:
    - Sale must be COMPLETED
    - Each sale can only have one invoice (idempotent)
    - Invoice is immutable after creation
    - GST data is snapshotted from Sale (no recalculation)
    """
    permission_classes = [IsStaffOrAdmin]  # Staff or Admin can generate invoices
    
    @extend_schema(
        summary="Generate invoice for sale",
        description=(
            "Generate an invoice for a completed sale.\\n\\n"
            "**PHASE 14 RULES:**\\n"
            "- Invoice is a snapshot of Sale data (no recalculation)\\n"
            "- GST breakdown copied from SaleItem\\n"
            "- Same sale_id returns existing invoice (idempotent)\\n"
            "- Invoice cannot be modified after creation\\n\\n"
            "**EXAMPLE:**\\n"
            "```json\\n"
            "{\\n"
            "  \\\"sale_id\\\": \\\"uuid\\\",\\n"
            "  \\\"billing_name\\\": \\\"John Doe\\\",\\n"
            "  \\\"billing_phone\\\": \\\"9999999999\\\",\\n"
            "  \\\"billing_gstin\\\": \\\"27AABCU9603R1ZM\\\"\\n"
            "}\\n"
            "```"
        ),
        request=GenerateInvoiceSerializer,
        responses={
            201: GenerateInvoiceResponseSerializer,
            200: GenerateInvoiceResponseSerializer,  # Existing invoice
            400: {"type": "object", "properties": {"error": {"type": "string"}}},
            404: {"type": "object", "properties": {"error": {"type": "string"}}},
        },
        tags=['Invoices']
    )
    def post(self, request):
        serializer = GenerateInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            # Check if invoice already exists
            existing_invoice = services.get_invoice_by_sale(
                str(serializer.validated_data['sale_id'])
            )
            
            if existing_invoice:
                # Return existing invoice (idempotent)
                return Response({
                    'success': True,
                    'invoice_id': str(existing_invoice.id),
                    'invoice_number': existing_invoice.invoice_number,
                    'sale_invoice_number': existing_invoice.sale.invoice_number,
                    'subtotal_amount': str(existing_invoice.subtotal_amount),
                    'discount_type': existing_invoice.discount_type,
                    'discount_value': str(existing_invoice.discount_value) if existing_invoice.discount_value else None,
                    'discount_amount': str(existing_invoice.discount_amount),
                    'gst_total': str(existing_invoice.gst_total),
                    'total_amount': str(existing_invoice.total_amount),
                    'pdf_url': existing_invoice.pdf_url,
                    'message': 'Invoice already exists',
                    'already_existed': True
                }, status=status.HTTP_200_OK)
            
            # Generate new invoice
            invoice = services.generate_invoice_for_sale(
                sale_id=str(serializer.validated_data['sale_id']),
                billing_name=serializer.validated_data.get('billing_name'),
                billing_phone=serializer.validated_data.get('billing_phone'),
                billing_gstin=serializer.validated_data.get('billing_gstin')
            )
            
            return Response({
                'success': True,
                'invoice_id': str(invoice.id),
                'invoice_number': invoice.invoice_number,
                'sale_invoice_number': invoice.sale.invoice_number,
                'subtotal_amount': str(invoice.subtotal_amount),
                'discount_type': invoice.discount_type,
                'discount_value': str(invoice.discount_value) if invoice.discount_value else None,
                'discount_amount': str(invoice.discount_amount),
                'gst_total': str(invoice.gst_total),
                'total_amount': str(invoice.total_amount),
                'pdf_url': invoice.pdf_url,
                'message': 'Invoice generated successfully',
                'already_existed': False
            }, status=status.HTTP_201_CREATED)
        
        except services.SaleNotFoundError as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except services.SaleNotCompletedError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except services.MissingSaleItemsError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except services.InvoiceError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema_view(
    list=extend_schema(
        summary="List invoices",
        description="View all invoices (read-only).",
        tags=['Invoices']
    ),
    retrieve=extend_schema(
        summary="Get invoice details",
        description="View complete invoice with all items (read-only).",
        tags=['Invoices']
    ),
)
class InvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet for invoices.
    
    IMMUTABILITY:
    - Invoices cannot be created through this endpoint (use /generate/)
    - Invoices cannot be updated
    - Invoices cannot be deleted
    """
    queryset = Invoice.objects.select_related(
        "warehouse",
        "sale",
        "sale__created_by",
    ).prefetch_related(
        "items",
        "sale__payments",
    ).all()
    permission_classes = [IsStaffOrAdmin]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        if self.action == 'list':
            sale_id = params.get('sale_id')
            if sale_id:
                qs = qs.filter(sale_id=sale_id)

            search = (params.get('search') or '').strip()
            if search:
                qs = qs.filter(
                    Q(invoice_number__icontains=search)
                    | Q(billing_name__icontains=search)
                    | Q(billing_phone__icontains=search)
                )

            pm = (params.get('payment_method') or '').strip().lower()
            if pm in ('cash', 'card', 'upi', 'credit'):
                method_map = {
                    'cash': Payment.PaymentMethod.CASH,
                    'card': Payment.PaymentMethod.CARD,
                    'upi': Payment.PaymentMethod.UPI,
                    'credit': Payment.PaymentMethod.CREDIT,
                }
                qs = qs.filter(sale__payments__method=method_map[pm]).distinct()

            st = (params.get('status') or '').strip().lower()
            if st == 'paid':
                qs = qs.filter(sale__payment_status=Sale.PaymentStatus.PAID)
            elif st == 'credit':
                qs = qs.filter(
                    sale__payment_status__in=[
                        Sale.PaymentStatus.UNPAID,
                        Sale.PaymentStatus.PARTIAL,
                    ]
                )
            elif st == 'cancelled':
                qs = qs.filter(
                    sale__status__in=[Sale.Status.CANCELLED, Sale.Status.FAILED]
                )
            elif st == 'refunded':
                qs = qs.filter(sale__status=Sale.Status.REFUNDED)

        return qs
    
    def get_serializer_class(self):
        if self.action == 'list':
            return InvoiceListSerializer
        return InvoiceSerializer

    @extend_schema(
        summary="Invoice aggregate summary",
        description=(
            "Counts and revenue across invoices with optional period filter. "
            "Revenue totals include only invoices whose sale status is COMPLETED."
        ),
        parameters=[
            OpenApiParameter(
                name='period',
                description='today | week | month | year | all (default: all)',
                required=False,
                type=OpenApiTypes.STR,
            ),
        ],
        tags=['Invoices'],
    )
    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """Aggregate stats for dashboards and `invoicesService.getInvoiceSummary`."""
        period = (request.query_params.get('period') or 'all').lower()
        today = timezone.now().date()

        qs = Invoice.objects.all()
        if period == 'today':
            qs = qs.filter(invoice_date=today)
        elif period == 'week':
            qs = qs.filter(invoice_date__gte=today - timedelta(days=7))
        elif period == 'month':
            qs = qs.filter(invoice_date__year=today.year, invoice_date__month=today.month)
        elif period == 'year':
            qs = qs.filter(invoice_date__year=today.year)

        aggregated = qs.aggregate(
            total_invoices=Count('id'),
            paid_count=Count(
                'id',
                filter=Q(sale__status=Sale.Status.COMPLETED),
            ),
            cancelled_count=Count(
                'id',
                filter=Q(
                    sale__status__in=[
                        Sale.Status.CANCELLED,
                        Sale.Status.FAILED,
                        Sale.Status.REFUNDED,
                    ]
                ),
            ),
        )

        revenue_result = qs.filter(sale__status=Sale.Status.COMPLETED).aggregate(
            total_revenue=Sum('total_amount'),
        )
        total_revenue = revenue_result['total_revenue'] or Decimal('0')
        paid_count = aggregated['paid_count'] or 0
        avg_value = (total_revenue / paid_count) if paid_count else Decimal('0')

        return Response(
            {
                'total_invoices': aggregated['total_invoices'] or 0,
                'paid_count': paid_count,
                'cancelled_count': aggregated['cancelled_count'] or 0,
                'total_revenue': float(total_revenue),
                'avg_value': float(avg_value),
            }
        )
    
    @extend_schema(
        summary="Download invoice PDF",
        description="Download the invoice as a PDF file.",
        responses={
            200: {"type": "string", "format": "binary"},
            404: {"type": "object", "properties": {"error": {"type": "string"}}}
        },
        tags=['Invoices']
    )
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """Download invoice PDF."""
        try:
            invoice = self.get_object()
        except Invoice.DoesNotExist:
            raise Http404("Invoice not found")

        # Build path from stored URL (may be empty on legacy rows)
        pdf_filename = ''
        pdf_path = ''
        if invoice.pdf_url:
            pdf_filename = invoice.pdf_url.replace('/media/', '')
            pdf_path = os.path.join(settings.BASE_DIR, 'media', pdf_filename)

        # Generate or regenerate when URL missing, file missing, or not a real PDF
        if (
            not invoice.pdf_url
            or not pdf_path
            or not os.path.exists(pdf_path)
            or not is_valid_invoice_pdf(pdf_path)
        ):
            new_url = services.generate_invoice_pdf(invoice)
            if new_url:
                Invoice.objects.filter(pk=invoice.pk).update(pdf_url=new_url)
                invoice.refresh_from_db()
            pdf_filename = invoice.pdf_url.replace('/media/', '') if invoice.pdf_url else ''
            pdf_path = os.path.join(settings.BASE_DIR, 'media', pdf_filename)

        if not invoice.pdf_url or not os.path.exists(pdf_path) or not is_valid_invoice_pdf(pdf_path):
            return Response(
                {'error': 'PDF file not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return FileResponse(
            open(pdf_path, 'rb'),
            as_attachment=True,
            filename=f"{invoice.invoice_number.replace('/', '_')}.pdf"
        )
