"use client";

import * as React from "react";
import { usePosCart, usePosStore } from "@/features/pos/store/usePosStore";

export type {
  AppliedDiscount,
  CartItem,
  DiscountPreset,
  Product,
  ProductPricing,
} from "@/features/pos/types";

/** Ensures POS cart rehydrate completes before UI treats cart as empty. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    const finish = () => usePosStore.getState().setHasHydrated(true);
    const unsub = usePosStore.persist.onFinishHydration(finish);
    if (usePosStore.persist.hasHydrated()) {
      finish();
    }
    return unsub;
  }, []);

  return <>{children}</>;
}

export function useCart() {
  return usePosCart();
}
