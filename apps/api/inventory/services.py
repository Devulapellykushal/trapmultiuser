"""
Inventory Services for Quake Inventory System.
Core business logic for stock management with ledger-based approach.

CRITICAL: All stock changes MUST go through this service layer.
Direct manipulation of StockLedger or StockSnapshot is forbidden.
"""

from decimal import Decimal
from typing import Optional
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone

from .models import (
    Warehouse,
    Product,
    ProductVariant,
    StockLedger,
    StockSnapshot,
)


class InsufficientStockError(Exception):
    """Raised when attempting to reduce stock below zero."""
    pass


class InvalidEventError(Exception):
    """Raised when an invalid stock event is attempted."""
    pass


def get_current_stock(variant: ProductVariant, warehouse: Warehouse) -> int:
    """
    Get current stock for a variant in a warehouse from snapshot.
    Falls back to ledger calculation if snapshot doesn't exist.
    """
    try:
        snapshot = StockSnapshot.objects.get(variant=variant, warehouse=warehouse)
        return snapshot.quantity
    except StockSnapshot.DoesNotExist:
        # Calculate from ledger if snapshot doesn't exist
        from django.db.models import Sum
        total = StockLedger.objects.filter(
            variant=variant,
            warehouse=warehouse
        ).aggregate(total=Sum('quantity'))['total']
        return total or 0


def validate_stock_event(
    variant: ProductVariant,
    warehouse: Warehouse,
    event_type: str,
    quantity: int,
    allow_negative: bool = False
) -> None:
    """
    Validate a stock event before recording.
    
    Args:
        variant: The product variant
        warehouse: The warehouse
        event_type: Type of event (PURCHASE, SALE, RETURN, ADJUSTMENT)
        quantity: Quantity change (positive or negative)
        allow_negative: Whether to allow resulting negative stock
    
    Raises:
        InvalidEventError: If event parameters are invalid
        InsufficientStockError: If event would result in negative stock
    """
    # Validate event type
    valid_event_types = [choice[0] for choice in StockLedger.EventType.choices]
    if event_type not in valid_event_types:
        raise InvalidEventError(f"Invalid event type: {event_type}")
    
    # Validate quantity
    if quantity == 0:
        raise InvalidEventError("Quantity cannot be zero")
    
    # Check for negative stock result
    if not allow_negative and quantity < 0:
        current_stock = get_current_stock(variant, warehouse)
        resulting_stock = current_stock + quantity
        if resulting_stock < 0:
            raise InsufficientStockError(
                f"Insufficient stock. Current: {current_stock}, "
                f"Requested: {abs(quantity)}, Would result in: {resulting_stock}"
            )


@transaction.atomic
def record_stock_event(
    variant: ProductVariant,
    warehouse: Warehouse,
    event_type: str,
    quantity: int,
    reference_type: str,
    reference_id: Optional[str] = None,
    notes: str = "",
    created_by: Optional[str] = None,
    allow_negative: bool = False
) -> StockLedger:
    """
    Record a stock event in the ledger and update snapshot.
    
    This is the ONLY way to modify stock. Direct edits are forbidden.
    
    Args:
        variant: The product variant
        warehouse: The warehouse
        event_type: Type of event (PURCHASE, SALE, RETURN, ADJUSTMENT)
        quantity: Quantity change (positive for additions, negative for deductions)
        reference_type: Type of reference (purchase, sale, adjustment, return)
        reference_id: Optional reference ID (e.g., PO number)
        notes: Optional notes
        created_by: User who created this entry
        allow_negative: Whether to allow negative stock (for adjustments)
    
    Returns:
        The created StockLedger entry
    
    Raises:
        InvalidEventError: If event parameters are invalid
        InsufficientStockError: If event would result in negative stock
    """
    # Lock the snapshot row for update to prevent race conditions
    snapshot = StockSnapshot.objects.select_for_update().filter(
        variant=variant,
        warehouse=warehouse
    ).first()
    
    # Validate the event
    validate_stock_event(
        variant=variant,
        warehouse=warehouse,
        event_type=event_type,
        quantity=quantity,
        allow_negative=allow_negative
    )
    
    # Create ledger entry
    ledger_entry = StockLedger.objects.create(
        variant=variant,
        warehouse=warehouse,
        event_type=event_type,
        quantity=quantity,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes,
        created_by=created_by
    )
    
    # Update snapshot
    if snapshot:
        snapshot.quantity += quantity
        snapshot.save()
    else:
        StockSnapshot.objects.create(
            variant=variant,
            warehouse=warehouse,
            quantity=quantity
        )
    
    return ledger_entry


@transaction.atomic
def record_purchase(
    variant: ProductVariant,
    warehouse: Warehouse,
    quantity: int,
    reference_id: Optional[str] = None,
    notes: str = "",
    created_by: Optional[str] = None
) -> StockLedger:
    """
    Record a purchase (stock addition).
    Quantity must be positive.
    """
    if quantity <= 0:
        raise InvalidEventError("Purchase quantity must be positive")
    
    return record_stock_event(
        variant=variant,
        warehouse=warehouse,
        event_type=StockLedger.EventType.PURCHASE,
        quantity=quantity,  # Positive for additions
        reference_type=StockLedger.ReferenceType.PURCHASE,
        reference_id=reference_id,
        notes=notes,
        created_by=created_by
    )


@transaction.atomic
def record_sale(
    variant: ProductVariant,
    warehouse: Warehouse,
    quantity: int,
    reference_id: Optional[str] = None,
    notes: str = "",
    created_by: Optional[str] = None
) -> StockLedger:
    """
    Record a sale (stock deduction).
    Quantity must be positive (will be stored as negative).
    """
    if quantity <= 0:
        raise InvalidEventError("Sale quantity must be positive")
    
    return record_stock_event(
        variant=variant,
        warehouse=warehouse,
        event_type=StockLedger.EventType.SALE,
        quantity=-quantity,  # Negative for deductions
        reference_type=StockLedger.ReferenceType.SALE,
        reference_id=reference_id,
        notes=notes,
        created_by=created_by
    )


@transaction.atomic
def record_return(
    variant: ProductVariant,
    warehouse: Warehouse,
    quantity: int,
    reference_id: Optional[str] = None,
    notes: str = "",
    created_by: Optional[str] = None
) -> StockLedger:
    """
    Record a return (stock addition).
    Quantity must be positive.
    """
    if quantity <= 0:
        raise InvalidEventError("Return quantity must be positive")
    
    return record_stock_event(
        variant=variant,
        warehouse=warehouse,
        event_type=StockLedger.EventType.RETURN,
        quantity=quantity,  # Positive for additions
        reference_type=StockLedger.ReferenceType.RETURN,
        reference_id=reference_id,
        notes=notes,
        created_by=created_by
    )


@transaction.atomic
def record_adjustment(
    variant: ProductVariant,
    warehouse: Warehouse,
    quantity: int,
    notes: str = "",
    created_by: Optional[str] = None,
    allow_negative: bool = False
) -> StockLedger:
    """
    Record a stock adjustment (can be positive or negative).
    Used for corrections, inventory counts, etc.
    """
    if quantity == 0:
        raise InvalidEventError("Adjustment quantity cannot be zero")
    
    return record_stock_event(
        variant=variant,
        warehouse=warehouse,
        event_type=StockLedger.EventType.ADJUSTMENT,
        quantity=quantity,
        reference_type=StockLedger.ReferenceType.ADJUSTMENT,
        notes=notes,
        created_by=created_by,
        allow_negative=allow_negative
    )


def get_stock_summary(organization_id=None):
    """
    Get a summary of stock for one organization.

    Phase 11.1: Stock is derived from InventoryMovement ledger.
    CRITICAL: never aggregate across organizations.
    """
    from django.db.models import Sum, Value
    from django.db.models.functions import Coalesce
    from .models import Product

    products_qs = Product.objects.filter(is_active=True, is_deleted=False)
    if organization_id is None:
        products_qs = products_qs.none()
    else:
        products_qs = products_qs.filter(organization_id=organization_id)

    # Get products with their derived stock from ledger
    # Convert to list to avoid queryset exhaustion
    products_with_stock = list(products_qs.annotate(
        available_stock=Coalesce(
            Sum("inventory_movements__quantity"),
            Value(0)
        )
    ).values('id', 'name', 'sku', 'available_stock'))
    
    # Calculate totals
    total_stock = 0
    low_stock_items = []
    out_of_stock_items = []
    
    # Default threshold (can be made product-specific in future)
    default_threshold = 10
    
    for product in products_with_stock:
        stock = product['available_stock'] or 0
        total_stock += stock
        
        if stock <= 0:
            out_of_stock_items.append({
                'product_id': str(product['id']),
                'sku': product['sku'],
                'product_name': product['name'],
                'quantity': stock
            })
        elif stock <= default_threshold:
            low_stock_items.append({
                'product_id': str(product['id']),
                'sku': product['sku'],
                'product_name': product['name'],
                'quantity': stock,
                'threshold': default_threshold
            })
    
    return {
        'total_stock': total_stock,
        'total_products': len(products_with_stock),
        'low_stock_count': len(low_stock_items),
        'out_of_stock_count': len(out_of_stock_items),
        'low_stock_items': low_stock_items,
        'out_of_stock_items': out_of_stock_items
    }


def get_variant_stock_breakdown(variant: ProductVariant):
    """
    Get warehouse-wise stock breakdown for a variant.
    """
    snapshots = StockSnapshot.objects.filter(
        variant=variant
    ).select_related('warehouse')
    
    return [
        {
            'warehouse_id': str(s.warehouse_id),
            'warehouse_name': s.warehouse.name,
            'warehouse_code': s.warehouse.code,
            'quantity': s.quantity,
            'last_updated': s.last_updated
        }
        for s in snapshots
    ]


# =============================================================================
# PHASE 11 + 12: INVENTORY LEDGER SERVICES
# =============================================================================

from uuid import UUID
from typing import Union
from .models import InventoryMovement


class InsufficientProductStockError(Exception):
    """Raised when attempting to reduce product stock below zero."""
    pass


class InvalidMovementError(Exception):
    """Raised when an invalid inventory movement is attempted."""
    pass


class DuplicateOpeningStockError(Exception):
    """Raised when attempting to create duplicate opening stock for a product+warehouse."""
    pass



def get_product_stock(
    product_id: Union[UUID, str],
    warehouse_id: Union[UUID, str, None] = None
) -> int:
    """
    Get current stock for a product by summing all inventory movements.
    
    CORE PRINCIPLE:
        Stock = SUM(inventory_movements.quantity)
    
    Args:
        product_id: UUID of the product
        warehouse_id: Optional warehouse UUID for location-specific stock
    
    Returns:
        Current stock quantity (can be 0, never negative in valid systems)
    """
    from django.db.models import Sum
    
    queryset = InventoryMovement.objects.filter(product_id=product_id)
    
    if warehouse_id:
        queryset = queryset.filter(warehouse_id=warehouse_id)
    
    total = queryset.aggregate(total=Sum('quantity'))['total']
    return total or 0


def get_product_stock_breakdown_by_warehouse(
    product_id: Union[UUID, str],
) -> list[dict]:
    """
    Net quantity per warehouse from the InventoryMovement ledger.

    Mirrors Product-level stock (movements attach to Product, not variant).
    Skips movements with null warehouse_id (store-only rows, legacy data).
    """
    from django.db.models import Sum, Max

    rows = (
        InventoryMovement.objects.filter(
            product_id=product_id,
            warehouse_id__isnull=False,
        )
        .values(
            'warehouse_id',
            'warehouse__name',
            'warehouse__code',
        )
        .annotate(
            quantity=Sum('quantity'),
            last_updated=Max('created_at'),
        )
        .order_by('warehouse__name', 'warehouse_id')
    )
    breakdown: list[dict] = []
    for row in rows:
        qty = row['quantity'] or 0
        breakdown.append(
            {
                'warehouse_id': row['warehouse_id'],
                'warehouse_name': row['warehouse__name'] or '',
                'warehouse_code': row['warehouse__code'] or '',
                'quantity': int(qty),
                'last_updated': row['last_updated'],
            }
        )
    return breakdown


def get_store_product_stock(
    product_id: Union[UUID, str],
    store_id: Union[UUID, str]
) -> int:
    """
    Get current stock for a product at a specific store.
    
    CORE PRINCIPLE:
        Store Stock = SUM(inventory_movements.quantity) WHERE store_id = given store
    
    Store inventory is tracked separately from warehouse inventory.
    Stock arrives at stores via TRANSFER_IN movements from warehouses.
    
    Args:
        product_id: UUID of the product
        store_id: UUID of the store
    
    Returns:
        Current stock quantity at the store (can be 0, never negative in valid systems)
    """
    from django.db.models import Sum
    
    total = InventoryMovement.objects.filter(
        product_id=product_id,
        store_id=store_id
    ).aggregate(total=Sum('quantity'))['total']
    
    return total or 0


def validate_sale_stock_availability(
    product_id: Union[UUID, str],
    quantity_to_sell: int,
    warehouse_id: Union[UUID, str, None] = None
) -> int:
    """
    Validate that sufficient stock exists for a sale.
    
    Args:
        product_id: UUID of the product
        quantity_to_sell: Positive integer of units to sell
        warehouse_id: Optional warehouse UUID
    
    Returns:
        Available stock if sufficient
    
    Raises:
        InsufficientProductStockError: If stock is insufficient
    """
    if quantity_to_sell <= 0:
        raise InvalidMovementError("Sale quantity must be positive")
    
    available_stock = get_product_stock(product_id, warehouse_id)
    
    if available_stock < quantity_to_sell:
        raise InsufficientProductStockError(
            f"Insufficient stock. Available: {available_stock}, "
            f"Requested: {quantity_to_sell}"
        )
    
    return available_stock


@transaction.atomic
def create_inventory_movement(
    product_id: Union[UUID, str],
    movement_type: str,
    quantity: int,
    user,  # CustomUser instance
    warehouse_id: Union[UUID, str, None] = None,
    warehouse=None,
    store=None,
    reference_type: str = "",
    reference_id: Union[UUID, str, None] = None,
    remarks: str = ""
) -> InventoryMovement:
    """
    Create an inventory movement record.
    
    This is the ONLY way to modify inventory. Direct stock edits are forbidden.
    
    Args:
        product_id: UUID of the product
        movement_type: One of OPENING, PURCHASE, SALE, RETURN, ADJUSTMENT, DAMAGE, TRANSFER_IN, TRANSFER_OUT
        quantity: Quantity with appropriate sign (+/-) based on movement type
        user: The user creating this movement (for audit trail)
        warehouse_id: Optional warehouse UUID
        warehouse: Optional warehouse object
        store: Optional store object (for store-level movements like TRANSFER_IN to stores)
        reference_type: Type of reference document
        reference_id: UUID of reference document
        remarks: Additional notes
    
    Returns:
        Created InventoryMovement instance
    
    Raises:
        InvalidMovementError: If movement parameters are invalid
        InsufficientProductStockError: If sale would result in negative stock
    """
    from .models import Product
    
    # Validate movement type
    valid_types = [t[0] for t in InventoryMovement.MovementType.choices]
    if movement_type not in valid_types:
        raise InvalidMovementError(f"Invalid movement type: {movement_type}")
    
    # Validate product exists
    if not Product.objects.filter(id=product_id, is_deleted=False).exists():
        raise InvalidMovementError(f"Product not found or deleted: {product_id}")
    
    # Validate quantity sign based on movement type
    if movement_type in InventoryMovement.POSITIVE_ONLY_TYPES and quantity <= 0:
        raise InvalidMovementError(
            f"{movement_type} movements must have positive quantity"
        )
    
    if movement_type in InventoryMovement.NEGATIVE_ONLY_TYPES and quantity >= 0:
        raise InvalidMovementError(
            f"{movement_type} movements must have negative quantity"
        )
    
    if quantity == 0:
        raise InvalidMovementError("Quantity cannot be zero")
    
    # Phase 12: Validate warehouse requirement for certain movement types
    warehouse_required_types = {'OPENING', 'PURCHASE', 'SALE', 'TRANSFER_OUT'}
    store_allowed_types = {'TRANSFER_IN', 'SALE'}  # SALE can happen at store level too
    
    if movement_type in warehouse_required_types and not warehouse_id and not warehouse:
        raise InvalidMovementError(
            f"{movement_type} movements require a warehouse"
        )
    
    # For TRANSFER_IN, either warehouse or store is required
    if movement_type == 'TRANSFER_IN' and not warehouse_id and not warehouse and not store:
        raise InvalidMovementError(
            "TRANSFER_IN movements require either a warehouse or store"
        )
    
    # For negative movements (SALE, DAMAGE, TRANSFER_OUT), validate stock availability
    if quantity < 0:
        current_stock = get_product_stock(product_id, warehouse_id)
        resulting_stock = current_stock + quantity  # quantity is negative
        if resulting_stock < 0:
            raise InsufficientProductStockError(
                f"Insufficient stock. Current: {current_stock}, "
                f"Change: {quantity}, Would result in: {resulting_stock}"
            )
    
    # Resolve warehouse - can be passed as object or ID
    warehouse_obj = warehouse
    if warehouse_id and not warehouse_obj:
        from .models import Warehouse
        warehouse_obj = Warehouse.objects.filter(pk=warehouse_id).first()
    
    # Create the movement record
    movement = InventoryMovement.objects.create(
        product_id=product_id,
        warehouse=warehouse_obj,
        store=store,
        movement_type=movement_type,
        quantity=quantity,
        reference_type=reference_type,
        reference_id=reference_id,
        remarks=remarks,
        created_by=user
    )
    
    return movement


def get_product_movement_history(
    product_id: Union[UUID, str],
    movement_type: str = None,
    start_date=None,
    end_date=None,
    limit: int = 100
) -> list:
    """
    Get movement history for a product.
    
    Args:
        product_id: UUID of the product
        movement_type: Optional filter by movement type
        start_date: Optional start date filter
        end_date: Optional end date filter
        limit: Maximum records to return
    
    Returns:
        List of InventoryMovement records
    """
    queryset = InventoryMovement.objects.filter(
        product_id=product_id
    ).select_related('product', 'created_by')
    
    if movement_type:
        queryset = queryset.filter(movement_type=movement_type)
    
    if start_date:
        queryset = queryset.filter(created_at__gte=start_date)
    
    if end_date:
        queryset = queryset.filter(created_at__lte=end_date)
    
    return list(queryset[:limit])


# =============================================================================
# PHASE 12: OPENING STOCK SERVICE
# =============================================================================

@transaction.atomic
def create_opening_stock(
    product_id: Union[UUID, str],
    warehouse_id: Union[UUID, str],
    quantity: int,
    user
) -> InventoryMovement:
    """
    Create opening stock for a product in a warehouse.
    
    PHASE 12 CORE RULE:
        Opening stock is not a field. It is a ledger entry.
    
    RULES:
    - Only ONE opening stock per product per warehouse
    - Quantity MUST be positive
    - Cannot be created if ANY movement already exists for product+warehouse
    - Product must exist and be active
    - Warehouse must exist and be active
    
    Args:
        product_id: UUID of the product
        warehouse_id: UUID of the warehouse
        quantity: Opening stock quantity (must be positive)
        user: User creating the opening stock
    
    Returns:
        Created InventoryMovement record
    
    Raises:
        DuplicateOpeningStockError: If opening stock already exists
        InvalidMovementError: If validation fails
        Product.DoesNotExist: If product not found
        Warehouse.DoesNotExist: If warehouse not found
    """
    from .models import Product, Warehouse
    
    # Validate quantity is positive
    if quantity <= 0:
        raise InvalidMovementError("Opening stock quantity must be positive")
    
    # Validate product exists and is active
    product = Product.objects.select_for_update().get(pk=product_id)
    if not product.is_active:
        raise InvalidMovementError(f"Product {product.sku} is not active")
    if product.is_deleted:
        raise InvalidMovementError(f"Product {product.sku} is deleted")
    
    # Validate warehouse exists and is active
    warehouse = Warehouse.objects.get(pk=warehouse_id)
    if not warehouse.is_active:
        raise InvalidMovementError(f"Warehouse {warehouse.code} is not active")
    
    # Check for ANY existing movement for this product+warehouse
    existing_movement = InventoryMovement.objects.filter(
        product_id=product_id,
        warehouse_id=warehouse_id
    ).exists()
    
    if existing_movement:
        raise DuplicateOpeningStockError(
            f"Opening stock for product {product.sku} in warehouse {warehouse.code} "
            f"already exists or other movements exist. Opening stock can only be "
            f"created as the first movement for a product+warehouse combination."
        )
    
    # Create the opening stock movement
    movement = InventoryMovement.objects.create(
        product=product,
        warehouse=warehouse,
        movement_type='OPENING',
        quantity=quantity,
        reference_type='opening_stock',
        remarks=f'Opening stock created by {user.username}',
        created_by=user
    )
    
    return movement


# =============================================================================
# PHASE 15: STOCK ADJUSTMENTS
# =============================================================================

class InvalidAdjustmentError(Exception):
    """Raised when an adjustment is invalid."""
    pass


@transaction.atomic
def create_stock_adjustment(
    product_id: Union[UUID, str],
    warehouse_id: Union[UUID, str],
    quantity: int,
    reason: str,
    user
) -> InventoryMovement:
    """
    Create a manual stock adjustment.
    
    PHASE 15 RULES:
    - Uses ADJUSTMENT movement type
    - Quantity can be positive or negative
    - Reason is mandatory
    - Admin only (enforced at API level)
    - Cannot result in negative stock
    
    Args:
        product_id: UUID of the product
        warehouse_id: UUID of the warehouse
        quantity: Adjustment amount (positive or negative, but not zero)
        reason: Mandatory reason for adjustment
        user: User making the adjustment
    
    Returns:
        InventoryMovement record
    
    Raises:
        InvalidAdjustmentError: If adjustment is invalid
        InsufficientStockError: If would result in negative stock
    """
    from .models import Product, Warehouse
    
    # Validate quantity
    if quantity == 0:
        raise InvalidAdjustmentError("Adjustment quantity cannot be zero")
    
    # Validate reason
    if not reason or not reason.strip():
        raise InvalidAdjustmentError("Reason is required for stock adjustments")
    
    # Validate product exists and is active
    try:
        product = Product.objects.select_for_update().get(pk=product_id)
    except Product.DoesNotExist:
        raise InvalidAdjustmentError(f"Product not found: {product_id}")
    
    if not product.is_active:
        raise InvalidAdjustmentError(f"Product {product.sku} is not active")
    if product.is_deleted:
        raise InvalidAdjustmentError(f"Product {product.sku} is deleted")
    
    # Validate warehouse exists and is active
    try:
        warehouse = Warehouse.objects.get(pk=warehouse_id)
    except Warehouse.DoesNotExist:
        raise InvalidAdjustmentError(f"Warehouse not found: {warehouse_id}")
    
    if not warehouse.is_active:
        raise InvalidAdjustmentError(f"Warehouse {warehouse.code} is not active")
    
    # Check for negative stock result on negative adjustments
    if quantity < 0:
        current_stock = get_product_stock(product_id, warehouse_id)
        resulting_stock = current_stock + quantity
        if resulting_stock < 0:
            raise InsufficientStockError(
                f"Cannot reduce stock by {abs(quantity)}. "
                f"Current stock: {current_stock}. Would result in: {resulting_stock}"
            )
    
    # Create the adjustment movement
    movement = InventoryMovement.objects.create(
        product=product,
        warehouse=warehouse,
        movement_type='ADJUSTMENT',
        quantity=quantity,
        reference_type='stock_adjustment',
        remarks=f'Adjustment: {reason.strip()} (by {user.username})',
        created_by=user
    )
    
    return movement


@transaction.atomic
def consolidate_store_stock_into_warehouse(
    warehouse_id: Union[UUID, str, None] = None,
    user=None,
) -> dict:
    """
    Pull all positive shop-counter stock into one warehouse.

    Used when switching Godown + shops → One shop only.
    Stock is NEVER split across shops — everything gathers into the
    primary warehouse (shown as \"My shop\" in single-shop mode).

    Shared-godown businesses usually have zero store ledger stock, so
    this is often a no-op (godown stock stays put).
    """
    from django.db.models import Sum
    from .models import Warehouse, Store, InventoryMovement

    if user is None:
        raise InvalidMovementError("User is required to consolidate stock")

    warehouses = list(Warehouse.objects.filter(is_active=True).order_by('name'))
    if not warehouses:
        raise InvalidMovementError(
            "Add a godown/shop stock location before switching to one shop."
        )

    target = None
    if warehouse_id:
        target = next((w for w in warehouses if str(w.id) == str(warehouse_id)), None)
        if not target:
            raise InvalidMovementError("Selected stock location not found or inactive")
    else:
        # Prefer the warehouse that already holds the most stock
        best_qty = -1
        for w in warehouses:
            rows = (
                InventoryMovement.objects.filter(warehouse_id=w.id)
                .values('product_id')
                .annotate(qty=Sum('quantity'))
            )
            total = sum(int(r['qty'] or 0) for r in rows if (r['qty'] or 0) > 0)
            if total > best_qty:
                best_qty = total
                target = w
        if target is None:
            target = warehouses[0]

    store_rows = (
        InventoryMovement.objects.filter(store_id__isnull=False)
        .values('store_id', 'product_id')
        .annotate(qty=Sum('quantity'))
        .filter(qty__gt=0)
    )

    lines_moved = 0
    units_moved = 0
    stores_touched: set[str] = set()

    for row in store_rows:
        qty = int(row['qty'] or 0)
        if qty <= 0:
            continue
        store = Store.objects.filter(pk=row['store_id']).first()
        if not store:
            continue

        # Remove from shop ledger
        InventoryMovement.objects.create(
            product_id=row['product_id'],
            warehouse=None,
            store=store,
            movement_type=InventoryMovement.MovementType.ADJUSTMENT,
            quantity=-qty,
            reference_type='mode_switch_single_shop',
            remarks=(
                f"Consolidate to one shop: pulled from {store.name} "
                f"→ {target.name}"
            ),
            created_by=user,
        )
        # Add to primary warehouse (My shop)
        InventoryMovement.objects.create(
            product_id=row['product_id'],
            warehouse=target,
            store=None,
            movement_type=InventoryMovement.MovementType.TRANSFER_IN,
            quantity=qty,
            reference_type='mode_switch_single_shop',
            remarks=(
                f"Consolidate to one shop: received from {store.name}"
            ),
            created_by=user,
        )
        lines_moved += 1
        units_moved += qty
        stores_touched.add(str(store.id))

    return {
        'warehouse_id': str(target.id),
        'warehouse_name': target.name,
        'warehouse_count': len(warehouses),
        'stores_consolidated': len(stores_touched),
        'lines_moved': lines_moved,
        'units_moved': units_moved,
    }



