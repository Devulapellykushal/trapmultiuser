"""
Resolve printed-invoice seller block: warehouse vs company + bank defaults.

Legal GSTIN / state line / signatory use ``BusinessSettings``; prominent name
and address use the invoice's warehouse when present.
"""

from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any, List, Tuple

_DEFAULT_BANK = ("ICICI Bank Account - OD", "041005006897", "ICIC0000410")
_DEFAULT_FALLBACK_ADDR = (
    "P No 385, Ground Floor",
    "Film Nagar, Jubilee Hills",
    "Hyderabad-500033",
)


def _clean(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "strftime"):
        return value.strftime("%d-%m-%y")
    return str(value).strip()


def warehouse_address_lines(address: str) -> List[str]:
    if not address:
        return []
    lines: List[str] = []
    for part in str(address).replace("\r\n", "\n").split("\n"):
        s = part.strip()
        if s:
            lines.append(s)
    return lines


def _company_address_lines(settings) -> Tuple[str, str, str]:
    a1 = _clean(getattr(settings, "address_line1", None))
    a2 = _clean(getattr(settings, "address_line2", None))
    city = _clean(getattr(settings, "city", None))
    state = _clean(getattr(settings, "state", None))
    pin = _clean(getattr(settings, "pincode", None))
    line3_parts = [p for p in [city, state, pin] if p]
    line3 = ", ".join(line3_parts) if line3_parts else ""
    if not a1 and not a2:
        a1, a2, line3 = _DEFAULT_FALLBACK_ADDR
    elif not line3:
        line3 = _DEFAULT_FALLBACK_ADDR[2]
    return a1, a2, line3


def gst_state_line_html(settings) -> str:
    state = _clean(getattr(settings, "state", None))
    code = "36"
    if state and "telangana" not in state.lower():
        code = ""
    if code:
        return f"State Name : {escape(state or 'Telangana')}, Code : {code}"
    return f"State Name : {escape(state)}, Code : —"


def gst_state_line_plain(settings) -> str:
    state = _clean(getattr(settings, "state", None)) or "Telangana"
    return f"State Name : {state}"


def resolve_invoice_seller_context(inv: Any, settings: Any) -> dict:
    """
    Returns keys:
      seller_name, address_lines (list[str], plain),
      gstin, state_line_html, state_line_plain,
      bank_name, bank_account, bank_ifsc,
      signatory_name (legal entity for \"for ...\"),
      seller_email, seller_phone, seller_contact_lines,
      seller_image_uri (file:// for WeasyPrint) or None,
      seller_image_path (absolute path for ReportLab) or None,
    """
    biz_name = _clean(getattr(settings, "business_name", None)) or "Quake"
    wh = getattr(inv, "warehouse", None)
    wh_name = _clean(getattr(wh, "name", None)) if wh else ""
    seller_name = wh_name or biz_name

    wh_addr = _clean(getattr(wh, "address", None)) if wh else ""
    if wh_addr:
        address_lines = warehouse_address_lines(wh_addr)
    else:
        a1, a2, line3 = _company_address_lines(settings)
        address_lines = [x for x in [a1, a2, line3] if x]

    gstin = _clean(getattr(settings, "gstin", None)) or ""
    state_line_html = gst_state_line_html(settings)
    state_line_plain = gst_state_line_plain(settings)

    def _wh_bank(field: str) -> str:
        if not wh:
            return ""
        return _clean(getattr(wh, field, None))

    wh_has_bank = bool(
        wh and (_wh_bank("bank_name") or _wh_bank("bank_account_number") or _wh_bank("bank_ifsc"))
    )
    if wh_has_bank:
        bank_name = _wh_bank("bank_name") or _DEFAULT_BANK[0]
        bank_acct = _wh_bank("bank_account_number") or _DEFAULT_BANK[1]
        bank_ifsc = _wh_bank("bank_ifsc") or _DEFAULT_BANK[2]
    else:
        bank_name = _clean(getattr(settings, "bank_name", None)) or _DEFAULT_BANK[0]
        bank_acct = _clean(getattr(settings, "bank_account_number", None)) or _DEFAULT_BANK[1]
        bank_ifsc = _clean(getattr(settings, "bank_ifsc", None)) or _DEFAULT_BANK[2]

    wh_email = _clean(getattr(wh, "email", None)) if wh else ""
    wh_phone = _clean(getattr(wh, "phone", None)) if wh else ""
    seller_contact_lines: List[str] = []
    if wh_email:
        seller_contact_lines.append(f"E-mail : {wh_email}")
    if wh_phone:
        seller_contact_lines.append(f"Mobile : {wh_phone}")

    seller_image_uri = None
    seller_image_path: str | None = None
    if wh and getattr(wh, "seller_image", None):
        try:
            p = Path(wh.seller_image.path).resolve()
            if p.is_file():
                seller_image_uri = p.as_uri()
                seller_image_path = str(p)
        except (ValueError, OSError, RuntimeError):
            seller_image_uri = None
            seller_image_path = None

    return {
        "seller_name": seller_name,
        "address_lines": address_lines,
        "gstin": gstin,
        "state_line_html": state_line_html,
        "state_line_plain": state_line_plain,
        "bank_name": bank_name,
        "bank_account": bank_acct,
        "bank_ifsc": bank_ifsc,
        "signatory_name": biz_name,
        "seller_email": wh_email,
        "seller_phone": wh_phone,
        "seller_contact_lines": seller_contact_lines,
        "seller_image_uri": seller_image_uri,
        "seller_image_path": seller_image_path,
    }
