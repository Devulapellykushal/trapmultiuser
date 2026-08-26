"use client";

import * as React from "react";
import {
  Trash2,
  Plus,
  Minus,
  ShoppingCart,
  Percent,
  ChevronDown,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart, CartItem, DiscountPreset } from "./cart-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Local format helper
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// API response type
interface POSDiscountOptions {
  discountEnabled: boolean;
  maxDiscountPercent: string;
  availableDiscounts: DiscountPreset[];
}

export function CartPanel() {
  const {
    items,
    hasHydrated,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    discount,
    appliedDiscount,
    applyDiscount,
    total,
    itemCount,
  } = useCart();

  const [showDiscountMenu, setShowDiscountMenu] = React.useState(false);

  // Fetch available discounts from API
  const { data: discountOptions } = useQuery<POSDiscountOptions>({
    queryKey: ["pos-discount-options"],
    queryFn: () =>
      api.get<POSDiscountOptions>("/invoices/settings/pos-discounts/"),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleSelectDiscount = (preset: DiscountPreset) => {
    applyDiscount(preset);
    setShowDiscountMenu(false);
  };

  const handleClearDiscount = () => {
    applyDiscount(null);
    setShowDiscountMenu(false);
  };

  const handleClearCart = () => {
    if (items.length === 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Clear all items from this bill?")
    ) {
      return;
    }
    clearCart();
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)]">
      {/* Cart Header */}
      <div className="p-4 border-b border-white/[0.08]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Cart
          </h2>
          <div className="flex items-center gap-2">
            {hasHydrated && items.length > 0 && (
              <button
                type="button"
                onClick={handleClearCart}
                className="px-2 py-1 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--danger)] hover:bg-[var(--danger-muted)] transition-colors"
                title="Clear bill"
              >
                Clear
              </button>
            )}
            <span className="px-2.5 py-1 rounded-full bg-[#c4a574]/10 text-[#c4a574] text-xs font-medium tabular-nums">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          </div>
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        <AnimatePresence mode="popLayout">
          {!hasHydrated ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <p className="text-[#8a867c] text-xs">Restoring cart…</p>
            </div>
          ) : items.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-center py-8"
            >
              <div className="w-16 h-16 rounded-full bg-white/[0.05] flex items-center justify-center mb-4">
                <ShoppingCart className="w-8 h-8 text-[#8a867c]" />
              </div>
              <p className="text-[#c5c0b5] text-sm">Cart is empty</p>
              <p className="text-[#8a867c] text-xs mt-1">
                Scan or select products to add
              </p>
            </motion.div>
          ) : (
            items.map((item) => (
              <CartItemRow
                key={item.product.id}
                item={item}
                onRemove={() => removeItem(item.product.id)}
                onUpdateQuantity={(qty) => updateQuantity(item.product.id, qty)}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Totals */}
      <div className="p-4 border-t border-white/[0.08] space-y-3">
        {/* Discount Selector */}
        {discountOptions?.discountEnabled !== false && (
          <div className="relative">
            {appliedDiscount ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#c4a574]/10 border border-[#c4a574]/30">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-[#c4a574]" />
                  <span className="text-sm text-[#c4a574]">
                    {appliedDiscount.label}
                  </span>
                </div>
                <button
                  onClick={handleClearDiscount}
                  className="p-1 rounded hover:bg-white/[0.1] transition-colors"
                >
                  <X className="w-4 h-4 text-[#c4a574]" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDiscountMenu(!showDiscountMenu)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-[#c5c0b5]" />
                  <span className="text-sm text-[#c5c0b5]">Add Discount</span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-[#8a867c] transition-transform ${showDiscountMenu ? "rotate-180" : ""}`}
                />
              </button>
            )}

            {/* Discount Dropdown */}
            <AnimatePresence>
              {showDiscountMenu && !appliedDiscount && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-full left-0 right-0 mb-2 p-2 rounded-lg popover-panel shadow-lg z-[80]"
                >
                  <div className="text-xs text-[#8a867c] mb-2 px-2">
                    Select Discount
                  </div>
                  {(discountOptions?.availableDiscounts || []).map(
                    (preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectDiscount(preset)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[var(--text-primary)] hover:bg-white/[0.05] transition-colors"
                      >
                        <span
                          className={
                            preset.type === "PERCENT"
                              ? "text-[#c4a574]"
                              : "text-[#d4b88a]"
                          }
                        >
                          {preset.type === "PERCENT" ? "%" : "₹"}
                        </span>
                        {preset.label}
                      </button>
                    ),
                  )}
                  {(!discountOptions?.availableDiscounts ||
                    discountOptions.availableDiscounts.length === 0) && (
                    <p className="text-xs text-[#8a867c] px-3 py-2">
                      No discounts available
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Summary */}
        <div className="space-y-2 pt-2">
          <div className="flex justify-between text-sm">
            <span className="text-[#c5c0b5]">Subtotal</span>
            <span className="text-[var(--text-primary)] tabular-nums font-medium">
              {formatCurrency(subtotal)}
            </span>
          </div>
          {discount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex justify-between text-sm"
            >
              <span className="text-[#c4a574]">
                {appliedDiscount?.label || "Discount"}
              </span>
              <span className="text-[#c4a574] tabular-nums font-medium">
                -{formatCurrency(discount)}
              </span>
            </motion.div>
          )}
          <div className="h-px bg-white/[0.08]" />
          <div className="flex justify-between items-center pt-1">
            <span className="text-lg font-semibold text-[var(--text-primary)]">Total</span>
            <motion.span
              key={total}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              className="text-2xl font-bold text-[var(--brand)] tabular-nums"
            >
              {formatCurrency(total)}
            </motion.span>
          </div>
        </div>
      </div>
    </div>
  );
}

function clampLineQuantity(product: CartItem["product"], next: number): number {
  if (next <= 0) return 0;
  const cap = product.stock;
  if (typeof cap === "number" && cap > 0) {
    return Math.min(next, cap);
  }
  return next;
}

// Cart Item Row Component
function CartItemRow({
  item,
  onRemove,
  onUpdateQuantity,
}: {
  item: CartItem;
  onRemove: () => void;
  onUpdateQuantity: (qty: number) => void;
}) {
  const [qtyDraft, setQtyDraft] = React.useState(String(item.quantity));

  React.useEffect(() => {
    setQtyDraft(String(item.quantity));
  }, [item.quantity]);

  const commitQtyDraft = () => {
    const raw = qtyDraft.replace(/\D/g, "");
    if (raw === "") {
      setQtyDraft(String(item.quantity));
      return;
    }
    let n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      setQtyDraft(String(item.quantity));
      return;
    }
    n = clampLineQuantity(item.product, n);
    onUpdateQuantity(n);
    setQtyDraft(String(n));
  };

  // Build variant label (size / color)
  const variantParts: string[] = [];
  if (item.product.size) variantParts.push(item.product.size);
  if (item.product.color) variantParts.push(item.product.color);
  const variantLabel = variantParts.join(" / ");

  // Use productName if available, otherwise fall back to name
  const displayName = item.product.productName || item.product.name;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]"
    >
      <div className="flex items-center gap-3">
        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
            {displayName}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {variantLabel && (
              <span className="px-1.5 py-0.5 rounded-md border border-[var(--brand)]/35 bg-[var(--brand-muted)] text-[var(--brand)] text-[10px] font-semibold">
                {variantLabel}
              </span>
            )}
            <span className="text-xs text-[var(--text-muted)]">
              {formatCurrency(item.product.pricing?.sellingPrice || 0)} each
            </span>
          </div>
        </div>

        {/* Quantity Controls (+ manual entry) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() =>
              onUpdateQuantity(
                clampLineQuantity(item.product, item.quantity - 1),
              )
            }
            className="p-2 rounded-md hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors"
          >
            <Minus className="w-4 h-4 text-[#c5c0b5]" />
          </button>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label={`Quantity for ${displayName}`}
            title="Type quantity, press Enter or click away to apply"
            value={qtyDraft}
            onChange={(e) =>
              setQtyDraft(e.target.value.replace(/\D/g, "").slice(0, 7))
            }
            onBlur={commitQtyDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="min-w-[2.25rem] max-w-[4.5rem] w-14 px-1 py-1.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-center text-sm font-semibold text-[var(--text-primary)] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#c4a574]/50"
          />
          <button
            type="button"
            onClick={() =>
              onUpdateQuantity(
                clampLineQuantity(item.product, item.quantity + 1),
              )
            }
            className="p-2 rounded-md hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors"
          >
            <Plus className="w-4 h-4 text-[#c5c0b5]" />
          </button>
        </div>

        {/* Remove — explicit label + outline so icon is never mistaken for an empty block */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${displayName} from cart`}
          title="Remove from cart"
          className="p-2 rounded-md border border-red-500/50 bg-red-950/40 text-red-300 hover:bg-red-500/20 hover:text-red-100 active:bg-red-500/30 transition-colors"
        >
          <Trash2 className="w-4 h-4" strokeWidth={2} aria-hidden />
        </button>
      </div>

      {/* Line Total */}
      <div className="flex justify-end mt-2 pt-2 border-t border-white/[0.04]">
        <span className="text-sm font-medium text-[#c4a574] tabular-nums">
          {formatCurrency(
            (item.product.pricing?.sellingPrice || 0) * item.quantity,
          )}
        </span>
      </div>
    </motion.div>
  );
}
