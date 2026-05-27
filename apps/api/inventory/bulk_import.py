"""
Bulk product import from CSV or XLSX.

One row = one product + one default variant + optional product-level pricing and opening stock.
Headers are snake_case (matches API field style). See IMPORT_COLUMNS and template download.
"""

from __future__ import annotations

import csv
import io
import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction

from .models import Supplier, Warehouse
from .serializers import ProductCreateSerializer

MAX_IMPORT_ROWS = 200

# Canonical column order for templates and strict header validation.
IMPORT_COLUMNS: tuple[str, ...] = (
    "warehouse_code",
    "name",
    "brand",
    "category",
    "description",
    "product_code",
    "brand_code",
    "alias",
    "country_of_origin",
    "gender",
    "material",
    "season",
    "attributes_json",
    "supplier_code",
    "is_active",
    "product_sku",
    "product_barcode",
    "pricing_cost_price",
    "pricing_mrp",
    "pricing_selling_price",
    "pricing_gst_percentage",
    "variant_sku",
    "variant_size",
    "variant_color",
    "variant_cost_price",
    "variant_selling_price",
    "variant_reorder_threshold",
    "initial_stock",
)

# Optional friendly aliases -> canonical
HEADER_ALIASES: dict[str, str] = {
    "warehouse": "warehouse_code",
    "warehouse id": "warehouse_code",
    "warehouse_id": "warehouse_code",
    "warehouse code": "warehouse_code",
    "product name": "name",
    "product_name": "name",
    "country of origin": "country_of_origin",
    "countryoforigin": "country_of_origin",
    "gst %": "pricing_gst_percentage",
    "gst_percentage": "pricing_gst_percentage",
    "gst": "pricing_gst_percentage",
    "cost": "pricing_cost_price",
    "mrp": "pricing_mrp",
    "selling price": "pricing_selling_price",
    "selling_price": "pricing_selling_price",
    "reorder": "variant_reorder_threshold",
    "stock": "initial_stock",
    "qty": "initial_stock",
    "quantity": "initial_stock",
    "sku": "product_sku",
    "barcode": "product_barcode",
    "barcode_value": "product_barcode",
}


def _norm_header(h: str) -> str:
    s = (h or "").strip().lstrip("\ufeff").lower()
    s = re.sub(r"\s+", "_", s)
    return HEADER_ALIASES.get(s, s)


def _parse_decimal(cell: Any) -> Decimal | None:
    if cell is None:
        return None
    if isinstance(cell, (int, float)) and not isinstance(cell, bool):
        return Decimal(str(cell))
    t = str(cell).strip()
    if not t:
        return None
    t = t.replace(",", ".")
    try:
        return Decimal(t)
    except InvalidOperation:
        return None


def _parse_int(cell: Any) -> int:
    if cell is None or str(cell).strip() == "":
        return 0
    if isinstance(cell, (int, float)) and not isinstance(cell, bool):
        return int(cell)
    t = str(cell).strip()
    try:
        return int(float(t))
    except ValueError:
        return 0


def _parse_bool(cell: Any) -> bool:
    if isinstance(cell, bool):
        return cell
    if cell is None:
        return True
    t = str(cell).strip().lower()
    if t in ("", "1", "true", "yes", "y"):
        return True
    if t in ("0", "false", "no", "n"):
        return False
    return True


def _parse_attributes(raw: Any) -> dict:
    if raw is None or str(raw).strip() == "":
        return {}
    if isinstance(raw, dict):
        return raw
    t = str(raw).strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid attributes_json: {e}") from e


def parse_csv_bytes(content: bytes) -> list[dict[str, Any]]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")
    rows: list[dict[str, Any]] = []
    for raw in reader:
        row = {_norm_header(k): (v.strip() if isinstance(v, str) else v) for k, v in raw.items() if k}
        if not (str(row.get("name") or "").strip()):
            continue
        rows.append(row)
    return rows


def parse_xlsx_bytes(content: bytes) -> list[dict[str, Any]]:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration as e:
        raise ValueError("XLSX sheet is empty") from e
    headers = [_norm_header(str(c) if c is not None else "") for c in header_row]
    if not any(headers):
        raise ValueError("XLSX has no header row")
    out: list[dict[str, Any]] = []
    for data in rows_iter:
        if data is None or all(c is None or str(c).strip() == "" for c in data):
            continue
        row: dict[str, Any] = {}
        for i, key in enumerate(headers):
            if not key:
                continue
            val = data[i] if i < len(data) else None
            row[key] = val
        out.append(row)
    return out


def _resolve_warehouse(
    row: dict[str, Any],
    default_warehouse_id: str | None,
) -> tuple[Any, str | None]:
    """Returns (Warehouse instance or None, error message)."""
    code = (row.get("warehouse_code") or "").strip()
    if code:
        wh = Warehouse.objects.filter(code__iexact=code, is_active=True).first()
        if not wh:
            return None, f"Unknown warehouse_code: {code!r}"
        return wh, None
    if default_warehouse_id:
        wh = Warehouse.objects.filter(id=default_warehouse_id, is_active=True).first()
        if wh:
            return wh, None
        if Warehouse.objects.filter(id=default_warehouse_id, is_active=False).exists():
            return (
                None,
                "Default warehouse is inactive; activate it or pick an active warehouse",
            )
        return None, "Invalid default_warehouse_id (not found)"
    return None, None


def _resolve_supplier(row: dict[str, Any]) -> Supplier | None:
    code = (row.get("supplier_code") or "").strip()
    if not code:
        return None
    return Supplier.objects.filter(code__iexact=code).first()


def row_to_create_payload(
    row: dict[str, Any],
    *,
    default_warehouse_id: str | None,
) -> tuple[dict[str, Any] | None, str | None]:
    name = (row.get("name") or "").strip()
    brand = (row.get("brand") or "").strip()
    category = (row.get("category") or "").strip()
    if not name or not brand or not category:
        return None, "name, brand, and category are required"

    pcost = _parse_decimal(row.get("pricing_cost_price"))
    pmrp = _parse_decimal(row.get("pricing_mrp"))
    psell = _parse_decimal(row.get("pricing_selling_price"))
    if pcost is None or psell is None:
        return None, "pricing_cost_price and pricing_selling_price are required"
    if pmrp is None:
        pmrp = psell

    gst = _parse_decimal(row.get("pricing_gst_percentage"))
    if gst is None:
        gst = Decimal("0")

    vcost = _parse_decimal(row.get("variant_cost_price"))
    vsell = _parse_decimal(row.get("variant_selling_price"))
    if vcost is None:
        vcost = pcost
    if vsell is None:
        vsell = psell

    initial_stock = _parse_int(row.get("initial_stock"))
    wh, wh_err = _resolve_warehouse(row, default_warehouse_id)
    if initial_stock > 0:
        if wh is None:
            return None, wh_err or "warehouse_code or default_warehouse_id required when initial_stock > 0"
    elif wh_err and (row.get("warehouse_code") or "").strip():
        return None, wh_err

    attrs = {}
    try:
        attrs = _parse_attributes(row.get("attributes_json"))
    except ValueError as e:
        return None, str(e)

    gender = (row.get("gender") or "").strip().upper() or "UNISEX"
    if gender not in ("MENS", "WOMENS", "UNISEX", "KIDS"):
        gender = "UNISEX"

    is_active = _parse_bool(row.get("is_active"))

    variant_sku = (row.get("variant_sku") or "").strip()
    variant_size = (row.get("variant_size") or "").strip()
    variant_color = (row.get("variant_color") or "").strip()
    reorder = _parse_int(row.get("variant_reorder_threshold"))
    if reorder < 0:
        reorder = 0

    product_sku = (row.get("product_sku") or "").strip() or None
    product_barcode = (row.get("product_barcode") or "").strip() or None

    payload: dict[str, Any] = {
        "name": name,
        "brand": brand,
        "category": category,
        "description": (row.get("description") or "").strip() or "",
        "product_code": (row.get("product_code") or "").strip() or "",
        "brand_code": (row.get("brand_code") or "").strip() or "",
        "alias": (row.get("alias") or "").strip() or "",
        "country_of_origin": (row.get("country_of_origin") or "").strip() or "",
        "gender": gender,
        "material": (row.get("material") or "").strip() or "",
        "season": (row.get("season") or "").strip() or "",
        "attributes": attrs,
        "is_active": is_active,
        "pricing": {
            "cost_price": str(pcost),
            "mrp": str(pmrp),
            "selling_price": str(psell),
            "gst_percentage": str(gst),
        },
        "variants": [
            {
                "sku": variant_sku,
                "size": variant_size,
                "color": variant_color,
                "cost_price": float(vcost),
                "selling_price": float(vsell),
                "reorder_threshold": reorder,
                "initial_stock": initial_stock,
            }
        ],
    }
    if product_sku:
        payload["sku"] = product_sku
    if product_barcode:
        payload["barcode_value"] = product_barcode

    if wh is not None and initial_stock > 0:
        payload["warehouse_id"] = str(wh.id)

    return payload, None


def build_template_csv() -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(list(IMPORT_COLUMNS))
    w.writerow(
        [
            "",
            "Sample Cotton Tee",
            "Quake",
            "TSHIRT",
            "Bulk import example row",
            "PC-TSH-001",
            "BC-STYLE-9",
            "Summer Tee",
            "IN",
            "UNISEX",
            "100% Cotton",
            "SS26",
            '{"sizes":["S","M","L"],"colors":["White","Navy"]}',
            "",
            "true",
            "",
            "",
            "250.00",
            "599.00",
            "499.00",
            "5",
            "",
            "M",
            "White",
            "250.00",
            "499.00",
            "10",
            "0",
        ]
    )
    w.writerow(
        [
            "",
            "Sample Polo",
            "Quake",
            "POLO",
            "",
            "",
            "",
            "",
            "",
            "MENS",
            "Pique",
            "",
            "",
            "",
            "true",
            "",
            "",
            "400.00",
            "1299.00",
            "999.00",
            "12",
            "",
            "L",
            "Black",
            "400.00",
            "999.00",
            "5",
            "24",
        ]
    )
    return buf.getvalue().encode("utf-8-sig")


def build_template_xlsx() -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "products"
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="4472C4")
    for col, name in enumerate(IMPORT_COLUMNS, start=1):
        c = ws.cell(row=1, column=col, value=name)
        c.font = header_font
        c.fill = header_fill
        c.alignment = Alignment(horizontal="center", wrap_text=True)
    examples = [
        [
            "",
            "Sample Cotton Tee",
            "Quake",
            "TSHIRT",
            "Bulk import example row",
            "PC-TSH-001",
            "BC-STYLE-9",
            "Summer Tee",
            "IN",
            "UNISEX",
            "100% Cotton",
            "SS26",
            '{"sizes":["S","M","L"],"colors":["White","Navy"]}',
            "",
            True,
            "",
            "",
            250,
            599,
            499,
            5,
            "",
            "M",
            "White",
            250,
            499,
            10,
            0,
        ],
        [
            "",
            "Sample Polo",
            "Quake",
            "POLO",
            "",
            "",
            "",
            "",
            "",
            "MENS",
            "Pique",
            "",
            "",
            "",
            True,
            "",
            "",
            400,
            1299,
            999,
            12,
            "",
            "L",
            "Black",
            400,
            999,
            5,
            24,
        ],
    ]
    for r, ex in enumerate(examples, start=2):
        for col, val in enumerate(ex, start=1):
            ws.cell(row=r, column=col, value=val)
    ws.freeze_panes = "A2"
    for col in range(1, len(IMPORT_COLUMNS) + 1):
        ws.column_dimensions[ws.cell(row=1, column=col).column_letter].width = 14

    help_ws = wb.create_sheet("instructions", 1)
    help_ws["A1"] = "Instructions"
    help_ws["A1"].font = Font(bold=True, size=14)
    lines = [
        "1. Fill one row per product. Each row creates one product with one variant.",
        "2. warehouse_code: set to your active warehouse code, or leave blank to use the "
        "default warehouse you pick in the import dialog (required for rows with initial_stock > 0).",
        "3. If every row uses the same warehouse, you can leave warehouse_code blank and choose "
        "Default warehouse in the UI.",
        "4. Leave product_sku / product_barcode empty to auto-generate.",
        "5. attributes_json must be valid JSON object or empty.",
        "6. gender: MENS, WOMENS, UNISEX, KIDS (default UNISEX).",
        "7. supplier_code: optional; must match Supplier.code if set.",
        f"8. Max {MAX_IMPORT_ROWS} data rows per file.",
    ]
    for i, line in enumerate(lines, start=3):
        help_ws.cell(row=i, column=1, value=line)
    help_ws.column_dimensions["A"].width = 100

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def import_products_from_rows(
    rows: list[dict[str, Any]],
    request,
    *,
    default_warehouse_id: str | None = None,
) -> dict[str, Any]:
    rows = [r for r in rows if (str(r.get("name") or "").strip())]
    if len(rows) > MAX_IMPORT_ROWS:
        return {
            "created": 0,
            "failed": len(rows),
            "errors": [{"row": 0, "message": f"Too many rows (max {MAX_IMPORT_ROWS})"}],
            "created_ids": [],
        }

    errors: list[dict[str, Any]] = []
    created_ids: list[str] = []

    for idx, row in enumerate(rows, start=2):
        payload, err = row_to_create_payload(row, default_warehouse_id=default_warehouse_id)
        if err:
            errors.append({"row": idx, "message": err})
            continue

        supplier = _resolve_supplier(row)
        ser = ProductCreateSerializer(data=payload, context={"request": request})
        if not ser.is_valid():
            msg = "; ".join(f"{k}: {v}" for k, v in ser.errors.items())
            errors.append({"row": idx, "message": msg})
            continue

        try:
            with transaction.atomic():
                product = ser.save()
                if supplier:
                    product.supplier = supplier
                    product.save(update_fields=["supplier", "updated_at"])
        except (DjangoValidationError, ValueError, IntegrityError) as e:
            errors.append({"row": idx, "message": str(e)})
            continue
        except Exception as e:
            errors.append({"row": idx, "message": str(e)})
            continue

        created_ids.append(str(product.id))

    return {
        "created": len(created_ids),
        "failed": len(errors),
        "errors": errors,
        "created_ids": created_ids,
    }
