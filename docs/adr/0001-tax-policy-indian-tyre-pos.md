# ADR 0001: Tax policy for Indian tyre shop POS (Telangana intra-state)

## Status

Accepted

## Context

Tyre shops in Telangana typically quote **one inclusive price** to the customer (bargained at the counter). GST must appear on invoices as **CGST + SGST** (intra-state) with HSN-wise breakup.

The TRAP backend already implements **GST-inclusive line amounts**: tax is **extracted** from the discounted line for reporting, not added on top.

## Decision

1. **Pricing model: Option A — tax-inclusive lines** (locked).  
   - `selling_price` × `quantity` forms line totals that **include** GST.  
   - `gst_amount` per line = `discounted_line × (gst% / (100 + gst%))`.

2. **CGST / SGST split** (intra-state, symmetric rates):  
   - `cgst_amount = round_half_up(gst_amount / 2, 2 paise)`  
   - `sgst_amount = gst_amount - cgst_amount` so the pair sums exactly to `gst_amount`.

3. **Rationale**: PDFs and compliance exports must not re-derive tax from current catalog rates; persisted line splits are authoritative.

## Consequences

- Sale line items store `gst_amount`, `cgst_amount`, `sgst_amount`, and `purchase_price_snapshot` at sale time.  
- If asymmetric tax components are ever required (non-half split), this ADR must be superseded and migrations must add explicit CGST/SGST rate fields per line.

## References

- `sales/services.py` — `calculate_sale_totals`  
- `docs/detailedroadmap.md` — §1.4
