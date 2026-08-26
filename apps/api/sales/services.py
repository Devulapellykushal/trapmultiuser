"""
Sales Services for Quake Inventory System.

PHASE 13: POS ENGINE (LEDGER-BACKED)
=====================================

PHASE 13.1: POS ACCOUNTING HARDENING
=====================================
- Sale lifecycle states (COMPLETED, CANCELLED, REFUNDED)
- GST breakdown per line item (extracted from MRP)
- Explicit discount + tax calculation order
- Immutable financial records

INDIAN RETAIL PRICING MODEL (MRP = GST INCLUSIVE):
In India, MRP already includes GST. The sale happens at MRP.
GST is EXTRACTED from MRP for tax reporting, NOT added on top.

OFFICIAL CALCULATION ORDER (LOCKED):
1. subtotal = sum(quantity × selling_price) for each item
2. discount_amount = apply discount on subtotal
3. discounted_subtotal = subtotal - discount_amount
4. For each item (tax reporting):
   - discount_share = (line_total / subtotal) × discount_amount
   - discounted_line = line_total - discount_share
   - gst_amount = discounted_line × gst_percentage / (100 + gst_percentage)
5. total_gst = sum(gst_amount) for all items (for reporting)
6. final_total = discounted_subtotal (MRP-based, GST already included)

IMMUTABILITY RULE:
Sales are immutable; corrections are new records.

CORE PRINCIPLE:
A sale is an atomic financial transaction.
Either everything happens — or nothing does.

REQUIREMENTS:
- Barcode-first product resolution
- Stock validation via inventory ledger
- Multi-payment support
- Discount and GST calculation
- Atomic transactions with rollback
- Invoice number generation

CRITICAL: All sales operations MUST go through this service layer.
Direct manipulation of Sale/SaleItem/Payment is forbidden.
"""

from decimal import Decimal
from typing import List, Optional, Union
from uuid import UUID

from django.db import transaction
from django.db.models import Q

from inventory.models import Warehouse, Product, ProductVariant, ServiceItem
from inventory.services import get_product_stock, create_inventory_movement, InvalidMovementError
from invoices.models import InvoiceSequence
from .models import Sale, SaleItem, Payment


# =============================================================================
# EXCEPTIONS
# =============================================================================

class SaleError(Exception):
    """Base exception for sale errors."""
    pass


class InvalidBarcodeError(SaleError):
    """Raised when barcode is invalid or not found."""
    pass


class InactiveProductError(SaleError):
    """Raised when product is inactive."""
    pass


class InsufficientStockError(SaleError):
    """Raised when stock is insufficient for sale."""
    pass


class DuplicateCheckoutError(SaleError):
    """Raised when duplicate checkout is detected (idempotency)."""
    pass


class PaymentMismatchError(SaleError):
    """Raised when payments don't equal total."""
    pass


class InvalidDiscountError(SaleError):
    """Raised when discount is invalid."""
    pass


class InvalidGSTError(SaleError):
    """Raised when GST percentage is invalid (Phase 13.1)."""
    pass


class WarehouseNotFoundError(SaleError):
    """Raised when warehouse is not found."""
    pass


# =============================================================================
# PRODUCT RESOLUTION
# =============================================================================

def lookup_product_by_barcode(barcode: str) -> Product:
    """
    Look up a product by barcode.
    
    Args:
        barcode: The barcode to look up (product-level or variant-level)
    
    Returns:
        Product matching the barcode.
        If a variant barcode matched, product._matched_variant is set.
    
    Raises:
        InvalidBarcodeError: If barcode not found
        InactiveProductError: If product is inactive
    """
    # Try variant barcode first (size/color specific)
    try:
        variant = ProductVariant.objects.select_related('product').get(barcode=barcode)
        product = variant.product
        # Attach the matched variant for downstream price/metadata usage
        product._matched_variant = variant  # type: ignore[attr-defined]
    except ProductVariant.DoesNotExist:
        # Fallback to product-level barcode
        try:
            product = Product.objects.get(barcode_value=barcode)
        except Product.DoesNotExist:
            raise InvalidBarcodeError(f"No product or variant found with barcode: {barcode}")
    
    if hasattr(product, 'is_active') and not product.is_active:
        raise InactiveProductError(f"Product {barcode} is inactive")
    
    return product


def check_stock_availability(
    product: Product,
    warehouse: Warehouse,
    quantity: int
) -> int:
    """
    Check if stock is available for sale.
    
    Returns:
        Available stock quantity
    
    Raises:
        InsufficientStockError: If stock is insufficient
    """
    available = get_product_stock(product.id, warehouse_id=warehouse.id)
    
    if available < quantity:
        raise InsufficientStockError(
            f"Insufficient stock for {product.sku}: "
            f"requested {quantity}, available {available}"
        )
    
    return available


def _resolve_product_pricing(product: Product) -> tuple[Decimal, Decimal, Decimal, str]:
    """
    Resolve MRP/GST/cost for POS display (ProductPricing first, then variant).
    Returns (selling_price, gst_percentage, cost_price, pricing_source).
    """
    selling_price = Decimal('0.00')
    gst_percentage = Decimal('0.00')
    cost_price = Decimal('0.00')
    pricing_source = 'none'

    if hasattr(product, 'pricing') and product.pricing:
        selling_price = product.pricing.selling_price or Decimal('0.00')
        gst_percentage = product.pricing.gst_percentage or Decimal('0.00')
        cost_price = product.pricing.cost_price or Decimal('0.00')
        pricing_source = 'product_pricing'
    else:
        matched_variant = getattr(product, '_matched_variant', None)
        if matched_variant and matched_variant.selling_price:
            selling_price = matched_variant.selling_price
            cost_price = matched_variant.cost_price or Decimal('0.00')
            pricing_source = 'variant'
        elif hasattr(product, 'variants') and product.variants.exists():
            variant = product.variants.first()
            if variant.selling_price:
                selling_price = variant.selling_price
                cost_price = variant.cost_price or Decimal('0.00')
                pricing_source = 'variant'

    return selling_price, gst_percentage, cost_price, pricing_source


def _pos_product_payload(
    product: Product,
    warehouse: Warehouse,
    *,
    requested_quantity: int = 1,
) -> dict:
    """Single product row for POS scan/search (ledger stock + pricing snapshot)."""
    available = get_product_stock(product.id, warehouse_id=warehouse.id)
    selling_price, gst_percentage, cost_price, pricing_source = _resolve_product_pricing(product)

    matched_variant = getattr(product, '_matched_variant', None)
    variant_info: dict = {}
    if matched_variant:
        variant_info = {
            'variant_sku': matched_variant.sku,
            'variant_barcode': matched_variant.barcode,
            'size': matched_variant.size or '',
            'color': matched_variant.color or '',
        }

    return {
        'item_type': 'PRODUCT',
        'product_id': str(product.id),
        'barcode': product.barcode_value or '',
        'sku': product.sku or '',
        'product_name': product.name,
        'selling_price': str(selling_price),
        'gst_percentage': str(gst_percentage),
        'available_stock': available,
        'requested_quantity': requested_quantity,
        'can_fulfill': available >= requested_quantity,
        'warehouse_id': str(warehouse.id),
        'warehouse_name': warehouse.name,
        'pricing': {
            'selling_price': str(selling_price),
            'cost_price': str(cost_price),
            'gst_percentage': str(gst_percentage),
        },
        'pricing_source': pricing_source,
        **variant_info,
    }


def scan_barcode(
    barcode: str,
    warehouse_id: Union[str, UUID],
    quantity: int = 1
) -> dict:
    """
    Validate a barcode scan for POS.
    
    Args:
        barcode: Barcode to scan
        warehouse_id: Warehouse UUID
        quantity: Quantity to check
    
    Returns:
        Dict with product info and availability
    """
    product = lookup_product_by_barcode(barcode)

    try:
        warehouse = Warehouse.objects.get(pk=warehouse_id, is_active=True)
    except Warehouse.DoesNotExist:
        raise WarehouseNotFoundError(f"Warehouse {warehouse_id} not found or inactive")

    return _pos_product_payload(product, warehouse, requested_quantity=quantity)


def pos_search(
    warehouse_id: Union[str, UUID],
    query: str,
    *,
    limit: int = 20,
) -> dict:
    """
    Text search for POS (products + service catalog) scoped to a warehouse.

    Products: name, SKU, barcode, product_code, brand, alias (icontains).
    Services: active ServiceItem by service_name.

    Roadmap: GET /sales/pos/search/?q=&warehouse_id=&limit=
    """
    try:
        warehouse = Warehouse.objects.get(pk=warehouse_id, is_active=True)
    except Warehouse.DoesNotExist:
        raise WarehouseNotFoundError(f"Warehouse {warehouse_id} not found or inactive")

    try:
        lim = int(limit)
    except (TypeError, ValueError):
        lim = 20
    lim = max(1, min(lim, 50))

    q = (query or '').strip()
    products_out: list[dict] = []
    services_out: list[dict] = []

    if not q:
        return {
            'query': q,
            'warehouse_id': str(warehouse.id),
            'limit': lim,
            'products': products_out,
            'services': services_out,
        }

    product_qs = (
        Product.objects.filter(is_active=True, is_deleted=False)
        .select_related('pricing')
        .filter(
            Q(name__icontains=q)
            | Q(sku__icontains=q)
            | Q(barcode_value__icontains=q)
            | Q(product_code__icontains=q)
            | Q(brand__icontains=q)
            | Q(alias__icontains=q)
        )
        .order_by('brand', 'name')[:lim]
    )

    for product in product_qs:
        # Clear variant attachment from any previous iteration
        if hasattr(product, '_matched_variant'):
            delattr(product, '_matched_variant')
        products_out.append(_pos_product_payload(product, warehouse, requested_quantity=1))

    for svc in (
        ServiceItem.objects.filter(active=True, service_name__icontains=q)
        .order_by('service_name')[:lim]
    ):
        services_out.append({
            'item_type': 'SERVICE',
            'service_item_id': str(svc.id),
            'service_name': svc.service_name,
            'default_price': str(svc.default_price),
            'gst_percent': str(svc.gst_percent),
            'hsn_code': svc.hsn_code or '',
        })

    return {
        'query': q,
        'warehouse_id': str(warehouse.id),
        'limit': lim,
        'products': products_out,
        'services': services_out,
    }


# =============================================================================
# IDEMPOTENCY
# =============================================================================

def _check_existing_sale(idempotency_key: UUID) -> Optional[Sale]:
    """
    Check if a sale already exists with the given idempotency key.
    
    Returns:
        Existing Sale if found, None otherwise
    """
    try:
        return Sale.objects.get(idempotency_key=idempotency_key)
    except Sale.DoesNotExist:
        return None


# =============================================================================
# DISCOUNT CALCULATION
# =============================================================================

def calculate_discount(
    subtotal: Decimal,
    discount_type: Optional[str],
    discount_value: Decimal
) -> Decimal:
    """
    Calculate discount amount.
    
    Args:
        subtotal: Subtotal before discount
        discount_type: 'PERCENT' or 'FLAT'
        discount_value: Discount value (percentage or amount)
    
    Returns:
        Discount amount
    
    Raises:
        InvalidDiscountError: If discount is invalid
    """
    if not discount_type or discount_value <= 0:
        return Decimal('0.00')
    
    if discount_type == 'PERCENT':
        if discount_value > 100:
            raise InvalidDiscountError("Percentage discount cannot exceed 100%")
        discount = (subtotal * discount_value / 100).quantize(Decimal('0.01'))
    else:  # FLAT
        discount = discount_value
    
    # Discount cannot exceed subtotal
    if discount > subtotal:
        raise InvalidDiscountError(
            f"Discount ({discount}) cannot exceed subtotal ({subtotal})"
        )
    
    return discount


# =============================================================================
# GST CALCULATION (PHASE 13.1)
# =============================================================================

def validate_gst_percentage(gst_percentage: Decimal) -> Decimal:
    """
    Validate GST percentage is within valid range.
    
    Args:
        gst_percentage: GST percentage (0-100)
    
    Returns:
        Validated GST percentage
    
    Raises:
        InvalidGSTError: If GST percentage is invalid
    """
    if gst_percentage < 0:
        raise InvalidGSTError("GST percentage cannot be negative")
    if gst_percentage > 100:
        raise InvalidGSTError("GST percentage cannot exceed 100%")
    return gst_percentage


def calculate_line_gst(amount: Decimal, gst_percentage: Decimal) -> Decimal:
    """
    Calculate GST amount for a given amount.
    
    Phase 13.1: Server-side GST calculation.
    
    Args:
        amount: Amount to calculate GST on (after any discount)
        gst_percentage: GST percentage (0-100)
    
    Returns:
        GST amount (rounded to 2 decimal places)
    
    Raises:
        InvalidGSTError: If GST percentage is invalid
    """
    validate_gst_percentage(gst_percentage)
    
    if gst_percentage == 0:
        return Decimal('0.00')
    
    return (amount * gst_percentage / 100).quantize(Decimal('0.01'))


def calculate_sale_totals(
    items: List[dict],
    discount_type: Optional[str],
    discount_value: Decimal,
    apply_automatic_gst: bool = True,
) -> dict:
    """
    Calculate all sale totals following the OFFICIAL calculation order.
    
    Phase 13.1: Server-side calculation. Frontend must NEVER send totals.
    
    INDIAN RETAIL PRICING MODEL:
    MRP is GST-INCLUSIVE. The sale happens at MRP/selling_price.
    GST is EXTRACTED from the MRP for tax reporting, NOT added on top.
    
    CALCULATION ORDER (LOCKED):
    1. subtotal = sum(line_totals) - this is the MRP-based total
    2. discount_amount = apply discount on subtotal
    3. discounted_subtotal = subtotal - discount_amount
    4. For each item (for tax reporting only, when apply_automatic_gst is True):
       - discount_share = (line_total / subtotal) × discount_amount
       - discounted_line = line_total - discount_share
       - gst_amount = discounted_line × gst_percentage / (100 + gst_percentage)
         (This extracts GST from inclusive price)
       When apply_automatic_gst is False, line GST amounts are zero and
       gst_percentage snapshots on items are stored as 0 (amount due unchanged).
    5. total_gst = sum(gst_amount) for all items (for reporting)
    6. final_total = discounted_subtotal (MRP-based, GST already included)
    
    Args:
        items: List of {'line_total': Decimal, 'gst_percentage': Decimal, ...}
        discount_type: 'PERCENT' or 'FLAT'
        discount_value: Discount value
        apply_automatic_gst: If False, no GST extraction; invoice lines show 0% GST.
    
    Returns:
        Dict with subtotal, discount_amount, discounted_subtotal, 
        total_gst, final_total, and items with calculated GST
    """
    # 1. Calculate subtotal (MRP-based)
    subtotal = sum(item['line_total'] for item in items)
    
    if subtotal == 0:
        for item in items:
            item['cgst_amount'] = Decimal('0.00')
            item['sgst_amount'] = Decimal('0.00')
        return {
            'subtotal': Decimal('0.00'),
            'discount_amount': Decimal('0.00'),
            'discounted_subtotal': Decimal('0.00'),
            'total_gst': Decimal('0.00'),
            'final_total': Decimal('0.00'),
            'items': items,
        }
    
    # 2. Apply discount
    discount_amount = calculate_discount(subtotal, discount_type, discount_value)
    
    # 3. Calculate discounted subtotal (this IS the final total in MRP-inclusive model)
    discounted_subtotal = subtotal - discount_amount
    
    # 4. Calculate GST for each item (EXTRACTED from inclusive price, for tax reporting)
    total_gst = Decimal('0.00')
    
    for item in items:
        # Pro-rata discount allocation
        if subtotal > 0:
            discount_share = (item['line_total'] / subtotal * discount_amount).quantize(Decimal('0.01'))
        else:
            discount_share = Decimal('0.00')
        
        discounted_line = item['line_total'] - discount_share
        
        # Calculate GST EXTRACTED from inclusive price (only when automatic GST is on)
        # Formula: GST = Price × (GST% / (100 + GST%))
        master_gst_pct = item.get('gst_percentage', Decimal('0.00'))
        validate_gst_percentage(master_gst_pct)
        effective_pct = master_gst_pct if apply_automatic_gst else Decimal('0.00')

        if effective_pct > 0:
            gst_amount = (
                discounted_line * effective_pct / (100 + effective_pct)
            ).quantize(Decimal('0.01'))
        else:
            gst_amount = Decimal('0.00')

        if gst_amount > 0:
            cgst = (gst_amount / Decimal('2')).quantize(Decimal('0.01'))
            sgst = (gst_amount - cgst).quantize(Decimal('0.01'))
        else:
            cgst = Decimal('0.00')
            sgst = Decimal('0.00')
        
        # Update item with calculated values
        item['discount_share'] = discount_share
        item['discounted_line'] = discounted_line
        item['gst_amount'] = gst_amount
        item['cgst_amount'] = cgst
        item['sgst_amount'] = sgst
        # Snapshot rate stored on sale line: 0 when GST not applied for this checkout
        item['gst_percentage'] = master_gst_pct if apply_automatic_gst else Decimal('0.00')
        # line_total_with_gst is same as discounted_line since GST is inclusive
        item['line_total_with_gst'] = discounted_line
        
        total_gst += gst_amount
    
    # 5. Final total = discounted_subtotal (MRP-based, GST already included)
    # DO NOT add GST again - it's already in the MRP
    final_total = discounted_subtotal
    
    return {
        'subtotal': subtotal,
        'discount_amount': discount_amount,
        'discounted_subtotal': discounted_subtotal,
        'total_gst': total_gst,  # For tax reporting only
        'final_total': final_total,
        'items': items,
    }


# =============================================================================
# SALE CREATION (ATOMIC)
# =============================================================================

@transaction.atomic
def process_sale(
    idempotency_key: UUID,
    warehouse_id: Union[str, UUID],
    items: List[dict],
    payments: List[dict],
    user,
    discount_type: Optional[str] = None,
    discount_value: Decimal = Decimal('0.00'),
    customer_name: str = '',
    customer_id: Optional[UUID] = None,
    customer_mobile: str = '',
    customer_email: str = '',
    customer_address: str = '',
    default_gst_percentage: Decimal = Decimal('0.00'),
    apply_automatic_gst: bool = True,
    store_id: Optional[Union[str, UUID]] = None,
) -> Sale:
    """
    Process a complete sale transaction atomically.
    
    This is the ONLY way to create a sale. Direct model manipulation is forbidden.
    
    PHASE 13.1 CALCULATION ORDER (LOCKED):
    1. subtotal = sum(line_totals)
    2. discount_amount = apply discount on subtotal
    3. discounted_subtotal = subtotal - discount_amount (amount due; GST-inclusive MRP)
    4. If apply_automatic_gst: per line, extract GST from discounted line for CGST/SGST;
       if False, line GST amounts and stored gst_percentage are zero (total unchanged).
    5. total_gst = sum(line GST) for reporting
    6. final_total = discounted_subtotal (do not add GST again)
    
    FLOW:
    1. Check idempotency (return existing if duplicate)
    2. Validate warehouse
    3. Resolve products by barcode
    4. Check stock for each item
    5. Calculate line totals, subtotal, discount, GST, total
    6. Validate payments sum == total
    7. Create Sale, SaleItems (with GST), Payments
    8. Create inventory movements (SALE type)
    9. Commit transaction
    
    Any failure → rollback everything.
    
        Args:
        idempotency_key: Client-provided UUID for duplicate prevention
        warehouse_id: Warehouse UUID
        items: List of {'barcode': str, 'quantity': int, 'gst_percentage': Decimal (optional)}
        payments: List of {'method': str, 'amount': Decimal}
        user: User creating the sale
        discount_type: 'PERCENT' or 'FLAT' (optional)
        discount_value: Discount value (optional)
        customer_name: Optional customer name (snapshot on Sale)
        customer_id: Optional linked Customer UUID
        customer_mobile, customer_email, customer_address: Optional contact snapshot;
            blank values are filled from the linked Customer when customer_id is set
        default_gst_percentage: Default GST % to apply if not specified per item
        apply_automatic_gst: If True, extract CGST/SGST from GST-inclusive line
            amounts (product GST%). If False (default), line GST snapshots are zero;
            amount due is unchanged.
        store_id: Optional shop counter UUID for sale attribution (stock still
            moves on warehouse_id)
    
    Returns:
        Sale object
    
    Raises:
        InvalidBarcodeError: If barcode not found
        InactiveProductError: If product is inactive
        InsufficientStockError: If stock is insufficient
        PaymentMismatchError: If payments don't equal total
        InvalidDiscountError: If discount is invalid
        InvalidGSTError: If GST percentage is invalid
        WarehouseNotFoundError: If warehouse not found
        SaleError: If store_id is invalid
    """
    # 1. Check idempotency
    existing = _check_existing_sale(idempotency_key)
    if existing:
        if existing.status == Sale.Status.COMPLETED:
            return existing  # Return existing completed sale
        elif existing.status == Sale.Status.PENDING:
            return existing  # Still processing
        # If FAILED, we can retry (but use same id)
    
    # 2. Validate warehouse
    org_id = getattr(user, "organization_id", None) if user else None
    try:
        wh_qs = Warehouse.objects.select_for_update().filter(pk=warehouse_id, is_active=True)
        if org_id:
            wh_qs = wh_qs.filter(organization_id=org_id)
        warehouse = wh_qs.get()
    except Warehouse.DoesNotExist:
        raise WarehouseNotFoundError(f"Warehouse {warehouse_id} not found or inactive")

    store = None
    if store_id is not None:
        from inventory.models import Store
        try:
            store_qs = Store.objects.filter(pk=store_id, is_active=True)
            if org_id:
                store_qs = store_qs.filter(organization_id=org_id)
            store = store_qs.get()
        except Store.DoesNotExist:
            raise SaleError(f"Shop {store_id} not found or inactive")

    customer = None
    if customer_id is not None:
        from customers.models import Customer
        try:
            cust_qs = Customer.objects.filter(pk=customer_id, is_active=True)
            if org_id:
                cust_qs = cust_qs.filter(organization_id=org_id)
            customer = cust_qs.get()
        except Customer.DoesNotExist:
            raise SaleError(f"Customer {customer_id} not found or inactive")

    def _snap(s: Optional[str]) -> str:
        if s is None:
            return ''
        return str(s).strip()

    req_name = _snap(customer_name)
    req_mobile = _snap(customer_mobile)
    req_email = _snap(customer_email)
    req_address = _snap(customer_address)

    # Auto-collect invoice buyers into CRM — unique by mobile or email (per org)
    if customer is None and (req_mobile or req_email or req_name):
        from customers.services import upsert_from_checkout
        customer = upsert_from_checkout(
            name=req_name,
            phone=req_mobile,
            email=req_email,
            address=req_address,
            organization_id=org_id,
        )

    if customer is not None:
        snapshot_name = req_name or (customer.name or '').strip()
        snapshot_mobile = req_mobile or (customer.phone or '').strip()
        snapshot_email = req_email or (customer.email or '').strip()
        snapshot_address = req_address or (customer.address or '').strip()
    else:
        snapshot_name = req_name
        snapshot_mobile = req_mobile
        snapshot_email = req_email
        snapshot_address = req_address

    snapshot_mobile = snapshot_mobile[:20]
    
    # Validate default GST percentage
    validate_gst_percentage(default_gst_percentage)
    
    # 3. Resolve products and validate stock
    resolved_items = []
    for item in items:
        barcode = (item.get('barcode') or '').strip()
        product_id = item.get('product_id')
        quantity = item.get('quantity', 1)
        gst_percentage = Decimal(str(item.get('gst_percentage', default_gst_percentage)))
        
        if not barcode and not product_id:
            raise InvalidBarcodeError("Each item needs a barcode or product id")
        
        if quantity < 1:
            label = barcode or str(product_id)
            raise SaleError(f"Invalid quantity for {label}: {quantity}")
        
        # Validate GST percentage
        validate_gst_percentage(gst_percentage)
        
        # Lookup product by barcode, else by id (barcode-optional mode)
        if barcode:
            product = lookup_product_by_barcode(barcode)
        else:
            try:
                product = Product.objects.get(pk=product_id)
            except Product.DoesNotExist:
                raise InvalidBarcodeError(f"No product found with id: {product_id}")
            if not product.is_active:
                raise InactiveProductError(f"Product {product_id} is inactive")
        
        # Check stock
        check_stock_availability(product, warehouse, quantity)
        
        # Phase 17.1: Get selling price from ProductPricing (authoritative source)
        selling_price = Decimal('0.00')
        cost_price = Decimal('0.00')
        product_gst_percentage = gst_percentage  # Use provided or default
        
        # Try ProductPricing first (Phase 17.1: authoritative source)
        if hasattr(product, 'pricing') and product.pricing:
            selling_price = product.pricing.selling_price or Decimal('0.00')
            cost_price = product.pricing.cost_price or Decimal('0.00')
            # Use pricing GST if not explicitly provided in item
            if item.get('gst_percentage') is None:
                product_gst_percentage = product.pricing.gst_percentage or Decimal('0.00')
        else:
            # Fallback: Try matched variant if present
            matched_variant = getattr(product, '_matched_variant', None)
            if matched_variant and matched_variant.selling_price:
                selling_price = matched_variant.selling_price
                cost_price = matched_variant.cost_price or Decimal('0.00')
            elif hasattr(product, 'variants') and product.variants.exists():
                variant = product.variants.first()
                if variant.selling_price:
                    selling_price = variant.selling_price
                    cost_price = variant.cost_price or Decimal('0.00')
        
        if selling_price <= 0:
            label = barcode or product.name or str(product_id)
            raise SaleError(f"Product {label} has no valid selling price. Please set pricing first.")
        
        # Calculate line total (before GST)
        line_total = (selling_price * quantity).quantize(Decimal('0.01'))
        
        # Capture variant snapshot for invoice if matched
        matched_variant = getattr(product, '_matched_variant', None)
        variant_snapshot = None
        if matched_variant:
            variant_snapshot = {
                'sku': matched_variant.sku,
                'size': matched_variant.size or '',
                'color': matched_variant.color or '',
            }
        
        resolved_items.append({
            'product': product,
            'product_name': product.name,  # Phase 17.1: Snapshot product name
            'product_sku': product.sku,    # Phase 17.1: Snapshot SKU
            'quantity': quantity,
            'selling_price': selling_price,
            'cost_price': cost_price,      # Phase 17.1: Snapshot cost price
            'line_total': line_total,
            'gst_percentage': product_gst_percentage,
            'variant_snapshot': variant_snapshot,
        })
    
    # 4. Calculate all totals using official order (Phase 13.1)
    totals = calculate_sale_totals(
        resolved_items,
        discount_type,
        discount_value,
        apply_automatic_gst=apply_automatic_gst,
    )
    
    subtotal = totals['subtotal']
    discount_amount = totals['discount_amount']
    total_gst = totals['total_gst']
    final_total = totals['final_total']
    
    # Ensure total is positive
    if final_total <= 0:
        raise InvalidDiscountError("Total after discount must be positive")
    
    # 5. Validate payments (may be less than total for on-account / partial checkout)
    eps = Decimal('0.01')
    payments_total = sum(
        (Decimal(str(p.get('amount', 0))) for p in payments),
        Decimal('0'),
    )
    if payments_total > final_total + eps:
        raise PaymentMismatchError(
            f"Payments total ({payments_total}) exceeds sale total ({final_total})"
        )

    immediate_paid = sum(
        (
            Decimal(str(p.get('amount', 0)))
            for p in payments
            if str(p.get('method', '')).upper() != 'CREDIT'
        ),
        Decimal('0'),
    )
    credit_row_total = sum(
        (
            Decimal(str(p.get('amount', 0)))
            for p in payments
            if str(p.get('method', '')).upper() == 'CREDIT'
        ),
        Decimal('0'),
    )

    outstanding = (final_total - payments_total).quantize(Decimal('0.01'))
    if credit_row_total > 0:
        credit_balance_initial = credit_row_total
    elif outstanding > 0:
        credit_balance_initial = outstanding
    else:
        credit_balance_initial = Decimal('0.00')

    is_credit_sale = credit_balance_initial > 0
    credit_amount_initial = credit_balance_initial
    credit_status = Sale.CreditStatus.PENDING if is_credit_sale else Sale.CreditStatus.NONE

    if credit_balance_initial <= eps:
        payment_status = Sale.PaymentStatus.PAID
    elif immediate_paid > eps:
        payment_status = Sale.PaymentStatus.PARTIAL
    else:
        payment_status = Sale.PaymentStatus.UNPAID

    paid_amount_initial = immediate_paid.quantize(Decimal('0.01'))
    due_amount_initial = credit_balance_initial.quantize(Decimal('0.01'))
    
    # 6. Generate invoice number
    invoice_number = InvoiceSequence.get_next_sale_invoice_number()
    
    # 7. Create Sale
    sale = Sale.objects.create(
        idempotency_key=idempotency_key,
        invoice_number=invoice_number,
        warehouse=warehouse,
        store=store,
        customer=customer,
        organization_id=org_id,
        customer_name=snapshot_name,
        customer_mobile=snapshot_mobile,
        customer_email=snapshot_email,
        customer_address=snapshot_address,
        subtotal=subtotal,
        discount_type=discount_type,
        discount_value=discount_value,
        total_gst=total_gst,
        total=final_total,
        total_items=sum(item['quantity'] for item in resolved_items),
        status=Sale.Status.PENDING,
        created_by=user,
        is_credit_sale=is_credit_sale,
        credit_amount=credit_amount_initial,
        credit_balance=credit_balance_initial,
        credit_status=credit_status,
        payment_status=payment_status,
        paid_amount=paid_amount_initial,
        due_amount=due_amount_initial,
    )
    
    # 8. Create SaleItems (with GST breakdown)
    for item in resolved_items:
        SaleItem.objects.create(
            sale=sale,
            product=item['product'],
            quantity=item['quantity'],
            selling_price=item['selling_price'],
            line_total=item['line_total'],
            gst_percentage=item['gst_percentage'],
            gst_amount=item['gst_amount'],
            line_total_with_gst=item['line_total_with_gst'],
            purchase_price_snapshot=item.get('cost_price') or Decimal('0.00'),
            cgst_amount=item['cgst_amount'],
            sgst_amount=item['sgst_amount'],
        )
    
    # 9. Create Payments
    for payment in payments:
        Payment.objects.create(
            sale=sale,
            method=payment['method'],
            amount=Decimal(str(payment['amount'])),
        )
    
    # 10. Create inventory movements (SALE type with negative quantity)
    for item in resolved_items:
        create_inventory_movement(
            product_id=item['product'].id,
            movement_type='SALE',
            quantity=-item['quantity'],  # Negative for sales
            user=user,
            warehouse_id=warehouse.id,
            reference_type='sale',
            reference_id=sale.id,
            remarks=f"Sale {invoice_number}"
        )
    
    # 11. Mark sale as completed
    sale.status = Sale.Status.COMPLETED
    sale.save()
    
    # 12. Auto-generate invoice for the completed sale
    try:
        from invoices.services import generate_invoice_for_sale
        invoice = generate_invoice_for_sale(str(sale.id))
        # Attach invoice hints for caller (no DB change on Sale)
        sale._generated_invoice = invoice  # type: ignore[attr-defined]
    except Exception:
        # Do not fail the sale if invoice generation fails; caller can retry
        sale._generated_invoice = None  # type: ignore[attr-defined]
    
    return sale


# =============================================================================
# SALE RETRIEVAL
# =============================================================================

def get_sale_details(sale_id: Union[str, UUID]) -> dict:
    """
    Get complete sale details including items and payments.
    """
    try:
        sale = Sale.objects.prefetch_related(
            'items__product',
            'payments'
        ).get(pk=sale_id)
    except Sale.DoesNotExist:
        return None
    
    items = []
    for item in sale.items.all():
        items.append({
            'product_id': str(item.product.id),
            'product_sku': item.product.sku,
            'product_barcode': item.product.barcode,
            'product_name': item.product.name,
            'quantity': item.quantity,
            'selling_price': str(item.selling_price),
            'line_total': str(item.line_total),
            'gst_percentage': str(item.gst_percentage),
            'gst_amount': str(item.gst_amount),
            'cgst_amount': str(item.cgst_amount),
            'sgst_amount': str(item.sgst_amount),
            'purchase_price_snapshot': str(item.purchase_price_snapshot),
        })
    
    payments = []
    for payment in sale.payments.all():
        payments.append({
            'id': str(payment.id),
            'method': payment.method,
            'amount': str(payment.amount),
            'created_at': payment.created_at.isoformat(),
        })
    
    return {
        'id': str(sale.id),
        'invoice_number': sale.invoice_number,
        'warehouse_id': str(sale.warehouse.id),
        'warehouse_name': sale.warehouse.name,
        'store_id': str(sale.store_id) if sale.store_id else None,
        'store_name': sale.store.name if sale.store_id else None,
        'store_code': sale.store.code if sale.store_id else None,
        'customer_id': str(sale.customer_id) if sale.customer_id else None,
        'customer_name': sale.customer_name,
        'customer_mobile': sale.customer_mobile,
        'customer_email': sale.customer_email,
        'customer_address': sale.customer_address,
        'payment_status': sale.payment_status,
        'paid_amount': str(sale.paid_amount),
        'due_amount': str(sale.due_amount),
        'subtotal': str(sale.subtotal),
        'discount_type': sale.discount_type,
        'discount_value': str(sale.discount_value),
        'discount_amount': str(sale.discount_amount),
        'total': str(sale.total),
        'total_items': sale.total_items,
        'status': sale.status,
        'created_by': sale.created_by.username if sale.created_by else None,
        'created_at': sale.created_at.isoformat(),
        'items': items,
        'payments': payments,
    }
