import { create } from "zustand";
import {
  salesService,
  type PosSearchProductRow,
  type PosSearchServiceRow,
} from "@/services/sales.service";
import type {
  AppliedDiscount,
  CartItem,
  DiscountPreset,
  Product,
} from "@/features/pos/types";
import {
  computeDiscountAmount,
  computeSubtotal,
  computeTotal,
  computeTotalGst,
} from "@/features/pos/cart-utils";

export interface PosCartState {
  items: CartItem[];
  appliedDiscount: AppliedDiscount | null;
}

export interface PosStoreState {
  cart: PosCartState;
  warehouseId: string | null;
  searchQuery: string;
  products: PosSearchProductRow[];
  services: PosSearchServiceRow[];
  limit: number;
  loading: boolean;
  error: string | null;
  lastQuery: string;

  setWarehouseId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setLimit: (n: number) => void;
  fetchPosSearch: (override?: { q?: string; warehouseId?: string }) => Promise<void>;
  resetResults: () => void;

  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  applyDiscount: (discount: DiscountPreset | null) => void;
}

function cartTotals(cart: PosCartState) {
  const subtotal = computeSubtotal(cart.items);
  const discount = computeDiscountAmount(subtotal, cart.appliedDiscount);
  const totalGst = computeTotalGst(cart.items, subtotal, discount);
  const total = computeTotal(subtotal, discount);
  const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);
  return { subtotal, discount, totalGst, total, itemCount };
}

export const usePosStore = create<PosStoreState>((set, get) => ({
  cart: { items: [], appliedDiscount: null },
  warehouseId: null,
  searchQuery: "",
  products: [],
  services: [],
  limit: 20,
  loading: false,
  error: null,
  lastQuery: "",

  setWarehouseId: (id) => set({ warehouseId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setLimit: (n) => set({ limit: n }),

  resetResults: () =>
    set({
      products: [],
      services: [],
      lastQuery: "",
      error: null,
    }),

  fetchPosSearch: async (override) => {
    const wid = override?.warehouseId ?? get().warehouseId;
    if (!wid) {
      set({ error: "Select a warehouse", products: [], services: [] });
      return;
    }
    const q = override?.q ?? get().searchQuery;
    const limit = get().limit;
    set({ loading: true, error: null });
    try {
      const data = await salesService.posSearch({
        warehouse_id: wid,
        q,
        limit,
      });
      set({
        products: data.products,
        services: data.services,
        lastQuery: data.query,
        loading: false,
      });
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Search failed";
      set({ error: message, loading: false, products: [], services: [] });
    }
  },

  addItem: (product) =>
    set((s) => {
      const prev = s.cart.items;
      const existing = prev.find((item) => item.product.id === product.id);
      let items: CartItem[];
      if (existing) {
        items = prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      } else {
        items = [...prev, { product, quantity: 1 }];
      }
      return { cart: { ...s.cart, items } };
    }),

  removeItem: (productId) =>
    set((s) => ({
      cart: {
        ...s.cart,
        items: s.cart.items.filter((item) => item.product.id !== productId),
      },
    })),

  updateQuantity: (productId, quantity) =>
    set((s) => {
      let items: CartItem[];
      if (quantity <= 0) {
        items = s.cart.items.filter((item) => item.product.id !== productId);
      } else {
        items = s.cart.items.map((item) =>
          item.product.id === productId ? { ...item, quantity } : item,
        );
      }
      return { cart: { ...s.cart, items } };
    }),

  clearCart: () =>
    set({
      cart: { items: [], appliedDiscount: null },
    }),

  applyDiscount: (discount) =>
    set((s) => {
      if (discount) {
        return {
          cart: {
            ...s.cart,
            appliedDiscount: {
              type: discount.type,
              value: discount.value,
              label: discount.label,
            },
          },
        };
      }
      return { cart: { ...s.cart, appliedDiscount: null } };
    }),
}));

/** Stable cart slice + derived totals for POS components. */
export function usePosCart() {
  const items = usePosStore((s) => s.cart.items);
  const appliedDiscount = usePosStore((s) => s.cart.appliedDiscount);
  const addItem = usePosStore((s) => s.addItem);
  const removeItem = usePosStore((s) => s.removeItem);
  const updateQuantity = usePosStore((s) => s.updateQuantity);
  const clearCart = usePosStore((s) => s.clearCart);
  const applyDiscount = usePosStore((s) => s.applyDiscount);

  const { subtotal, discount, totalGst, total, itemCount } = cartTotals({
    items,
    appliedDiscount,
  });

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    discount,
    appliedDiscount,
    applyDiscount,
    totalGst,
    total,
    itemCount,
  };
}
