"use client";

import * as React from "react";
import { X, Package, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "./cart-context";
import { useIndustryProfile } from "@/lib/industry";

export interface ProductVariant {
  id: string;
  name: string;
  productName: string;
  sku: string;
  barcode: string;
  size: string | null;
  color: string | null;
  sellingPrice: number;
  /** List price reference when selling price is unset in POS payloads */
  mrp?: number;
  costPrice?: number;
  gstPercentage?: number;
  stock: number;
  category: string;
  brand: string;
}

interface SizeSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  brand: string;
  variants: ProductVariant[];
  onSelectVariant: (variant: ProductVariant) => void;
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Group variants by color (if multiple colors exist)
function groupVariantsByColor(
  variants: ProductVariant[],
): Map<string, ProductVariant[]> {
  const grouped = new Map<string, ProductVariant[]>();

  variants.forEach((variant) => {
    const colorKey = variant.color || "Default";
    if (!grouped.has(colorKey)) {
      grouped.set(colorKey, []);
    }
    grouped.get(colorKey)!.push(variant);
  });

  return grouped;
}

// Sort sizes in a logical order
function sortSizes(variants: ProductVariant[]): ProductVariant[] {
  const sizeOrder: Record<string, number> = {
    XXS: 1,
    XS: 2,
    S: 3,
    M: 4,
    L: 5,
    XL: 6,
    XXL: 7,
    XXXL: 8,
    "2XL": 7,
    "3XL": 8,
    "4XL": 9,
    "5XL": 10,
  };

  return [...variants].sort((a, b) => {
    const sizeA = a.size?.toUpperCase() || "";
    const sizeB = b.size?.toUpperCase() || "";

    // Check if both are in predefined order
    const orderA = sizeOrder[sizeA];
    const orderB = sizeOrder[sizeB];

    if (orderA !== undefined && orderB !== undefined) {
      return orderA - orderB;
    }

    // Try numeric comparison for shoe sizes (6, 7, 8, 9, 10, etc.)
    const numA = parseFloat(sizeA);
    const numB = parseFloat(sizeB);

    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }

    // Fallback to alphabetical
    return sizeA.localeCompare(sizeB);
  });
}

export function SizeSelectionModal({
  isOpen,
  onClose,
  productName,
  brand,
  variants,
  onSelectVariant,
}: SizeSelectionModalProps) {
  const industry = useIndustryProfile();
  const { items } = useCart();
  const qtyByVariantId = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const id = it.product.id;
      m.set(id, (m.get(id) || 0) + it.quantity);
    }
    return m;
  }, [items]);

  const remainingForVariant = React.useCallback(
    (v: ProductVariant) => Math.max(0, v.stock - (qtyByVariantId.get(v.id) || 0)),
    [qtyByVariantId],
  );

  const [selectedColor, setSelectedColor] = React.useState<string | null>(null);

  // Group variants by color
  const colorGroups = React.useMemo(
    () => groupVariantsByColor(variants),
    [variants],
  );
  const colors = Array.from(colorGroups.keys());
  const hasMultipleColors = colors.length > 1;

  // Auto-select first color if not selected
  React.useEffect(() => {
    if (isOpen && colors.length > 0 && !selectedColor) {
      setSelectedColor(colors[0]);
    }
  }, [isOpen, colors, selectedColor]);

  // Reset selection when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setSelectedColor(colors.length > 0 ? colors[0] : null);
    }
  }, [isOpen, colors]);

  // Get variants for selected color
  const displayVariants = React.useMemo(() => {
    if (!selectedColor) return [];
    const colorVariants = colorGroups.get(selectedColor) || [];
    return sortSizes(colorVariants);
  }, [colorGroups, selectedColor]);

  // Check if any variant has size attribute
  const hasSize = variants.some((v) => v.size);

  const handleSelect = (variant: ProductVariant) => {
    if (remainingForVariant(variant) > 0) {
      onSelectVariant(variant);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 modal-scrim z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md modal-panel rounded-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#c4a574]/10">
                  <Package className="w-5 h-5 text-[#c4a574]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    Select {hasSize ? industry.variantOptionLabel : "Variant"}
                  </h2>
                  <p className="text-sm text-[#8a867c]">
                    {brand} - {productName}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
              >
                <X className="w-5 h-5 text-[#8a867c]" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Color Selection (if multiple colors) */}
              {hasMultipleColors && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#c5c0b5]">
                    Color
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((color) => {
                      const isSelected = selectedColor === color;
                      const colorVariants = colorGroups.get(color) || [];
                      const totalRemaining = colorVariants.reduce(
                        (sum, v) => sum + remainingForVariant(v),
                        0,
                      );
                      const isOutOfStock = totalRemaining === 0;

                      return (
                        <button
                          key={color}
                          onClick={() =>
                            !isOutOfStock && setSelectedColor(color)
                          }
                          disabled={isOutOfStock}
                          className={`
                            px-4 py-2 rounded-lg text-sm font-medium transition-all
                            ${
                              isSelected
                                ? "bg-[var(--brand)] text-[var(--brand-contrast)]"
                                : isOutOfStock
                                  ? "bg-[var(--bg-card-fill)] text-[var(--text-muted)] cursor-not-allowed line-through"
                                  : "bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--brand-muted)]"
                            }
                          `}
                        >
                          {color}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size Selection */}
              <div className="space-y-2">
                {hasSize && (
                  <label className="text-sm font-medium text-[#c5c0b5]">
                    {industry.variantOptionLabel}
                  </label>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {displayVariants.map((variant) => {
                    const left = remainingForVariant(variant);
                    const isOutOfStock = left === 0;
                    const isLowStock = left > 0 && left <= 5;
                    const displayLabel =
                      variant.size || variant.color || "Default";

                    return (
                      <button
                        key={variant.id}
                        onClick={() => handleSelect(variant)}
                        disabled={isOutOfStock}
                        className={`
                          relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all
                          ${
                            isOutOfStock
                              ? "bg-white/[0.02] border-white/[0.04] opacity-50 cursor-not-allowed"
                              : "bg-white/[0.03] border-white/[0.08] hover:border-[#c4a574]/50 hover:bg-[#c4a574]/10 cursor-pointer"
                          }
                        `}
                      >
                        <span
                          className={`text-base font-semibold ${
                            isOutOfStock
                              ? "text-[#8a867c] line-through"
                              : "text-[var(--text-primary)]"
                          }`}
                        >
                          {displayLabel}
                        </span>
                        <span
                          className={`text-xs mt-1 ${
                            isOutOfStock
                              ? "text-[#c45c5c]"
                              : isLowStock
                                ? "text-[#d4b88a]"
                                : "text-[#8a867c]"
                          }`}
                        >
                          {isOutOfStock
                            ? "Out"
                            : isLowStock
                              ? `Only ${left}`
                              : `${left} left`}
                        </span>
                        {isLowStock && !isOutOfStock && (
                          <AlertTriangle className="absolute top-1 right-1 w-3 h-3 text-[#d4b88a]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Price Info */}
              {displayVariants.length > 0 && (
                <div className="pt-3 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#c5c0b5]">Price</span>
                    <span className="text-lg font-semibold text-[#c4a574]">
                      {formatCurrency(displayVariants[0].sellingPrice)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/[0.08] bg-white/[0.02]">
              <p className="text-xs text-[#8a867c] text-center">
                Tap a size to add to cart
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
