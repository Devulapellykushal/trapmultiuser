"""
Views for Notifications app.
"""

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone

from .models import Notification, NotificationSetting, EmailNotification, WhatsAppNotification
from .serializers import (
    NotificationSerializer,
    NotificationListSerializer,
    MarkReadSerializer,
    NotificationSettingSerializer,
    NotificationSettingUpdateSerializer,
    LowStockProductSerializer,
    SendWhatsAppInvoiceSerializer,
    EmailNotificationSerializer,
    WhatsAppNotificationSerializer,
)
from .services import LowStockService, EmailService, WhatsAppService


class NotificationListView(APIView):
    """
    GET: List all notifications
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get all notifications, optionally filtered."""
        queryset = Notification.objects.all()
        
        # Filter by type
        notification_type = request.query_params.get('type')
        if notification_type:
            queryset = queryset.filter(notification_type=notification_type)
        
        # Filter by read status
        is_read = request.query_params.get('is_read')
        if is_read is not None:
            queryset = queryset.filter(is_read=is_read.lower() == 'true')
        
        # Filter by priority
        priority = request.query_params.get('priority')
        if priority:
            queryset = queryset.filter(priority=priority)
        
        # Limit results
        limit = request.query_params.get('limit', 50)
        try:
            limit = int(limit)
        except ValueError:
            limit = 50
        
        queryset = queryset[:limit]
        
        serializer = NotificationListSerializer(queryset, many=True)
        
        # Get unread count
        unread_count = Notification.objects.filter(is_read=False).count()
        
        return Response({
            'notifications': serializer.data,
            'unread_count': unread_count,
        })


class NotificationDetailView(APIView):
    """
    GET: Get notification details
    DELETE: Delete a notification
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk)
        except Notification.DoesNotExist:
            return Response(
                {'error': 'Notification not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = NotificationSerializer(notification)
        return Response(serializer.data)
    
    def delete(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk)
        except Notification.DoesNotExist:
            return Response(
                {'error': 'Notification not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        notification.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MarkNotificationsReadView(APIView):
    """
    POST: Mark notifications as read
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = MarkReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        notification_ids = serializer.validated_data.get('notification_ids', [])
        
        if notification_ids:
            # Mark specific notifications as read
            updated = Notification.objects.filter(
                id__in=notification_ids,
                is_read=False
            ).update(
                is_read=True,
                read_by=request.user,
                read_at=timezone.now()
            )
        else:
            # Mark all as read
            updated = Notification.objects.filter(is_read=False).update(
                is_read=True,
                read_by=request.user,
                read_at=timezone.now()
            )
        
        return Response({
            'marked_read': updated,
            'unread_count': Notification.objects.filter(is_read=False).count()
        })


class UnreadCountView(APIView):
    """
    GET: Get count of unread notifications
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        unread_count = Notification.objects.filter(is_read=False).count()
        
        # Also get counts by type
        by_type = {}
        for type_choice in Notification.NotificationType.choices:
            type_key = type_choice[0]
            by_type[type_key] = Notification.objects.filter(
                notification_type=type_key,
                is_read=False
            ).count()
        
        return Response({
            'unread_count': unread_count,
            'by_type': by_type
        })


class LowStockView(APIView):
    """
    GET: Get list of low stock products
    POST: Check low stock and create notifications
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get current low stock products."""
        warehouse_id = request.query_params.get('warehouse_id')
        
        low_stock_items = LowStockService.check_low_stock(
            warehouse_id,
            organization_id=getattr(request.user, "organization_id", None),
        )
        
        return Response({
            'count': len(low_stock_items),
            'items': low_stock_items,
            'summary': {
                'critical': len([i for i in low_stock_items if i['urgency'] == 'CRITICAL']),
                'high': len([i for i in low_stock_items if i['urgency'] == 'HIGH']),
                'medium': len([i for i in low_stock_items if i['urgency'] == 'MEDIUM']),
                'low': len([i for i in low_stock_items if i['urgency'] == 'LOW']),
            }
        })
    
    def post(self, request):
        """Check low stock and create notifications."""
        warehouse_id = request.data.get('warehouse_id')
        send_email = request.data.get('send_email', False)
        
        # Check low stock
        low_stock_items = LowStockService.check_low_stock(
            warehouse_id,
            organization_id=getattr(request.user, "organization_id", None),
        )
        
        # Create notifications
        notifications_created = LowStockService.create_low_stock_notifications(low_stock_items)
        
        # Optionally send email
        email_results = []
        if send_email and low_stock_items:
            email_results = EmailService.send_low_stock_alert_email(low_stock_items)
        
        return Response({
            'low_stock_count': len(low_stock_items),
            'notifications_created': notifications_created,
            'emails_sent': len([e for e in email_results if e.status == 'SENT']),
            'emails_failed': len([e for e in email_results if e.status == 'FAILED']),
        })


class NotificationSettingsView(APIView):
    """
    GET: Get notification settings
    PUT/PATCH: Update notification settings
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        settings = NotificationSetting.get_settings()
        serializer = NotificationSettingSerializer(settings)
        return Response(serializer.data)
    
    def put(self, request):
        settings = NotificationSetting.get_settings()
        serializer = NotificationSettingUpdateSerializer(settings, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(NotificationSettingSerializer(settings).data)
    
    def patch(self, request):
        settings = NotificationSetting.get_settings()
        serializer = NotificationSettingUpdateSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(NotificationSettingSerializer(settings).data)


class TestEmailView(APIView):
    """
    POST: Send a test email to verify SMTP configuration
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        to_email = request.data.get('to_email')
        
        if not to_email:
            return Response(
                {'error': 'to_email is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        result = EmailService.send_email(
            to_email=to_email,
            subject="Quake Inventory - Test Email",
            body="This is a test email from Quake Inventory System. If you received this, your email configuration is working correctly!",
            html_body="""
            <html>
            <body>
                <h2>Test Email</h2>
                <p>This is a test email from <strong>Quake Inventory System</strong>.</p>
                <p>If you received this, your email configuration is working correctly! ✅</p>
                <hr>
                <p style="color: #666; font-size: 12px;">This is an automated message.</p>
            </body>
            </html>
            """
        )
        
        serializer = EmailNotificationSerializer(result)
        
        if result.status == 'SENT':
            return Response({
                'success': True,
                'message': f'Test email sent successfully to {to_email}',
                'details': serializer.data
            })
        else:
            return Response({
                'success': False,
                'message': f'Failed to send test email: {result.error_message}',
                'details': serializer.data
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SendWhatsAppInvoiceView(APIView):
    """
    POST: Send a sales invoice via WhatsApp
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = SendWhatsAppInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        sale_id = str(serializer.validated_data['sale_id'])
        phone_number = serializer.validated_data['phone_number']
        custom_message = serializer.validated_data.get('custom_message', '')
        
        result = WhatsAppService.send_invoice_via_whatsapp(
            sale_id=sale_id,
            phone_number=phone_number,
            custom_message=custom_message
        )
        
        response_serializer = WhatsAppNotificationSerializer(result)
        
        if result.status == 'SENT':
            return Response({
                'success': True,
                'message': f'Invoice sent via WhatsApp to {result.phone_number}',
                'details': response_serializer.data
            })
        else:
            return Response({
                'success': False,
                'message': f'Failed to send WhatsApp message: {result.error_message}',
                'details': response_serializer.data
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WhatsAppMessageView(APIView):
    """
    POST: Send a custom WhatsApp message
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        phone_number = request.data.get('phone_number')
        message = request.data.get('message')
        
        if not phone_number or not message:
            return Response(
                {'error': 'phone_number and message are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        result = WhatsAppService.send_whatsapp_message(
            phone_number=phone_number,
            message=message,
            message_type='CUSTOM'
        )
        
        response_serializer = WhatsAppNotificationSerializer(result)
        
        if result.status == 'SENT':
            return Response({
                'success': True,
                'message': f'Message sent via WhatsApp to {result.phone_number}',
                'details': response_serializer.data
            })
        else:
            return Response({
                'success': False,
                'message': f'Failed to send WhatsApp message: {result.error_message}',
                'details': response_serializer.data
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
