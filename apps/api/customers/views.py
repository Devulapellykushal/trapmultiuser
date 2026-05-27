from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated

from users.permissions import IsStaffOrAdmin
from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    """
    Staff CRUD for customers (POS / accounts).
    """

    queryset = Customer.objects.all().order_by('name')
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, IsStaffOrAdmin]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'phone', 'email', 'gstin']

    def get_queryset(self):
        qs = super().get_queryset()
        raw = self.request.query_params.get('is_active')
        if raw is None:
            return qs
        if str(raw).lower() in ('true', '1', 'yes'):
            return qs.filter(is_active=True)
        if str(raw).lower() in ('false', '0', 'no'):
            return qs.filter(is_active=False)
        return qs
