"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Loader2,
  Minus,
  Package,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AxiosError } from "axios";
import {
  useAdjustStock,
  useProducts,
  useWarehouses,
} from "@/hooks/use-inventory";
import { useLocationLabels } from "@/hooks/use-business-setup";
import { useIndustryProfile } from "@/lib/industry";

export interface AdjustStockProductOption {
  id: string;
  name: string;
  sku?: string;
  brand?: string;
  stock: {
    total: number;
    byWarehouse: {
      warehouseId: string;
      warehouseName: string;
      quantity: number;
    }[];
  };
}

interface AdjustStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** When opened from a product row/drawer, lock selection to that tyre. */
  product?: AdjustStockProductOption | null;
  /** Prefer this warehouse when opening. */
  warehouseId?: string | null;
}

type AdjustMode = "add" | "remove";

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as
      | { error?: string; detail?: string; reason?: string[] }
      | undefined;
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
    if (typeof data?.detail === "string" && data.detail.trim())
      return data.detail;
    if (Array.isArray(data?.reason) && data.reason[0]) return data.reason[0];
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not update stock. Please try again.";
}

function mapApiProduct(raw: Record<string, unknown>): AdjustStockProductOption {
  const byWarehouseRaw = (raw.warehouseStock ??
    raw.warehouse_stock ??
    []) as Array<Record<string, unknown>>;
  return {
    id: String(raw.id),
    name: String(raw.name ?? "Unnamed"),
    sku: raw.sku != null ? String(raw.sku) : undefined,
    brand: raw.brand != null ? String(raw.brand) : undefined,
    stock: {
      total: Number(raw.totalStock ?? raw.total_stock ?? 0),
      byWarehouse: byWarehouseRaw.map((wh) => ({
        warehouseId: String(wh.warehouseId ?? wh.warehouse_id ?? ""),
        warehouseName: String(
          wh.warehouseName ?? wh.warehouse_name ?? "Warehouse",
        ),
        quantity: Number(wh.quantity ?? 0),
      })),
    },
  };
}

function stockAtWarehouse(
  product: AdjustStockProductOption,
  warehouseId: string,
): number {
  const row = product.stock.byWarehouse.find(
    (wh) => wh.warehouseId === warehouseId,
  );
  return row?.quantity ?? 0;
}

/**
 * Admin Update stock — multi-select tyres + qty each (same idea as shop transfer).
 * When opened from a single product drawer, that tyre stays locked.
 */
export function AdjustStockModal({
  isOpen,
  onClose,
  onSuccess,
  product: lockedProduct = null,
  warehouseId: initialWarehouseId = null,
}: AdjustStockModalProps) {
  const [mode, setMode] = React.useState<AdjustMode>("add");
  const [reason, setReason] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  /** Keep selected product rows even if search results change */
  const [selectedCache, setSelectedCache] = React.useState<
    Record<string, AdjustStockProductOption>
  >({});
  /** Empty string = not typed yet (type 7 → 7, not 17) */
  const [qtyById, setQtyById] = React.useState<Record<string, string>>({});
  const [selectedWarehouseId, setSelectedWarehouseId] =
    React.useState<string>("");
  const [productSearch, setProductSearch] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [isBatchSaving, setIsBatchSaving] = React.useState(false);

  const adjustMutation = useAdjustStock();
  const { labels, isSingleShop } = useLocationLabels();
  const industry = useIndustryProfile();
  const { data: warehouses = [], isLoading: warehousesLoading } =
    useWarehouses();

  const searchEnabled = isOpen && !lockedProduct;
  const { data: productsResponse, isFetching: productsFetching } = useProducts(
    {
      search: productSearch.trim() || undefined,
      page: 1,
      page_size: 80,
    },
    { enabled: searchEnabled },
  );

  const catalog = React.useMemo(() => {
    if (lockedProduct) return [lockedProduct];
    const results = productsResponse?.results ?? [];
    if (!Array.isArray(results)) return [];
    return results.map((p) =>
      mapApiProduct(p as unknown as Record<string, unknown>),
    );
  }, [lockedProduct, productsResponse]);

  const selectedProducts = React.useMemo(() => {
    if (lockedProduct && selectedIds.has(lockedProduct.id)) {
      return [lockedProduct];
    }
    const list: AdjustStockProductOption[] = [];
    for (const id of selectedIds) {
      const p = selectedCache[id] ?? catalog.find((c) => c.id === id);
      if (p) list.push(p);
    }
    return list;
  }, [selectedIds, selectedCache, catalog, lockedProduct]);

  // Reset / seed when opened
  React.useEffect(() => {
    if (!isOpen) return;
    setMode("add");
    setReason("");
    setFieldError(null);
    setProductSearch("");
    setIsBatchSaving(false);

    if (lockedProduct) {
      setSelectedIds(new Set([lockedProduct.id]));
      setSelectedCache({ [lockedProduct.id]: lockedProduct });
      setQtyById({ [lockedProduct.id]: "" });
    } else {
      setSelectedIds(new Set());
      setSelectedCache({});
      setQtyById({});
    }

    const activeWarehouses = warehouses.filter((w) => w.isActive !== false);
    if (initialWarehouseId) {
      setSelectedWarehouseId(initialWarehouseId);
    } else if (activeWarehouses.length === 1) {
      setSelectedWarehouseId(activeWarehouses[0].id);
    } else if (
      lockedProduct?.stock.byWarehouse.length === 1 &&
      lockedProduct.stock.byWarehouse[0]?.warehouseId
    ) {
      setSelectedWarehouseId(lockedProduct.stock.byWarehouse[0].warehouseId);
    } else {
      setSelectedWarehouseId("");
    }
  }, [isOpen, lockedProduct, initialWarehouseId, warehouses]);

  const defaultReason = mode === "add" ? "Stock received" : "Stock removed";

  const toggleProduct = (product: AdjustStockProductOption) => {
    if (lockedProduct) return;
    setFieldError(null);
    const id = product.id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectedCache((c) => {
          const copy = { ...c };
          delete copy[id];
          return copy;
        });
        setQtyById((q) => {
          const copy = { ...q };
          delete copy[id];
          return copy;
        });
      } else {
        next.add(id);
        setSelectedCache((c) => ({ ...c, [id]: product }));
        setQtyById((q) => ({ ...q, [id]: q[id] ?? "" }));
      }
      return next;
    });
  };

  const setLineQtyInput = (id: string, raw: string) => {
    setFieldError(null);
    const digits = raw.replace(/\D/g, "");
    setQtyById((q) => ({ ...q, [id]: digits }));
  };

  const bumpLineQty = (id: string, delta: number) => {
    setFieldError(null);
    setQtyById((q) => {
      const current = Math.max(0, Math.floor(Number(q[id]) || 0));
      const next = Math.max(0, current + delta);
      return { ...q, [id]: next === 0 ? "" : String(next) };
    });
  };

  const totalUnits = selectedProducts.reduce((sum, p) => {
    return sum + Math.max(0, Math.floor(Number(qtyById[p.id]) || 0));
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    if (!selectedWarehouseId) {
      setFieldError(`Select a ${labels.warehouseSingular}.`);
      return;
    }
    if (selectedProducts.length === 0) {
      setFieldError(industry.labels.stockSelect);
      return;
    }

    const lines: {
      product: AdjustStockProductOption;
      qty: number;
      onHand: number;
    }[] = [];

    for (const product of selectedProducts) {
      const qty = Math.max(0, Math.floor(Number(qtyById[product.id]) || 0));
      if (qty < 1) {
        setFieldError(`Enter quantity for ${product.name}.`);
        return;
      }
      const onHand = stockAtWarehouse(product, selectedWarehouseId);
      if (mode === "remove" && qty > onHand) {
        setFieldError(
          `${product.name}: only ${onHand} on hand, you asked to remove ${qty}.`,
        );
        return;
      }
      lines.push({ product, qty, onHand });
    }

    const reasonText = (reason.trim() || defaultReason).trim();
    if (reasonText.length < 5) {
      setFieldError("Reason must be at least 5 characters.");
      return;
    }

    setIsBatchSaving(true);
    let done = 0;
    try {
      for (const line of lines) {
        await adjustMutation.mutateAsync({
          product_id: line.product.id,
          warehouse_id: selectedWarehouseId,
          quantity: mode === "add" ? line.qty : -line.qty,
          reason: reasonText,
        });
        done += 1;
      }
        toast.success(
          mode === "add"
            ? industry.labels.stockAdded(done, totalUnits)
            : industry.labels.stockRemoved(done, totalUnits),
        );
      onSuccess?.();
      onClose();
    } catch (err) {
      const message = extractErrorMessage(err);
      const suffix =
        done > 0
          ? ` (${done} of ${lines.length} saved before this error)`
          : "";
      setFieldError(`${message}${suffix}`);
      toast.error(message);
    } finally {
      setIsBatchSaving(false);
    }
  };

  if (!isOpen) return null;

  const activeWarehouses = warehouses.filter((w) => w.isActive !== false);
  const saving = isBatchSaving || adjustMutation.isPending;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 modal-scrim"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="adjust-stock-title"
              className="pointer-events-auto w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl modal-panel overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-[var(--border-default)] shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-[var(--brand-muted)] shrink-0">
                    <Package className="w-5 h-5 text-[var(--brand)]" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="adjust-stock-title"
                      className="text-lg font-semibold text-[var(--text-primary)]"
                    >
                      Update stock
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {lockedProduct
                        ? `Add or remove units for this ${industry.itemNoun}`
                        : `Tick ${industry.itemNounPlural}, set qty each — one save`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-[var(--bg-surface)] transition-colors shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-[var(--text-secondary)]" />
                </button>
              </div>

              <form
                onSubmit={handleSubmit}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Warehouse / shop */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                      {labels.warehouseSingularTitle}
                    </label>
                    {warehousesLoading ? (
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading…
                      </div>
                    ) : isSingleShop && activeWarehouses.length <= 1 ? (
                      <div className="px-3 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-sm text-[var(--text-primary)]">
                        {activeWarehouses[0]?.name ?? "Your shop"}
                      </div>
                    ) : activeWarehouses.length === 1 ? (
                      <div className="px-3 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-sm text-[var(--text-primary)]">
                        {activeWarehouses[0].name}
                      </div>
                    ) : (
                      <select
                        value={selectedWarehouseId}
                        onChange={(e) =>
                          setSelectedWarehouseId(e.target.value)
                        }
                        className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]/50"
                      >
                        <option value="">
                          Select {labels.warehouseSingular}…
                        </option>
                        {activeWarehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                            {w.code ? ` (${w.code})` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Add / Remove */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                      Action
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setMode("add")}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                          mode === "add"
                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                            : "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-fill)]"
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("remove")}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                          mode === "remove"
                            ? "bg-red-500/15 border-red-500/40 text-red-300"
                            : "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-fill)]"
                        }`}
                      >
                        <Minus className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Products — multi-select (or locked single) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                        Products
                      </label>
                      {!lockedProduct && selectedIds.size > 0 && (
                        <span className="text-[11px] text-[var(--brand)] tabular-nums">
                          {selectedIds.size} selected · {totalUnits} units
                        </span>
                      )}
                    </div>

                    {lockedProduct ? (
                      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 space-y-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {lockedProduct.name}
                          </p>
                          {(lockedProduct.sku || lockedProduct.brand) && (
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                              {[lockedProduct.brand, lockedProduct.sku]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                          {selectedWarehouseId && (
                            <p className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                              On hand:{" "}
                              {stockAtWarehouse(
                                lockedProduct,
                                selectedWarehouseId,
                              )}
                            </p>
                          )}
                        </div>
                        <LineQtyControls
                          value={qtyById[lockedProduct.id] ?? ""}
                          onChange={(v) =>
                            setLineQtyInput(lockedProduct.id, v)
                          }
                          onBump={(d) => bumpLineQty(lockedProduct.id, d)}
                          mode={mode}
                          onHand={
                            selectedWarehouseId
                              ? stockAtWarehouse(
                                  lockedProduct,
                                  selectedWarehouseId,
                                )
                              : null
                          }
                        />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-[var(--border-default)] overflow-hidden bg-[var(--bg-page)]">
                        <div className="p-2.5 border-b border-[var(--border-default)]">
                          <input
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            placeholder="Search name, SKU, brand…"
                            className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-modal)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand)]/60 focus:ring-2 focus:ring-[var(--brand)]/25"
                          />
                        </div>
                        <ul className="max-h-64 overflow-y-auto divide-y divide-[var(--border-default)]">
                          {productsFetching && (
                            <li className="px-3 py-3 text-xs text-[var(--text-muted)] flex items-center gap-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Searching…
                            </li>
                          )}
                          {!productsFetching && catalog.length === 0 && (
                            <li className="px-3 py-3 text-xs text-[var(--text-muted)]">
                              No products found
                            </li>
                          )}
                          {catalog.map((p) => {
                            const checked = selectedIds.has(p.id);
                            const onHand = selectedWarehouseId
                              ? stockAtWarehouse(p, selectedWarehouseId)
                              : null;
                            return (
                              <li
                                key={p.id}
                                className={`px-3 py-3 transition-colors ${
                                  checked
                                    ? "bg-[var(--brand-muted)]"
                                    : "hover:bg-[var(--bg-surface)]"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <button
                                    type="button"
                                    onClick={() => toggleProduct(p)}
                                    className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                                      checked
                                        ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-contrast)]"
                                        : "border-[var(--text-muted)] bg-[var(--bg-modal)]"
                                    }`}
                                    aria-pressed={checked}
                                    aria-label={`${checked ? "Deselect" : "Select"} ${p.name}`}
                                  >
                                    {checked && (
                                      <Check
                                        className="w-3.5 h-3.5"
                                        strokeWidth={3}
                                      />
                                    )}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <button
                                      type="button"
                                      onClick={() => toggleProduct(p)}
                                      className="w-full text-left"
                                    >
                                      <span className="block text-sm font-medium text-[var(--text-primary)] truncate">
                                        {p.name}
                                      </span>
                                      <span className="block text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                                        {[p.brand, p.sku]
                                          .filter(Boolean)
                                          .join(" · ") ||
                                          `${p.stock.total} total`}
                                        {onHand != null &&
                                          ` · on hand ${onHand}`}
                                      </span>
                                    </button>
                                    {checked && (
                                      <div className="mt-2.5">
                                        <LineQtyControls
                                          value={qtyById[p.id] ?? ""}
                                          onChange={(v) =>
                                            setLineQtyInput(p.id, v)
                                          }
                                          onBump={(d) => bumpLineQty(p.id, d)}
                                          mode={mode}
                                          onHand={onHand}
                                          compact
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Reason */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                      Reason{" "}
                      <span className="normal-case font-normal text-[var(--text-muted)]">
                        (optional — defaults to “{defaultReason}”)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={defaultReason}
                      maxLength={500}
                      className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand)]/50"
                    />
                  </div>

                  {fieldError && (
                    <p className="text-sm text-[var(--danger)] bg-[var(--danger-muted)] border border-[var(--danger)]/30 rounded-lg px-3 py-2">
                      {fieldError}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 p-4 border-t border-[var(--border-default)] shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-card-fill)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      saving ||
                      selectedProducts.length === 0 ||
                      totalUnits < 1
                    }
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--brand)] text-[var(--brand-contrast)] text-sm font-semibold hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving…
                      </>
                    ) : selectedProducts.length === 0 ? (
                      `Select ${industry.itemNounPlural}`
                    ) : totalUnits < 1 ? (
                      "Enter quantities"
                    ) : mode === "add" ? (
                      <>
                        <Plus className="w-4 h-4" />
                        Add {totalUnits} to {selectedProducts.length}{" "}
                        {selectedProducts.length === 1
                          ? industry.itemNoun
                          : industry.itemNounPlural}
                      </>
                    ) : (
                      <>
                        <Minus className="w-4 h-4" />
                        Remove {totalUnits} from {selectedProducts.length}{" "}
                        {selectedProducts.length === 1
                          ? industry.itemNoun
                          : industry.itemNounPlural}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function LineQtyControls({
  value,
  onChange,
  onBump,
  mode,
  onHand,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onBump: (delta: number) => void;
  mode: AdjustMode;
  onHand: number | null;
  compact?: boolean;
}) {
  const qty = Math.max(0, Math.floor(Number(value) || 0));
  const resulting =
    onHand == null || qty < 1
      ? null
      : mode === "add"
        ? onHand + qty
        : onHand - qty;
  const bad = resulting != null && resulting < 0;

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onBump(-1)}
          className="p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-card-fill)] transition-colors"
          aria-label="Decrease"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 text-center px-2 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-base font-semibold tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--brand)]/50"
        />
        <button
          type="button"
          onClick={() => onBump(1)}
          className="p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-card-fill)] transition-colors"
          aria-label="Increase"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {onHand != null && qty > 0 && (
        <p
          className={`text-[11px] tabular-nums ${
            bad ? "text-[var(--danger)]" : "text-[var(--text-muted)]"
          }`}
        >
          On hand {onHand}
          {resulting != null && (
            <>
              {" → "}
              <span
                className={
                  bad
                    ? "text-[var(--danger)]"
                    : mode === "add"
                      ? "text-emerald-400"
                      : "text-[var(--text-primary)]"
                }
              >
                {resulting}
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
