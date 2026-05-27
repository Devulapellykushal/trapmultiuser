"""
Tally-style invoice HTML aligned with ``apps/web/components/invoices/invoice-preview.tsx``.

Used by WeasyPrint only; keeps borders, 8-column line grid, filler rows, discount/total/words/bank/footer.
"""

from __future__ import annotations

from decimal import Decimal
from html import escape
from typing import Any, Callable, List

_MONTHS = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)

_DEFAULT_DECL = (
    "1) Prices are inclusive of taxes. 2) Subject to Hyderabad Jurisdiction. "
    "3) Goods Once sold will not be taken back."
)


def _clean(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "strftime"):
        return value.strftime("%d-%m-%y")
    return str(value).strip()


def _format_invoice_date(d) -> str:
    if d is None:
        return ""
    day = str(d.day).zfill(2)
    month = _MONTHS[d.month - 1] if 1 <= d.month <= 12 else ""
    year = str(d.year)[-2:]
    return f"{day}-{month}-{year}"


def _fmt_money(value) -> str:
    try:
        return f"{Decimal(str(value)):,.2f}"
    except Exception:
        return "0.00"


def build_tally_invoice_html(
    inv,
    all_items: List[Any],
    settings,
    payment_terms: str,
    amount_to_words: Callable[[Any], str],
) -> str:
    from invoices.pdf.seller_context import resolve_invoice_seller_context

    ctx = resolve_invoice_seller_context(inv, settings)
    seller_title = escape(ctx["seller_name"])
    gstin = escape(ctx["gstin"])
    state_line = ctx["state_line_html"]
    bank_name = escape(ctx["bank_name"])
    bank_acct = escape(ctx["bank_account"])
    bank_ifsc = escape(ctx["bank_ifsc"])
    signatory = escape(ctx["signatory_name"])

    inv_no = escape(_clean(inv.invoice_number))
    dated = escape(_format_invoice_date(inv.invoice_date))
    pay = escape(payment_terms or "Cash")

    billing_name = _clean(inv.billing_name) or "Walk-in Customer"
    billing_phone = _clean(inv.billing_phone)
    sale = inv.sale
    cust_email = _clean(getattr(sale, "customer_email", "") or "")
    cust_addr = _clean(getattr(sale, "customer_address", "") or "")
    billing_gstin = _clean(getattr(inv, "billing_gstin", "") or "")

    customer_line = " ".join(p for p in [billing_name, billing_phone] if p).strip() or "Walk-in Customer"

    decl = (_clean(getattr(settings, "terms_text", None)) or _DEFAULT_DECL).strip()

    grand = Decimal(str(inv.total_amount or 0))
    words = amount_to_words(grand)
    amount_words = f"INR {words} Only"

    disc_amt = Decimal(str(inv.discount_amount or 0))
    disc_type = str(inv.discount_type or "NONE")
    is_disc = disc_amt > 0 and disc_type != "NONE"
    if disc_type == "PERCENTAGE":
        dv = inv.discount_value
        try:
            disc_label = f"Discount ({Decimal(str(dv or 0)).normalize()}%)"
        except Exception:
            disc_label = "Discount"
    else:
        disc_label = "Discount"

    total_qty = sum(int(getattr(it, "quantity", 0) or 0) for it in all_items)

    rows_html: List[str] = []
    if not all_items:
        rows_html.append(
            '<tr><td class="sl">—</td>'
            '<td class="desc" colspan="6" style="text-align:center;">No line items</td>'
            '<td class="amt">0.00</td></tr>'
        )
        displayed_count = 1
    else:
        displayed_count = len(all_items)
        for idx, item in enumerate(all_items, start=1):
            qty = int(getattr(item, "quantity", 0) or 0)
            line_total = Decimal(str(getattr(item, "line_total_with_gst", 0) or 0))
            if qty > 0:
                rate = (line_total / Decimal(qty)).quantize(Decimal("0.01"))
            else:
                rate = Decimal(str(getattr(item, "unit_price", 0) or 0))

            pname = _clean(getattr(item, "product_name", None)) or "Unknown Product"
            sku = _clean(getattr(item, "sku", "") or "")
            vd = _clean(getattr(item, "variant_details", "") or "")
            sub_bits = []
            if sku or vd:
                sub = []
                if sku:
                    sub.append(f"SKU: {escape(sku)}")
                if vd:
                    sub.append(escape(vd))
                sub_bits.append(
                    f'<div class="sub">{" | ".join(sub)}</div>'
                )
            hsn = escape(_clean(getattr(item, "hsn_sac", None) or ""))

            rows_html.append(
                "<tr>"
                f'<td class="sl">{idx}</td>'
                f'<td class="desc"><div class="pn">{escape(pname)}</div>{"".join(sub_bits)}</td>'
                f'<td class="hsn">{hsn}</td>'
                f'<td class="qty">{qty} Nos</td>'
                f'<td class="rate">{_fmt_money(rate)}</td>'
                f'<td class="per">Nos</td>'
                f'<td class="disc">-</td>'
                f'<td class="amt">{_fmt_money(line_total)}</td>'
                "</tr>"
            )

    min_rows = max(8, displayed_count)
    n_fill = max(0, min_rows - displayed_count)
    for _ in range(n_fill):
        rows_html.append(
            "<tr class=\"filler\">"
            + "".join('<td class="bf"></td>' for _ in range(8))
            + "</tr>"
        )

    disc_row = ""
    if is_disc:
        disc_row = (
            "<tr>"
            '<td class="dr" colspan="7">'
            + escape(disc_label)
            + "</td>"
            f'<td class="amt">- ₹ {_fmt_money(disc_amt)}</td>'
            "</tr>"
        )

    buyer_bits = [
        '<div class="lbl">Buyer (Bill to)</div>',
        f'<div class="buyer-name">{escape(customer_line)}</div>',
    ]
    if cust_email:
        buyer_bits.append(f'<div>E-mail : {escape(cust_email)}</div>')
    if cust_addr:
        buyer_bits.append(f'<div>{escape(cust_addr)}</div>')
    if billing_gstin:
        buyer_bits.append(f'<div>GSTIN : {escape(billing_gstin)}</div>')
    buyer_bits.append(f'<div class="st-line">{state_line}</div>')
    buyer_html = "\n".join(buyer_bits)

    addr_block = "\n".join(
        f"<div>{escape(x)}</div>"
        for x in ctx["address_lines"]
    )
    contact_block = "\n".join(
        f"<div>{escape(x)}</div>"
        for x in (ctx.get("seller_contact_lines") or [])
    )
    img_uri = ctx.get("seller_image_uri") or ""
    seller_logo_html = ""
    if img_uri:
        seller_logo_html = (
            f'<div class="seller-logo-wrap">'
            f'<img src="{escape(img_uri)}" alt="" class="seller-logo" />'
            f"</div>"
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Invoice {inv_no}</title>
<style>
  @page {{ size: A4; margin: 10mm; }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 9px;
    color: #000;
    background: #fff;
  }}
  .doc {{ max-width: 980px; margin: 0 auto; border: 1px solid #000; }}
  .inv-title {{
    border-bottom: 1px solid #000;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    padding: 4px 0;
  }}
  .head {{
    width: 100%;
    border-collapse: collapse;
    border-bottom: 1px solid #000;
  }}
  .head td {{ vertical-align: top; padding: 6px; }}
  .co {{ width: 58%; border-right: 1px solid #000; font-size: 9px; line-height: 1.35; }}
  .co-inner {{
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }}
  .co-copy {{ flex: 1; min-width: 0; }}
  .co .seller-logo-wrap {{
    flex-shrink: 0;
    width: 112px;
    max-height: 86px;
    overflow: hidden;
    background: #f6f6f6;
    border: 1px solid #ccc;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
  }}
  .co .seller-logo {{
    max-width: 100%;
    max-height: 80px;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
  }}
  .co .bn {{ font-size: 12px; font-weight: 700; margin-bottom: 2px; }}
  .meta-wrap {{ width: 42%; }}
  .meta {{ width: 100%; border-collapse: collapse; font-size: 8px; }}
  .meta td {{
    border-right: 1px solid #000;
    border-bottom: 1px solid #000;
    padding: 3px 4px;
    vertical-align: top;
    width: 50%;
  }}
  .meta tr td:last-child {{ border-right: none; }}
  .meta .k {{ font-size: 7px; color: #000; }}
  .meta .v {{ font-size: 8px; font-weight: 600; margin-top: 1px; }}
  .meta tr:last-child td {{ border-bottom: none; }}
  .buyer {{
    border-bottom: 1px solid #000;
    padding: 6px 8px;
    font-size: 9px;
    line-height: 1.35;
  }}
  .buyer .lbl {{ font-size: 7px; }}
  .buyer-name {{ font-size: 10px; font-weight: 600; margin-top: 2px; }}
  .st-line {{ margin-top: 4px; }}
  .grid {{
    width: 100%;
    border-collapse: collapse;
    font-size: 8px;
  }}
  .grid th, .grid td {{
    border-right: 1px solid #000;
    border-bottom: 1px solid #000;
    padding: 3px 4px;
    vertical-align: top;
  }}
  .grid th:last-child, .grid td:last-child {{ border-right: none; }}
  .grid th {{
    font-weight: 600;
    text-align: left;
  }}
  .grid th.sl {{ width: 5%; text-align: center; }}
  .grid th.desc {{ width: 40%; }}
  .grid th.hsn {{ width: 10%; text-align: center; }}
  .grid th.qty {{ width: 10%; text-align: center; }}
  .grid th.rate {{ width: 11%; text-align: right; }}
  .grid th.per {{ width: 6%; text-align: center; }}
  .grid th.disc {{ width: 8%; text-align: center; }}
  .grid th.amt {{ width: 10%; text-align: right; }}
  .grid td.sl {{ text-align: center; }}
  .grid td.desc .pn {{ font-weight: 600; line-height: 1.2; }}
  .grid td.desc .sub {{ font-size: 7px; color: #444; margin-top: 2px; line-height: 1.2; }}
  .grid td.hsn {{ text-align: center; }}
  .grid td.qty {{ text-align: center; font-weight: 600; }}
  .grid td.rate {{ text-align: right; }}
  .grid td.per {{ text-align: center; }}
  .grid td.disc {{ text-align: center; }}
  .grid td.amt {{ text-align: right; font-weight: 600; }}
  .grid td.dr {{ text-align: right; font-weight: 500; }}
  .grid tr.filler td {{ height: 22px; }}
  .grid tr.filler td.bf {{ border-bottom: 1px solid #000; }}
  .words-row td {{ border-bottom: 1px solid #000; }}
  .words-k {{ font-size: 7px; }}
  .words-v {{ font-size: 9px; font-weight: 600; margin-top: 2px; }}
  .eoe {{ text-align: right; font-size: 8px; vertical-align: top; padding: 4px 6px; }}
  .eoe-main {{ font-style: italic; font-weight: 600; display: block; }}
  .eoe-sub {{ font-size: 6px; font-style: normal; font-weight: 400; color: #333; display: block; margin-top: 2px; }}
  .foot-grid {{
    width: 100%;
    border-collapse: collapse;
    border-top: 1px solid #000;
  }}
  .foot-grid td {{
    vertical-align: bottom;
    padding: 8px;
    font-size: 9px;
    line-height: 1.35;
  }}
  .decl {{ width: 58%; border-right: 1px solid #000; min-height: 88px; }}
  .bank {{ width: 42%; min-height: 88px; }}
  .bank h3 {{ text-align: center; font-size: 9px; margin: 0 0 6px; font-weight: 600; }}
  .bank table {{ width: 100%; font-size: 9px; margin-bottom: 10px; }}
  .bank td {{ border: none; padding: 1px 0; }}
  .sign1 {{ text-align: right; font-weight: 600; margin-bottom: 6px; }}
  .sign2 {{ text-align: right; }}
  .cg-foot {{
    border-top: 1px solid #000;
    text-align: center;
    font-size: 9px;
    padding: 4px 0;
  }}
</style>
</head>
<body>
<div class="doc">
  <div class="inv-title">INVOICE</div>
  <table class="head">
    <tr>
      <td class="co">
        <div class="co-inner">
          <div class="co-copy">
            <div class="bn">{seller_title}</div>
            {addr_block}
            {contact_block}
            <div>GSTIN/UIN: {escape(gstin)}</div>
            <div>{state_line}</div>
          </div>
          {seller_logo_html}
        </div>
      </td>
      <td class="meta-wrap">
        <table class="meta">
          <tr>
            <td><div class="k">Invoice No.</div><div class="v">{inv_no}</div></td>
            <td><div class="k">Dated</div><div class="v">{dated}</div></td>
          </tr>
          <tr>
            <td><div class="k">Delivery Note</div><div class="v">&nbsp;</div></td>
            <td><div class="k">Mode/Terms of Payment</div><div class="v">{pay}</div></td>
          </tr>
          <tr>
            <td><div class="k">Reference No. &amp; Date.</div><div class="v">&nbsp;</div></td>
            <td><div class="k">Other References</div><div class="v">&nbsp;</div></td>
          </tr>
          <tr>
            <td><div class="k">Buyer&apos;s Order No.</div><div class="v">&nbsp;</div></td>
            <td><div class="k">Dated</div><div class="v">&nbsp;</div></td>
          </tr>
          <tr>
            <td><div class="k">Dispatch Doc No.</div><div class="v">&nbsp;</div></td>
            <td><div class="k">Delivery Note Date</div><div class="v">&nbsp;</div></td>
          </tr>
          <tr>
            <td><div class="k">Dispatched through</div><div class="v">&nbsp;</div></td>
            <td><div class="k">Destination</div><div class="v">&nbsp;</div></td>
          </tr>
          <tr>
            <td colspan="2"><div class="k">Terms of Delivery</div><div class="v">&nbsp;</div></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <div class="buyer">
    {buyer_html}
  </div>

  <table class="grid">
    <thead>
      <tr>
        <th class="sl">Sl<br/>No.</th>
        <th class="desc">Description of Goods</th>
        <th class="hsn">HSN/SAC</th>
        <th class="qty">Quantity</th>
        <th class="rate">Rate</th>
        <th class="per">per</th>
        <th class="disc">Disc. %</th>
        <th class="amt">Amount</th>
      </tr>
    </thead>
    <tbody>
      {"".join(rows_html)}
      {disc_row}
      <tr>
        <td></td>
        <td style="text-align:right;font-weight:600;">Total</td>
        <td></td>
        <td class="qty">{total_qty} Nos</td>
        <td></td>
        <td></td>
        <td></td>
        <td class="amt">₹ {_fmt_money(grand)}</td>
      </tr>
      <tr class="words-row">
        <td colspan="7">
          <div class="words-k">Amount Chargeable (in words)</div>
          <div class="words-v">{escape(amount_words)}</div>
        </td>
        <td class="eoe"><span class="eoe-main">E. &amp; O.E.</span><br/><span class="eoe-sub">Errors &amp; omissions excepted</span></td>
      </tr>
    </tbody>
  </table>

  <table class="foot-grid">
    <tr>
      <td class="decl">
        <div style="font-weight:600;margin-bottom:4px;">Declaration</div>
        <div>{escape(decl)}</div>
      </td>
      <td class="bank">
        <h3>Company&apos;s Bank Details</h3>
        <table>
          <tr><td style="width:42%;">Bank Name</td><td style="width:4%;">:</td><td style="font-weight:600;">{bank_name}</td></tr>
          <tr><td>A/c No.</td><td>:</td><td style="font-weight:600;">{bank_acct}</td></tr>
          <tr><td>Branch &amp; IFS Code</td><td>:</td><td style="font-weight:600;">{bank_ifsc}</td></tr>
        </table>
        <div class="sign1">for {signatory}</div>
        <div class="sign2">Authorised Signatory</div>
      </td>
    </tr>
  </table>

  <div class="cg-foot">This is a Computer Generated Invoice</div>
</div>
</body>
</html>"""
