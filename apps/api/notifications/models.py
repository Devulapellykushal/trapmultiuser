"""
Notifications Models for Quake Inventory System.

Handles:
- Low stock alerts
- System notifications
- Email notifications tracking
- WhatsApp message tracking
"""

import uuid
from django.db import models
from django.conf import settings


class Notification(models.Model):
    """
    Notification model for storing all types of notifications.
    
    Types:
    - LOW_STOCK: Product stock below threshold
    - RESTOCK_REMINDER: Periodic reminder to restock
    - SALE_COMPLETED: Sale completed notification
    - PO_RECEIVED: Purchase order received
    - SYSTEM: General system notifications
    """
    
    class NotificationType(models.TextChoices):
        LOW_STOCK = 'LOW_STOCK', 'Low Stock Alert'
        RESTOCK_REMINDER = 'RESTOCK_REMINDER', 'Restock Reminder'
        SALE_COMPLETED = 'SALE_COMPLETED', 'Sale Completed'
        PO_RECEIVED = 'PO_RECEIVED', 'PO Received'
        SYSTEM = 'SYSTEM', 'System Notification'
    
    class Priority(models.TextChoices):
        LOW = 'LOW', 'Low'
        MEDIUM = 'MEDIUM', 'Medium'
        HIGH = 'HIGH', 'High'
        CRITICAL = 'CRITICAL', 'Critical'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Notification content
    title = models.CharField(max_length=255)
    message = models.TextField()
    notification_type = models.CharField(
        max_length=50,
        choices=NotificationType.choices,
        default=NotificationType.SYSTEM
    )
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.MEDIUM
    )
    
    # Related entities (optional)
    product_id = models.UUIDField(null=True, blank=True, db_index=True)
    product_name = models.CharField(max_length=255, blank=True)
    product_sku = models.CharField(max_length=100, blank=True)
    warehouse_id = models.UUIDField(null=True, blank=True)
    warehouse_name = models.CharField(max_length=255, blank=True)
    
    # Stock info for low stock alerts
    current_stock = models.IntegerField(null=True, blank=True)
    threshold = models.IntegerField(null=True, blank=True)
    
    # Read status - can be per user or global
    is_read = models.BooleanField(default=False)
    read_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='read_notifications'
    )
    read_at = models.DateTimeField(null=True, blank=True)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['notification_type', 'is_read']),
            models.Index(fields=['product_id']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return f"{self.notification_type}: {self.title}"


class EmailNotification(models.Model):
    """
    Track email notifications sent.
    """
    
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        SENT = 'SENT', 'Sent'
        FAILED = 'FAILED', 'Failed'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    notification = models.ForeignKey(
        Notification,
        on_delete=models.CASCADE,
        related_name='email_records',
        null=True,
        blank=True
    )
    
    # Email details
    to_email = models.EmailField()
    subject = models.CharField(max_length=255)
    body = models.TextField()
    
    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )
    error_message = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Email to {self.to_email}: {self.subject}"


class WhatsAppNotification(models.Model):
    """
    Track WhatsApp messages sent (invoices, notifications).
    """
    
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        SENT = 'SENT', 'Sent'
        FAILED = 'FAILED', 'Failed'
    
    class MessageType(models.TextChoices):
        INVOICE = 'INVOICE', 'Sales Invoice'
        LOW_STOCK = 'LOW_STOCK', 'Low Stock Alert'
        PROMOTIONAL = 'PROMOTIONAL', 'Promotional'
        CUSTOM = 'CUSTOM', 'Custom Message'
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Message details
    phone_number = models.CharField(max_length=20)
    message = models.TextField()
    message_type = models.CharField(
        max_length=20,
        choices=MessageType.choices,
        default=MessageType.CUSTOM
    )
    
    # Related sale (for invoice messages)
    sale_id = models.UUIDField(null=True, blank=True)
    sale_invoice_number = models.CharField(max_length=50, blank=True)
    
    # WhatsApp message ID for tracking
    whatsapp_message_id = models.CharField(max_length=100, blank=True)
    
    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )
    error_message = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"WhatsApp to {self.phone_number}: {self.message_type}"


class NotificationSetting(models.Model):
    """
    User/system notification preferences.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Email settings
    email_low_stock_alerts = models.BooleanField(default=True)
    email_daily_summary = models.BooleanField(default=False)
    low_stock_email_recipients = models.TextField(
        blank=True,
        help_text="Comma-separated email addresses for low stock alerts"
    )
    
    # WhatsApp Business API settings
    whatsapp_invoice_enabled = models.BooleanField(default=False)
    whatsapp_phone_number_id = models.CharField(
        max_length=50, 
        blank=True,
        help_text="Phone Number ID from Meta Developer Console"
    )
    whatsapp_access_token = models.CharField(
        max_length=500, 
        blank=True,
        help_text="Permanent access token from Meta"
    )
    whatsapp_business_account_id = models.CharField(
        max_length=50, 
        blank=True,
        help_text="WhatsApp Business Account ID (optional)"
    )
    
    # SMTP settings (stored here for flexibility, can also use env vars)
    smtp_host = models.CharField(max_length=255, blank=True)
    smtp_port = models.IntegerField(default=587)
    smtp_username = models.CharField(max_length=255, blank=True)
    smtp_password = models.CharField(max_length=255, blank=True)  # Should be encrypted in production
    smtp_use_tls = models.BooleanField(default=True)
    smtp_from_email = models.EmailField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Notification Setting'
        verbose_name_plural = 'Notification Settings'
    
    def __str__(self):
        return "Notification Settings"
    
    @classmethod
    def get_settings(cls):
        """Get or create the singleton settings instance."""
        settings, _ = cls.objects.get_or_create(pk='00000000-0000-0000-0000-000000000001')
        return settings
