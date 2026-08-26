"""
Services for Notifications app.

Handles:
- Low stock detection and notification creation
- Email sending via SMTP
- WhatsApp message sending via WhatsApp Business API (Meta Cloud API)
"""

import logging
import requests
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Union
from decimal import Decimal

from django.db.models import F, Q, Sum
from django.utils import timezone
from django.core.mail import EmailMessage
from django.conf import settings

from .models import (
    Notification,
    EmailNotification,
    WhatsAppNotification,
    NotificationSetting
)

logger = logging.getLogger(__name__)


def _product_field_display(value: Union[str, object, None]) -> Optional[str]:
    """
    Serialize brand/category for API payloads.

    Product.brand and Product.category are CharFields (plain strings). Legacy code
    assumed FKs with .name; this helper supports both strings and related objects.
    """
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip()
        return s or None
    name = getattr(value, "name", None)
    if name is not None:
        s = str(name).strip()
        return s or None
    s = str(value).strip()
    return s or None


def _variant_detail_join(size: Optional[str], color: Optional[str]) -> Optional[str]:
    """Industry-neutral variant line (no apparel-specific labels)."""
    parts = []
    for raw in (size, color):
        if raw is None:
            continue
        chunk = str(raw).strip()
        if chunk:
            parts.append(chunk)
    return " · ".join(parts) if parts else None


class LowStockService:
    """
    Service for detecting low stock products and creating notifications.
    """
    
    @staticmethod
    def check_low_stock(
        warehouse_id: Optional[str] = None,
        organization_id=None,
    ) -> List[Dict[str, Any]]:
        """
        Check for products with stock below reorder threshold.
        
        Args:
            warehouse_id: Optional warehouse ID to filter by
            organization_id: Required tenancy scope
            
        Returns:
            List of low stock products with details
        """
        from inventory.models import ProductVariant, Warehouse
        from inventory.services import get_product_stock
        
        # Get variants with reorder threshold set
        variants = ProductVariant.objects.filter(
            reorder_threshold__gt=0,
            is_active=True,
            product__is_active=True,
            product__is_deleted=False
        ).select_related('product', 'product__supplier', 'product__pricing')
        if organization_id is not None:
            variants = variants.filter(product__organization_id=organization_id)
        else:
            variants = variants.none()
        
        low_stock_items = []
        
        # Get warehouses to check
        if warehouse_id:
            warehouses = Warehouse.objects.filter(
                id=warehouse_id,
                is_active=True,
            )
            if organization_id is not None:
                warehouses = warehouses.filter(organization_id=organization_id)
            else:
                warehouses = warehouses.none()
        else:
            if organization_id is None:
                warehouses = Warehouse.objects.none()
            else:
                warehouses = Warehouse.objects.filter(
                    is_active=True,
                    organization_id=organization_id,
                )
        
        for variant in variants:
            for warehouse in warehouses:
                # Get current stock using the inventory service
                try:
                    current_stock = get_product_stock(variant.product_id, warehouse.id)
                except Exception as e:
                    logger.error(f"Error getting stock for variant {variant.id}: {e}")
                    current_stock = 0
                
                threshold = variant.reorder_threshold
                
                if current_stock < threshold:
                    deficit = threshold - current_stock
                    
                    # Determine urgency
                    if current_stock == 0:
                        urgency = 'CRITICAL'
                    elif current_stock <= threshold * 0.25:
                        urgency = 'HIGH'
                    elif current_stock <= threshold * 0.5:
                        urgency = 'MEDIUM'
                    else:
                        urgency = 'LOW'
                    
                    product = variant.product
                    variant_details = _variant_detail_join(variant.size, variant.color)

                    low_stock_items.append({
                        'id': str(variant.id),
                        'product_id': str(product.id),
                        'name': product.name,
                        'sku': variant.sku or product.sku or '',
                        'variant_details': variant_details,
                        'brand': _product_field_display(product.brand),
                        'category': _product_field_display(product.category),
                        'warehouse_id': str(warehouse.id),
                        'warehouse_name': warehouse.name,
                        'current_stock': current_stock,
                        'reorder_threshold': threshold,
                        'deficit': deficit,
                        'urgency': urgency,
                    })
        
        # Sort by urgency (CRITICAL first) then by deficit
        urgency_order = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
        low_stock_items.sort(key=lambda x: (urgency_order.get(x['urgency'], 4), -x['deficit']))
        
        return low_stock_items
    
    @staticmethod
    def create_low_stock_notifications(low_stock_items: List[Dict[str, Any]]) -> int:
        """
        Create notifications for low stock items.
        
        Args:
            low_stock_items: List from check_low_stock()
            
        Returns:
            Number of notifications created
        """
        created_count = 0
        now = timezone.now()
        
        for item in low_stock_items:
            # Check if we already have an unread notification for this product/warehouse
            existing = Notification.objects.filter(
                notification_type=Notification.NotificationType.LOW_STOCK,
                product_id=item['id'],
                warehouse_id=item['warehouse_id'],
                is_read=False,
                created_at__gte=now - timedelta(hours=24)  # Within last 24 hours
            ).exists()
            
            if not existing:
                # Map urgency to priority
                priority_map = {
                    'CRITICAL': Notification.Priority.CRITICAL,
                    'HIGH': Notification.Priority.HIGH,
                    'MEDIUM': Notification.Priority.MEDIUM,
                    'LOW': Notification.Priority.LOW,
                }
                
                Notification.objects.create(
                    title=f"Low Stock: {item['name']}",
                    message=f"Product '{item['name']}' has only {item['current_stock']} units in stock at {item['warehouse_name']}. "
                            f"Reorder threshold is {item['reorder_threshold']} units. "
                            f"Deficit: {item['deficit']} units.",
                    notification_type=Notification.NotificationType.LOW_STOCK,
                    priority=priority_map.get(item['urgency'], Notification.Priority.MEDIUM),
                    product_id=item['id'],
                    product_name=item['name'],
                    product_sku=item['sku'],
                    warehouse_id=item['warehouse_id'],
                    warehouse_name=item['warehouse_name'],
                    current_stock=item['current_stock'],
                    threshold=item['reorder_threshold'],
                    expires_at=now + timedelta(days=7)  # Expire after 7 days
                )
                created_count += 1
        
        return created_count


class EmailService:
    """
    Service for sending emails via SMTP.
    """
    
    @staticmethod
    def get_smtp_settings() -> Dict[str, Any]:
        """Get SMTP settings from database or environment."""
        try:
            db_settings = NotificationSetting.get_settings()
            
            # Prefer database settings if configured
            if db_settings.smtp_host:
                return {
                    'host': db_settings.smtp_host,
                    'port': db_settings.smtp_port,
                    'username': db_settings.smtp_username,
                    'password': db_settings.smtp_password,
                    'use_tls': db_settings.smtp_use_tls,
                    'from_email': db_settings.smtp_from_email,
                }
        except Exception as e:
            logger.warning(f"Could not load DB SMTP settings: {e}")
        
        # Fall back to Django settings / environment variables
        return {
            'host': getattr(settings, 'EMAIL_HOST', ''),
            'port': getattr(settings, 'EMAIL_PORT', 587),
            'username': getattr(settings, 'EMAIL_HOST_USER', ''),
            'password': getattr(settings, 'EMAIL_HOST_PASSWORD', ''),
            'use_tls': getattr(settings, 'EMAIL_USE_TLS', True),
            'from_email': getattr(settings, 'DEFAULT_FROM_EMAIL', ''),
        }
    
    @staticmethod
    def send_email(
        to_email: str,
        subject: str,
        body: str,
        notification: Optional[Notification] = None,
        html_body: Optional[str] = None
    ) -> EmailNotification:
        """
        Send an email and track it.
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            body: Plain text body
            notification: Optional related notification
            html_body: Optional HTML body
            
        Returns:
            EmailNotification record
        """
        # Create tracking record
        email_record = EmailNotification.objects.create(
            notification=notification,
            to_email=to_email,
            subject=subject,
            body=body,
            status=EmailNotification.Status.PENDING
        )
        
        smtp_settings = EmailService.get_smtp_settings()
        
        if not smtp_settings['host'] or not smtp_settings['from_email']:
            email_record.status = EmailNotification.Status.FAILED
            email_record.error_message = "SMTP not configured. Please set up email settings."
            email_record.save()
            logger.warning("SMTP not configured, email not sent")
            return email_record
        
        try:
            # Configure email
            email = EmailMessage(
                subject=subject,
                body=html_body or body,
                from_email=smtp_settings['from_email'],
                to=[to_email],
            )
            
            if html_body:
                email.content_subtype = 'html'
            
            # Send
            email.send(fail_silently=False)
            
            email_record.status = EmailNotification.Status.SENT
            email_record.sent_at = timezone.now()
            email_record.save()
            
            logger.info(f"Email sent successfully to {to_email}")
            
        except Exception as e:
            email_record.status = EmailNotification.Status.FAILED
            email_record.error_message = str(e)
            email_record.save()
            logger.error(f"Failed to send email to {to_email}: {e}")
        
        return email_record
    
    @staticmethod
    def send_low_stock_alert_email(low_stock_items: List[Dict[str, Any]]) -> List[EmailNotification]:
        """
        Send low stock alert email to configured recipients.
        
        Args:
            low_stock_items: List from LowStockService.check_low_stock()
            
        Returns:
            List of EmailNotification records
        """
        if not low_stock_items:
            return []
        
        try:
            settings_obj = NotificationSetting.get_settings()
            
            if not settings_obj.email_low_stock_alerts:
                logger.info("Low stock email alerts disabled")
                return []
            
            recipients = [
                email.strip()
                for email in settings_obj.low_stock_email_recipients.split(',')
                if email.strip()
            ]
            
            if not recipients:
                logger.warning("No recipients configured for low stock alerts")
                return []
            
        except Exception as e:
            logger.error(f"Error getting notification settings: {e}")
            return []
        
        # Build email content
        subject = f"🚨 Low Stock Alert - {len(low_stock_items)} products need restocking"
        
        # Group by urgency
        critical = [i for i in low_stock_items if i['urgency'] == 'CRITICAL']
        high = [i for i in low_stock_items if i['urgency'] == 'HIGH']
        medium = [i for i in low_stock_items if i['urgency'] == 'MEDIUM']
        low = [i for i in low_stock_items if i['urgency'] == 'LOW']
        
        html_body = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; }}
                .critical {{ color: #dc2626; }}
                .high {{ color: #ea580c; }}
                .medium {{ color: #ca8a04; }}
                .low {{ color: #16a34a; }}
                table {{ border-collapse: collapse; width: 100%; margin: 10px 0; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                th {{ background-color: #f3f4f6; }}
            </style>
        </head>
        <body>
            <h2>Low Stock Alert</h2>
            <p>The following products need restocking:</p>
            
            <table>
                <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Warehouse</th>
                    <th>Current Stock</th>
                    <th>Threshold</th>
                    <th>Deficit</th>
                    <th>Urgency</th>
                </tr>
        """
        
        for item in low_stock_items:
            urgency_class = item['urgency'].lower()
            html_body += f"""
                <tr>
                    <td>{item['name']}</td>
                    <td>{item['sku']}</td>
                    <td>{item['warehouse_name']}</td>
                    <td>{item['current_stock']}</td>
                    <td>{item['reorder_threshold']}</td>
                    <td>{item['deficit']}</td>
                    <td class="{urgency_class}">{item['urgency']}</td>
                </tr>
            """
        
        html_body += """
            </table>
            
            <p>
                <strong>Summary:</strong><br>
        """
        
        if critical:
            html_body += f'<span class="critical">Critical: {len(critical)} products (out of stock or very low)</span><br>'
        if high:
            html_body += f'<span class="high">High: {len(high)} products</span><br>'
        if medium:
            html_body += f'<span class="medium">Medium: {len(medium)} products</span><br>'
        if low:
            html_body += f'<span class="low">Low: {len(low)} products</span><br>'
        
        html_body += """
            </p>
            <p>Please review and restock as needed.</p>
            <hr>
            <p style="color: #666; font-size: 12px;">This is an automated message from Quake Inventory System.</p>
        </body>
        </html>
        """
        
        # Plain text version
        plain_body = f"Low Stock Alert - {len(low_stock_items)} products need restocking\n\n"
        for item in low_stock_items:
            plain_body += f"- {item['name']} ({item['sku']}): {item['current_stock']}/{item['reorder_threshold']} at {item['warehouse_name']} [{item['urgency']}]\n"
        
        # Send to all recipients
        results = []
        for recipient in recipients:
            result = EmailService.send_email(
                to_email=recipient,
                subject=subject,
                body=plain_body,
                html_body=html_body
            )
            results.append(result)
        
        return results


class WhatsAppService:
    """
    Service for sending WhatsApp messages via WhatsApp Business API (Meta Cloud API).
    
    Required environment variables or NotificationSetting fields:
    - WHATSAPP_PHONE_NUMBER_ID: The Phone Number ID from Meta Developer Console
    - WHATSAPP_ACCESS_TOKEN: Permanent access token from Meta
    - WHATSAPP_BUSINESS_ACCOUNT_ID: Optional, for account-level operations
    """
    
    # WhatsApp Cloud API base URL
    API_BASE_URL = "https://graph.facebook.com/v18.0"
    
    @staticmethod
    def get_whatsapp_config() -> Dict[str, str]:
        """Get WhatsApp Business API configuration."""
        try:
            db_settings = NotificationSetting.get_settings()
            
            # Check database settings first
            if db_settings.whatsapp_phone_number_id and db_settings.whatsapp_access_token:
                return {
                    'phone_number_id': db_settings.whatsapp_phone_number_id,
                    'access_token': db_settings.whatsapp_access_token,
                    'business_account_id': db_settings.whatsapp_business_account_id or '',
                }
        except Exception as e:
            logger.warning(f"Could not load DB WhatsApp settings: {e}")
        
        # Fall back to environment variables
        import os
        return {
            'phone_number_id': os.getenv('WHATSAPP_PHONE_NUMBER_ID', ''),
            'access_token': os.getenv('WHATSAPP_ACCESS_TOKEN', ''),
            'business_account_id': os.getenv('WHATSAPP_BUSINESS_ACCOUNT_ID', ''),
        }
    
    @staticmethod
    def format_phone_number(phone: str) -> str:
        """
        Format phone number for WhatsApp Business API.
        Returns number without + prefix (API requirement).
        
        Args:
            phone: Phone number (with or without country code)
            
        Returns:
            Formatted phone number without + prefix
        """
        # Remove spaces, dashes, parentheses, and + sign
        phone = ''.join(c for c in phone if c.isdigit())
        
        # Assume India if 10 digits
        if len(phone) == 10:
            phone = '91' + phone
        
        return phone
    
    @staticmethod
    def send_whatsapp_message(
        phone_number: str,
        message: str,
        message_type: str = 'CUSTOM',
        sale_id: Optional[str] = None,
        sale_invoice_number: Optional[str] = None
    ) -> WhatsAppNotification:
        """
        Send a WhatsApp message via WhatsApp Business API.
        
        Args:
            phone_number: Recipient phone number
            message: Message to send
            message_type: Type of message (INVOICE, LOW_STOCK, etc.)
            sale_id: Optional related sale ID
            sale_invoice_number: Optional invoice number
            
        Returns:
            WhatsAppNotification record
        """
        formatted_phone = WhatsAppService.format_phone_number(phone_number)
        
        # Create tracking record
        wa_record = WhatsAppNotification.objects.create(
            phone_number=formatted_phone,
            message=message,
            message_type=message_type,
            sale_id=sale_id,
            sale_invoice_number=sale_invoice_number or '',
            status=WhatsAppNotification.Status.PENDING
        )
        
        # Get WhatsApp configuration
        config = WhatsAppService.get_whatsapp_config()
        
        if not config['phone_number_id'] or not config['access_token']:
            wa_record.status = WhatsAppNotification.Status.FAILED
            wa_record.error_message = "WhatsApp Business API not configured. Please set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN."
            wa_record.save()
            logger.warning("WhatsApp Business API not configured")
            return wa_record
        
        try:
            # WhatsApp Cloud API endpoint
            url = f"{WhatsAppService.API_BASE_URL}/{config['phone_number_id']}/messages"
            
            headers = {
                'Authorization': f"Bearer {config['access_token']}",
                'Content-Type': 'application/json',
            }
            
            # Message payload for text message
            payload = {
                'messaging_product': 'whatsapp',
                'recipient_type': 'individual',
                'to': formatted_phone,
                'type': 'text',
                'text': {
                    'preview_url': False,
                    'body': message
                }
            }
            
            # Send request to WhatsApp API
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            
            if response.status_code == 200:
                response_data = response.json()
                wa_record.status = WhatsAppNotification.Status.SENT
                wa_record.sent_at = timezone.now()
                # Store message ID from WhatsApp for tracking
                if 'messages' in response_data and response_data['messages']:
                    wa_record.whatsapp_message_id = response_data['messages'][0].get('id', '')
                wa_record.save()
                logger.info(f"WhatsApp message sent to {formatted_phone}")
            else:
                error_data = response.json() if response.content else {}
                error_msg = error_data.get('error', {}).get('message', f'HTTP {response.status_code}')
                wa_record.status = WhatsAppNotification.Status.FAILED
                wa_record.error_message = f"API Error: {error_msg}"
                wa_record.save()
                logger.error(f"WhatsApp API error: {error_msg}")
                
        except requests.exceptions.Timeout:
            wa_record.status = WhatsAppNotification.Status.FAILED
            wa_record.error_message = "Request timeout - WhatsApp API did not respond"
            wa_record.save()
            logger.error("WhatsApp API timeout")
            
        except requests.exceptions.RequestException as e:
            wa_record.status = WhatsAppNotification.Status.FAILED
            wa_record.error_message = f"Network error: {str(e)}"
            wa_record.save()
            logger.error(f"WhatsApp network error: {e}")
            
        except Exception as e:
            wa_record.status = WhatsAppNotification.Status.FAILED
            wa_record.error_message = str(e)
            wa_record.save()
            logger.error(f"Failed to send WhatsApp message to {formatted_phone}: {e}")
        
        return wa_record
    
    @staticmethod
    def send_invoice_via_whatsapp(sale_id: str, phone_number: str, custom_message: str = '') -> WhatsAppNotification:
        """
        Send a sales invoice via WhatsApp.
        
        Args:
            sale_id: Sale ID to send invoice for
            phone_number: Customer's phone number
            custom_message: Optional custom message to prepend
            
        Returns:
            WhatsAppNotification record
        """
        from sales.models import Sale, SaleItem
        from decimal import Decimal
        
        try:
            sale = Sale.objects.select_related('customer').prefetch_related('items__product').get(id=sale_id)
        except Sale.DoesNotExist:
            # Create failed record
            wa_record = WhatsAppNotification.objects.create(
                phone_number=phone_number,
                message="",
                message_type=WhatsAppNotification.MessageType.INVOICE,
                sale_id=sale_id,
                status=WhatsAppNotification.Status.FAILED,
                error_message=f"Sale with ID {sale_id} not found"
            )
            return wa_record
        
        # Build invoice message
        message_parts = []
        
        if custom_message:
            message_parts.append(custom_message)
            message_parts.append("")
        
        message_parts.append("🧾 *SALES INVOICE*")
        message_parts.append(f"Invoice: {sale.invoice_number}")
        message_parts.append(f"Date: {sale.created_at.strftime('%d/%m/%Y %I:%M %p')}")
        
        if sale.customer:
            message_parts.append(f"Customer: {sale.customer.name}")
        
        message_parts.append("")
        message_parts.append("*Items:*")
        
        for item in sale.items.all():
            product_name = item.product.name if item.product else "Unknown"
            message_parts.append(f"• {product_name}")
            message_parts.append(f"  Qty: {item.quantity} × ₹{item.unit_price} = ₹{item.total_price}")
        
        message_parts.append("")
        message_parts.append(f"*Subtotal:* ₹{sale.subtotal}")
        
        if sale.discount_amount and sale.discount_amount > 0:
            message_parts.append(f"*Discount:* -₹{sale.discount_amount}")
        
        if sale.tax_amount and sale.tax_amount > 0:
            message_parts.append(f"*Tax:* ₹{sale.tax_amount}")
        
        message_parts.append(f"*Total:* ₹{sale.total_amount}")
        message_parts.append(f"*Payment:* {sale.payment_method}")
        
        message_parts.append("")
        message_parts.append("Thank you for your purchase! 🙏")
        message_parts.append("_Quake Inventory System_")
        
        message = "\n".join(message_parts)
        
        return WhatsAppService.send_whatsapp_message(
            phone_number=phone_number,
            message=message,
            message_type='INVOICE',
            sale_id=str(sale.id),
            sale_invoice_number=sale.invoice_number
        )
