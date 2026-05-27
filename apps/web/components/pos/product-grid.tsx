"use client";

import * as React from "react";
import {
  ShoppingCart,
  Package,
  AlertTriangle,
  Barcode,
  Printer,
  Layers,
} from "lucide-react";
import { motion } from "framer-motion";
// Re-export Product type from cart-context for consistency
import { useCart, Product } from "./cart-context";
import { SizeSelectionModal, ProductVariant } from "./size-selection-modal";
import { usePOSProducts } from "@/hooks";
import { EmptyState, emptyStates } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { POSProduct } from "@/services/inventory.service";
import { adminHref } from "@/lib/admin-routes";

// Get API base URL for barcode images
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** MRP range from variants (ignores zeros) — for when selling price is unset */
function getVariantMrpBounds(
  variants: ProductVariant[],
): { min: number; max: number } {
  const positive = variants
    .map((v) => v.mrp ?? 0)
    .filter((m) => m > 0);
  if (!positive.length) return { min: 0, max: 0 };
  return { min: Math.min(...positive), max: Math.max(...positive) };
}

// Grouped product for display
interface GroupedProduct {
  productName: string;
  brand: string;
  category: string;
  description: string;
  variants: ProductVariant[];
  totalStock: number;
  minPrice: number;
  maxPrice: number;
  /** Min MRP among variants — used when all selling prices are 0 */
  mrp: number;
  hasMultipleVariants: boolean;
  // Use first variant's data for display
  displayBarcode: string;
  displaySku: string;
  displaySize: string | null;
}

interface ProductGridProps {
  searchQuery?: string;
  warehouseId?: string;
  storeId?: string;
}

export function ProductGrid({
  searchQuery = "",
  warehouseId,
  storeId,
}: ProductGridProps) {
  const { addItem, items } = useCart();
  const [lastAdded, setLastAdded] = React.useState<string | null>(null);
  const [showBarcodeFor, setShowBarcodeFor] = React.useState<string | null>(
    null,
  );
  const [selectedProduct, setSelectedProduct] =
    React.useState<GroupedProduct | null>(null);

  // Use POS-specific API to get flattened variants with real-time stock
  const {
    data: productsResponse,
    isLoading,
    isError,
  } = usePOSProducts({
    search: searchQuery || undefined,
    warehouse_id: warehouseId,
    store_id: storeId,
  });

  // Transform and GROUP products by base product name
  const groupedProducts: GroupedProduct[] = React.useMemo(() => {
    if (!productsResponse?.results) return [];

    // Create a map to group variants by product name + brand
    const productMap = new Map<string, GroupedProduct>();

    productsResponse.results.forEach((p: POSProduct) => {
      // Use productName if available, otherwise extract from name (before the parentheses)
      const baseName = p.productName || p.name.split(" (")[0].trim();
      const groupKey = `${p.brand}::${baseName}`;

      const mrpVal = parseFloat(p.mrp) || 0;
      const variant: ProductVariant = {
        id: p.id,
        name: p.name,
        productName: baseName,
        sku: p.sku,
        barcode: p.barcode || "",
        size: p.size,
        color: p.color,
        sellingPrice: parseFloat(p.sellingPrice) || 0,
        mrp: mrpVal,
        costPrice: parseFloat(p.costPrice) || 0,
        gstPercentage: parseFloat(p.gstPercentage) || 0,
        stock: p.stock,
        category: p.category,
        brand: p.brand,
      };

      if (!productMap.has(groupKey)) {
        productMap.set(groupKey, {
          productName: baseName,
          brand: p.brand,
          category: p.category,
          description: p.description || "",
          variants: [variant],
          totalStock: p.stock,
          minPrice: variant.sellingPrice,
          maxPrice: variant.sellingPrice,
          mrp: mrpVal || variant.sellingPrice,
          hasMultipleVariants: false,
          displayBarcode: p.barcode || "",
          displaySku: p.sku,
          displaySize: p.size,
        });
      } else {
        const existing = productMap.get(groupKey)!;
        existing.variants.push(variant);
        existing.totalStock += p.stock;
        existing.minPrice = Math.min(existing.minPrice, variant.sellingPrice);
        existing.maxPrice = Math.max(existing.maxPrice, variant.sellingPrice);
        existing.mrp = Math.max(existing.mrp, mrpVal);
        existing.hasMultipleVariants = true;
      }
    });

    return Array.from(productMap.values());
  }, [productsResponse]);

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

  const remainingForGroup = React.useCallback(
    (product: GroupedProduct) =>
      product.variants.reduce((s, v) => s + remainingForVariant(v), 0),
    [remainingForVariant],
  );

  // Filter by search (additional client-side filtering if needed)
  const filteredProducts = React.useMemo(() => {
    if (!searchQuery.trim()) return groupedProducts;
    const query = searchQuery.toLowerCase();
    return groupedProducts.filter(
      (p) =>
        p.productName.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query) ||
        p.displaySku.toLowerCase().includes(query) ||
        p.displayBarcode.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        p.variants.some(
          (v) =>
            v.sku.toLowerCase().includes(query) ||
            v.barcode.toLowerCase().includes(query),
        ),
    );
  }, [searchQuery, groupedProducts]);

  const handleProductClick = (product: GroupedProduct) => {
    // If product has multiple variants (sizes/colors), show selection modal
    if (product.hasMultipleVariants) {
      setSelectedProduct(product);
    } else {
      // Single variant - add directly to cart
      const variant = product.variants[0];
      if (remainingForVariant(variant) <= 0) return;

      const cartProduct: Product = {
        id: variant.id,
        name: variant.name,
        productName: variant.productName,
        sku: variant.sku,
        barcode: variant.barcode,
        pricing: {
          sellingPrice: variant.sellingPrice,
          gstPercentage: variant.gstPercentage || 0,
        },
        stock: variant.stock,
        category: variant.category,
        size: variant.size,
        color: variant.color,
      };

      addItem(cartProduct);
      setLastAdded(product.productName);
      setTimeout(() => setLastAdded(null), 300);
    }
  };

  const handleVariantSelect = (variant: ProductVariant) => {
    const cartProduct: Product = {
      id: variant.id,
      name: variant.name,
      productName: variant.productName,
      sku: variant.sku,
      barcode: variant.barcode,
      pricing: {
        sellingPrice: variant.sellingPrice,
        gstPercentage: variant.gstPercentage || 0,
      },
      stock: variant.stock,
      category: variant.category,
      size: variant.size,
      color: variant.color,
    };

    addItem(cartProduct);
    setLastAdded(variant.productName);
    setTimeout(() => setLastAdded(null), 300);
  };

  const handlePrintBarcode = (e: React.MouseEvent, product: GroupedProduct) => {
    e.stopPropagation();
    if (!product.displayBarcode) return;

    const printWindow = window.open("", "_blank", "width=400,height=400");
    if (!printWindow) {
      alert("Please allow popups to print barcodes");
      return;
    }

    const barcodeUrl = `${API_BASE_URL}/inventory/barcodes/${product.displayBarcode}/image/`;

    // Footwear-style categories: prepend EU prefix for numeric EU sizing heuristics
    const footwearHints = [
      "shoes",
      "footwear",
      "sneakers",
      "boots",
      "sandals",
      "heels",
      "flats",
      "loafers",
      "slippers",
    ];
    const categoryLower = product.category.toLowerCase();
    const hintsFootwear = footwearHints.some((cat) =>
      categoryLower.includes(cat),
    );

    let variantDisplay = "";
    if (product.displaySize) {
      const raw = String(product.displaySize).trim();
      const looksEuNumeric =
        hintsFootwear && /^\d+(\.\d+)?$/.test(raw) && !/^eu\s/i.test(raw);
      variantDisplay = looksEuNumeric ? `EU ${raw}` : raw;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Barcode - ${product.displaySku}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: Arial, sans-serif; 
              padding: 10mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
            }
            .label {
              text-align: center;
              padding: 4mm;
              border: 1px dashed #ccc;
              width: 50mm;
              background: white;
            }
            .brand-name {
              font-size: 9pt;
              font-weight: bold;
              text-transform: uppercase;
              margin-bottom: 2mm;
              letter-spacing: 0.5px;
            }
            .product-name {
              font-size: 8pt;
              margin-bottom: 2mm;
              word-wrap: break-word;
              line-height: 1.2;
              max-height: 3em;
              overflow: hidden;
            }
            .size-display {
              font-size: 10pt;
              font-weight: bold;
              margin-bottom: 2mm;
            }
            .mrp {
              font-size: 11pt;
              font-weight: bold;
              margin-bottom: 2mm;
            }
            .barcode-image {
              max-width: 100%;
              height: auto;
              margin: 2mm 0;
            }
            .barcode-value {
              font-size: 8pt;
              font-family: 'Courier New', monospace;
              letter-spacing: 1px;
              margin-top: 1mm;
            }
            .description {
              font-size: 7pt;
              color: #444;
              margin-top: 2mm;
              line-height: 1.2;
              max-height: 2.5em;
              overflow: hidden;
              word-wrap: break-word;
            }
            @media print {
              body { padding: 0; }
              .label { border: none; }
            }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="brand-name">${product.brand}</div>
            <div class="product-name">${product.productName}</div>
            ${variantDisplay ? `<div class="size-display">${variantDisplay}</div>` : ""}
            <div class="mrp">MRP ₹${product.mrp.toLocaleString("en-IN")}</div>
            <img src="${barcodeUrl}" alt="Barcode" class="barcode-image" />
            <div class="barcode-value">${product.displayBarcode}</div>
            ${product.description ? `<div class="description">${product.description}</div>` : ""}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-xl bg-[var(--bg-surface)] border border-white/[0.08]"
          >
            <Skeleton className="aspect-square rounded-lg mb-3" />
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-3 w-1/2 mb-2" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="py-16 text-center">
        <Package className="w-12 h-12 text-[#EC4899] mx-auto mb-4" />
        <p className="text-[#EC4899]">Could not load products</p>
        <p className="text-xs text-[#6F7285] mt-1">
          Check if backend is running
        </p>
      </div>
    );
  }

  // Empty state
  if (groupedProducts.length === 0) {
    return (
      <div className="col-span-full">
        <EmptyState
          icon={Package}
          title={emptyStates.pos.title}
          description={emptyStates.pos.description}
          actions={[
            {
              label: "Go to Inventory",
              href: adminHref("/inventory"),
              variant: "primary",
            },
          ]}
        />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filteredProducts.map((product) => {
          const remaining = remainingForGroup(product);
          const isOutOfStock = remaining <= 0;
          const isLowStock = remaining > 0 && remaining <= 5;
          const isJustAdded = lastAdded === product.productName;
          const showingBarcode = showBarcodeFor === product.productName;
          const mrpBounds = getVariantMrpBounds(product.variants);

          // Get available sizes for display
          const availableSizes = product.variants
            .filter((v) => remainingForVariant(v) > 0)
            .map((v) => v.size)
            .filter((s): s is string => s !== null && s !== undefined);
          const uniqueSizes = Array.from(new Set(availableSizes));

          return (
            <motion.div
              key={product.productName + product.brand}
              animate={isJustAdded ? { scale: [1, 0.95, 1] } : {}}
              transition={{ duration: 0.2 }}
              className={`
                relative p-4 rounded-xl text-left transition-all group
                ${
                  isOutOfStock
                    ? "bg-[#1A1B23]/40 border border-white/[0.04] opacity-60"
                    : "bg-[var(--bg-surface)] border border-white/[0.08] hover:border-[#6366F1]/40 hover:bg-[var(--bg-elevated)]"
                }
              `}
              onMouseEnter={() => setShowBarcodeFor(product.productName)}
              onMouseLeave={() => setShowBarcodeFor(null)}
            >
              {/* Main clickable area */}
              <button
                onClick={() => handleProductClick(product)}
                disabled={isOutOfStock}
                className="w-full text-left focus:outline-none"
              >
                {/* Product Image Placeholder */}
                <div
                  className={`
                  aspect-square rounded-lg mb-3 flex items-center justify-center
                  ${isOutOfStock ? "bg-white/[0.02]" : "bg-white/[0.03]"}
                `}
                >
                  <Package
                    className={`w-10 h-10 ${
                      isOutOfStock ? "text-[#6F7285]/50" : "text-[#6F7285]"
                    } stroke-[1.5]`}
                  />
                </div>

                {/* Product Info */}
                <p
                  className={`text-sm font-medium truncate ${
                    isOutOfStock ? "text-[#6F7285]" : "text-[var(--text-primary)]"
                  }`}
                >
                  {product.productName}
                </p>
                <p className="text-xs text-[#6F7285] mt-0.5">{product.brand}</p>

                {/* Available Sizes Preview (if multiple variants) */}
                {product.hasMultipleVariants && uniqueSizes.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <Layers className="w-3 h-3 text-[#6F7285]" />
                    <span className="text-[10px] text-[#A1A4B3]">
                      {uniqueSizes.slice(0, 5).join(", ")}
                      {uniqueSizes.length > 5 && ` +${uniqueSizes.length - 5}`}
                    </span>
                  </div>
                )}

                {/* Barcode on hover */}
                {product.displayBarcode && showingBarcode && (
                  <p className="flex items-center gap-1 text-xs text-[#6366F1] mt-0.5">
                    <Barcode className="w-3 h-3" />
                    {product.displayBarcode}
                  </p>
                )}

                <div className="mt-2 space-y-0.5">
                  {product.minPrice > 0 ? (
                    <p
                      className={`text-base font-semibold tabular-nums ${
                        isOutOfStock ? "text-[#6F7285]" : "text-[#6366F1]"
                      }`}
                    >
                      <span className="text-[11px] font-medium text-[#6F7285] block leading-tight">
                        Selling
                      </span>
                      <span className="inline-flex items-baseline gap-1 flex-wrap">
                        {formatCurrency(product.minPrice)}
                        {product.maxPrice > product.minPrice && (
                          <span className="text-xs text-[#6F7285] font-normal">
                            – {formatCurrency(product.maxPrice)}
                          </span>
                        )}
                      </span>
                    </p>
                  ) : mrpBounds.min > 0 ? (
                    <p
                      className={`text-base font-semibold tabular-nums ${
                        isOutOfStock ? "text-[#6F7285]" : "text-[#C6A15B]"
                      }`}
                    >
                      <span className="text-[11px] font-medium text-[#6F7285] block leading-tight">
                        MRP (set selling price in inventory)
                      </span>
                      <span className="inline-flex items-baseline gap-1 flex-wrap">
                        {formatCurrency(mrpBounds.min)}
                        {mrpBounds.max > mrpBounds.min && (
                          <span className="text-xs text-[#6F7285] font-normal">
                            – {formatCurrency(mrpBounds.max)}
                          </span>
                        )}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-[#F5A623]/90 leading-snug">
                      No selling price or MRP on file — edit product in Inventory
                      to set prices.
                    </p>
                  )}
                </div>
              </button>

              {/* Stock Badge */}
              {isOutOfStock && (
                <div className="absolute top-3 right-3 z-[1] px-2 py-1 rounded-md border border-rose-400/55 bg-neutral-950/90 text-rose-200 text-[10px] font-semibold uppercase tracking-wide shadow-sm ring-1 ring-rose-500/35">
                  Out of Stock
                </div>
              )}
              {!isOutOfStock && isLowStock && (
                <div
                  className="absolute top-3 right-3 z-[1] flex items-center gap-1 max-w-[min(140px,calc(100%-1rem))] px-2 py-1 rounded-md border border-amber-400/70 bg-amber-500 text-neutral-950 text-[10px] font-semibold shadow-sm ring-1 ring-amber-200/90"
                  title={`Low stock: ${remaining} available (after cart)`}
                >
                  <AlertTriangle
                    className="w-3 h-3 shrink-0 text-neutral-900"
                    aria-hidden
                  />
                  <span className="truncate">{remaining} left</span>
                </div>
              )}
              {!isOutOfStock && !isLowStock && (
                <div
                  className="absolute top-3 right-3 z-[1] px-2 py-1 rounded-md border border-white/[0.12] bg-slate-950/90 text-[#A1A4B3] text-[10px] font-semibold tabular-nums shadow-sm"
                  title="Units available at this location (minus cart)"
                >
                  {remaining} left
                </div>
              )}

              {/* Multiple Sizes Indicator */}
              {product.hasMultipleVariants && !isOutOfStock && (
                <div className="absolute top-3 left-3 z-[1] flex items-center gap-1 px-2 py-1 rounded-md border border-indigo-400/40 bg-slate-900/95 text-indigo-100 text-[10px] font-semibold shadow-sm">
                  <Layers className="w-3 h-3 shrink-0 text-indigo-200" aria-hidden />
                  <span>{product.variants.length} sizes</span>
                </div>
              )}

              {/* Print Barcode Button - on hover */}
              {product.displayBarcode && showingBarcode && !isOutOfStock && (
                <button
                  type="button"
                  onClick={(e) => handlePrintBarcode(e, product)}
                  className="absolute bottom-3 right-3 z-[1] p-1.5 rounded-md border border-indigo-400/45 bg-slate-950/95 text-indigo-200 hover:bg-indigo-500/20 hover:text-white transition-colors shadow-sm"
                  title="Print barcode label"
                  aria-label="Print barcode for this product"
                >
                  <Printer className="w-4 h-4" strokeWidth={2} aria-hidden />
                </button>
              )}

              {/* Add indicator when not showing barcode */}
              {!isOutOfStock && !showingBarcode && (
                <div
                  className="absolute bottom-3 right-3 z-[1] p-1.5 rounded-md border border-indigo-400/40 bg-slate-950/95 text-indigo-200 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm pointer-events-none"
                  title="Click card to add"
                  aria-hidden
                >
                  <ShoppingCart className="w-4 h-4" strokeWidth={2} />
                </div>
              )}
            </motion.div>
          );
        })}

        {filteredProducts.length === 0 && groupedProducts.length > 0 && (
          <div className="col-span-full py-16 text-center">
            <Package className="w-12 h-12 text-[#6F7285] mx-auto mb-4" />
            <p className="text-[#A1A4B3]">
              No products found for &quot;{searchQuery}&quot;
            </p>
          </div>
        )}
      </div>

      {/* Size Selection Modal */}
      <SizeSelectionModal
        isOpen={selectedProduct !== null}
        onClose={() => setSelectedProduct(null)}
        productName={selectedProduct?.productName || ""}
        brand={selectedProduct?.brand || ""}
        variants={selectedProduct?.variants || []}
        onSelectVariant={handleVariantSelect}
      />
    </>
  );
}
