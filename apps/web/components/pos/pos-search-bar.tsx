"use client";

import * as React from "react";
import { Search, Loader2 } from "lucide-react";
import { usePosStore } from "@/features/pos/store/usePosStore";
import { usePosCart } from "@/features/pos/store/usePosStore";
import type { PosSearchProductRow } from "@/services/sales.service";
import type { Product } from "@/features/pos/types";
import { toast } from "sonner";

function rowToProduct(row: PosSearchProductRow): Product {
  const sp = parseFloat(row.selling_price) || 0;
  const gst = parseFloat(row.gst_percentage) || 0;
  const cost = parseFloat(row.pricing?.cost_price || "0") || 0;
  return {
    id: row.product_id,
    name: row.product_name,
    sku: row.sku,
    barcode: row.barcode || row.variant_barcode || "",
    pricing: {
      sellingPrice: sp,
      costPrice: cost,
      gstPercentage: gst,
    },
    stock: row.available_stock,
    category: "",
    size: row.size ?? null,
    color: row.color ?? null,
    productName: row.product_name,
  };
}

interface PosSearchBarProps {
  enabled: boolean;
}

export function PosSearchBar({ enabled }: PosSearchBarProps) {
  const warehouseId = usePosStore((s) => s.warehouseId);
  const searchQuery = usePosStore((s) => s.searchQuery);
  const setSearchQuery = usePosStore((s) => s.setSearchQuery);
  const products = usePosStore((s) => s.products);
  const services = usePosStore((s) => s.services);
  const loading = usePosStore((s) => s.loading);
  const error = usePosStore((s) => s.error);
  const fetchPosSearch = usePosStore((s) => s.fetchPosSearch);
  const { addItem } = usePosCart();

  React.useEffect(() => {
    if (!enabled || !warehouseId) return;
    const t = window.setTimeout(() => {
      void fetchPosSearch({ q: searchQuery, warehouseId });
    }, 320);
    return () => window.clearTimeout(t);
  }, [enabled, warehouseId, searchQuery, fetchPosSearch]);

  if (!enabled) return null;

  return (
    <div className="mb-4 space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search products…"
          disabled={!warehouseId}
          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand)]/50"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--brand)] animate-spin" />
        )}
      </div>
      {error && (
        <p className="text-xs text-[var(--danger)]">{error}</p>
      )}
      {(products.length > 0 || services.length > 0) && searchQuery.trim() && (
        <div className="max-h-40 overflow-y-auto rounded-xl popover-panel divide-y divide-[var(--border-default)] shadow-md">
          {products.map((row) => (
            <button
              key={row.product_id}
              type="button"
              disabled={!row.can_fulfill}
              onClick={() => {
                const result = addItem(rowToProduct(row));
                if (!result.ok) {
                  toast.error(
                    result.reason === "out_of_stock"
                      ? "Out of stock"
                      : `Only ${result.available} left in stock`,
                  );
                  return;
                }
                setSearchQuery("");
                usePosStore.getState().resetResults();
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--brand-muted)] disabled:opacity-40 disabled:pointer-events-none"
            >
              <span className="text-[var(--text-primary)]">{row.product_name}</span>
              <span className="text-[var(--text-muted)] ml-2 tabular-nums">
                ₹{parseFloat(row.selling_price).toFixed(0)} · stock{" "}
                {row.available_stock}
              </span>
            </button>
          ))}
          {services.map((s) => (
            <div
              key={s.service_item_id}
              className="px-3 py-2 text-xs text-[var(--text-muted)]"
              title="Service checkout from cart is not wired yet"
            >
              Service: {s.service_name} (add via dedicated flow)
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
