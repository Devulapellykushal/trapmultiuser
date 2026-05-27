"use client";

import * as React from "react";
import { usePosCart } from "@/features/pos/store/usePosStore";

export type {
  AppliedDiscount,
  CartItem,
  DiscountPreset,
  Product,
  ProductPricing,
} from "@/features/pos/types";

/** Zustand-backed cart; provider kept for layout compatibility (no React context state). */
export function CartProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useCart() {
  return usePosCart();
}
