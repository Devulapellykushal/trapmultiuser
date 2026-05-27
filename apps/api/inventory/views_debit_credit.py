"""
Debit/Credit Note Views for Quake Inventory System.
"""

from django.db import models
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view

from .models import CreditNote, DebitNote
from .serializers import (
    CreditNoteSerializer,
    CreditNoteCreateSerializer,
    DebitNoteSerializer,
    DebitNoteCreateSerializer,
)
from core.pagination import StandardResultsSetPagination
from users.permissions import IsStaffOrAdmin


# =============================================================================
# CREDIT NOTES (CUSTOMER RETURNS)
# =============================================================================

@extend_schema_view(
    list=extend_schema(summary="List credit notes", description="Get list of all credit notes"),
    retrieve=extend_schema(summary="Get credit note", description="Get credit note details"),
    create=extend_schema(summary="Create credit note", description="Create a new credit note"),
    update=extend_schema(summary="Update credit note", description="Update credit note details"),
    partial_update=extend_schema(summary="Partial update credit note", description="Partially update credit note"),
    destroy=extend_schema(summary="Delete credit note", description="Delete credit note (only drafts)"),
)
class CreditNoteViewSet(viewsets.ModelViewSet):
    """
    Credit Note ViewSet for customer returns.
    
    Features:
    - List and filter credit notes
    - Create credit notes from sales
    - Update credit notes (drafts only)
    - Issue credit notes
    - Process refunds
    """
    
    queryset = CreditNote.objects.select_related(
        'original_sale', 'warehouse', 'created_by'
    ).prefetch_related('items__product', 'items__original_sale_item')
    
    permission_classes = [IsStaffOrAdmin]
    pagination_class = StandardResultsSetPagination
    
    filterset_fields = ['status', 'return_reason', 'warehouse']
    search_fields = ['credit_note_number', 'original_sale__invoice_number']
    ordering_fields = ['created_at', 'return_date', 'total_amount']
    ordering = ['-created_at']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return CreditNoteCreateSerializer
        return CreditNoteSerializer
    
    def create(self, request, *args, **kwargs):
        """Create credit note and return proper serialized response."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        
        # Use CreditNoteSerializer for the response
        response_serializer = CreditNoteSerializer(instance, context=self.get_serializer_context())
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)
    
    def perform_destroy(self, instance):
        """Only allow deletion of draft credit notes."""
        if instance.status != CreditNote.Status.DRAFT:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only draft credit notes can be deleted")
        super().perform_destroy(instance)
    
    @extend_schema(
        summary="Issue credit note",
        description="Issue a draft credit note to the customer",
        request=None,
        responses={200: CreditNoteSerializer}
    )
    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        """Issue a draft credit note."""
        credit_note = self.get_object()
        
        if credit_note.status != CreditNote.Status.DRAFT:
            return Response(
                {'error': 'Only draft credit notes can be issued'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        import datetime
        credit_note.status = CreditNote.Status.ISSUED
        credit_note.issue_date = datetime.date.today()
        credit_note.save()
        
        serializer = self.get_serializer(credit_note)
        return Response(serializer.data)
    
    @extend_schema(
        summary="Process refund",
        description="Mark credit note as settled after refund",
        request=CreditNoteSerializer,
        responses={200: CreditNoteSerializer}
    )
    @action(detail=True, methods=['post'])
    def settle(self, request, pk=None):
        """Process refund and mark as settled."""
        credit_note = self.get_object()
        
        if credit_note.status != CreditNote.Status.ISSUED:
            return Response(
                {'error': 'Only issued credit notes can be settled'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        refund_amount = request.data.get('refund_amount')
        if not refund_amount:
            return Response(
                {'error': 'Refund amount is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        import datetime
        from decimal import Decimal
        
        credit_note.refund_amount = Decimal(refund_amount)
        credit_note.status = CreditNote.Status.SETTLED
        credit_note.settlement_date = datetime.date.today()
        credit_note.save()
        
        serializer = self.get_serializer(credit_note)
        return Response(serializer.data)


# =============================================================================
# DEBIT NOTES (SUPPLIER RETURNS)
# =============================================================================

@extend_schema_view(
    list=extend_schema(summary="List debit notes", description="Get list of all debit notes"),
    retrieve=extend_schema(summary="Get debit note", description="Get debit note details"),
    create=extend_schema(summary="Create debit note", description="Create a new debit note"),
    update=extend_schema(summary="Update debit note", description="Update debit note details"),
    partial_update=extend_schema(summary="Partial update debit note", description="Partially update debit note"),
    destroy=extend_schema(summary="Delete debit note", description="Delete debit note (only drafts)"),
)
class DebitNoteViewSet(viewsets.ModelViewSet):
    """
    Debit Note ViewSet for supplier returns.
    
    Features:
    - List and filter debit notes
    - Create debit notes from purchase orders
    - Update debit notes (drafts only)
    - Issue debit notes
    - Track supplier responses
    - Process settlements
    """
    
    queryset = DebitNote.objects.select_related(
        'original_purchase_order', 'supplier', 'warehouse', 'created_by'
    ).prefetch_related('items__product', 'items__original_purchase_order_item')
    
    permission_classes = [IsStaffOrAdmin]
    pagination_class = StandardResultsSetPagination
    
    filterset_fields = ['status', 'return_reason', 'supplier', 'warehouse']
    search_fields = ['debit_note_number', 'original_purchase_order__po_number', 'supplier__name']
    ordering_fields = ['created_at', 'return_date', 'total_amount']
    ordering = ['-created_at']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return DebitNoteCreateSerializer
        return DebitNoteSerializer
    
    def create(self, request, *args, **kwargs):
        """Create debit note and return proper serialized response."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        
        # Use DebitNoteSerializer for the response
        response_serializer = DebitNoteSerializer(instance, context=self.get_serializer_context())
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)
    
    def perform_destroy(self, instance):
        """Only allow deletion of draft debit notes."""
        if instance.status != DebitNote.Status.DRAFT:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only draft debit notes can be deleted")
        super().perform_destroy(instance)
    
    @extend_schema(
        summary="Issue debit note",
        description="Issue a draft debit note to the supplier",
        request=None,
        responses={200: DebitNoteSerializer}
    )
    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        """Issue a draft debit note."""
        debit_note = self.get_object()
        
        if debit_note.status != DebitNote.Status.DRAFT:
            return Response(
                {'error': 'Only draft debit notes can be issued'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        import datetime
        debit_note.status = DebitNote.Status.ISSUED
        debit_note.issue_date = datetime.date.today()
        debit_note.save()
        
        serializer = self.get_serializer(debit_note)
        return Response(serializer.data)
    
    @extend_schema(
        summary="Mark as accepted",
        description="Mark debit note as accepted by supplier",
        request=None,
        responses={200: DebitNoteSerializer}
    )
    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """Mark debit note as accepted by supplier."""
        debit_note = self.get_object()
        
        if debit_note.status != DebitNote.Status.ISSUED:
            return Response(
                {'error': 'Only issued debit notes can be accepted'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        debit_note.status = DebitNote.Status.ACCEPTED
        debit_note.save()
        
        serializer = self.get_serializer(debit_note)
        return Response(serializer.data)
    
    @extend_schema(
        summary="Mark as rejected",
        description="Mark debit note as rejected by supplier",
        request=DebitNoteSerializer,
        responses={200: DebitNoteSerializer}
    )
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Mark debit note as rejected by supplier."""
        debit_note = self.get_object()
        
        if debit_note.status != DebitNote.Status.ISSUED:
            return Response(
                {'error': 'Only issued debit notes can be rejected'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        rejection_reason = request.data.get('notes', '')
        if rejection_reason:
            debit_note.notes = f"{debit_note.notes}\n\nREJECTION REASON: {rejection_reason}".strip()
        
        debit_note.status = DebitNote.Status.REJECTED
        debit_note.save()
        
        serializer = self.get_serializer(debit_note)
        return Response(serializer.data)
    
    @extend_schema(
        summary="Process settlement",
        description="Mark debit note as settled after adjustment",
        request=DebitNoteSerializer,
        responses={200: DebitNoteSerializer}
    )
    @action(detail=True, methods=['post'])
    def settle(self, request, pk=None):
        """Process settlement and mark as settled."""
        debit_note = self.get_object()
        
        if debit_note.status != DebitNote.Status.ACCEPTED:
            return Response(
                {'error': 'Only accepted debit notes can be settled'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        adjustment_amount = request.data.get('adjustment_amount')
        if adjustment_amount is None:
            return Response(
                {'error': 'Adjustment amount is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        import datetime
        from decimal import Decimal
        
        debit_note.adjustment_amount = Decimal(adjustment_amount)
        debit_note.status = DebitNote.Status.SETTLED
        debit_note.settlement_date = datetime.date.today()
        debit_note.save()
        
        serializer = self.get_serializer(debit_note)
        return Response(serializer.data)