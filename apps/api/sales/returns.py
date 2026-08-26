"""
Returns Service for Quake Inventory System.

PHASE 15: RETURNS, REFUNDS & ADJUSTMENTS (LEDGER-SAFE)
=======================================================

CORE PRINCIPLE: Nothing is edited. Everything is reversed with new records.

RULES:
- Returns create new records, never mutate originals
- Refund amounts derived from stored sale data
- Stock increases via RETURN inventory movements
- Multiple partial returns allowed per sale
- Return quantity cannot exceed original sale quantity

WORKFLOW:
1. Validate sale exists & status = COMPLETED
2. Validate return quantities <= remaining
3. Calculate refund from stored prices (no recalculation)
4. Create Return + ReturnItem records
5. Create RETURN inventory movements (+quantity)
6. Update sale status if fully returned
"""

from decimal import Decimal
from typing import Dict, List, Optional, Any
from django.db import transaction
from django.db.models import Sum

from sales.models import Sale, SaleItem, Return, ReturnItem
from inventory.models import Warehouse
from inventory import services as inventory_services


# =============================================================================
# EXCEPTIONS
# =============================================================================

class ReturnError(Exception):
    """Base exception for return errors."""
    pass


class SaleNotFoundError(ReturnError):
    """Raised when sale is not found."""
    pass


class SaleNotCompletedError(ReturnError):
    """Raised when sale is not in valid status for return."""
    pass


class InvalidReturnQuantityError(ReturnError):
    """Raised when return quantity exceeds sold quantity."""
    pass


class NoItemsToReturnError(ReturnError):
    """Raised when no valid items provided for return."""
    pass


class SaleItemNotFoundError(ReturnError):
    """Raised when sale item is not found."""
    pass


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_remaining_returnable_quantity(sale_item: SaleItem) -> int:
    """
    Calculate remaining quantity that can still be returned for a sale item.
    
    Returns:
        int: Remaining returnable quantity
    """
    returned_qty = ReturnItem.objects.filter(
        sale_item=sale_item
    ).aggregate(total=Sum('quantity'))['total'] or 0
    
    return sale_item.quantity - returned_qty


def is_sale_fully_returned(sale: Sale) -> bool:
    """
    Check if a sale has been fully returned.
    
    Returns:
        bool: True if all items have been fully returned
    """
    for sale_item in sale.items.all():
        if get_remaining_returnable_quantity(sale_item) > 0:
            return False
    return True


def calculate_line_refund(sale_item: SaleItem, return_quantity: int) -> Dict[str, Decimal]:
    """
    Calculate refund amounts for a return line item.
    
    Uses stored sale data (no recalculation from current prices).
    
    Args:
        sale_item: Original sale item
        return_quantity: Quantity being returned
    
    Returns:
        Dict with 'line_refund' and 'gst_refund'
    """
    # Calculate proportional refund based on original quantities
    original_qty = sale_item.quantity
    
    # Line refund (proportional to original line_total_with_gst)
    if original_qty > 0 and sale_item.line_total_with_gst > 0:
        # Use line_total_with_gst as the total amount including GST
        unit_price_with_gst = sale_item.line_total_with_gst / original_qty
        line_refund_with_gst = (unit_price_with_gst * return_quantity).quantize(Decimal('0.01'))
        
        # Calculate GST portion
        if sale_item.gst_amount > 0:
            gst_per_unit = sale_item.gst_amount / original_qty
            gst_refund = (gst_per_unit * return_quantity).quantize(Decimal('0.01'))
        else:
            gst_refund = Decimal('0.00')
        
        # Line refund before GST
        line_refund = line_refund_with_gst - gst_refund
    else:
        # Fallback to simple calculation
        line_refund = (sale_item.selling_price * return_quantity).quantize(Decimal('0.01'))
        gst_refund = Decimal('0.00')
    
    return {
        'line_refund': line_refund,
        'gst_refund': gst_refund
    }


# =============================================================================
# MAIN RETURN FUNCTION
# =============================================================================

@transaction.atomic
def process_return(
    sale_id: str,
    warehouse_id: str,
    items: List[Dict[str, Any]],
    reason: str,
    user
) -> Return:
    """
    Process a return for a completed sale.
    
    PHASE 15 RULES:
    - Atomic transaction (all or nothing)
    - Refund amounts from stored prices
    - Creates RETURN inventory movements
    - Updates sale status if fully returned
    
    Args:
        sale_id: UUID of the original sale
        warehouse_id: UUID of the warehouse
        items: List of {'sale_item_id': uuid, 'quantity': int}
        reason: Reason for return
        user: User processing the return
    
    Returns:
        Return object
    
    Raises:
        SaleNotFoundError: Sale not found
        SaleNotCompletedError: Sale not in valid status
        InvalidReturnQuantityError: Return qty > sold qty
        NoItemsToReturnError: No valid items
        SaleItemNotFoundError: Sale item not found
    """
    # 1. Validate sale exists (scoped to caller's active organization)
    org_id = getattr(user, "organization_id", None)
    sale_qs = Sale.objects.prefetch_related("items__product").filter(id=sale_id)
    if org_id:
        sale_qs = sale_qs.filter(organization_id=org_id)
    try:
        sale = sale_qs.get()
    except Sale.DoesNotExist:
        raise SaleNotFoundError(f"Sale not found: {sale_id}")

    # 2. Validate sale status
    if sale.status not in [Sale.Status.COMPLETED, Sale.Status.REFUNDED]:
        raise SaleNotCompletedError(
            f"Cannot process return for sale with status: {sale.status}. "
            f"Only COMPLETED or partially REFUNDED sales can be returned."
        )

    # 3. Validate warehouse (same organization as the sale / caller)
    warehouse_qs = Warehouse.objects.filter(id=warehouse_id)
    if org_id:
        warehouse_qs = warehouse_qs.filter(organization_id=org_id)
    elif sale.organization_id:
        warehouse_qs = warehouse_qs.filter(organization_id=sale.organization_id)
    try:
        warehouse = warehouse_qs.get()
    except Warehouse.DoesNotExist:
        raise ReturnError(f"Warehouse not found: {warehouse_id}")
    
    # 4. Validate items
    if not items:
        raise NoItemsToReturnError("No items provided for return")
    
    validated_items = []
    total_refund_subtotal = Decimal('0.00')
    total_refund_gst = Decimal('0.00')
    
    for item_data in items:
        sale_item_id = item_data.get('sale_item_id')
        return_quantity = item_data.get('quantity', 0)
        
        if return_quantity <= 0:
            continue
        
        # Find sale item
        try:
            sale_item = SaleItem.objects.select_related('product').get(
                id=sale_item_id,
                sale=sale
            )
        except SaleItem.DoesNotExist:
            raise SaleItemNotFoundError(
                f"Sale item not found: {sale_item_id}"
            )
        
        # Check remaining returnable quantity
        remaining = get_remaining_returnable_quantity(sale_item)
        if return_quantity > remaining:
            raise InvalidReturnQuantityError(
                f"Cannot return {return_quantity} units of {sale_item.product.name}. "
                f"Maximum returnable: {remaining}"
            )
        
        # Calculate refund amounts
        refund_amounts = calculate_line_refund(sale_item, return_quantity)
        
        validated_items.append({
            'sale_item': sale_item,
            'quantity': return_quantity,
            'line_refund': refund_amounts['line_refund'],
            'gst_refund': refund_amounts['gst_refund']
        })
        
        total_refund_subtotal += refund_amounts['line_refund']
        total_refund_gst += refund_amounts['gst_refund']
    
    if not validated_items:
        raise NoItemsToReturnError("No valid items to return")
    
    # 5. Create Return record
    total_refund_amount = total_refund_subtotal + total_refund_gst
    
    return_record = Return.objects.create(
        original_sale=sale,
        warehouse=warehouse,
        reason=reason,
        refund_subtotal=total_refund_subtotal,
        refund_gst=total_refund_gst,
        refund_amount=total_refund_amount,
        status=Return.Status.COMPLETED,
        created_by=user
    )
    
    # 6. Create ReturnItem records and inventory movements
    for item in validated_items:
        sale_item = item['sale_item']
        
        # Create return item
        ReturnItem.objects.create(
            return_record=return_record,
            sale_item=sale_item,
            quantity=item['quantity'],
            line_refund=item['line_refund'],
            gst_refund=item['gst_refund']
        )
        
        # Create RETURN inventory movement (+quantity back to stock)
        inventory_services.create_inventory_movement(
            product_id=sale_item.product.id,
            movement_type='RETURN',
            quantity=item['quantity'],  # Positive - stock increases
            user=user,
            warehouse_id=warehouse.id,
            reference_id=str(return_record.id),
            remarks=f"Return for sale {sale.invoice_number}: {reason}"
        )
    
    # 7. Update sale status if fully returned
    if is_sale_fully_returned(sale):
        Sale.objects.filter(pk=sale.pk).update(status=Sale.Status.REFUNDED)
    
    return return_record


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_return_details(return_id: str) -> Dict[str, Any]:
    """
    Get complete return details.
    """
    try:
        return_record = Return.objects.prefetch_related(
            'items__sale_item__product',
            'original_sale'
        ).get(id=return_id)
    except Return.DoesNotExist:
        raise ReturnError(f"Return not found: {return_id}")
    
    items = []
    for item in return_record.items.all():
        items.append({
            'id': str(item.id),
            'sale_item_id': str(item.sale_item.id),
            'product_name': item.sale_item.product.name,
            'quantity': item.quantity,
            'line_refund': str(item.line_refund),
            'gst_refund': str(item.gst_refund)
        })
    
    return {
        'id': str(return_record.id),
        'original_sale_id': str(return_record.original_sale.id),
        'original_invoice_number': return_record.original_sale.invoice_number,
        'warehouse_id': str(return_record.warehouse.id),
        'reason': return_record.reason,
        'refund_subtotal': str(return_record.refund_subtotal),
        'refund_gst': str(return_record.refund_gst),
        'refund_amount': str(return_record.refund_amount),
        'status': return_record.status,
        'created_at': return_record.created_at.isoformat(),
        'items': items
    }


def get_sale_returnable_items(
    sale_id: str,
    *,
    organization_id=None,
) -> List[Dict[str, Any]]:
    """
    Get list of items that can still be returned for a sale.
    When organization_id is set, foreign-org sales are treated as not found.
    """
    sale_qs = Sale.objects.prefetch_related("items__product").filter(id=sale_id)
    if organization_id:
        sale_qs = sale_qs.filter(organization_id=organization_id)
    try:
        sale = sale_qs.get()
    except Sale.DoesNotExist:
        raise SaleNotFoundError(f"Sale not found: {sale_id}")
    
    returnable_items = []
    for sale_item in sale.items.all():
        remaining = get_remaining_returnable_quantity(sale_item)
        if remaining > 0:
            returnable_items.append({
                'sale_item_id': str(sale_item.id),
                'product_name': sale_item.product.name,
                'original_quantity': sale_item.quantity,
                'remaining_quantity': remaining,
                'unit_price': str(sale_item.selling_price),
                'gst_percentage': str(sale_item.gst_percentage)
            })
    
    return returnable_items
