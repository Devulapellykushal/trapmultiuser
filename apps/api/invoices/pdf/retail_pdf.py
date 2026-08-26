"""
Retail-style invoice PDF (WeasyPrint).

Tally-style layout aligned with the web Invoice Preview:
INVOICE banner, company block + metadata table, Buyer (Bill to), 8-column
line grid (Sl No., Description, HSN/SAC, Qty, Rate, per, Disc. %, Amount),
filler rows, optional discount, totals, amount in words, bank + declaration,
computer-generated footer.

Line items are reloaded from DB with a fallback to live SaleItem rows when
InvoiceItem snapshots are missing.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, List, Tuple


def load_invoice_items_for_pdf(invoice) -> Tuple[Any, List[Any]]:
    """Reload invoice with line items; fallback to sale lines if snapshot empty."""
    from invoices.models import Invoice

    inv = (
        Invoice.objects.prefetch_related("items")
        .select_related("sale", "sale__store", "warehouse")
        .get(pk=invoice.pk)
    )
    items = list(inv.items.order_by("id"))
    if items:
        return inv, items

    synthetic: List[Any] = []
    for si in inv.sale.items.select_related("product").order_by("id"):
        synthetic.append(
            SimpleNamespace(
                product_name=si.product.name,
                sku=getattr(si.product, "sku", "") or "",
                variant_details="",
                quantity=si.quantity,
                unit_price=si.selling_price,
                line_total_with_gst=si.line_total_with_gst,
                hsn_sac="",
            )
        )
    return inv, synthetic


def generate_retail_pdf_weasyprint(invoice, pdf_path: str) -> None:
    from weasyprint import HTML

    from invoices.pdf.generator import amount_to_words, get_business_settings
    from invoices.pdf.preview_invoice_html import build_tally_invoice_html

    inv, all_items = load_invoice_items_for_pdf(invoice)
    settings = get_business_settings()

    payment_methods: List[str] = []
    if hasattr(inv.sale, "payments"):
        for payment in inv.sale.payments.all():
            if hasattr(payment, "get_method_display"):
                payment_methods.append(payment.get_method_display())
            else:
                payment_methods.append(str(payment.method).replace("_", " ").title())
    payment_terms = ", ".join(payment_methods) if payment_methods else "Cash"

    html_content = build_tally_invoice_html(
        inv,
        all_items,
        settings,
        payment_terms,
        amount_to_words,
    )
    HTML(string=html_content).write_pdf(pdf_path)
