# ADR 001: POS line GST and discount order

## Status

Accepted

## Context

POS checkout and the web cart must match backend `process_sale` ordering so staff see the same totals as printed invoices.

## Decision

1. **Subtotal** is the sum of line selling prices × quantity (pre-discount, pre-tax display base for “subtotal” label in cart UI).
2. **Discount** applies to subtotal first (percentage or flat cap).
3. **GST** is computed per line on the **discounted** line amount using a **pro-rata** share of the cart discount (same loop as `cart-context` / `usePosStore`).
4. **Total** shown in cart as discounted subtotal **without** adding GST into that number matches the existing UI contract (“GST excluded from display total”); invoice PDF may show GST lines separately.
5. **Checkout** accepts `apply_automatic_gst` (default false): when false, the sale stores zero GST on lines while the amount due stays the same; when true, the server extracts GST from GST-inclusive prices (CGST/SGST split) as before.

## Consequences

- Any change to `process_sale` discount/GST order must update `features/pos/cart-utils.ts` and backend tests together.
