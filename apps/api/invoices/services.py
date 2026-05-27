"""
Invoice Services for Quake Inventory System.
Core business logic for invoice generation.

PHASE 14: INVOICE PDFs & COMPLIANCE
====================================
- Invoice generated exactly once per sale (idempotent)
- All data snapshotted from Sale (no recalculation)
- GST breakdown copied from SaleItem
- PDF generation on creation
- Immutable after creation

CRITICAL: All invoice operations MUST go through this service layer.
Direct manipulation of Invoice/InvoiceItem is forbidden.
"""

from decimal import Decimal
import logging
import os
from typing import Optional, Dict, Any
from django.db import transaction
from django.core.exceptions import ValidationError

from sales.models import Sale, SaleItem
from .models import Invoice, InvoiceItem


# =============================================================================
# EXCEPTIONS
# =============================================================================

class InvoiceError(Exception):
    """Base exception for invoice errors."""
    pass


class SaleNotFoundError(InvoiceError):
    """Raised when sale is not found."""
    pass


class SaleNotCompletedError(InvoiceError):
    """Raised when sale is not in COMPLETED status."""
    pass


class InvoiceAlreadyExistsError(InvoiceError):
    """Raised when invoice already exists for sale."""
    pass


class MissingSaleItemsError(InvoiceError):
    """Raised when sale has no items."""
    pass


# =============================================================================
# INVOICE GENERATION (PHASE 14)
# =============================================================================

@transaction.atomic
def generate_invoice_for_sale(
    sale_id: str,
    billing_name: Optional[str] = None,
    billing_phone: Optional[str] = None,
    billing_gstin: Optional[str] = None
) -> Invoice:
    """
    Generate an invoice for a completed sale.
    
    PHASE 14 RULES:
    - Invoice is a snapshot of Sale data (no recalculation)
    - One Sale → One Invoice (idempotent)
    - GST data copied directly from SaleItem
    - PDF generated on creation
    - Immutable after creation
    
    Args:
        sale_id: UUID of the sale
        billing_name: Customer name (defaults to sale.customer_name)
        billing_phone: Customer phone (optional)
        billing_gstin: Customer GSTIN (optional)
    
    Returns:
        Invoice object (existing if already created)
    
    Raises:
        SaleNotFoundError: If sale doesn't exist
        SaleNotCompletedError: If sale is not COMPLETED
        MissingSaleItemsError: If sale has no items
    """
    # Validate sale exists
    try:
        sale = Sale.objects.prefetch_related(
            'items__product',
            'payments'
        ).get(id=sale_id)
    except Sale.DoesNotExist:
        raise SaleNotFoundError(f"Sale not found: {sale_id}")
    
    # Validate sale status
    if sale.status != Sale.Status.COMPLETED:
        raise SaleNotCompletedError(
            f"Cannot generate invoice for sale with status: {sale.status}. "
            f"Only COMPLETED sales can have invoices."
        )
    
    # Check if invoice already exists (idempotent)
    if hasattr(sale, 'invoice'):
        return sale.invoice  # Return existing invoice
    
    # Validate sale has items
    sale_items = list(sale.items.all())
    if not sale_items:
        raise MissingSaleItemsError(f"Sale {sale_id} has no items")
    
    # Use the sale's invoice number as the single source of truth (roadmap: one sequence).
    # Sale.invoice_number is allocated atomically at checkout in sales.services.process_sale.
    invoice_number = sale.invoice_number

    # Map Sale discount type to Invoice discount type
    discount_type = Invoice.DiscountType.NONE
    if sale.discount_type == 'PERCENT':
        discount_type = Invoice.DiscountType.PERCENTAGE
    elif sale.discount_type == 'FLAT':
        discount_type = Invoice.DiscountType.FLAT
    
    # Calculate discount amount from sale
    discount_amount = sale.discount_amount if hasattr(sale, 'discount_amount') and sale.discount_amount else Decimal('0.00')
    if not discount_amount:
        # Calculate from subtotal and total if not stored
        discount_amount = sale.subtotal - (sale.total - sale.total_gst)
        if discount_amount < 0:
            discount_amount = Decimal('0.00')
    
    # Create invoice (snapshot from Sale - NO recalculation)
    invoice = Invoice.objects.create(
        invoice_number=invoice_number,
        sale=sale,
        warehouse=sale.warehouse,
        subtotal_amount=sale.subtotal,
        discount_type=discount_type,
        discount_value=sale.discount_value if sale.discount_value else None,
        discount_amount=discount_amount,
        gst_total=sale.total_gst,
        total_amount=sale.total,
        billing_name=billing_name or sale.customer_name or 'Walk-in Customer',
        billing_phone=billing_phone or sale.customer_mobile or '',
        billing_gstin=billing_gstin or ''
    )
    
    # Create invoice items (snapshotted from SaleItem - NO recalculation)
    for sale_item in sale_items:
        product = sale_item.product
        
        # Build variant details if available
        variant_details = ''
        if hasattr(product, 'variants') and product.variants.exists():
            variant = product.variants.first()
            details = []
            if hasattr(variant, 'size') and variant.size:
                details.append(variant.size)
            if hasattr(variant, 'color') and variant.color:
                details.append(variant.color)
            variant_details = ' / '.join(details) if details else ''
        
        # Calculate taxable amount (line_total - discount share)
        # This is approximated from the GST calculation
        if sale_item.gst_percentage > 0 and sale_item.gst_amount > 0:
            taxable_amount = (sale_item.gst_amount * 100 / sale_item.gst_percentage).quantize(Decimal('0.01'))
        else:
            taxable_amount = sale_item.line_total
        
        InvoiceItem.objects.create(
            invoice=invoice,
            product_name=product.name,
            sku=product.sku,
            variant_details=variant_details,
            quantity=sale_item.quantity,
            unit_price=sale_item.selling_price,
            line_total=sale_item.line_total,
            taxable_amount=taxable_amount,
            gst_percentage=sale_item.gst_percentage,
            gst_amount=sale_item.gst_amount,
            line_total_with_gst=sale_item.line_total_with_gst
        )
    
    # Generate PDF
    pdf_url = generate_invoice_pdf(invoice)
    if pdf_url:
        # Update PDF URL without triggering immutability check
        Invoice.objects.filter(pk=invoice.pk).update(pdf_url=pdf_url)
        invoice.pdf_url = pdf_url
    
    return invoice


# =============================================================================
# PDF GENERATION
# =============================================================================

def generate_invoice_pdf(invoice: Invoice) -> Optional[str]:
    """
    Generate PDF for invoice.
    
    PHASE 14: 
    - PDF generated once on creation
    - Stored for reuse
    - Same sale = same PDF
    - Corrupt or non-PDF cached files are regenerated
    
    Uses the same WeasyPrint → ReportLab pipeline as ``testinvoice`` /
    ``write_invoice_pdf_best_effort`` so POS/Sales PDFs match CLI output.

    Returns:
        URL/path to the generated PDF, or None if generation failed
    """
    from django.conf import settings

    from .pdf.write_pdf import write_invoice_pdf_best_effort, is_valid_invoice_pdf

    logger = logging.getLogger(__name__)

    # Create PDF directory if not exists
    pdf_dir = os.path.join(settings.BASE_DIR, 'media', 'invoices')
    os.makedirs(pdf_dir, exist_ok=True)
    
    pdf_filename = f"{invoice.invoice_number.replace('/', '_')}.pdf"
    pdf_path = os.path.join(pdf_dir, pdf_filename)

    # Reuse only a real PDF (avoids stale text placeholders from older fallbacks)
    if os.path.exists(pdf_path) and is_valid_invoice_pdf(pdf_path):
        return f"/media/invoices/{pdf_filename}"
    if os.path.exists(pdf_path):
        try:
            os.remove(pdf_path)
        except OSError:
            pass
    
    try:
        write_invoice_pdf_best_effort(invoice, pdf_path)
    except Exception:
        logger.exception("Invoice PDF generation failed for %s", invoice.pk)
        return None

    if not is_valid_invoice_pdf(pdf_path):
        logger.error("Invoice PDF at %s is not a valid PDF after generation", pdf_path)
        return None

    return f"/media/invoices/{pdf_filename}"


# =============================================================================
# INVOICE RETRIEVAL
# =============================================================================

def get_invoice_details(invoice_id: str) -> Dict[str, Any]:
    """
    Get complete invoice details including GST breakdown.
    """
    try:
        invoice = Invoice.objects.prefetch_related('items', 'sale__payments').get(id=invoice_id)
    except Invoice.DoesNotExist:
        raise InvoiceError("Invoice not found")
    
    items = []
    for item in invoice.items.all():
        items.append({
            'product_name': item.product_name,
            'sku': item.sku,
            'variant_details': item.variant_details,
            'quantity': item.quantity,
            'unit_price': str(item.unit_price),
            'line_total': str(item.line_total),
            'taxable_amount': str(item.taxable_amount),
            'gst_percentage': str(item.gst_percentage),
            'gst_amount': str(item.gst_amount),
            'line_total_with_gst': str(item.line_total_with_gst)
        })
    
    # Get payment methods used
    payments = []
    if hasattr(invoice.sale, 'payments'):
        for payment in invoice.sale.payments.all():
            payments.append({
                'method': payment.method,
                'amount': str(payment.amount)
            })
    
    return {
        'id': str(invoice.id),
        'invoice_number': invoice.invoice_number,
        'sale_id': str(invoice.sale_id),
        'invoice_number_from_sale': invoice.sale.invoice_number,
        'warehouse_id': str(invoice.warehouse_id),
        'warehouse_name': invoice.warehouse.name,
        'subtotal_amount': str(invoice.subtotal_amount),
        'discount_type': invoice.discount_type,
        'discount_value': str(invoice.discount_value) if invoice.discount_value else None,
        'discount_amount': str(invoice.discount_amount),
        'gst_total': str(invoice.gst_total),
        'total_amount': str(invoice.total_amount),
        'billing_name': invoice.billing_name,
        'billing_phone': invoice.billing_phone,
        'billing_gstin': invoice.billing_gstin,
        'invoice_date': invoice.invoice_date.isoformat(),
        'pdf_url': invoice.pdf_url,
        'created_at': invoice.created_at.isoformat(),
        'items': items,
        'payments': payments
    }


def get_invoice_by_sale(sale_id: str) -> Optional[Invoice]:
    """
    Get invoice for a sale if it exists.
    """
    try:
        sale = Sale.objects.get(id=sale_id)
        if hasattr(sale, 'invoice'):
            return sale.invoice
        return None
    except Sale.DoesNotExist:
        return None
