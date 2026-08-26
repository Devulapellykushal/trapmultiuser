"""
Serializers for Notifications app.
"""

from rest_framework import serializers
from .models import (
    Notification,
    EmailNotification,
    WhatsAppNotification,
    NotificationSetting
)


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for Notification model."""
    
    class Meta:
        model = Notification
        fields = [
            'id',
            'title',
            'message',
            'notification_type',
            'priority',
            'product_id',
            'product_name',
            'product_sku',
            'warehouse_id',
            'warehouse_name',
            'current_stock',
            'threshold',
            'is_read',
            'read_at',
            'created_at',
            'expires_at',
        ]
        read_only_fields = ['id', 'created_at']


class NotificationListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for notification lists."""
    
    class Meta:
        model = Notification
        fields = [
            'id',
            'title',
            'message',
            'notification_type',
            'priority',
            'is_read',
            'product_name',
            'current_stock',
            'threshold',
            'created_at',
        ]


class MarkReadSerializer(serializers.Serializer):
    """Serializer for marking notifications as read."""
    notification_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        help_text="List of notification IDs to mark as read. If empty, marks all as read."
    )


class EmailNotificationSerializer(serializers.ModelSerializer):
    """Serializer for EmailNotification model."""
    
    class Meta:
        model = EmailNotification
        fields = [
            'id',
            'notification',
            'to_email',
            'subject',
            'body',
            'status',
            'error_message',
            'created_at',
            'sent_at',
        ]
        read_only_fields = ['id', 'created_at', 'sent_at']


class WhatsAppNotificationSerializer(serializers.ModelSerializer):
    """Serializer for WhatsAppNotification model."""
    
    class Meta:
        model = WhatsAppNotification
        fields = [
            'id',
            'phone_number',
            'message',
            'message_type',
            'sale_id',
            'sale_invoice_number',
            'whatsapp_message_id',
            'status',
            'error_message',
            'created_at',
            'sent_at',
        ]
        read_only_fields = ['id', 'created_at', 'sent_at', 'whatsapp_message_id']


class NotificationSettingSerializer(serializers.ModelSerializer):
    """Serializer for NotificationSetting model."""

    whatsapp_token_configured = serializers.SerializerMethodField()

    class Meta:
        model = NotificationSetting
        fields = [
            'email_low_stock_alerts',
            'email_daily_summary',
            'low_stock_email_recipients',
            'whatsapp_invoice_enabled',
            'whatsapp_phone_number_id',
            'whatsapp_business_account_id',
            'whatsapp_token_configured',
            'smtp_host',
            'smtp_port',
            'smtp_username',
            'smtp_use_tls',
            'smtp_from_email',
        ]

    def get_whatsapp_token_configured(self, obj):
        return bool((obj.whatsapp_access_token or '').strip())


class NotificationSettingUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating notification settings."""
    
    class Meta:
        model = NotificationSetting
        fields = [
            'email_low_stock_alerts',
            'email_daily_summary',
            'low_stock_email_recipients',
            'whatsapp_invoice_enabled',
            'whatsapp_phone_number_id',
            'whatsapp_access_token',
            'whatsapp_business_account_id',
            'smtp_host',
            'smtp_port',
            'smtp_username',
            'smtp_password',
            'smtp_use_tls',
            'smtp_from_email',
        ]


class LowStockProductSerializer(serializers.Serializer):
    """Serializer for low stock product response."""
    id = serializers.UUIDField()
    name = serializers.CharField()
    sku = serializers.CharField()
    brand = serializers.CharField(allow_null=True)
    category = serializers.CharField(allow_null=True)
    warehouse_id = serializers.UUIDField()
    warehouse_name = serializers.CharField()
    current_stock = serializers.IntegerField()
    reorder_threshold = serializers.IntegerField()
    deficit = serializers.IntegerField(help_text="How much below threshold")
    urgency = serializers.CharField(help_text="LOW, MEDIUM, HIGH, CRITICAL")


class SendWhatsAppInvoiceSerializer(serializers.Serializer):
    """Serializer for sending invoice via WhatsApp."""
    sale_id = serializers.UUIDField()
    phone_number = serializers.CharField(max_length=20)
    custom_message = serializers.CharField(required=False, allow_blank=True)
