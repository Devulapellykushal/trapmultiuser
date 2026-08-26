from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.pagination import StandardResultsSetPagination
from users.permissions import HasCustomersService, IsStaffOrAdmin
from users.organization import filter_queryset_for_user
from .models import Customer
from .serializers import (
    CustomerSerializer,
    CustomerUpsertSerializer,
    CustomerSaleSerializer,
)
from . import services as crm


class CustomerViewSet(viewsets.ModelViewSet):
    """
    Staff CRM for customers — directory, profile, segments, POS upsert.
    """

    queryset = Customer.objects.all().order_by('name')
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsStaffOrAdmin, HasCustomersService]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'phone', 'email', 'gstin']

    def get_queryset(self):
        qs = crm.annotate_customer_queryset(
            filter_queryset_for_user(Customer.objects.all(), self.request.user)
        ).order_by('name')
        raw = self.request.query_params.get('is_active')
        if raw is None:
            return qs
        if str(raw).lower() in ('true', '1', 'yes'):
            return qs.filter(is_active=True)
        if str(raw).lower() in ('false', '0', 'no'):
            return qs.filter(is_active=False)
        return qs

    def perform_create(self, serializer):
        org_id = getattr(self.request.user, 'organization_id', None)
        serializer.save(organization_id=org_id)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        instance._crm_stats = crm.compute_purchase_stats(instance)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == 'retrieve':
            ctx['enrich_stats'] = True
        return ctx
    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        org_id = getattr(request.user, 'organization_id', None)
        data = crm.hub_summary(organization_id=org_id)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='segments')
    def segments(self, request):
        org_id = getattr(request.user, 'organization_id', None)
        return Response(crm.segment_counts(organization_id=org_id))

    @action(detail=False, methods=['get'], url_path='lookup')
    def lookup(self, request):
        """
        POS helper: find an existing customer by phone and/or email
        (same uniqueness rules as checkout upsert). Does not create.
        """
        phone = (request.query_params.get('phone') or '').strip()
        email = (request.query_params.get('email') or '').strip()
        if not phone and not email:
            return Response(
                {'detail': 'Provide phone or email.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        customer = crm.find_existing_customer(
            phone=phone,
            email=email,
            organization_id=getattr(request.user, 'organization_id', None),
        )
        if customer is None:
            return Response({'matched': False, 'customer': None})
        out = CustomerSerializer(
            self.get_queryset().filter(pk=customer.pk).first() or customer,
            context=self.get_serializer_context(),
        ).data
        return Response({'matched': True, 'customer': out})

    @action(detail=False, methods=['post'], url_path='upsert')
    def upsert(self, request):
        ser = CustomerUpsertSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        customer = crm.upsert_from_checkout(
            name=ser.validated_data.get('name', ''),
            phone=ser.validated_data.get('phone', ''),
            email=ser.validated_data.get('email', ''),
            address=ser.validated_data.get('address', ''),
            organization_id=getattr(request.user, 'organization_id', None),
        )
        if customer is None:
            return Response(
                {'detail': 'Provide a name, phone, or email.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        gstin = (ser.validated_data.get('gstin') or '').strip()
        notes = (ser.validated_data.get('notes') or '').strip()
        if gstin and not customer.gstin:
            customer.gstin = gstin
            customer.save(update_fields=['gstin', 'updated_at'])
        if notes and not customer.notes:
            customer.notes = notes
            customer.save(update_fields=['notes', 'updated_at'])
        linked = crm.link_matching_sales(customer)
        customer = self.get_queryset().get(pk=customer.pk)
        out = CustomerSerializer(customer, context=self.get_serializer_context()).data
        return Response(
            {'customer': out, 'linked_sales': linked},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'], url_path='sync-from-sales')
    def sync_from_sales(self, request):
        """Import every invoice buyer into Customers and re-link sales."""
        result = crm.sync_customers_from_sales()
        return Response(result)

    @action(detail=True, methods=['get'], url_path='sales')
    def sales(self, request, pk=None):
        customer = self.get_object()
        sales = crm.list_customer_sales(customer, limit=100)
        ser = CustomerSaleSerializer(
            sales, many=True, context={'customer': customer}
        )
        return Response({'results': ser.data})

    @action(detail=True, methods=['post'], url_path='link-sales')
    def link_sales(self, request, pk=None):
        customer = self.get_object()
        n = crm.link_matching_sales(customer)
        stats = crm.compute_purchase_stats(customer)
        return Response({'linked': n, 'stats': stats})
