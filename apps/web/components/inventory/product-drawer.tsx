"use client";

import * as React from "react";
import {
  X,
  Package,
  MapPin,
  Tag,
  Barcode,
  Printer,
  Trash2,
  Loader2,
  Building2,
  Pencil,
  ChevronDown,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useDeactivateProduct, useWarehouses } from "@/hooks";
import { useAuth } from "@/lib/auth";
import { EditProductModal } from "./edit-product-modal";

// Local helpers
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
      return "#3f9d7a";
    case "low_stock":
      return "#d4a054";
    case "out_of_stock":
      return "#c45c5c";
    default:
      return "#8a867c";
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

// Get API base URL
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000/api/v1"
    : "https://trapmultiuser.onrender.com/api/v1");

// Product type - Phase 10B enhanced
interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  barcode?: string;
  barcodeImageUrl?: string;
  brand?: string;
  productCode?: string | null;
  brandCode?: string | null;
  alias?: string | null;
  description?: string;
  costPrice?: number;
  mrp?: number;
  sellingPrice: number;
  reorderThreshold?: number;
  isDeleted?: boolean;
  size?: string | null;
  stock: {
    total: number;
    byWarehouse: {
      warehouseId: string;
      warehouseName: string;
      quantity: number;
    }[];
  };
  status: "in_stock" | "low_stock" | "out_of_stock";
}

interface ProductDrawerProps {
  product: InventoryProduct | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: () => void;
  /** Admin: open stock add/remove for this product */
  onAdjustStock?: (product: InventoryProduct) => void;
}

export function ProductDrawer({
  product,
  isOpen,
  onClose,
  onDeleted,
  onAdjustStock,
}: ProductDrawerProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [showBarcodePreview, setShowBarcodePreview] = React.useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = React.useState<
    string | null
  >(null);
  const [isWarehouseDropdownOpen, setIsWarehouseDropdownOpen] =
    React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const deactivateMutation = useDeactivateProduct();
  const { data: warehouses = [], isLoading: isLoadingWarehouses } =
    useWarehouses();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  // Get selected warehouse info
  const selectedWarehouse = React.useMemo(() => {
    if (!selectedWarehouseId) return null;
    return warehouses.find((w) => w.id === selectedWarehouseId) || null;
  }, [selectedWarehouseId, warehouses]);

  // Get stock for selected warehouse
  const selectedWarehouseStock = React.useMemo(() => {
    if (!selectedWarehouseId || !product?.stock.byWarehouse) return null;
    const warehouseStock = product.stock.byWarehouse.find(
      (wh) => wh.warehouseId === selectedWarehouseId,
    );
    return warehouseStock?.quantity ?? 0;
  }, [selectedWarehouseId, product?.stock.byWarehouse]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsWarehouseDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Reset delete confirm when drawer closes
  React.useEffect(() => {
    if (!isOpen) {
      setShowDeleteConfirm(false);
      setShowEditModal(false);
      setShowBarcodePreview(false);
      setSelectedWarehouseId(null);
      setIsWarehouseDropdownOpen(false);
    }
  }, [isOpen]);

  // Handle product deletion (soft delete)
  const handleDelete = async () => {
    if (!product) return;

    try {
      await deactivateMutation.mutateAsync(product.id);
      setShowDeleteConfirm(false);
      onClose();
      onDeleted?.();
    } catch (error) {
      console.error("Failed to deactivate product:", error);
    }
  };

  // Build label HTML sized for TVS LP-46 printer: 50mm × 25mm (1:2 ratio) at 203 DPI
  const buildLabelHtml = (p: InventoryProduct, forPrint: boolean): string => {
    const barcodeUrl = `${API_BASE_URL}/inventory/barcodes/${p.barcode}/image/`;
    const displayPrice = p.mrp || p.sellingPrice;
    const autoClose = forPrint
      ? `<script>window.onload=function(){setTimeout(function(){window.print();window.close();},400);};<\/script>`
      : "";
    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>Barcode - ${p.sku}</title>
<style>
  @page { size: 50mm 25mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 50mm; height: 25mm; overflow: hidden; font-family: Arial, Helvetica, sans-serif; background: #fff; }
  .label { width: 50mm; height: 25mm; padding: 1mm 1.5mm 0.5mm; display: flex; flex-direction: column; justify-content: space-between; }
  .brand-name { font-size: 6.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.3px; line-height: 1; white-space: nowrap; overflow: hidden; }
  .product-name { font-size: 5.5pt; line-height: 1.15; word-break: break-word; }
  .brand-code-line { font-size: 5.5pt; font-weight: bold; line-height: 1; }
  .mrp { font-size: 7pt; font-weight: bold; line-height: 1; }
  .barcode-wrap { display: flex; flex-direction: column; align-items: flex-start; line-height: 1; }
  .barcode-image { height: 7mm; width: auto; max-width: 100%; display: block; }
  .barcode-number { font-size: 4.5pt; font-family: 'Courier New', monospace; letter-spacing: 0.5px; margin-top: 0.3mm; }
  .alias { font-size: 4.5pt; font-style: italic; line-height: 1; white-space: nowrap; overflow: hidden; }
  @media print { @page { size: 50mm 25mm; margin: 0; } body { width: 50mm; height: 25mm; } }
</style>
</head>
<body>
  <div class="label">
    <div class="brand-name">${p.brand || ""}</div>
    <div class="product-name">${p.name}${p.productCode ? ` [${p.productCode}]` : ""}</div>
    ${p.brandCode ? `<div class="brand-code-line">${p.brandCode}</div>` : ""}
    <div class="mrp">MRP &#8377;${displayPrice.toLocaleString("en-IN")}</div>
    <div class="barcode-wrap">
      <img src="${barcodeUrl}" alt="Barcode" class="barcode-image"/>
      <div class="barcode-number">${p.productCode || p.barcode}</div>
    </div>
    ${p.alias ? `<div class="alias">${p.alias}</div>` : ""}
  </div>
  ${autoClose}
</body></html>`;
  };

  const handleViewBarcode = () => setShowBarcodePreview(true);

  const handlePrintBarcode = (p: InventoryProduct) => {
    const printWindow = window.open("", "_blank", "width=600,height=400");
    if (!printWindow) {
      alert("Please allow popups to print barcodes");
      return;
    }
    printWindow.document.write(buildLabelHtml(p, true));
    printWindow.document.close();
  };

  if (!product) return null;

  const statusColor = getStockColor(product.status);
  const statusLabel = getStockLabel(product.status);

  const drawer = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — portaled so it is not offset by dashboard layout */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 modal-scrim"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer — flush to viewport top/bottom */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0, y: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md h-dvh bg-[var(--bg-modal)] border-l border-[var(--border-default)] shadow-2xl overflow-hidden"
            style={{ top: 0, right: 0, bottom: 0, height: "100dvh" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-drawer-title"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--border-default)] shrink-0">
                <h2
                  id="product-drawer-title"
                  className="text-lg font-semibold text-[var(--text-primary)]"
                >
                  Product Details
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-[var(--bg-surface)] transition-colors"
                  aria-label="Close drawer"
                >
                  <X className="w-5 h-5 text-[var(--text-secondary)]" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-4 space-y-6">
                {/* Product Image Placeholder */}
                <div className="aspect-square max-w-[200px] mx-auto rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                  <Package className="w-16 h-16 text-[#8a867c] stroke-[1]" />
                </div>

                {/* Basic Info */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-semibold text-[#f3eee4] mb-2">
                      {product.name}
                    </h3>
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-medium"
                      style={{
                        backgroundColor: `${statusColor}15`,
                        color: statusColor,
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: statusColor }}
                      />
                      {statusLabel}
                    </span>
                    {product.isDeleted && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-medium bg-[#c45c5c]/20 text-[#c45c5c] ml-2">
                        <Trash2 className="w-3 h-3" />
                        Deleted
                      </span>
                    )}
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <InfoCard icon={Barcode} label="SKU" value={product.sku} />
                    <InfoCard
                      icon={Tag}
                      label="Category"
                      value={product.category}
                    />
                    {product.brand && (
                      <InfoCard
                        icon={Building2}
                        label="Brand"
                        value={product.brand}
                      />
                    )}
                  </div>
                </div>

                {/* Warehouse Selection Dropdown */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-[#c5c0b5] uppercase tracking-wide">
                    Select Warehouse
                  </h4>
                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() =>
                        setIsWarehouseDropdownOpen(!isWarehouseDropdownOpen)
                      }
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[#f3eee4] hover:bg-white/[0.05] transition-colors"
                      disabled={isLoadingWarehouses}
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#8a867c]" />
                        <span className="text-sm">
                          {isLoadingWarehouses
                            ? "Loading warehouses..."
                            : selectedWarehouse
                              ? selectedWarehouse.name
                              : "Select a warehouse"}
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-[#8a867c] transition-transform ${
                          isWarehouseDropdownOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* Dropdown Menu */}
                    <AnimatePresence>
                      {isWarehouseDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.15 }}
                          className="absolute z-[80] w-full mt-1 py-1 rounded-lg popover-panel max-h-48 overflow-auto"
                        >
                          {warehouses.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-[#8a867c]">
                              No warehouses available
                            </div>
                          ) : (
                            warehouses.map((warehouse) => {
                              const warehouseStock =
                                product.stock.byWarehouse?.find(
                                  (wh) => wh.warehouseId === warehouse.id,
                                );
                              const stockQty = warehouseStock?.quantity ?? 0;

                              return (
                                <button
                                  key={warehouse.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedWarehouseId(warehouse.id);
                                    setIsWarehouseDropdownOpen(false);
                                  }}
                                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.05] transition-colors ${
                                    selectedWarehouseId === warehouse.id
                                      ? "bg-[#c4a574]/10"
                                      : ""
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-[#8a867c]" />
                                    <span className="text-sm text-[#f3eee4]">
                                      {warehouse.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-xs font-medium tabular-nums ${
                                        stockQty === 0
                                          ? "text-[#c45c5c]"
                                          : stockQty <= 5
                                            ? "text-[#d4a054]"
                                            : "text-[#3f9d7a]"
                                      }`}
                                    >
                                      {stockQty} units
                                    </span>
                                    {selectedWarehouseId === warehouse.id && (
                                      <Check className="w-4 h-4 text-[#c4a574]" />
                                    )}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Selected Warehouse Stock Info */}
                  {selectedWarehouse && (
                    <div className="rounded-lg border border-[#c4a574]/30 bg-[#1c1d22] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-[#c5c0b5]">
                            Stock at this warehouse
                          </p>
                          <p className="mt-0.5 truncate text-sm font-semibold text-[#f3eee4]">
                            {selectedWarehouse.name}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-[#c5c0b5]">
                            On hand
                          </p>
                          <p
                            className={`mt-0.5 text-xl font-bold tabular-nums ${
                              selectedWarehouseStock === 0
                                ? "text-[#c45c5c]"
                                : selectedWarehouseStock !== null &&
                                    selectedWarehouseStock <= 5
                                  ? "text-[#d4a054]"
                                  : "text-[#f3eee4]"
                            }`}
                          >
                            {selectedWarehouseStock ?? 0}
                            <span className="text-sm font-semibold text-[#c5c0b5]">
                              {" "}
                              units
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Barcode Section */}
                {product.barcode && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-[#c5c0b5] uppercase tracking-wide">
                      Barcode
                    </h4>
                    <div className="p-4 rounded-lg bg-white border border-white/[0.08] text-center">
                      {/* Barcode image: public SVG endpoint; use <img> so no next/image remote host config */}
                      <div className="mb-3">
                        {/* eslint-disable-next-line @next/next/no-img-element -- API SVG; avoids next/image host config */}
                        <img
                          src={`${API_BASE_URL}/inventory/barcodes/${product.barcode}/image/`}
                          alt={`Barcode ${product.barcode}`}
                          width={200}
                          height={96}
                          className="mx-auto max-h-24 w-auto"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                      <p className="text-sm font-mono text-gray-800">
                        {product.barcode}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleViewBarcode}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] font-medium hover:bg-white/[0.08] transition-colors"
                      >
                        <Barcode className="w-4 h-4" />
                        View Label
                      </button>
                      <button
                        onClick={() => handlePrintBarcode(product)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#c4a574]/10 border border-[#c4a574]/20 text-[#c4a574] font-medium hover:bg-[#c4a574]/20 transition-colors"
                      >
                        <Printer className="w-4 h-4" />
                        Print
                      </button>
                    </div>
                  </div>
                )}

                {/* Stock by Warehouse */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-[#c5c0b5] uppercase tracking-wide">
                    Stock by Warehouse
                  </h4>
                  <div className="space-y-2">
                    {product.stock.byWarehouse &&
                    product.stock.byWarehouse.length > 0 ? (
                      product.stock.byWarehouse.map((wh) => (
                        <div
                          key={wh.warehouseId}
                          className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                        >
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-[#8a867c]" />
                            <span className="text-sm text-[#f3eee4]">
                              {wh.warehouseName}
                            </span>
                          </div>
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              wh.quantity === 0
                                ? "text-[#c45c5c]"
                                : wh.quantity <= 5
                                  ? "text-[#d4a054]"
                                  : "text-[#f3eee4]"
                            }`}
                          >
                            {wh.quantity} units
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-sm leading-relaxed text-[#c5c0b5]">
                        <p className="font-medium text-[#f3eee4]">
                          No breakdown by warehouse
                        </p>
                        <p className="mt-1 text-[#8a867c]">
                          Receipts or stock transfers will populate per-location
                          quantities. Total below is still the sum across
                          warehouses.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-white/[0.1] bg-[#1c1d22] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-[#c5c0b5]">
                        Total stock (all locations)
                      </span>
                      <span className="text-lg font-bold text-[#f3eee4] tabular-nums">
                        {product.stock.total}
                        <span className="text-sm font-semibold text-[#c5c0b5] ml-1">
                          units
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pricing */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-[#c5c0b5] uppercase tracking-wide">
                    Pricing
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-xs text-[#8a867c] mb-1">Cost</p>
                      <p className="text-lg font-semibold text-[#f3eee4] tabular-nums">
                        {formatCurrency(product.costPrice || 0)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-xs text-[#8a867c] mb-1">MRP</p>
                      <p className="text-lg font-semibold text-[#c5c0b5] tabular-nums">
                        {formatCurrency(product.mrp || product.sellingPrice)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#c4a574]/35 bg-[#1c1d22] p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#c5c0b5] mb-1">
                        Selling price
                      </p>
                      <p className="text-lg font-semibold text-[#f3eee4] tabular-nums">
                        {formatCurrency(product.sellingPrice)}
                      </p>
                      {product.sellingPrice <= 0 && (
                        <p className="mt-2 text-[11px] leading-snug text-[#d4a054]">
                          Not set — use Edit to add a selling price (POS uses
                          this amount).
                        </p>
                      )}
                    </div>
                  </div>
                  <div
                    className={`rounded-lg border p-3 ${
                      product.costPrice && product.costPrice > 0
                        ? "border-[#3f9d7a]/30 bg-[#1c1d22]"
                        : "border-white/[0.08] bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm ${
                          product.costPrice && product.costPrice > 0
                            ? "text-[#3f9d7a]"
                            : "text-[#8a867c]"
                        }`}
                      >
                        Profit margin
                      </span>
                      {product.costPrice && product.costPrice > 0 ? (
                        <span className="text-sm font-semibold text-[#3f9d7a] tabular-nums">
                          {Math.round(
                            ((product.sellingPrice - product.costPrice) /
                              product.costPrice) *
                              100,
                          )}
                          %
                        </span>
                      ) : (
                        <span className="text-xs text-right leading-snug text-[#c5c0b5]">
                          Add cost price to calculate margin
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/[0.08] space-y-3">
                {/* Delete Confirmation */}
                {showDeleteConfirm ? (
                  <div className="p-3 rounded-lg bg-[#c45c5c]/10 border border-[#c45c5c]/30">
                    <p className="text-sm text-[#c45c5c] mb-3">
                      Are you sure you want to deactivate this product? It will
                      be hidden from inventory and POS.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={deactivateMutation.isPending}
                        className="flex-1 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] text-sm font-medium hover:bg-white/[0.08] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={deactivateMutation.isPending}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[#c45c5c] text-white text-sm font-medium hover:bg-[#c45c5c] transition-colors disabled:opacity-50"
                      >
                        {deactivateMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Deactivating...
                          </>
                        ) : (
                          "Yes, Deactivate"
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {/* Update stock - Admin only */}
                    {isAdmin && !product.isDeleted && onAdjustStock && (
                      <button
                        type="button"
                        onClick={() => onAdjustStock(product)}
                        className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-lg bg-[#c4a574]/15 border-2 border-[#c4a574]/45 text-[#d4b88a] text-sm font-semibold hover:bg-[#c4a574]/25 hover:border-[#c4a574]/70 transition-colors shadow-sm"
                      >
                        <SlidersHorizontal className="w-4 h-4 shrink-0" aria-hidden />
                        <span>Update stock</span>
                      </button>
                    )}
                    {/* Edit button */}
                    {!product.isDeleted && (
                      <button
                        type="button"
                        onClick={() => setShowEditModal(true)}
                        className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-lg bg-[#0c0d10] border-2 border-[#c4a574]/60 text-[#e0cba0] text-sm font-semibold hover:bg-[#c4a574]/15 hover:border-[#c4a574] transition-colors shadow-sm"
                      >
                        <Pencil className="w-4 h-4 shrink-0" aria-hidden />
                        <span>Edit product</span>
                      </button>
                    )}
                    {/* Delete button - Admin only */}
                    {isAdmin && !product.isDeleted && (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-lg bg-[#0c0d10] border-2 border-red-500/55 text-red-200 text-sm font-semibold hover:bg-red-500/15 hover:border-red-400 transition-colors shadow-sm"
                      >
                        <Trash2 className="w-4 h-4 shrink-0" aria-hidden />
                        <span>Deactivate</span>
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="flex-1 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] font-medium hover:bg-white/[0.08] transition-colors"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Barcode Label Preview Modal */}
          <AnimatePresence>
            {showBarcodePreview && product && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[60] modal-scrim"
                  onClick={() => setShowBarcodePreview(false)}
                  aria-hidden="true"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="fixed inset-0 z-[70] flex items-center justify-center p-4"
                >
                  <div className="bg-[#111318] rounded-2xl border border-white/[0.08] shadow-2xl w-full max-w-sm overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
                      <div>
                        <h3 className="text-base font-semibold text-[#f3eee4]">
                          Barcode Label Preview
                        </h3>
                        <p className="text-xs text-[#8a867c] mt-0.5">
                          50mm × 25mm — TVS LP-46 (1:2 ratio)
                        </p>
                      </div>
                      <button
                        onClick={() => setShowBarcodePreview(false)}
                        className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
                      >
                        <X className="w-4 h-4 text-[#c5c0b5]" />
                      </button>
                    </div>

                    {/* Label preview — iframe renders exact print HTML at 3× scale */}
                    <div className="p-6 flex flex-col items-center gap-4">
                      <div
                        className="relative rounded border border-dashed border-[#8a867c]"
                        style={{ width: "300px", height: "150px" }}
                      >
                        <iframe
                          srcDoc={buildLabelHtml(product, false)}
                          title="Barcode Label Preview"
                          style={{
                            width: "50mm",
                            height: "25mm",
                            border: "none",
                            transformOrigin: "top left",
                            transform: "scale(2.267)",
                          }}
                          sandbox="allow-same-origin"
                        />
                      </div>
                      <p className="text-xs text-[#8a867c] text-center">
                        Preview shown at 3× actual size
                      </p>
                    </div>

                    <div className="flex gap-3 p-4 border-t border-white/[0.08]">
                      <button
                        onClick={() => setShowBarcodePreview(false)}
                        className="flex-1 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] text-sm font-medium hover:bg-white/[0.08] transition-colors"
                      >
                        Close
                      </button>
                      <button
                        onClick={() => {
                          setShowBarcodePreview(false);
                          handlePrintBarcode(product);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#c4a574] text-[#0c0d10] text-sm font-medium hover:bg-[#d4b88a] transition-colors"
                      >
                        <Printer className="w-4 h-4" />
                        Print
                      </button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Edit Product Modal */}
          <EditProductModal
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            onSuccess={() => {
              // Refresh the data
              onDeleted?.(); // Reuse the onDeleted callback to trigger a refresh
            }}
            product={
              product
                ? {
                    id: product.id,
                    name: product.name,
                    brand: product.brand || "",
                    category: product.category,
                    costPrice: product.costPrice,
                    mrp: product.mrp,
                    sellingPrice: product.sellingPrice,
                  }
                : null
            }
          />
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(drawer, document.body);
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-[#8a867c]" />
        <span className="text-xs text-[#8a867c]">{label}</span>
      </div>
      <p className="text-sm font-medium text-[#f3eee4]">{value}</p>
    </div>
  );
}
