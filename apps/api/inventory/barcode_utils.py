"""
Barcode Utilities for Quake Inventory System.

Provides Code128 barcode generation for products.
Barcodes are:
- Auto-generated on product creation if not provided
- Include supplier prefix (first 2 letters of supplier name)
- Immutable once created
- Stored as both value and SVG image URL
"""

import os
import uuid
import time
import random
from pathlib import Path


def get_supplier_prefix(supplier_name: str) -> str:
    """
    Extract first 2 letters from supplier name for barcode prefix.
    
    Args:
        supplier_name: Full supplier name (e.g., "Noor Textiles")
    
    Returns:
        2-letter uppercase prefix (e.g., "NO")
    """
    if not supplier_name:
        return "XX"  # Default prefix for unknown supplier
    
    # Remove non-alphabetic characters and get first 2 letters
    clean_name = ''.join(c for c in supplier_name.upper() if c.isalpha())
    if len(clean_name) < 2:
        clean_name = clean_name.ljust(2, 'X')
    return clean_name[:2]


def generate_barcode_value(prefix: str = "Quake", supplier_name: str = None) -> str:
    """
    Generate a unique Code128-compatible barcode value.
    
    Format: {SUPPLIER_PREFIX}{TIMESTAMP_PART}{RANDOM_PART}
    Example: NO168432A7X9K (for supplier "Noor")
    
    Args:
        prefix: Fallback barcode prefix (default: "Quake", ignored if supplier provided)
        supplier_name: Supplier name to derive 2-letter prefix from
    
    Returns:
        Unique barcode string (max 128 chars, machine-readable)
    """
    # Use supplier prefix if provided, otherwise use default
    if supplier_name:
        barcode_prefix = get_supplier_prefix(supplier_name)
    else:
        barcode_prefix = prefix[:2].upper() if prefix else "XX"
    
    timestamp_part = str(int(time.time()))[-6:]  # Last 6 digits of timestamp
    random_part = ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=5))
    
    # Format: XX168432A7X9K (no hyphens for better scanner compatibility)
    barcode = f"{barcode_prefix}{timestamp_part}{random_part}"
    return barcode


def generate_sku(product_name: str, brand: str = "") -> str:
    """
    DEPRECATED: Use generate_retail_sku() instead.
    
    Legacy function kept for backward compatibility.
    Generates a random SKU - NOT recommended for new products.
    """
    # Extract brand code (first 3 chars, uppercase)
    brand_code = ''.join(c for c in brand.upper() if c.isalnum())[:3] or "GEN"
    
    # Extract product code (first 5 consonants/chars)
    name_clean = ''.join(c for c in product_name.upper() if c.isalnum())
    name_code = name_clean[:5] if len(name_clean) >= 5 else name_clean.ljust(5, 'X')
    
    # Random suffix for uniqueness
    random_suffix = ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=4))
    
    sku = f"{brand_code}-{name_code}-{random_suffix}"
    return sku


def generate_retail_sku(brand: str, category: str) -> str:
    """
    Generate a deterministic, retail-grade SKU.
    
    Phase 10.1: Format: {BRAND}-{CATEGORY}-{SEQUENCE:06d}
    Examples:
        Quake-POLO-000001
        NIKE-JACKET-000042
        ZARA-TEE-000123
    
    Rules:
        - Uppercase
        - Hyphen-separated
        - Zero-padded 6-digit sequence
        - Unique across all products
        - Concurrency-safe (uses SELECT FOR UPDATE)
    
    Args:
        brand: Brand name
        category: Category name
    
    Returns:
        Deterministic SKU string
    """
    from .models import SKUSequence
    
    # Normalize to uppercase, alphanumeric only
    brand_code = ''.join(c for c in brand.upper() if c.isalnum())[:10] or "Quake"
    category_code = ''.join(c for c in category.upper() if c.isalnum())[:10] or "ITEM"
    
    # Get next sequence atomically
    sequence = SKUSequence.get_next_sequence(brand, category)
    
    # Format: BRAND-CATEGORY-NNNNNN
    sku = f"{brand_code}-{category_code}-{sequence:06d}"
    return sku


def generate_barcode_svg(barcode_value: str, output_dir: str = None) -> str:
    """
    Generate Code128 barcode as SVG and save to file.
    
    Args:
        barcode_value: The barcode value to encode
        output_dir: Directory to save SVG (default: media/barcodes)
    
    Returns:
        Relative URL path to the generated SVG file
    """
    try:
        import barcode
        from barcode.writer import SVGWriter
    except ImportError:
        # Fallback if python-barcode not installed
        return ""
    
    if output_dir is None:
        # Default to Django media directory
        from django.conf import settings
        output_dir = os.path.join(settings.MEDIA_ROOT, 'barcodes')
    
    # Ensure directory exists
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Generate unique filename
    filename = f"{barcode_value}_{uuid.uuid4().hex[:8]}"
    filepath = os.path.join(output_dir, filename)
    
    # Generate Code128 barcode
    code128 = barcode.get('code128', barcode_value, writer=SVGWriter())
    
    # Save barcode (adds .svg extension automatically)
    saved_path = code128.save(filepath, options={
        'module_width': 0.4,
        'module_height': 15.0,
        'font_size': 10,
        'text_distance': 5.0,
        'quiet_zone': 6.5,
    })
    
    # Return relative URL
    from django.conf import settings
    relative_path = os.path.relpath(saved_path, settings.MEDIA_ROOT)
    return f"/media/{relative_path}"


def validate_barcode_immutability(old_barcode: str, new_barcode: str) -> None:
    """
    Validate that barcode is not being changed.
    
    Args:
        old_barcode: Existing barcode value
        new_barcode: New barcode value being set
    
    Raises:
        ValueError: If attempting to change an existing barcode
    """
    if old_barcode and new_barcode and old_barcode != new_barcode:
        raise ValueError("Barcode cannot be modified after creation.")
