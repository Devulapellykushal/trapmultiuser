"""
PDF Generator for Invoices.
Generates traditional Indian Tax Invoice (Tally-style) for Quake.

PHASE 14: INVOICE PDFs & COMPLIANCE
====================================
- Traditional Indian invoice format (matching customer_bill.pdf)
- Sl No. | Description | HSN/SAC | Quantity | Rate | per | Disc.% | Amount
- Amount in words (INR ... Only)
- Company bank details + Declaration + Authorised Signatory
- "This is a Computer Generated Invoice" footer
"""

import os
from decimal import Decimal
from functools import lru_cache
from typing import List, Tuple

@lru_cache(maxsize=1)
def _invoice_unicode_font_name() -> str | None:
    """
    Register a TTF with U+20B9 (₹) when present (macOS/Linux paths).
    Returns registered ReportLab font name, or None → callers use Rs. + Helvetica.
    """
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except ImportError:
        return None

    candidates = [
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    ]
    for path in candidates:
        if not os.path.isfile(path):
            continue
        try:
            pdfmetrics.registerFont(TTFont("InvoiceUnicode", path))
            return "InvoiceUnicode"
        except Exception:
            continue
    return None


def _pdf_rs(amount: Decimal | float | str) -> str:
    """Plain-text money for table cells that must stay Helvetica-only."""
    try:
        d = Decimal(str(amount)).quantize(Decimal("0.01"))
    except Exception:
        d = Decimal("0.00")
    return f"Rs. {d:,.2f}"


def _pdf_money_para(amount: Decimal | float | str, style) -> "Paragraph":
    """Money as Paragraph: ₹ + Unicode font when available, else Rs. + Helvetica."""
    from reportlab.platypus import Paragraph

    try:
        d = Decimal(str(amount)).quantize(Decimal("0.01"))
    except Exception:
        d = Decimal("0.00")
    formatted = f"{d:,.2f}"
    fn = _invoice_unicode_font_name()
    if fn:
        return Paragraph(
            f'<font name="{fn}" size="{style.fontSize}">₹ {formatted}</font>',
            style,
        )
    return Paragraph(f"Rs. {formatted}", style)


def get_business_settings():
    """Get business settings for invoice branding."""
    try:
        from invoices.models import BusinessSettings
        return BusinessSettings.get_settings()
    except Exception:
        class DefaultSettings:
            business_name = "Quake"
            tagline = ""
            address_line1 = "P No 385, Ground Floor"
            address_line2 = "Film Nagar, Jubilee Hills"
            city = "Hyderabad"
            state = "Telangana"
            pincode = "500033"
            phone = ""
            email = ""
            website = ""
            gstin = ""
            footer_text = ""
            terms_text = ""
        return DefaultSettings()


def amount_to_words(amount):
    """
    Convert a decimal/float amount to Indian English words.
    Example: 2500.50 → 'Two Thousand Five Hundred and Fifty Paise'
    """
    ones = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'
    ]
    tens_list = [
        '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
        'Sixty', 'Seventy', 'Eighty', 'Ninety'
    ]

    def two_dig(n):
        if n == 0:
            return ''
        if n < 20:
            return ones[n]
        return tens_list[n // 10] + (' ' + ones[n % 10] if n % 10 else '')

    def three_dig(n):
        if n == 0:
            return ''
        if n < 100:
            return two_dig(n)
        return ones[n // 100] + ' Hundred' + (' ' + two_dig(n % 100) if n % 100 else '')

    try:
        total = float(amount)
    except (TypeError, ValueError):
        return 'Zero'

    rupees = int(total)
    paise = round((total - rupees) * 100)

    if rupees == 0 and paise == 0:
        return 'Zero'

    parts = []
    crore = rupees // 10000000
    rupees %= 10000000
    lakh = rupees // 100000
    rupees %= 100000
    thousand = rupees // 1000
    rupees %= 1000
    remaining = rupees

    if crore:
        parts.append(three_dig(crore) + ' Crore')
    if lakh:
        parts.append(three_dig(lakh) + ' Lakh')
    if thousand:
        parts.append(three_dig(thousand) + ' Thousand')
    if remaining:
        parts.append(three_dig(remaining))

    result = ' '.join(parts)
    if paise:
        result += f' and {two_dig(paise)} Paise'

    return result


def generate_pdf_weasyprint(invoice, pdf_path: str):
    """
    Generate retail-style invoice PDF using WeasyPrint.

    Delegates to ``retail_pdf`` (clean layout, line items reloaded from DB).
    """
    from .retail_pdf import generate_retail_pdf_weasyprint

    generate_retail_pdf_weasyprint(invoice, pdf_path)


def generate_pdf_simple(invoice, pdf_path: str):
    """
    Generate traditional Indian-style Tax Invoice using ReportLab.
    Fallback when WeasyPrint is not available.
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table,
            TableStyle, Image as RLImage,
        )
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    except ImportError:
        with open(pdf_path, 'w') as f:
            f.write(f"Invoice: {invoice.invoice_number}\nTotal: {invoice.total_amount}")
        return

    settings = get_business_settings()
    from .retail_pdf import load_invoice_items_for_pdf
    from .seller_context import resolve_invoice_seller_context
    from html import escape as html_escape

    inv_loaded, pdf_line_items = load_invoice_items_for_pdf(invoice)
    ctx = resolve_invoice_seller_context(inv_loaded, settings)

    # Content width matches header / buyer / line grid (A4 − 2 cm margins)
    content_w = 18 * cm

    doc = SimpleDocTemplate(
        pdf_path, pagesize=A4,
        leftMargin=1*cm, rightMargin=1*cm,
        topMargin=1*cm, bottomMargin=1*cm
    )
    styles = getSampleStyleSheet()
    story = []

    biz_name = ctx["signatory_name"]
    gstin = ctx["gstin"]
    grand_total = invoice.total_amount
    amount_words = amount_to_words(grand_total)
    invoice_date_str = invoice.invoice_date.strftime('%d-%b-%Y')

    # Register optional font for ₹ (keeps Helvetica for grid; amounts use Paragraph)
    _invoice_unicode_font_name()

    # Payment methods
    payment_methods = []
    if hasattr(invoice.sale, "payments"):
        for payment in invoice.sale.payments.all():
            payment_methods.append(payment.method)

    # Right column: Tax Invoice title + metadata (label left, value flush right)
    if payment_methods:
        pay_upper = ", ".join(str(p).strip().upper() for p in payment_methods)
    else:
        pay_upper = "CASH"
    meta_l = ParagraphStyle(
        "MetaL", parent=styles["Normal"], fontSize=8, leading=11, alignment=TA_LEFT
    )
    meta_r = ParagraphStyle(
        "MetaR", parent=styles["Normal"], fontSize=8, leading=11, alignment=TA_RIGHT
    )
    meta_rows = [
        [
            Paragraph("Invoice No. :", meta_l),
            Paragraph(f"<b>{invoice.invoice_number}</b>", meta_r),
        ],
        [
            Paragraph("Dated :", meta_l),
            Paragraph(invoice_date_str, meta_r),
        ],
        [
            Paragraph("Mode/Terms :", meta_l),
            Paragraph(pay_upper, meta_r),
        ],
    ]
    # Label column wide enough for "Mode/Terms :"; value column fills rest of 8 cm header cell
    meta_label_w = 3.05 * cm
    meta_val_w = 8 * cm - meta_label_w
    meta_inner = Table(meta_rows, colWidths=[meta_label_w, meta_val_w])
    meta_inner.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("LEFTPADDING", (1, 0), (1, -1), 0),
                ("RIGHTPADDING", (1, 0), (1, -1), 0),
            ]
        )
    )
    title_para = Paragraph(
        "<b><font size=\"13\">Tax Invoice</font></b>",
        ParagraphStyle(
            "TaxInvTitle",
            parent=styles["Normal"],
            alignment=TA_CENTER,
            leading=15,
        ),
    )
    inv_details = Table([[title_para], [meta_inner]], colWidths=[8 * cm])
    inv_details.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (0, 0), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (0, 0), 4),
            ]
        )
    )

    # Left: seller block — name / address / contact / GSTIN / state (left); optional logo (right)
    seller_display = html_escape(ctx["seller_name"])
    addr_br = "<br/>".join(html_escape(line) for line in ctx["address_lines"])
    contact_lines = ctx.get("seller_contact_lines") or []
    contact_br = "<br/>".join(html_escape(line) for line in contact_lines)
    if contact_br:
        contact_br = contact_br + "<br/>"
    gstin_esc = html_escape(ctx["gstin"])
    state_buyer = html_escape(ctx["state_line_plain"])
    biz_info = Paragraph(
        f'<b><font size="14">{seller_display}</font></b><br/>'
        f'<font size="8">{addr_br}<br/>'
        f'{contact_br}'
        f'<b>GSTIN/UIN :</b> {gstin_esc}<br/>'
        f'{state_buyer}</font>',
        ParagraphStyle("BizInfo", parent=styles["Normal"], leading=12),
    )

    img_path = ctx.get("seller_image_path")
    logo_col_w = 3.5 * cm
    text_col_w = 10 * cm - logo_col_w
    logo_cell = None
    if img_path and os.path.isfile(img_path):
        try:
            from PIL import Image as PILImage

            with PILImage.open(img_path) as pil_im:
                pw, ph = pil_im.size
            max_w = float(logo_col_w)
            max_h = float(2.35 * cm)
            scale = min(max_w / max(pw, 1), max_h / max(ph, 1))
            lw = pw * scale
            lh = ph * scale
            logo_cell = RLImage(img_path, width=lw, height=lh)
        except Exception:
            try:
                logo_cell = RLImage(img_path, width=logo_col_w)
            except Exception:
                logo_cell = None

    if logo_cell is not None:
        left_col = Table([[biz_info, logo_cell]], colWidths=[text_col_w, logo_col_w])
    else:
        left_col = Table([[biz_info]], colWidths=[10 * cm])
    seller_ts = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]
    if logo_cell is not None:
        seller_ts.append(("ALIGN", (1, 0), (1, 0), "RIGHT"))
    left_col.setStyle(TableStyle(seller_ts))

    header_table = Table([[left_col, inv_details]], colWidths=[10 * cm, 8 * cm])
    header_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, colors.black),
        ('LINEAFTER', (0, 0), (0, -1), 1, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(header_table)

    # Buyer section
    customer_email = getattr(invoice.sale, 'customer_email', '') or ''
    customer_address = getattr(invoice.sale, 'customer_address', '') or ''
    buyer_text = (
        f'<font size="8" color="#555">Buyer (Bill to)</font><br/>'
        f'<b><font size="10">{invoice.billing_name}</font></b><br/>'
        f'<font size="8">Phone : {invoice.billing_phone}</font>'
    )
    if customer_email:
        buyer_text += f'<br/><font size="8">E-mail : {customer_email}</font>'
    if customer_address:
        buyer_text += f'<br/><font size="8">{customer_address}</font>'
    if invoice.billing_gstin:
        buyer_text += f'<br/><font size="8">GSTIN : {invoice.billing_gstin}</font>'
    buyer_text += f'<br/><font size="8">{state_buyer}</font>'

    buyer_para = Paragraph(buyer_text, ParagraphStyle('Buyer', parent=styles['Normal'], leading=13))
    buyer_table = Table([[buyer_para]], colWidths=[content_w])
    buyer_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, colors.black),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(buyer_table)

    money_r = ParagraphStyle(
        "MoneyR",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        alignment=TA_RIGHT,
        fontName="Helvetica",
    )
    money_r_bold = ParagraphStyle(
        "MoneyRBold",
        parent=styles["Normal"],
        fontSize=9,
        leading=11,
        alignment=TA_RIGHT,
        fontName="Helvetica-Bold",
    )

    # Items table (8 columns aligned with invoice preview / WeasyPrint HTML)
    items_data: List[List[str]] = [
        ['Sl\nNo.', 'Description of Goods', 'HSN/\nSAC', 'Quantity', 'Rate', 'per', 'Disc.%', 'Amount']
    ]

    total_qty = 0
    if not pdf_line_items:
        items_data.append(
            [
                "—",
                "No line items",
                "",
                "",
                "",
                "",
                "",
                _pdf_money_para(0, money_r),
            ]
        )
        n_data_rows = 1
    else:
        n_data_rows = len(pdf_line_items)
        for idx, item in enumerate(pdf_line_items, 1):
            qty = int(getattr(item, "quantity", 0) or 0)
            total_qty += qty
            line_total = Decimal(str(getattr(item, "line_total_with_gst", 0) or 0))
            if qty > 0:
                rate = (line_total / Decimal(qty)).quantize(Decimal("0.01"))
            else:
                rate = Decimal(str(getattr(item, "unit_price", 0) or 0))

            variant_str = f"\n({item.variant_details})" if getattr(item, "variant_details", None) else ""
            sku = getattr(item, "sku", "") or ""
            desc = item.product_name + variant_str
            if sku:
                desc += f"\nSKU: {sku}"

            items_data.append([
                str(idx),
                desc,
                getattr(item, "hsn_sac", "") or "",
                f"{qty} Nos",
                _pdf_money_para(rate, money_r),
                "Nos",
                "-",
                _pdf_money_para(line_total, money_r),
            ])

    for _ in range(max(0, max(8, n_data_rows) - n_data_rows)):
        items_data.append(['', '', '', '', '', '', '', ''])

    extra_style: List[Tuple] = []

    # Discount row (label spans first 7 columns)
    if invoice.discount_type != 'NONE' and invoice.discount_amount > 0:
        if invoice.discount_type == 'PERCENTAGE':
            disc_label = f"Discount ({invoice.discount_value}%)"
        else:
            disc_label = "Discount"
        r = len(items_data)
        items_data.append(
            [disc_label, "", "", "", "", "", "", f"- {_pdf_rs(invoice.discount_amount)}"]
        )
        extra_style.extend(
            [
                ("SPAN", (0, r), (6, r)),
                ("ALIGN", (0, r), (0, r), "RIGHT"),
                ("ALIGN", (7, r), (7, r), "RIGHT"),
                ("FONTNAME", (0, r), (-1, r), "Helvetica"),
            ]
        )

    # Total row: "Total" centered across Sl + Description + HSN (cols 0–2); qty in col 3; amount in col 7
    r_tot = len(items_data)
    items_data.append(
        [
            "Total",
            "",
            "",
            f"{total_qty} Nos",
            "",
            "",
            "",
            _pdf_money_para(grand_total, money_r_bold),
        ]
    )
    extra_style.extend(
        [
            ("SPAN", (0, r_tot), (2, r_tot)),
            ("FONTNAME", (0, r_tot), (0, r_tot), "Helvetica-Bold"),
            ("ALIGN", (0, r_tot), (0, r_tot), "CENTER"),
            ("FONTNAME", (3, r_tot), (3, r_tot), "Helvetica-Bold"),
            ("ALIGN", (3, r_tot), (3, r_tot), "CENTER"),
        ]
    )

    # Column widths ≈ preview proportions; must sum to ``content_w`` for edge alignment
    col_sl = 0.85 * cm
    col_desc = 7.25 * cm
    col_hsn = 1.55 * cm
    col_qty = 1.85 * cm
    col_rate = 2.15 * cm
    col_per = 1.05 * cm
    col_disc = 1.2 * cm
    col_amt = 2.1 * cm
    items_table = Table(
        items_data,
        colWidths=[
            col_sl,
            col_desc,
            col_hsn,
            col_qty,
            col_rate,
            col_per,
            col_disc,
            col_amt,
        ],
    )
    total_rows = len(items_data)
    base_style: List[Tuple] = [
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 1, colors.black),
        ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.94, 0.94, 0.94)),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        # Header row: Sl, HSN, Qty, per, Disc centered; Desc left; Rate & Amount right
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("ALIGN", (1, 0), (1, 0), "LEFT"),
        ("ALIGN", (2, 0), (2, 0), "CENTER"),
        ("ALIGN", (3, 0), (3, 0), "CENTER"),
        ("ALIGN", (4, 0), (4, 0), "RIGHT"),
        ("ALIGN", (5, 0), (5, 0), "CENTER"),
        ("ALIGN", (6, 0), (6, 0), "CENTER"),
        ("ALIGN", (7, 0), (7, 0), "RIGHT"),
        # Body + filler: match preview
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("ALIGN", (1, 1), (1, -1), "LEFT"),
        ("ALIGN", (2, 1), (2, -1), "CENTER"),
        ("ALIGN", (3, 1), (3, -1), "CENTER"),
        ("ALIGN", (4, 1), (4, -1), "RIGHT"),
        ("ALIGN", (5, 1), (5, -1), "CENTER"),
        ("ALIGN", (6, 1), (6, -1), "CENTER"),
        ("ALIGN", (7, 1), (7, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    items_table.setStyle(TableStyle(base_style + extra_style))
    story.append(items_table)

    # E.&O.E. + grand total row
    half = content_w / 2
    eoe_left = Paragraph(
        "<i>E.&amp; O.E.</i><br/><font size='6' color='#444444'>"
        "(Errors &amp; omissions excepted)</font>",
        ParagraphStyle(
            "EOE",
            parent=styles["Normal"],
            fontSize=9,
            leading=11,
            alignment=TA_LEFT,
        ),
    )
    eoe_table = Table(
        [[eoe_left, _pdf_money_para(grand_total, money_r_bold)]],
        colWidths=[half, half],
    )
    eoe_table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, colors.black),
                ("LINEAFTER", (0, 0), (0, -1), 1, colors.black),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (0, 0), (0, 0), "LEFT"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(eoe_table)

    # Amount in words
    words_para = Paragraph(
        f'<b>Amount Chargeable (in words) :</b> '
        f'<i>INR {amount_words} Only</i>',
        ParagraphStyle('Words', parent=styles['Normal'], fontSize=9, leading=12)
    )
    words_table = Table([[words_para]], colWidths=[content_w])
    words_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, colors.black),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(words_table)

    # Bank details + Declaration
    bn = html_escape(ctx["bank_name"])
    ba = html_escape(ctx["bank_account"])
    bi = html_escape(ctx["bank_ifsc"])
    bank_text = Paragraph(
        f'<b>Company\'s Bank Details</b><br/>'
        f'<font size="8">Bank Name : {bn}<br/>'
        f'A/c No. : {ba}<br/>'
        f'Branch &amp; IFS Code : {bi}</font>',
        ParagraphStyle('Bank', parent=styles['Normal'], leading=12)
    )
    decl_text = Paragraph(
        f'<i><font size="7" color="#555">'
        f'<u>Declaration</u><br/>'
        f'We declare that this invoice shows the actual price of the goods '
        f'described and that all particulars are true and correct.'
        f'</font></i><br/><br/>'
        f'<b>for {biz_name}</b>',
        ParagraphStyle('Decl', parent=styles['Normal'], alignment=TA_CENTER, leading=11)
    )
    bottom_table = Table([[bank_text, decl_text]], colWidths=[half, half])
    bottom_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, colors.black),
        ('LINEAFTER', (0, 0), (0, -1), 1, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 40),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(bottom_table)

    # Authorised signatory bar
    sign_right = Paragraph(
        "Authorised Signatory",
        ParagraphStyle(
            "SignRight",
            parent=styles["Normal"],
            fontSize=8,
            alignment=TA_RIGHT,
            leading=10,
        ),
    )
    sign_table = Table([["", sign_right]], colWidths=[half, half])
    sign_table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, colors.black),
                ("LINEAFTER", (0, 0), (0, -1), 1, colors.black),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(sign_table)

    # Computer generated notice
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        'This is a Computer Generated Invoice',
        ParagraphStyle(
            'Notice', parent=styles['Normal'],
            fontSize=8, alignment=TA_CENTER,
            fontName='Helvetica-Oblique', textColor=colors.grey
        )
    ))

    doc.build(story)
