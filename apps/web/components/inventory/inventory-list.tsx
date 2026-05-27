"use client";

import * as React from "react";
import { Package, ChevronRight, Barcode, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getStockColor(status: string): string {
  switch (status) {
    case "in_stock":
      return "#2ECC71";
    case "low_stock":
      return "#F5A623";
    case "out_of_stock":
      return "#E74C3C";
    default:
      return "#6F7285";
  }
}

function getStockLabel(status: string): string {
  switch (status) {
    case "in_stock":
      return "In Stock";
    case "low_stock":
      return "Low Stock";
    case "out_of_stock":
      return "Out of Stock";
    default:
      return status;
  }
}

function formatDaysInInventory(days: number | null | undefined): string {
  if (days === null || days === undefined) {
    return "-";
  }
  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "1 day";
  }
  return `${days} days`;
}

export interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  sellingPrice: number;
  barcode?: string;
  brand?: string;
  productCode?: string | null;
  brandCode?: string | null;
  alias?: string | null;
  costPrice?: number;
  reorderThreshold?: number;
  isDeleted?: boolean;
  daysInInventory?: number | null;
  firstPurchaseDate?: string | null;
  stock: {
    total: number;
    byWarehouse: {
      warehouseId: string;
      warehouseName: string;
      quantity: number;
    }[];
  };
  status: "in_stock" | "low_stock" | "out_of_stock";
  sellingPriceUnset?: boolean;
}

interface InventoryListProps {
  products: InventoryProduct[];
  onProductClick: (product: InventoryProduct) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

/** Shared column scale: table-fixed distributes width; fractions must sum visually with flex extras (checkbox narrow). */
const TABLE_COL_CLASSES =
  "[&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-3 [&_td]:py-3";

export function InventoryList({
  products,
  onProductClick,
  selectedIds = new Set(),
  onSelectionChange,
}: InventoryListProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const headerCheckboxRef = React.useRef<HTMLInputElement>(null);

  const allIdsSelected =
    products.length > 0 && products.every((p) => selectedIds.has(p.id));
  const someSelected = products.some((p) => selectedIds.has(p.id));

  React.useEffect(() => {
    const el = headerCheckboxRef.current;
    if (el) {
      el.indeterminate = someSelected && !allIdsSelected;
    }
  }, [someSelected, allIdsSelected]);

  const toggleRowSelection = (productId: string) => {
    if (!onSelectionChange) return;
    const newSelection = new Set(selectedIds);
    if (newSelection.has(productId)) {
      newSelection.delete(productId);
    } else {
      newSelection.add(productId);
    }
    onSelectionChange(newSelection);
  };

  const handleHeaderCheckboxChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    e.stopPropagation();
    if (!onSelectionChange) return;
    if (e.target.checked) {
      onSelectionChange(new Set(products.map((p) => p.id)));
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleRowKeyDown = (
    e: React.KeyboardEvent<HTMLTableRowElement>,
    product: InventoryProduct,
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onProductClick(product);
    }
  };

  if (products.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/[0.05] mb-4">
          <Package className="w-8 h-8 text-[#6F7285] stroke-[1.5]" />
        </div>
        <h3 className="text-lg font-semibold text-[#F5F6FA] mb-2">
          No products found
        </h3>
        <p className="text-sm text-[#A1A4B3]">
          Try adjusting your filters or search query
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#1A1B23]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
      <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
        {/* Desktop: semantic table — header/body columns stay aligned */}
        <table
          className={`hidden md:table w-full min-w-[860px] table-fixed border-collapse text-left ${TABLE_COL_CLASSES}`}
        >
          <colgroup>
            <col className="w-10" />
            <col className="min-w-[11rem]" style={{ width: "26%" }} />
            <col className="min-w-[7rem]" style={{ width: "16%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "11%" }} />
            <col className="w-[4.25rem]" />
            <col className="w-[4rem]" />
            <col style={{ width: "12%" }} />
            <col className="min-w-[5.5rem]" style={{ width: "10%" }} />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr className="bg-[#1A1B23] border-b border-white/[0.08] text-xs font-medium text-[#6F7285] uppercase tracking-wide sticky top-0 z-10 shadow-[0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
              <th scope="col" className="text-center align-middle">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  disabled={!onSelectionChange}
                  checked={allIdsSelected}
                  onChange={handleHeaderCheckboxChange}
                  onClick={(e) => e.stopPropagation()}
                  className={`w-4 h-4 rounded border-2 border-white/[0.15] bg-transparent ${
                    onSelectionChange
                      ? "cursor-pointer opacity-100"
                      : "cursor-not-allowed opacity-50"
                  }`}
                  title={
                    onSelectionChange
                      ? "Select all products on this page"
                      : "Selection unavailable"
                  }
                  aria-label="Select all products on this page"
                />
              </th>
              <th scope="col" className="align-middle font-medium">
                Product
              </th>
              <th scope="col" className="align-middle font-medium">
                SKU
              </th>
              <th scope="col" className="align-middle font-medium">
                Brand
              </th>
              <th scope="col" className="align-middle font-medium">
                Category
              </th>
              <th
                scope="col"
                className="align-middle font-medium text-right tabular-nums"
              >
                Stock
              </th>
              <th
                scope="col"
                className="align-middle font-medium text-center whitespace-nowrap"
              >
                Age
              </th>
              <th scope="col" className="align-middle font-medium">
                Status
              </th>
              <th
                scope="col"
                className="align-middle font-medium text-right whitespace-nowrap"
              >
                Price
              </th>
              <th scope="col" className="w-10 p-0">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {products.map((product, index) => {
              const isHovered = hoveredId === product.id;
              const isSelected = selectedIds.has(product.id);
              const isDeleted = product.isDeleted;

              return (
                <motion.tr
                  key={product.id}
                  layout={false}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.02, 0.45) }}
                  tabIndex={0}
                  role="button"
                  onClick={() => onProductClick(product)}
                  onKeyDown={(e) => handleRowKeyDown(e, product)}
                  onMouseEnter={() => setHoveredId(product.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  aria-label={`Open ${product.name}`}
                  className={`
                    cursor-pointer transition-colors duration-150
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C6A15B]
                    ${isDeleted ? "opacity-50" : ""}
                    ${isHovered || isSelected ? "bg-white/[0.04]" : ""}
                    ${!isHovered && !isSelected ? "hover:bg-white/[0.03]" : ""}
                    ${isSelected ? "bg-[#C6A15B]/5" : ""}
                  `}
                >
                  <td className="align-middle text-center">
                    <div className="inline-flex items-center justify-center p-1 rounded-md hover:bg-white/[0.06]">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!onSelectionChange}
                        aria-label={`Select ${product.name}`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleRowSelection(product.id)}
                        className={`w-4 h-4 rounded border-2 border-white/[0.2] bg-transparent checked:bg-[#C6A15B] checked:border-[#C6A15B] ${
                          onSelectionChange
                            ? "cursor-pointer"
                            : "cursor-not-allowed opacity-50"
                        }`}
                      />
                    </div>
                  </td>
                  <td className="align-middle min-w-0">
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0 overflow-hidden">
                        <Package className="w-5 h-5 text-[#6F7285] stroke-[1.5]" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-[#F5F6FA] truncate">
                            {product.name}
                          </span>
                          {isDeleted && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#E74C3C]/20 text-[#E74C3C] flex items-center gap-1">
                              <Trash2 className="w-2.5 h-2.5" />
                              Deleted
                            </span>
                          )}
                        </div>
                        {product.barcode && isHovered && (
                          <span className="flex items-center gap-1 text-xs text-[#6F7285] truncate">
                            <Barcode className="w-3 h-3 flex-shrink-0" />
                            {product.barcode}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="align-middle min-w-0">
                    <span
                      className="font-mono text-sm text-[#A1A4B3] break-all min-w-0"
                      title={product.sku}
                    >
                      {product.sku}
                    </span>
                  </td>
                  <td className="align-middle min-w-0">
                    <span className="text-sm text-[#A1A4B3] truncate block">
                      {product.brand || "—"}
                    </span>
                  </td>
                  <td className="align-middle min-w-0">
                    <span className="text-sm text-[#A1A4B3] truncate block">
                      {product.category}
                    </span>
                  </td>
                  <td className="align-middle text-right tabular-nums">
                    <span className="text-sm text-[#F5F6FA]">
                      {product.stock.total}
                    </span>
                  </td>
                  <td className="align-middle text-center">
                    <span
                      className="text-sm text-[#A1A4B3]"
                      title={
                        product.firstPurchaseDate
                          ? `Since ${product.firstPurchaseDate}`
                          : "No purchase order"
                      }
                    >
                      {formatDaysInInventory(product.daysInInventory)}
                    </span>
                  </td>
                  <td className="align-middle">
                    <StockBadge status={product.status} />
                  </td>
                  <td className="align-middle text-right tabular-nums min-w-0">
                    <span className="text-sm font-medium text-[#C6A15B]">
                      {product.sellingPriceUnset ? (
                        <span className="text-[#6F7285] font-normal">—</span>
                      ) : (
                        formatCurrency(product.sellingPrice)
                      )}
                    </span>
                  </td>
                  <td className="align-middle text-center pr-4">
                    <ChevronRight
                      className={`inline w-4 h-4 text-[#6F7285] transition-opacity duration-150 ${
                        isHovered ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-white/[0.06]">
          {products.map((product, index) => {
            const isHovered = hoveredId === product.id;
            const isSelected = selectedIds.has(product.id);
            const isDeleted = product.isDeleted;

            return (
              <motion.button
                key={product.id}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.5) }}
                onClick={() => onProductClick(product)}
                onMouseEnter={() => setHoveredId(product.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`
                  w-full grid grid-cols-1 gap-2 px-4 py-4 text-left cursor-pointer
                  transition-all duration-150 ease-out
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C6A15B]
                  ${isDeleted ? "opacity-50" : ""}
                  ${isHovered || isSelected ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"}
                  ${isSelected ? "bg-[#C6A15B]/5" : ""}
                `}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!onSelectionChange}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleRowSelection(product.id)}
                      className={`w-4 h-4 rounded border-2 border-white/[0.2] bg-transparent checked:bg-[#C6A15B] checked:border-[#C6A15B] ${
                        onSelectionChange
                          ? "cursor-pointer"
                          : "cursor-not-allowed opacity-50"
                      }`}
                      aria-label={`Select ${product.name}`}
                    />
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-[#6F7285] stroke-[1.5]" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#F5F6FA]">
                        {product.name}
                      </span>
                      {isDeleted && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#E74C3C]/20 text-[#E74C3C]">
                          Deleted
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-[#A1A4B3] mt-1">
                      <span className="font-mono break-all text-left flex-1 min-w-0">
                        {product.sku}
                      </span>
                      <span>{product.category}</span>
                    </div>
                  </div>
                  <StockBadge status={product.status} />
                </div>

                <div className="flex items-center justify-between pl-14 pr-1 text-xs">
                  <span className="text-[#6F7285]">
                    Stock: {product.stock.total}
                  </span>
                  <span className="text-sm font-semibold text-[#C6A15B] tabular-nums">
                    {product.sellingPriceUnset ? (
                      <span className="text-[#6F7285] font-normal text-xs">
                        —
                      </span>
                    ) : (
                      formatCurrency(product.sellingPrice)
                    )}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StockBadge({ status }: { status: string }) {
  const color = getStockColor(status);
  const label = getStockLabel(status);

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium max-w-full"
      style={{
        backgroundColor: `${color}15`,
        color: color,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
