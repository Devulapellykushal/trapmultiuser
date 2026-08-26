from rest_framework import serializers
from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    sale_count = serializers.SerializerMethodField()
    last_sale_at = serializers.SerializerMethodField()
    total_revenue = serializers.SerializerMethodField()
    credit_outstanding = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            'id', 'name', 'phone', 'email', 'address', 'gstin',
            'notes', 'is_active', 'created_at', 'updated_at',
            'sale_count', 'last_sale_at', 'total_revenue', 'credit_outstanding',
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'sale_count', 'last_sale_at', 'total_revenue', 'credit_outstanding',
        ]

    def _stats(self, obj):
        cached = getattr(obj, '_crm_stats', None)
        if cached is not None:
            return cached
        if self.context.get('enrich_stats'):
            from .services import compute_purchase_stats
            stats = compute_purchase_stats(obj)
            obj._crm_stats = stats
            return stats
        return {
            'sale_count': int(getattr(obj, 'sale_count', 0) or 0),
            'last_sale_at': getattr(obj, 'last_sale_at', None),
            'total_revenue': getattr(obj, 'total_revenue', None) or '0.00',
            'credit_outstanding': getattr(obj, 'credit_outstanding', None) or '0.00',
        }

    def get_sale_count(self, obj):
        return self._stats(obj)['sale_count']

    def get_last_sale_at(self, obj):
        return self._stats(obj)['last_sale_at']

    def get_total_revenue(self, obj):
        return self._stats(obj)['total_revenue']

    def get_credit_outstanding(self, obj):
        return self._stats(obj)['credit_outstanding']


class CustomerUpsertSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=True, default='')
    phone = serializers.CharField(required=False, allow_blank=True, default='', max_length=20)
    email = serializers.EmailField(required=False, allow_blank=True, default='')
    address = serializers.CharField(required=False, allow_blank=True, default='')
    gstin = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if (
            not (attrs.get('phone') or '').strip()
            and not (attrs.get('name') or '').strip()
            and not (attrs.get('email') or '').strip()
        ):
            raise serializers.ValidationError('Provide a name, phone, or email.')
        return attrs


class CustomerSaleSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    invoice_number = serializers.CharField()
    total = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_items = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    credit_status = serializers.CharField()
    credit_balance = serializers.DecimalField(max_digits=12, decimal_places=2)
    warehouse_name = serializers.SerializerMethodField()
    store_name = serializers.SerializerMethodField()
    linked = serializers.SerializerMethodField()

    def get_warehouse_name(self, obj):
        return getattr(obj.warehouse, 'name', None) if obj.warehouse_id else None

    def get_store_name(self, obj):
        return getattr(obj.store, 'name', None) if getattr(obj, 'store_id', None) else None

    def get_linked(self, obj):
        customer = self.context.get('customer')
        if not customer:
            return False
        return str(obj.customer_id) == str(customer.id) if obj.customer_id else False
