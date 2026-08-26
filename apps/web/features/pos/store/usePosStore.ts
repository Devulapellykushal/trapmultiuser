import { create } from "zustand";
import { persist } from "zustand/middleware";
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

/** localStorage key — bump version suffix if CartItem shape changes incompatibly */
export const POS_STORE_PERSIST_KEY = "quake-pos-v1";

export interface PosCartState {
  items: CartItem[];
  appliedDiscount: AppliedDiscount | null;
}

export interface PosStoreState {
  cart: PosCartState;
  warehouseId: string | null;
  /** Shown in POS header — e.g. shop name when selling */
  headerLocation: string | null;
  searchQuery: string;
  products: PosSearchProductRow[];
  services: PosSearchServiceRow[];
  limit: number;
  loading: boolean;
  error: string | null;
  lastQuery: string;
  /** True after localStorage rehydrate — avoid empty-cart flash on load */
  _hasHydrated: boolean;

  setWarehouseId: (id: string | null) => void;
  setHeaderLocation: (label: string | null) => void;
  setSearchQuery: (q: string) => void;
  setLimit: (n: number) => void;
  fetchPosSearch: (override?: {
    q?: string;
    warehouseId?: string;
  }) => Promise<void>;
  resetResults: () => void;
  setHasHydrated: (value: boolean) => void;

  addItem: (product: Product) => AddItemResult;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => UpdateQuantityResult;
  clearCart: () => void;
  applyDiscount: (discount: DiscountPreset | null) => void;
}

export type AddItemResult =
  | { ok: true; quantity: number }
  | { ok: false; reason: "out_of_stock" | "at_limit"; available: number };

export type UpdateQuantityResult =
  | { ok: true; quantity: number }
  | { ok: false; reason: "out_of_stock" | "at_limit"; available: number };

function stockCap(product: Product): number {
  const n = product.stock;
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function cartTotals(cart: PosCartState) {
  const subtotal = computeSubtotal(cart.items);
  const discount = computeDiscountAmount(subtotal, cart.appliedDiscount);
  const totalGst = computeTotalGst(cart.items, subtotal, discount);
  const total = computeTotal(subtotal, discount);
  const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);
  return { subtotal, discount, totalGst, total, itemCount };
}

function isValidCartItem(raw: unknown): raw is CartItem {
  if (!raw || typeof raw !== "object") return false;
  const item = raw as CartItem;
  return (
    typeof item.quantity === "number" &&
    item.quantity > 0 &&
    !!item.product &&
    typeof item.product.id === "string" &&
    typeof item.product.name === "string" &&
    !!item.product.pricing &&
    typeof item.product.pricing.sellingPrice === "number"
  );
}

function sanitizeCart(cart: unknown): PosCartState {
  if (!cart || typeof cart !== "object") {
    return { items: [], appliedDiscount: null };
  }
  const c = cart as PosCartState;
  const items = Array.isArray(c.items)
    ? c.items.filter(isValidCartItem)
    : [];
  return {
    items,
    appliedDiscount: c.appliedDiscount ?? null,
  };
}

export const usePosStore = create<PosStoreState>()(
  persist(
    (set, get) => ({
      cart: { items: [], appliedDiscount: null },
      warehouseId: null,
      headerLocation: null,
      searchQuery: "",
      products: [],
      services: [],
      limit: 20,
      loading: false,
      error: null,
      lastQuery: "",
      _hasHydrated: false,

      setHasHydrated: (value) => set({ _hasHydrated: value }),
      setWarehouseId: (id) => set({ warehouseId: id }),
      setHeaderLocation: (label) => set({ headerLocation: label }),
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

      addItem: (product) => {
        const cap = stockCap(product);
        const prev = get().cart.items;
        const existing = prev.find((item) => item.product.id === product.id);
        const currentQty = existing?.quantity ?? 0;

        if (cap <= 0) {
          return { ok: false, reason: "out_of_stock", available: 0 };
        }
        if (currentQty >= cap) {
          return { ok: false, reason: "at_limit", available: cap };
        }

        const nextQty = currentQty + 1;
        set((s) => {
          const items = existing
            ? s.cart.items.map((item) =>
                item.product.id === product.id
                  ? {
                      ...item,
                      quantity: nextQty,
                      // Keep latest stock snapshot from scan/grid
                      product: { ...item.product, ...product, stock: cap },
                    }
                  : item,
              )
            : [
                ...s.cart.items,
                { product: { ...product, stock: cap }, quantity: 1 },
              ];
          return { cart: { ...s.cart, items } };
        });
        return { ok: true, quantity: nextQty };
      },

      removeItem: (productId) =>
        set((s) => ({
          cart: {
            ...s.cart,
            items: s.cart.items.filter((item) => item.product.id !== productId),
          },
        })),

      updateQuantity: (productId, quantity) => {
        const line = get().cart.items.find(
          (item) => item.product.id === productId,
        );
        if (!line) {
          return { ok: false, reason: "out_of_stock", available: 0 };
        }
        const cap = stockCap(line.product);
        if (quantity <= 0) {
          set((s) => ({
            cart: {
              ...s.cart,
              items: s.cart.items.filter(
                (item) => item.product.id !== productId,
              ),
            },
          }));
          return { ok: true, quantity: 0 };
        }
        if (cap <= 0) {
          return { ok: false, reason: "out_of_stock", available: 0 };
        }
        if (quantity > cap) {
          set((s) => ({
            cart: {
              ...s.cart,
              items: s.cart.items.map((item) =>
                item.product.id === productId
                  ? { ...item, quantity: cap }
                  : item,
              ),
            },
          }));
          return { ok: false, reason: "at_limit", available: cap };
        }
        set((s) => ({
          cart: {
            ...s.cart,
            items: s.cart.items.map((item) =>
              item.product.id === productId
                ? { ...item, quantity }
                : item,
            ),
          },
        }));
        return { ok: true, quantity };
      },

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
    }),
    {
      name: POS_STORE_PERSIST_KEY,
      version: 1,
      // Keep draft bill like counter POS (Petpooja-style hold) across refresh
      partialize: (state) => ({
        cart: state.cart,
        warehouseId: state.warehouseId,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PosStoreState>;
        return {
          ...current,
          ...p,
          cart: sanitizeCart(p.cart ?? current.cart),
          warehouseId:
            typeof p.warehouseId === "string" || p.warehouseId === null
              ? p.warehouseId
              : current.warehouseId,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/** Clear draft cart + storage (logout / shared terminal). */
export function clearPosSession() {
  usePosStore.getState().clearCart();
  usePosStore.getState().setWarehouseId(null);
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(POS_STORE_PERSIST_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
}

/** Stable cart slice + derived totals for POS components. */
export function usePosCart() {
  const items = usePosStore((s) => s.cart.items);
  const appliedDiscount = usePosStore((s) => s.cart.appliedDiscount);
  const hasHydrated = usePosStore((s) => s._hasHydrated);
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
    hasHydrated,
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
