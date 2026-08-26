"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Upload,
  Download,
  Package,
  Layers,
  Truck,
  ChevronDown,
  ChevronUp,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { PageTransition } from "@/components/layout";
import {
  FilterBar,
  InventoryList,
  ProductDrawer,
  AddProductModal,
  ImportModal,
  AdjustStockModal,
  StockFilter,
  SortOption,
} from "@/components/inventory";
import { EmptyState, emptyStates } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Tooltip } from "@/components/ui/tooltip";
import { Pagination } from "@/components/ui/pagination";
import {
  useProducts,
  useStockSummary,
  useWarehouses,
  useInventoryWarehouseFilterStore,
} from "@/hooks";
import { useAuth } from "@/lib/auth";
import { adminHref } from "@/lib/admin-routes";
import { ProductListParams } from "@/services";

// Types matching API
interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  brand?: string;
  productCode?: string | null;
  brandCode?: string | null;
  alias?: string | null;
  description?: string;
  costPrice?: number;
  mrp?: number;
  sellingPrice: number;
  isDeleted?: boolean;
  daysInInventory?: number | null;
  firstPurchaseDate?: string | null;
  size?: string | null;
  supplierName?: string | null;
  supplierCode?: string | null;
  stock: {
    total: number;
    byWarehouse: {
      warehouseId: string;
      warehouseName: string;
      quantity: number;
    }[];
  };
  reorderThreshold?: number;
  status: "in_stock" | "low_stock" | "out_of_stock";
  /** True when API had no usable selling price (show em dash in table). */
  sellingPriceUnset?: boolean;
}

function minReorderThreshold(apiProduct: Record<string, unknown>): number {
  const direct = Number(
    (apiProduct.reorderThreshold as number | undefined) ??
      (apiProduct.reorder_threshold as number | undefined) ??
      0,
  );
  if (direct > 0) return direct;

  const variants = apiProduct.variants as
    | Array<{ reorderThreshold?: number; reorder_threshold?: number }>
    | undefined;
  if (!variants?.length) return 0;

  let min = Infinity;
  for (const v of variants) {
    const t = Number(v.reorderThreshold ?? v.reorder_threshold ?? 0);
    if (t > 0 && t < min) min = t;
  }
  return min === Infinity ? 0 : min;
}

/**
 * Stock status from API when provided; otherwise derived from ledger total vs reorder thresholds.
 */
function deriveRawStockStatus(apiProduct: Record<string, unknown>): string {
  const raw = String(apiProduct.stockStatus ?? apiProduct.stock_status ?? "").toUpperCase();
  if (["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"].includes(raw)) {
    return raw;
  }

  const total = Number(apiProduct.totalStock ?? apiProduct.total_stock ?? 0);
  const threshold = minReorderThreshold(apiProduct);

  if (total <= 0) return "OUT_OF_STOCK";
  if (threshold > 0 && total <= threshold) return "LOW_STOCK";
  return "IN_STOCK";
}

function mapStockStatus(
  apiStatus: string,
): "in_stock" | "low_stock" | "out_of_stock" {
  switch (apiStatus) {
    case "IN_STOCK":
      return "in_stock";
    case "LOW_STOCK":
      return "low_stock";
    case "OUT_OF_STOCK":
      return "out_of_stock";
    default:
      return "in_stock";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformProduct(apiProduct: any): InventoryProduct {
  // API uses CamelCaseJSONRenderer, so all fields are camelCase
  // pricing is a nested object with costPrice, mrp, sellingPrice
  const pricing = apiProduct.pricing;

  // Parse pricing values - handle both string and number formats
  const parsePricing = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const variants = apiProduct.variants as
    | Array<{ sellingPrice?: unknown; selling_price?: unknown }>
    | undefined;

  let sellingPriceFromVariant = 0;
  if (variants?.length) {
    for (const v of variants) {
      const pv = parsePricing(v.sellingPrice ?? v.selling_price);
      if (pv > 0) {
        sellingPriceFromVariant = pv;
        break;
      }
    }
  }

  const mainPrice = parsePricing(
    pricing?.sellingPrice ?? pricing?.selling_price,
  );
  const rootSelling = parsePricing(
    apiProduct.sellingPrice ?? apiProduct.selling_price,
  );
  const resolvedSelling =
    mainPrice > 0
      ? mainPrice
      : sellingPriceFromVariant > 0
        ? sellingPriceFromVariant
        : rootSelling;
  const sellingPriceUnset =
    mainPrice <= 0 &&
    sellingPriceFromVariant <= 0 &&
    rootSelling <= 0;

  return {
    id: String(apiProduct.id),
    name: apiProduct.name || apiProduct.productName || "",
    sku: apiProduct.sku || "",
    barcode: apiProduct.barcode || apiProduct.barcodeValue || "",
    category: apiProduct.category || "",
    brand: apiProduct.brand || "",
    productCode: apiProduct.productCode || null,
    brandCode: apiProduct.brandCode || null,
    alias: apiProduct.alias || null,
    description: apiProduct.description || "",
    // API returns camelCase: pricing.costPrice, pricing.mrp, pricing.sellingPrice
    costPrice: parsePricing(pricing?.costPrice ?? pricing?.cost_price),
    mrp: parsePricing(pricing?.mrp),
    sellingPrice: resolvedSelling,
    sellingPriceUnset,
    isDeleted: apiProduct.isDeleted || false,
    daysInInventory: apiProduct.daysInInventory ?? null,
    firstPurchaseDate: apiProduct.firstPurchaseDate ?? null,
    // Size from attributes or variants
    size: apiProduct.attributes?.size || apiProduct.variants?.[0]?.size || null,
    // Supplier info
    supplierName: apiProduct.supplierName || null,
    supplierCode: apiProduct.supplierCode || null,
    stock: {
      // API returns totalStock (camelCase); warehouseStock from ledger breakdown
      total: apiProduct.totalStock || 0,
      byWarehouse: (apiProduct.warehouseStock || []).map(
        (w: {
          warehouseId?: string;
          warehouse_id?: string;
          warehouseName?: string;
          warehouse_name?: string;
          quantity?: number;
        }) => ({
          warehouseId: String(w.warehouseId ?? w.warehouse_id ?? ""),
          warehouseName: String(w.warehouseName ?? w.warehouse_name ?? ""),
          quantity: Number(w.quantity ?? 0),
        }),
      ),
    },
    reorderThreshold:
      apiProduct.reorderThreshold ??
      (apiProduct.reorder_threshold as number | undefined) ??
      minReorderThreshold(apiProduct as Record<string, unknown>),
    status: mapStockStatus(
      deriveRawStockStatus(apiProduct as Record<string, unknown>),
    ),
  };
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<InventoryPageSkeleton />}>
      <InventoryPageContent />
    </Suspense>
  );
}

function InventoryPageSkeleton() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Package className="w-6 h-6 text-[#c4a574]" />
              Products
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">Loading products...</p>
          </div>
        </div>
        <SkeletonTable rows={6} />
      </div>
    </PageTransition>
  );
}

function InventoryPageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  // Pagination state
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  // Filter state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [stockFilter, setStockFilter] = React.useState<StockFilter>("all");

  React.useEffect(() => {
    const q = searchParams.get("search");
    setSearchQuery(q ?? "");
  }, [searchParams]);
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const warehouseFilter = useInventoryWarehouseFilterStore((s) => s.warehouseId);
  const setWarehouseFilter = useInventoryWarehouseFilterStore(
    (s) => s.setWarehouseId,
  );
  const [brandFilter, setBrandFilter] = React.useState("");
  const [showDeleted, setShowDeleted] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortOption>("name");

  // Collapsible sections state
  const [showVariantBreakdown, setShowVariantBreakdown] = React.useState(false);
  const [showSupplierDetails, setShowSupplierDetails] = React.useState(false);

  // Drawer state
  const [selectedProduct, setSelectedProduct] =
    React.useState<InventoryProduct | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Modal state
  const [addProductOpen, setAddProductOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [adjustStockOpen, setAdjustStockOpen] = React.useState(false);
  const [adjustStockProduct, setAdjustStockProduct] =
    React.useState<InventoryProduct | null>(null);

  /** Row checkboxes in the product table (bulk actions can use this later). */
  const [selectedProductIds, setSelectedProductIds] = React.useState<
    Set<string>
  >(() => new Set());

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [
    searchQuery,
    stockFilter,
    categoryFilter,
    warehouseFilter,
    brandFilter,
    showDeleted,
  ]);

  // Handle query param for opening Add Product modal
  React.useEffect(() => {
    if (searchParams.get("openAddProduct") === "true") {
      setAddProductOpen(true);
      window.history.replaceState({}, "", adminHref("/inventory"));
    }
  }, [searchParams]);

  React.useEffect(() => {
    return () => {
      useInventoryWarehouseFilterStore.getState().resetWarehouse();
    };
  }, []);

  // API hooks
  const {
    data: productsResponse,
    isLoading: productsLoading,
    isFetching: productsFetching,
    isError: productsError,
    refetch,
  } = useProducts({
    search: searchQuery || undefined,
    stock_status: stockFilter !== "all" ? stockFilter : undefined,
    category: categoryFilter || undefined,
    warehouse: warehouseFilter || undefined,
    brand: brandFilter || undefined,
    is_deleted: showDeleted && isAdmin ? true : undefined,
    page,
    page_size: pageSize,
  } as ProductListParams);

  const { data: stockSummary } = useStockSummary();
  const { data: warehousesData = [] } = useWarehouses();

  // Transform products
  const products: InventoryProduct[] = React.useMemo(() => {
    if (!productsResponse?.results) return [];
    return productsResponse.results.map(transformProduct);
  }, [productsResponse]);

  // Group by primary variant hint (API `size` field — e.g. apparel size, pack, grade)
  const variantSummary = React.useMemo(() => {
    const UNLABELED = "Unlabeled";
    const bucketMap: Record<string, { count: number; stock: number }> = {};
    products.forEach((product) => {
      const raw = product.size?.trim();
      const bucket = raw && raw.length > 0 ? raw : UNLABELED;
      if (!bucketMap[bucket]) {
        bucketMap[bucket] = { count: 0, stock: 0 };
      }
      bucketMap[bucket].count += 1;
      bucketMap[bucket].stock += product.stock.total;
    });
    return Object.entries(bucketMap)
      .map(([bucket, data]) => ({ bucket, ...data }))
      .sort((a, b) => b.stock - a.stock);
  }, [products]);

  // Compute supplier-wise summary
  const supplierSummary = React.useMemo(() => {
    const supplierMap: Record<string, { count: number; stock: number }> = {};
    products.forEach((product) => {
      const supplier = product.supplierName || "No Supplier";
      if (!supplierMap[supplier]) {
        supplierMap[supplier] = { count: 0, stock: 0 };
      }
      supplierMap[supplier].count += 1;
      supplierMap[supplier].stock += product.stock.total;
    });
    return Object.entries(supplierMap)
      .map(([supplier, data]) => ({ supplier, ...data }))
      .sort((a, b) => b.stock - a.stock);
  }, [products]);

  // Filter check
  const hasActiveFilters =
    searchQuery !== "" ||
    stockFilter !== "all" ||
    categoryFilter !== "" ||
    warehouseFilter !== "" ||
    brandFilter !== "" ||
    showDeleted;

  // Reset filters
  const resetFilters = () => {
    setSearchQuery("");
    setStockFilter("all");
    setCategoryFilter("");
    setWarehouseFilter("");
    setBrandFilter("");
    setShowDeleted(false);
    setSortBy("name");
    setSelectedProductIds(new Set());
  };

  // Sort products
  const sortedProducts = React.useMemo(() => {
    const result = [...products];
    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "stock":
          return b.stock.total - a.stock.total;
        case "price":
          return b.sellingPrice - a.sellingPrice;
        default:
          return 0;
      }
    });
    return result;
  }, [products, sortBy]);

  // Drop selections that are no longer on the current page / result set
  React.useEffect(() => {
    const allowed = new Set(sortedProducts.map((p) => p.id));
    setSelectedProductIds((prev) => {
      let stale = false;
      for (const id of prev) {
        if (!allowed.has(id)) {
          stale = true;
          break;
        }
      }
      if (!stale) return prev;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (allowed.has(id)) next.add(id);
      });
      return next;
    });
  }, [sortedProducts]);

  // Handlers
  const handleProductClick = (product: InventoryProduct) => {
    setSelectedProduct(product);
    setDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setTimeout(() => setSelectedProduct(null), 300);
  };

  const handleProductAdded = () => {
    refetch();
  };

  // Loading state
  if (productsLoading) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Package className="w-6 h-6 text-[#c4a574]" />
                Products
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">Loading products...</p>
            </div>
          </div>
          <SkeletonTable rows={6} />
        </div>
      </PageTransition>
    );
  }

  // Error state
  if (productsError) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Package className="w-6 h-6 text-[#c4a574]" />
            Products
          </h1>
          <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
            <ErrorState
              message="Could not load products. Check if backend is running."
              onRetry={() => refetch()}
            />
          </div>
        </div>
      </PageTransition>
    );
  }

  // Stock summary
  const summary = stockSummary || {
    total_products: 0,
    in_stock: 0,
    low_stock: 0,
    out_of_stock: 0,
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Package className="w-6 h-6 text-[#c4a574]" />
              Products
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {products.length} of {summary.total_products || products.length}{" "}
              products
              {showDeleted && " (including deleted)"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Export - Disabled */}
            <Tooltip content="Export available after data sync">
              <button
                disabled
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[var(--text-muted)] text-sm cursor-not-allowed opacity-50"
              >
                <Download className="w-4 h-4 stroke-[1.5]" />
                Export
              </button>
            </Tooltip>

            {/* Update stock - Admin only (select existing tyre + qty) */}
            {isAdmin && (
              <button
                onClick={() => {
                  setAdjustStockProduct(null);
                  setAdjustStockOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[var(--text-primary)] text-sm hover:bg-white/[0.08] transition-colors"
              >
                <SlidersHorizontal className="w-4 h-4 stroke-[1.5]" />
                Update stock
              </button>
            )}

            {/* Import - Admin only */}
            {isAdmin && (
              <button
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[var(--text-primary)] text-sm hover:bg-white/[0.08] transition-colors"
              >
                <Upload className="w-4 h-4 stroke-[1.5]" />
                Import
              </button>
            )}

            {/* Add Product - Admin only */}
            {isAdmin && (
              <button
                onClick={() => setAddProductOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#c4a574] text-white text-sm font-medium hover:bg-[#c4a574] transition-colors"
              >
                <Plus className="w-4 h-4 stroke-[2]" />
                Add a product
              </button>
            )}
          </div>
        </div>

        {/* Stock Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StockCard
            label="Total Products"
            value={summary.total_products || products.length}
          />
          <StockCard
            label="In Stock"
            value={summary.in_stock || 0}
            color="#3f9d7a"
          />
          <StockCard
            label="Low Stock"
            value={summary.low_stock || 0}
            color="#d4a054"
          />
          <StockCard
            label="Out of Stock"
            value={summary.out_of_stock || 0}
            color="#c45c5c"
          />
        </div>
        <p className="text-xs text-[var(--text-muted)] max-w-3xl">
          Summary counts are for your whole catalogue. A product shows{" "}
          <span className="text-[var(--text-primary)]">Out of stock</span> when
          it has zero units recorded—after you add a product, record incoming stock
          (purchase or stock adjustment) so the quantity matches what is on the shelf.
        </p>

        {/* Variant & supplier rollups */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Variant breakdown (uses product primary variant hint from API) */}
          <div className="rounded-xl bg-[var(--bg-surface)] backdrop-blur-xl border border-[var(--border-default)] overflow-hidden">
            <button
              onClick={() =>
                setShowVariantBreakdown(!showVariantBreakdown)
              }
              className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#c4a574] shadow-sm">
                  <Layers className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Variant breakdown
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {variantSummary.length} groups
                  </p>
                </div>
              </div>
              {showVariantBreakdown ? (
                <ChevronUp className="w-5 h-5 text-[#8a867c]" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[#8a867c]" />
              )}
            </button>
            {showVariantBreakdown && (
              <div className="px-4 pb-4 space-y-2 max-h-64 overflow-auto">
                {variantSummary.length === 0 ? (
                  <p className="text-sm text-[#8a867c] text-center py-4">
                    No products to summarize
                  </p>
                ) : (
                  variantSummary.map((item) => (
                    <div
                      key={item.bucket}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#f3eee4]">
                          {item.bucket}
                        </span>
                        <span className="text-xs text-[#8a867c]">
                          ({item.count} products)
                        </span>
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          item.stock === 0
                            ? "text-[#c45c5c]"
                            : item.stock <= 5
                              ? "text-[#d4a054]"
                              : "text-[#3f9d7a]"
                        }`}
                      >
                        {item.stock} units
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* By supplier */}
          <div className="rounded-xl bg-[var(--bg-surface)] backdrop-blur-xl border border-[var(--border-default)] overflow-hidden">
            <button
              onClick={() => setShowSupplierDetails(!showSupplierDetails)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#d4b88a] shadow-sm">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    By supplier
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {supplierSummary.length} suppliers
                  </p>
                </div>
              </div>
              {showSupplierDetails ? (
                <ChevronUp className="w-5 h-5 text-[#8a867c]" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[#8a867c]" />
              )}
            </button>
            {showSupplierDetails && (
              <div className="px-4 pb-4 space-y-2 max-h-64 overflow-auto">
                {supplierSummary.length === 0 ? (
                  <p className="text-sm text-[#8a867c] text-center py-4">
                    No supplier data available
                  </p>
                ) : (
                  supplierSummary.map((item) => (
                    <div
                      key={item.supplier}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#f3eee4]">
                          {item.supplier}
                        </span>
                        <span className="text-xs text-[#8a867c]">
                          ({item.count} products)
                        </span>
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          item.stock === 0
                            ? "text-[#c45c5c]"
                            : item.stock <= 5
                              ? "text-[#d4a054]"
                              : "text-[#3f9d7a]"
                        }`}
                      >
                        {item.stock} units
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          stockFilter={stockFilter}
          onStockFilterChange={setStockFilter}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          warehouseFilter={warehouseFilter}
          onWarehouseChange={setWarehouseFilter}
          brandFilter={brandFilter}
          onBrandChange={setBrandFilter}
          showDeleted={showDeleted}
          onShowDeletedChange={setShowDeleted}
          sortBy={sortBy}
          onSortChange={setSortBy}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {productsFetching && searchQuery.trim() !== "" ? (
          <p className="text-xs text-[var(--text-muted)] flex items-center gap-2 -mt-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            Searching products…
          </p>
        ) : null}

        {/* Product List or Empty State */}
        {products.length === 0 ? (
          <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
            <EmptyState
              icon={Package}
              title={emptyStates.inventory.title}
              description={emptyStates.inventory.description}
              actions={
                isAdmin
                  ? [
                      {
                        label: "Add a product",
                        onClick: () => setAddProductOpen(true),
                        variant: "primary",
                      },
                      {
                        label: "Import from file",
                        onClick: () => setImportOpen(true),
                        variant: "secondary",
                      },
                    ]
                  : []
              }
            />
          </div>
        ) : (
          <>
            <InventoryList
              products={sortedProducts}
              onProductClick={handleProductClick}
              selectedIds={selectedProductIds}
              onSelectionChange={setSelectedProductIds}
            />
            {/* Pagination */}
            {productsResponse?.meta && (
              <Pagination
                page={productsResponse.meta.page}
                pageSize={productsResponse.meta.pageSize}
                total={productsResponse.meta.total}
                onPageChange={setPage}
              />
            )}
          </>
        )}

        {/* Product Drawer */}
        <ProductDrawer
          product={selectedProduct}
          isOpen={drawerOpen}
          onClose={handleDrawerClose}
          onDeleted={handleProductAdded}
          onAdjustStock={
            isAdmin
              ? (product) => {
                  setAdjustStockProduct(product);
                  setAdjustStockOpen(true);
                }
              : undefined
          }
        />

        {/* Add Product Modal */}
        <AddProductModal
          isOpen={addProductOpen}
          onClose={() => setAddProductOpen(false)}
          onSuccess={handleProductAdded}
        />

        {/* Import Modal */}
        <ImportModal
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
          warehouses={warehousesData}
          onImported={() => {
            void refetch();
          }}
        />

        {/* Admin: select tyre + add/remove quantity */}
        {isAdmin && (
          <AdjustStockModal
            isOpen={adjustStockOpen}
            onClose={() => {
              setAdjustStockOpen(false);
              setAdjustStockProduct(null);
            }}
            onSuccess={() => {
              void refetch();
            }}
            product={
              adjustStockProduct
                ? {
                    id: adjustStockProduct.id,
                    name: adjustStockProduct.name,
                    sku: adjustStockProduct.sku,
                    brand: adjustStockProduct.brand,
                    stock: adjustStockProduct.stock,
                  }
                : null
            }
            warehouseId={warehouseFilter || null}
          />
        )}
      </div>
    </PageTransition>
  );
}

function StockCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-[var(--bg-surface)] backdrop-blur-xl border border-[var(--border-default)]">
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">{label}</p>
      <p
        className={`text-2xl font-bold tabular-nums mt-1 ${
          color ? "" : "text-[var(--text-primary)]"
        }`}
        style={color ? { color } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
