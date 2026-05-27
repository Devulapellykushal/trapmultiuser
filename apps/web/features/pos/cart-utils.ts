import type { AppliedDiscount, CartItem } from "./types";

/** Match Django Decimal quantize('0.01') for money math (avoid float drift vs checkout). */
export function roundMoney2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/** Per-line total then sum — mirrors `(selling_price * qty).quantize(0.01)` per line on the server. */
export function computeSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    const unit = item.product.pricing?.sellingPrice || 0;
    const line = roundMoney2(unit * item.quantity);
    return roundMoney2(sum + line);
  }, 0);
}

export function computeDiscountAmount(
  subtotal: number,
  applied: AppliedDiscount | null,
): number {
  if (!applied) return 0;
  if (applied.type === "PERCENT") {
    return roundMoney2(subtotal * (applied.value / 100));
  }
  if (applied.type === "FLAT") {
    return roundMoney2(Math.min(applied.value, subtotal));
  }
  return 0;
}

/** GST on discounted line totals (pro-rata discount), aligned with cart-context. */
export function computeTotalGst(
  items: CartItem[],
  subtotal: number,
  discount: number,
): number {
  if (subtotal === 0) return 0;
  let gstTotal = 0;
  for (const item of items) {
    const lineTotal = roundMoney2(
      (item.product.pricing?.sellingPrice || 0) * item.quantity,
    );
    const gstPercentage = item.product.pricing?.gstPercentage || 0;
    const discountShare = roundMoney2((lineTotal / subtotal) * discount);
    const discountedLine = roundMoney2(lineTotal - discountShare);
    gstTotal += (discountedLine * gstPercentage) / 100;
  }
  return roundMoney2(gstTotal);
}

/** GST extracted from GST-inclusive line amounts (matches backend when automatic GST is on). */
export function computeTotalGstInclusiveExtract(
  items: CartItem[],
  subtotal: number,
  discount: number,
): number {
  if (subtotal === 0) return 0;
  let gstTotal = 0;
  for (const item of items) {
    const lineTotal = roundMoney2(
      (item.product.pricing?.sellingPrice || 0) * item.quantity,
    );
    const gstPct = item.product.pricing?.gstPercentage || 0;
    const discountShare = roundMoney2((lineTotal / subtotal) * discount);
    const discountedLine = roundMoney2(lineTotal - discountShare);
    if (gstPct > 0) {
      gstTotal += (discountedLine * gstPct) / (100 + gstPct);
    }
  }
  return roundMoney2(gstTotal);
}

export function computeTotal(subtotal: number, discount: number): number {
  return roundMoney2(subtotal - discount);
}
