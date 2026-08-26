"use client";

import * as React from "react";
import {
  Package,
  AlertTriangle,
  Printer,
  Layers,
  PackagePlus,
} from "lucide-react";
import { motion } from "framer-motion";
// Re-export Product type from cart-context for consistency
import { useCart, Product } from "./cart-context";
import { SizeSelectionModal, ProductVariant } from "./size-selection-modal";
import {
  PosReceiveStockModal,
  type PosStockTarget,
} from "./pos-receive-stock-modal";
import { usePOSProducts, useLocationLabels } from "@/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { inventoryKeys } from "@/hooks/use-inventory";
import { EmptyState, emptyStates } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { POSProduct } from "@/services/inventory.service";
import { adminHref } from "@/lib/admin-routes";
import { toast } from "sonner";

// Get API base URL for barcode images
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000/api/v1"
    : "https://trapmultiuser.onrender.com/api/v1");

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
  productId: string;
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
  imageUrl: string | null;
}

interface ProductGridProps {
  searchQuery?: string;
  warehouseId?: string;
  warehouseName?: string;
  storeId?: string;
}

export function ProductGrid({
  searchQuery = "",
  warehouseId,
  warehouseName,
  storeId,
}: ProductGridProps) {
  const { addItem, items } = useCart();
  const { barcodeEnabled } = useLocationLabels();
  const queryClient = useQueryClient();
  const [lastAdded, setLastAdded] = React.useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] =
    React.useState<GroupedProduct | null>(null);
  const [stockTarget, setStockTarget] = React.useState<PosStockTarget | null>(
    null,
  );

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
      const productId =
        p.productId ||
        (p as POSProduct & { product_id?: string }).product_id ||
        "";

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
          productId,
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
          imageUrl:
            p.imageUrl ||
            (p as POSProduct & { image_url?: string }).image_url ||
            null,
        });
      } else {
        const existing = productMap.get(groupKey)!;
        existing.variants.push(variant);
        existing.totalStock += p.stock;
        existing.minPrice = Math.min(existing.minPrice, variant.sellingPrice);
        existing.maxPrice = Math.max(existing.maxPrice, variant.sellingPrice);
        existing.mrp = Math.max(existing.mrp, mrpVal);
        existing.hasMultipleVariants = true;
        if (!existing.productId && productId) existing.productId = productId;
        if (
          !existing.imageUrl &&
          (p.imageUrl || (p as POSProduct & { image_url?: string }).image_url)
        ) {
          existing.imageUrl =
            p.imageUrl ||
            (p as POSProduct & { image_url?: string }).image_url ||
            null;
        }
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

      const result = addItem(cartProduct);
      if (!result.ok) {
        toast.error(
          result.reason === "out_of_stock"
            ? "Out of stock"
            : `Only ${result.available} left in stock`,
        );
        return;
      }
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

    const result = addItem(cartProduct);
    if (!result.ok) {
      toast.error(
        result.reason === "out_of_stock"
          ? "Out of stock"
          : `Only ${result.available} left in stock`,
      );
      return;
    }
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
        <Package className="w-12 h-12 text-[#c45c5c] mx-auto mb-4" />
        <p className="text-[#c45c5c]">Could not load products</p>
        <p className="text-xs text-[#8a867c] mt-1">
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
          const mrpBounds = getVariantMrpBounds(product.variants);

          // Get available sizes for display
          const availableSizes = product.variants
            .filter((v) => remainingForVariant(v) > 0)
            .map((v) => v.size)
            .filter((s): s is string => s !== null && s !== undefined);
          const uniqueSizes = Array.from(new Set(availableSizes));

          const canReceiveStock = Boolean(product.productId && warehouseId);
          const canPrintBarcode =
            barcodeEnabled && Boolean(product.displayBarcode) && !isOutOfStock;

          return (
            <motion.div
              key={product.productName + product.brand}
              animate={isJustAdded ? { scale: [1, 0.95, 1] } : {}}
              transition={{ duration: 0.2 }}
              className={`
                relative flex flex-col rounded-xl text-left transition-colors
                ${
                  isOutOfStock
                    ? "bg-[var(--bg-card-fill)] border border-[var(--border-default)] opacity-60"
                    : "bg-[var(--bg-surface)] border border-[var(--border-default)] hover:border-[var(--brand)]/40 hover:bg-[var(--bg-elevated)]"
                }
              `}
            >
              {/* Stock count — top right, over image only */}
              {isOutOfStock && (
                <div className="absolute top-2.5 right-2.5 z-[1] px-2 py-1 rounded-md border border-[var(--danger)]/40 bg-[var(--danger-muted)] text-[var(--danger)] text-[10px] font-semibold uppercase tracking-wide">
                  Out of Stock
                </div>
              )}
              {!isOutOfStock && isLowStock && (
                <div
                  className="absolute top-2.5 right-2.5 z-[1] flex items-center gap-1 max-w-[min(120px,calc(100%-1rem))] px-2 py-1 rounded-md border border-[var(--warning)]/50 bg-[var(--warning)] text-[var(--brand-contrast)] text-[10px] font-semibold"
                  title={`Low stock: ${remaining} available (after cart)`}
                >
                  <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
                  <span className="truncate">{remaining} left</span>
                </div>
              )}
              {!isOutOfStock && !isLowStock && (
                <div
                  className="absolute top-2.5 right-2.5 z-[1] px-2 py-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-[10px] font-semibold tabular-nums"
                  title="Units available at this location (minus cart)"
                >
                  {remaining} left
                </div>
              )}

              {product.hasMultipleVariants && !isOutOfStock && (
                <div className="absolute top-2.5 left-2.5 z-[1] flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--brand)]/35 bg-[var(--brand-muted)] text-[var(--brand)] text-[10px] font-semibold">
                  <Layers className="w-3 h-3 shrink-0" aria-hidden />
                  <span>{product.variants.length} sizes</span>
                </div>
              )}

              {/* Main clickable area — fixed info stack, no hover layout shift */}
              <button
                type="button"
                onClick={() => handleProductClick(product)}
                disabled={isOutOfStock}
                className="flex flex-1 flex-col w-full p-3 pb-2 text-left focus:outline-none disabled:cursor-not-allowed"
              >
                <div
                  className={`
                  relative aspect-square w-full rounded-lg mb-3 flex items-center justify-center overflow-hidden
                  ${isOutOfStock ? "bg-[var(--bg-card-fill)]" : "bg-[var(--bg-elevated)]"}
                `}
                >
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote/API media URLs
                    <img
                      src={product.imageUrl}
                      alt={product.productName}
                      className={`absolute inset-0 h-full w-full object-cover ${
                        isOutOfStock ? "opacity-50 grayscale" : ""
                      }`}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget.nextElementSibling;
                        if (fallback instanceof HTMLElement) {
                          fallback.style.display = "flex";
                        }
                      }}
                    />
                  ) : null}
                  <div
                    className={`absolute inset-0 items-center justify-center ${
                      product.imageUrl ? "hidden" : "flex"
                    }`}
                  >
                    <Package
                      className={`w-10 h-10 ${
                        isOutOfStock
                          ? "text-[var(--text-muted)]/50"
                          : "text-[var(--text-muted)]"
                      } stroke-[1.5]`}
                    />
                  </div>
                </div>

                <div className="min-h-[3.25rem]">
                  <p
                    className={`text-sm font-medium leading-snug line-clamp-2 ${
                      isOutOfStock
                        ? "text-[var(--text-muted)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {product.productName}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                    {product.brand}
                  </p>
                </div>

                {product.hasMultipleVariants && uniqueSizes.length > 0 ? (
                  <div className="flex items-center gap-1 mt-1.5 min-h-[1rem]">
                    <Layers className="w-3 h-3 shrink-0 text-[var(--text-muted)]" />
                    <span className="text-[10px] text-[var(--text-secondary)] truncate">
                      {uniqueSizes.slice(0, 5).join(", ")}
                      {uniqueSizes.length > 5 && ` +${uniqueSizes.length - 5}`}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1.5 min-h-[1rem]" aria-hidden />
                )}

                <div className="mt-2 min-h-[2.75rem]">
                  {product.minPrice > 0 ? (
                    <p
                      className={`text-base font-semibold tabular-nums leading-tight ${
                        isOutOfStock
                          ? "text-[var(--text-muted)]"
                          : "text-[var(--brand)]"
                      }`}
                    >
                      <span className="text-[11px] font-medium text-[var(--text-muted)] block leading-tight">
                        Selling
                      </span>
                      <span className="inline-flex items-baseline gap-1 flex-wrap">
                        {formatCurrency(product.minPrice)}
                        {product.maxPrice > product.minPrice && (
                          <span className="text-xs text-[var(--text-muted)] font-normal">
                            – {formatCurrency(product.maxPrice)}
                          </span>
                        )}
                      </span>
                    </p>
                  ) : mrpBounds.min > 0 ? (
                    <p
                      className={`text-base font-semibold tabular-nums leading-tight ${
                        isOutOfStock
                          ? "text-[var(--text-muted)]"
                          : "text-[var(--brand)]"
                      }`}
                    >
                      <span className="text-[11px] font-medium text-[var(--text-muted)] block leading-tight">
                        MRP
                      </span>
                      <span className="inline-flex items-baseline gap-1 flex-wrap">
                        {formatCurrency(mrpBounds.min)}
                        {mrpBounds.max > mrpBounds.min && (
                          <span className="text-xs text-[var(--text-muted)] font-normal">
                            – {formatCurrency(mrpBounds.max)}
                          </span>
                        )}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-[var(--warning)] leading-snug">
                      No price set — edit in Inventory
                    </p>
                  )}
                </div>
              </button>

              {/* Stable footer — no hover pop-ins */}
              {(canReceiveStock || canPrintBarcode) && (
                <div className="flex items-center gap-2 px-3 pb-3 pt-0">
                  {canReceiveStock && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStockTarget({
                          productId: product.productId,
                          productName: product.productName,
                          brand: product.brand,
                          currentStock:
                            product.variants[0]?.stock ?? remaining,
                        });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[var(--brand)]/40 bg-[var(--brand-muted)] text-[var(--brand)] text-[10px] font-semibold hover:bg-[var(--brand)] hover:text-[var(--brand-contrast)] transition-colors"
                      title="Add or remove stock without leaving POS"
                      aria-label={`Update stock for ${product.productName}`}
                    >
                      <PackagePlus className="w-3.5 h-3.5" strokeWidth={2} />
                      Stock
                    </button>
                  )}
                  {canPrintBarcode && (
                    <button
                      type="button"
                      onClick={(e) => handlePrintBarcode(e, product)}
                      className="ml-auto p-1.5 rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--brand)]/40 hover:text-[var(--brand)] hover:bg-[var(--brand-muted)] transition-colors"
                      title="Print barcode label"
                      aria-label="Print barcode for this product"
                    >
                      <Printer className="w-4 h-4" strokeWidth={2} aria-hidden />
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}

        {filteredProducts.length === 0 && groupedProducts.length > 0 && (
          <div className="col-span-full py-16 text-center">
            <Package className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">
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

      <PosReceiveStockModal
        isOpen={stockTarget !== null}
        onClose={() => setStockTarget(null)}
        target={stockTarget}
        warehouseId={warehouseId ?? null}
        warehouseName={warehouseName}
        onSuccess={() => {
          void queryClient.invalidateQueries({
            queryKey: [...inventoryKeys.all, "pos-products"],
          });
        }}
      />
    </>
  );
}
