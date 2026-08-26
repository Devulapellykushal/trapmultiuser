"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { adminHref } from "@/lib/admin-routes";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Store,
  ArrowLeft,
  MapPin,
  Phone,
  User,
  Package,
  AlertTriangle,
  Check,
  X,
  Loader2,
  RefreshCcw,
  ArrowRightLeft,
  TrendingDown,
  Truck,
  Send,
  PackageCheck,
  DollarSign,
  ShoppingCart,
  Tag,
  BarChart3,
  Bell,
} from "lucide-react";
import {
  storesService,
  stockTransfersService,
  StoreStock,
  StockTransferListItem,
  StockTransfer,
  StoreAnalytics,
} from "@/services";
import { inventoryService, Warehouse } from "@/services";
import { inventoryKeys, useLocationLabels } from "@/hooks";

// =============================================================================
// TRANSFER STOCK MODAL — multi tyre + qty each (one trip to the shop)
// =============================================================================

interface TransferStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  storeName: string;
  onSuccess: () => void;
}

type TransferProductRow = {
  id: string;
  name: string;
  sku: string;
  brand?: string;
  /** Stock by godown id */
  stockByWarehouse: Record<string, number>;
};

type LineQty = Record<string, number>;

function mapTransferProduct(raw: Record<string, unknown>): TransferProductRow {
  const breakdown = (raw.warehouseStock ??
    raw.warehouse_stock ??
    []) as Array<Record<string, unknown>>;
  const stockByWarehouse: Record<string, number> = {};
  for (const row of breakdown) {
    const wid = String(row.warehouseId ?? row.warehouse_id ?? "");
    if (wid) stockByWarehouse[wid] = Number(row.quantity ?? 0);
  }
  return {
    id: String(raw.id),
    name: String(raw.name ?? "Product"),
    sku: String(raw.sku ?? ""),
    brand: raw.brand != null ? String(raw.brand) : undefined,
    stockByWarehouse,
  };
}

function extractTransferError(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: unknown } }).response?.data as
      | {
          error?: string;
          detail?: string;
          items?: string | string[];
          non_field_errors?: string[];
        }
      | undefined;
    if (typeof data?.error === "string") return data.error;
    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.items === "string") return data.items;
    if (Array.isArray(data?.items) && data.items[0]) return String(data.items[0]);
    if (data?.non_field_errors?.[0]) return data.non_field_errors[0];
  }
  if (error instanceof Error) return error.message;
  return "Could not create transfer. Check quantities against godown stock.";
}

function TransferStockModal({
  isOpen,
  onClose,
  storeId,
  storeName,
  onSuccess,
}: TransferStockModalProps) {
  const [selectedWarehouse, setSelectedWarehouse] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [quantities, setQuantities] = React.useState<LineQty>({});
  const [search, setSearch] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  const { data: warehouses = [] } = useQuery({
    queryKey: inventoryKeys.warehouses(),
    queryFn: () => inventoryService.getWarehouses(),
    enabled: isOpen,
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products-for-transfer"],
    queryFn: async () => {
      const response = await inventoryService.getProducts({ page_size: 1000 });
      const rows = response.results || [];
      return rows.map((p) =>
        mapTransferProduct(p as unknown as Record<string, unknown>),
      );
    },
    enabled: isOpen,
  });

  // Auto-pick single godown
  React.useEffect(() => {
    if (!isOpen) return;
    if (warehouses.length === 1 && !selectedWarehouse) {
      setSelectedWarehouse(warehouses[0].id);
    }
  }, [isOpen, warehouses, selectedWarehouse]);

  // Reset when closed
  React.useEffect(() => {
    if (isOpen) return;
    setSelectedWarehouse("");
    setSelectedIds(new Set());
    setQuantities({});
    setSearch("");
    setFormError(null);
  }, [isOpen]);

  const createMutation = useMutation({
    mutationFn: stockTransfersService.createTransfer,
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const filteredProducts = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products;
    if (selectedWarehouse) {
      // Prefer showing items that have stock in this godown first
      list = [...list].sort((a, b) => {
        const sa = a.stockByWarehouse[selectedWarehouse] ?? 0;
        const sb = b.stockByWarehouse[selectedWarehouse] ?? 0;
        if (sa > 0 && sb <= 0) return -1;
        if (sb > 0 && sa <= 0) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)),
    );
  }, [products, search, selectedWarehouse]);

  const selectedLines = React.useMemo(() => {
    return products.filter((p) => selectedIds.has(p.id));
  }, [products, selectedIds]);

  const toggleProduct = (id: string) => {
    setFormError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setQuantities((q) => {
          const copy = { ...q };
          delete copy[id];
          return copy;
        });
      } else {
        next.add(id);
        setQuantities((q) => ({ ...q, [id]: q[id] ?? 1 }));
      }
      return next;
    });
  };

  const setLineQty = (id: string, qty: number) => {
    setFormError(null);
    const available = selectedWarehouse
      ? (products.find((p) => p.id === id)?.stockByWarehouse[selectedWarehouse] ??
        0)
      : Infinity;
    const safe = Math.max(1, Math.min(Math.floor(qty) || 1, available || 1));
    setQuantities((q) => ({ ...q, [id]: safe }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedWarehouse) {
      setFormError("Select the godown to send from.");
      return;
    }
    if (selectedLines.length === 0) {
      setFormError("Tick at least one tyre to send.");
      return;
    }

    const items: { product: string; quantity: number }[] = [];
    for (const line of selectedLines) {
      const qty = quantities[line.id] ?? 0;
      const available = line.stockByWarehouse[selectedWarehouse] ?? 0;
      if (qty < 1) {
        setFormError(`Enter quantity for ${line.name}.`);
        return;
      }
      if (qty > available) {
        setFormError(
          `${line.name}: only ${available} in godown, you asked for ${qty}.`,
        );
        return;
      }
      items.push({ product: line.id, quantity: qty });
    }

    createMutation.mutate(
      {
        sourceWarehouse: selectedWarehouse,
        destinationStore: storeId,
        transferDate: new Date().toISOString().split("T")[0],
        items,
      },
      {
        onError: (err) => setFormError(extractTransferError(err)),
      },
    );
  };

  if (!isOpen) return null;

  const totalUnits = selectedLines.reduce(
    (sum, p) => sum + (quantities[p.id] ?? 0),
    0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 modal-scrim"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative z-10 w-full sm:max-w-xl max-h-[92vh] flex flex-col bg-zinc-900 rounded-t-2xl sm:rounded-2xl border border-zinc-800 shadow-xl overflow-hidden"
      >
        <div className="p-5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 shrink-0">
                <Truck className="w-5 h-5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-white">
                  Send stock to shop
                </h2>
                <p className="text-sm text-zinc-400 truncate">
                  To <span className="text-zinc-200">{storeName}</span> — tick
                  tyres, set how many
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Godown */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                From godown *
              </label>
              {warehouses.length === 1 ? (
                <div className="px-4 py-3 bg-zinc-800/80 border border-zinc-700 rounded-xl text-white text-sm">
                  {warehouses[0].name}
                  {warehouses[0].code ? (
                    <span className="text-zinc-500 ml-2">
                      ({warehouses[0].code})
                    </span>
                  ) : null}
                </div>
              ) : (
                <select
                  required
                  value={selectedWarehouse}
                  onChange={(e) => {
                    setSelectedWarehouse(e.target.value);
                    setFormError(null);
                  }}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">Select godown…</option>
                  {warehouses.map((wh: Warehouse) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                      {wh.code ? ` (${wh.code})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Search + multi select list */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block text-sm font-medium text-zinc-300">
                  Tyres to send *
                </label>
                {selectedLines.length > 0 && (
                  <span className="text-xs text-blue-300">
                    {selectedLines.length} selected · {totalUnits} units
                  </span>
                )}
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, brand, size…"
                className="w-full mb-2 px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />

              <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 max-h-64 overflow-y-auto divide-y divide-zinc-800">
                {productsLoading && (
                  <div className="flex items-center gap-2 px-4 py-6 text-sm text-zinc-400 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading tyres…
                  </div>
                )}
                {!productsLoading && filteredProducts.length === 0 && (
                  <div className="px-4 py-6 text-sm text-zinc-500 text-center">
                    No tyres found
                  </div>
                )}
                {!productsLoading &&
                  filteredProducts.map((p) => {
                    const checked = selectedIds.has(p.id);
                    const available = selectedWarehouse
                      ? (p.stockByWarehouse[selectedWarehouse] ?? 0)
                      : 0;
                    const outOfStock = !!selectedWarehouse && available <= 0;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-start gap-3 px-3 py-3 ${
                          outOfStock ? "opacity-50" : "hover:bg-zinc-800/80"
                        }`}
                      >
                        <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={outOfStock}
                            onChange={() => toggleProduct(p.id)}
                            className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-blue-500/40"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-white truncate">
                              {p.name}
                            </span>
                            <span className="block text-[11px] text-zinc-500 truncate">
                              {[p.brand, p.sku].filter(Boolean).join(" · ")}
                              {selectedWarehouse
                                ? ` · Godown: ${available}`
                                : ""}
                            </span>
                          </span>
                        </label>
                        {checked && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setLineQty(p.id, (quantities[p.id] ?? 1) - 1)
                              }
                              className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                              aria-label="Less"
                            >
                              <span className="text-sm font-bold leading-none">
                                −
                              </span>
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={available || undefined}
                              value={quantities[p.id] ?? 1}
                              onChange={(e) =>
                                setLineQty(p.id, Number(e.target.value))
                              }
                              className="w-14 text-center px-1 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setLineQty(p.id, (quantities[p.id] ?? 1) + 1)
                              }
                              disabled={
                                !!selectedWarehouse &&
                                (quantities[p.id] ?? 1) >= available
                              }
                              className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
                              aria-label="More"
                            >
                              <span className="text-sm font-bold leading-none">
                                +
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">
                Tip: only send what the shop needs. Godown stock goes down; shop
                stock goes up after receive.
              </p>
            </div>

            {/* Selected summary */}
            {selectedLines.length > 0 && (
              <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-sm text-blue-100 space-y-1">
                <p className="font-medium text-blue-200">Sending now</p>
                {selectedLines.map((p) => (
                  <p key={p.id} className="text-xs text-blue-100/80 truncate">
                    {quantities[p.id] ?? 0} × {p.name}
                  </p>
                ))}
              </div>
            )}

            {(formError || createMutation.isError) && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-sm">
                  {formError ||
                    extractTransferError(createMutation.error) ||
                    "Failed to create transfer."}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 p-5 border-t border-zinc-800 shrink-0 bg-zinc-900">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                createMutation.isPending ||
                selectedLines.length === 0 ||
                !selectedWarehouse
              }
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4" />
                  Send {selectedLines.length || ""}{" "}
                  {selectedLines.length === 1 ? "tyre type" : "tyre types"}
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// =============================================================================
// RECEIVE TRANSFER MODAL
// =============================================================================

interface ReceiveTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: StockTransfer | null;
  onSuccess: () => void;
}

function ReceiveTransferModal({
  isOpen,
  onClose,
  transfer,
  onSuccess,
}: ReceiveTransferModalProps) {
  const [itemQuantities, setItemQuantities] = React.useState<
    Record<string, number>
  >({});

  // Initialize quantities when transfer changes
  React.useEffect(() => {
    if (transfer?.items) {
      const quantities: Record<string, number> = {};
      transfer.items.forEach((item) => {
        // Default to pending quantity (quantity - received)
        const pending = item.quantity - (item.receivedQuantity || 0);
        quantities[item.id] = pending > 0 ? pending : 0;
      });
      setItemQuantities(quantities);
    }
  }, [transfer]);

  const receiveMutation = useMutation({
    mutationFn: (data: {
      id: string;
      items: Array<{ itemId: string; quantity: number }>;
    }) => stockTransfersService.receiveTransfer(data.id, { items: data.items }),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transfer) return;

    const items = Object.entries(itemQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity }));

    if (items.length === 0) {
      return;
    }

    receiveMutation.mutate({ id: transfer.id, items });
  };

  if (!isOpen || !transfer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 modal-scrim"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full max-w-xl bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl overflow-hidden"
      >
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20">
                <PackageCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Receive Transfer
                </h2>
                <p className="text-sm text-zinc-400">
                  {transfer.transferNumber}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Transfer Info */}
          <div className="p-4 bg-zinc-800/50 rounded-xl space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">From:</span>
              <span className="text-white">{transfer.sourceWarehouseName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">To:</span>
              <span className="text-white">
                {transfer.destinationStoreName}
              </span>
            </div>
          </div>

          {/* Items */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              Items to Receive
            </label>
            <div className="space-y-3">
              {transfer.items.map((item) => {
                const pending = item.quantity - (item.receivedQuantity || 0);
                return (
                  <div
                    key={item.id}
                    className="p-4 bg-zinc-800/50 rounded-xl flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {item.productName}
                      </p>
                      <p className="text-zinc-400 text-sm">
                        Ordered: {item.quantity} | Received:{" "}
                        {item.receivedQuantity || 0} | Pending: {pending}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={pending}
                        value={itemQuantities[item.id] || 0}
                        onChange={(e) =>
                          setItemQuantities((prev) => ({
                            ...prev,
                            [item.id]: Math.min(
                              parseInt(e.target.value) || 0,
                              pending,
                            ),
                          }))
                        }
                        disabled={pending <= 0}
                        className="w-20 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {receiveMutation.isError && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-400 text-sm">
                Failed to receive transfer. Please try again.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                receiveMutation.isPending ||
                Object.values(itemQuantities).every((q) => q === 0)
              }
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-medium hover:from-emerald-600 hover:to-green-700 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {receiveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Receiving...
                </>
              ) : (
                <>
                  <PackageCheck className="w-4 h-4" />
                  Confirm Receipt
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// =============================================================================
// STOCK TABLE
// =============================================================================

interface StockTableProps {
  stock: StoreStock[];
  isLoading: boolean;
  isSharedGodown?: boolean;
}

function StockTable({ stock, isLoading, isSharedGodown }: StockTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (stock.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
        <p className="text-zinc-400">
          {isSharedGodown
            ? "This shop has no local stock ledger"
            : "No stock in this store yet"}
        </p>
        <p className="text-zinc-500 text-sm">
          {isSharedGodown
            ? "Sales use shared godown stock — open Godown to see and update qty"
            : "Send stock from the godown to add inventory here"}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left py-4 px-4 text-sm font-medium text-zinc-400">
              Product
            </th>
            <th className="text-left py-4 px-4 text-sm font-medium text-zinc-400">
              SKU
            </th>
            <th className="text-right py-4 px-4 text-sm font-medium text-zinc-400">
              Stock
            </th>
            <th className="text-center py-4 px-4 text-sm font-medium text-zinc-400">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {stock.map((item) => (
            <tr
              key={item.productId}
              className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
            >
              <td className="py-4 px-4">
                <span className="text-white font-medium">
                  {item.productName}
                </span>
              </td>
              <td className="py-4 px-4">
                <span className="text-zinc-400 font-mono text-sm">
                  {item.productSku}
                </span>
              </td>
              <td className="py-4 px-4 text-right">
                <span
                  className={`font-semibold ${
                    item.isLowStock ? "text-amber-400" : "text-white"
                  }`}
                >
                  {item.stock}
                </span>
              </td>
              <td className="py-4 px-4 text-center">
                {item.isLowStock ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400">
                    <TrendingDown className="w-3 h-3" />
                    Low Stock
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400">
                    <Check className="w-3 h-3" />
                    OK
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// TRANSFERS TABLE
// =============================================================================

interface TransfersTableProps {
  transfers: StockTransferListItem[];
  isLoading: boolean;
  onDispatch: (id: string) => void;
  onReceive: (id: string) => void;
  isDispatching: boolean;
  dispatchingId: string | null;
}

function TransfersTable({
  transfers,
  isLoading,
  onDispatch,
  onReceive,
  isDispatching,
  dispatchingId,
}: TransfersTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="text-center py-12">
        <ArrowRightLeft className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
        <p className="text-zinc-400">No transfers yet</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-500/20 text-yellow-400",
    IN_TRANSIT: "bg-blue-500/20 text-blue-400",
    COMPLETED: "bg-emerald-500/20 text-emerald-400",
    CANCELLED: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left py-4 px-4 text-sm font-medium text-zinc-400">
              Transfer #
            </th>
            <th className="text-left py-4 px-4 text-sm font-medium text-zinc-400">
              From
            </th>
            <th className="text-center py-4 px-4 text-sm font-medium text-zinc-400">
              Items
            </th>
            <th className="text-center py-4 px-4 text-sm font-medium text-zinc-400">
              Status
            </th>
            <th className="text-right py-4 px-4 text-sm font-medium text-zinc-400">
              Date
            </th>
            <th className="text-right py-4 px-4 text-sm font-medium text-zinc-400">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((transfer) => (
            <tr
              key={transfer.id}
              className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
            >
              <td className="py-4 px-4">
                <span className="text-white font-mono text-sm">
                  {transfer.transferNumber}
                </span>
              </td>
              <td className="py-4 px-4">
                <span className="text-zinc-300">
                  {transfer.sourceWarehouseName}
                </span>
              </td>
              <td className="py-4 px-4 text-center">
                <span className="text-white">{transfer.itemCount}</span>
              </td>
              <td className="py-4 px-4 text-center">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[transfer.status] || ""
                  }`}
                >
                  {transfer.status.replace("_", " ")}
                </span>
              </td>
              <td className="py-4 px-4 text-right">
                <span className="text-zinc-400 text-sm">
                  {new Date(transfer.transferDate).toLocaleDateString()}
                </span>
              </td>
              <td className="py-4 px-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  {/* Dispatch Button - Show for PENDING transfers */}
                  {transfer.status === "PENDING" && (
                    <button
                      onClick={() => onDispatch(transfer.id)}
                      disabled={isDispatching && dispatchingId === transfer.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                    >
                      {isDispatching && dispatchingId === transfer.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                      Dispatch
                    </button>
                  )}
                  {/* Receive Button - Show for IN_TRANSIT transfers */}
                  {transfer.status === "IN_TRANSIT" && (
                    <button
                      onClick={() => onReceive(transfer.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                    >
                      <PackageCheck className="w-3 h-3" />
                      Receive
                    </button>
                  )}
                  {/* Completed indicator */}
                  {transfer.status === "COMPLETED" && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500">
                      <Check className="w-3 h-3" />
                      Done
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// BRAND ANALYTICS TABLE
// =============================================================================

interface BrandAnalyticsTableProps {
  analytics: StoreAnalytics | null;
  isLoading: boolean;
}

function BrandAnalyticsTable({
  analytics,
  isLoading,
}: BrandAnalyticsTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!analytics || analytics.brands.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
        <p className="text-zinc-400 font-medium">No brand data available</p>
        <p className="text-zinc-500 text-sm mt-1">
          Transfer products to this store to see brand analytics
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Brand alert notice */}
      {analytics.lowBrandAlerts.length > 0 && (
        <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl flex items-start gap-3">
          <Bell className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-orange-300 font-medium text-sm">
              {analytics.lowBrandAlerts.length} brand(s) have less than{" "}
              {analytics.brandAlertThreshold} units in this store
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {analytics.lowBrandAlerts.map((alert) => (
                <span
                  key={alert.brand}
                  className="px-2 py-0.5 rounded-lg text-xs bg-orange-500/15 text-orange-300 border border-orange-500/20"
                >
                  {alert.brand} — {alert.totalStock} units
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Brand table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">
                Brand
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">
                Description
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">
                Categories
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400">
                Available Sizes
              </th>
              <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400">
                Products
              </th>
              <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400">
                Total Units
              </th>
              <th className="text-center py-3 px-4 text-sm font-medium text-zinc-400">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {analytics.brands.map((brand) => (
              <tr
                key={brand.brand}
                className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${
                  brand.isLowBrandStock ? "bg-orange-500/5" : ""
                }`}
              >
                <td className="py-4 px-4">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        brand.isLowBrandStock
                          ? "bg-orange-400"
                          : "bg-emerald-400"
                      }`}
                    />
                    <span className="text-white font-semibold">
                      {brand.brand}
                    </span>
                  </div>
                </td>
                <td className="py-4 px-4 max-w-xs">
                  <p className="text-zinc-400 text-sm truncate">
                    {brand.description || "—"}
                  </p>
                </td>
                <td className="py-4 px-4">
                  <div className="flex flex-wrap gap-1">
                    {brand.categories.length > 0
                      ? brand.categories.map((cat) => (
                          <span
                            key={cat}
                            className="px-2 py-0.5 rounded-md text-xs bg-zinc-700/60 text-zinc-300"
                          >
                            {cat}
                          </span>
                        ))
                      : <span className="text-zinc-600 text-sm">—</span>}
                  </div>
                </td>
                <td className="py-4 px-4">
                  {brand.sizes.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-48">
                      {brand.sizes.map((size) => (
                        <span
                          key={size}
                          className="px-2 py-0.5 rounded-md text-xs bg-blue-500/15 text-blue-300 border border-blue-500/20"
                        >
                          {size}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-zinc-600 text-sm">—</span>
                  )}
                </td>
                <td className="py-4 px-4 text-right">
                  <span className="text-white font-medium">
                    {brand.productCount}
                  </span>
                </td>
                <td className="py-4 px-4 text-right">
                  <span
                    className={`font-semibold ${
                      brand.isLowBrandStock ? "text-orange-400" : "text-white"
                    }`}
                  >
                    {brand.totalStock}
                  </span>
                </td>
                <td className="py-4 px-4 text-center">
                  {brand.isLowBrandStock ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-orange-500/20 text-orange-400">
                      <Bell className="w-3 h-3" />
                      Low Stock
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400">
                      <Check className="w-3 h-3" />
                      Good
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function StoreDetailPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.id as string;
  const queryClient = useQueryClient();
  const { isSharedGodown, isTransferStock, labels } = useLocationLabels();
  const [isTransferModalOpen, setIsTransferModalOpen] = React.useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = React.useState(false);
  const [selectedTransfer, setSelectedTransfer] =
    React.useState<StockTransfer | null>(null);
  const [dispatchingId, setDispatchingId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<
    "stock" | "transfers" | "analytics"
  >("stock");

  React.useEffect(() => {
    if (isSharedGodown && activeTab === "transfers") {
      setActiveTab("stock");
    }
  }, [isSharedGodown, activeTab]);

  const {
    data: store,
    isLoading: storeLoading,
    isError: storeError,
  } = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => storesService.getStore(storeId),
  });

  const { data: stock = [], isLoading: stockLoading } = useQuery({
    queryKey: ["store-stock", storeId],
    queryFn: () => storesService.getStoreStock(storeId),
    enabled: !!storeId,
  });

  const { data: transfers = [], isLoading: transfersLoading } = useQuery({
    queryKey: ["store-transfers", storeId],
    queryFn: () => stockTransfersService.getTransfers({ store: storeId }),
    enabled: !!storeId && isTransferStock,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["store-analytics", storeId],
    queryFn: () => storesService.getStoreAnalytics(storeId),
    enabled: !!storeId,
    staleTime: 60_000,
  });

  // Dispatch mutation
  const dispatchMutation = useMutation({
    mutationFn: stockTransfersService.dispatchTransfer,
    onSuccess: () => {
      handleRefresh();
      setDispatchingId(null);
    },
    onError: () => {
      setDispatchingId(null);
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["store", storeId] });
    queryClient.invalidateQueries({ queryKey: ["store-stock", storeId] });
    queryClient.invalidateQueries({ queryKey: ["store-transfers", storeId] });
    queryClient.invalidateQueries({ queryKey: ["store-analytics", storeId] });
  };

  const handleDispatch = (transferId: string) => {
    setDispatchingId(transferId);
    dispatchMutation.mutate(transferId);
  };

  const handleReceive = async (transferId: string) => {
    // Fetch full transfer details to get items
    try {
      const transfer = await stockTransfersService.getTransfer(transferId);
      setSelectedTransfer(transfer);
      setIsReceiveModalOpen(true);
    } catch (error) {
      console.error("Failed to fetch transfer details:", error);
    }
  };

  const lowStockItems = stock.filter((s) => s.isLowStock);

  if (storeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (storeError || !store) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Store not found
          </h2>
          <button
            onClick={() => router.push(adminHref("/stores"))}
            className="mt-4 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Back to Stores
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Back Button */}
        <button
          onClick={() => router.push(adminHref("/stores"))}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Stores
        </button>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
              <Store className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-white">{store.name}</h1>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    store.isActive
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {store.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-zinc-400 font-mono text-sm mt-1">
                {store.code}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              className="p-3 rounded-xl border border-zinc-800 hover:bg-zinc-800 transition-colors"
            >
              <RefreshCcw className="w-5 h-5 text-zinc-400" />
            </button>
            {isTransferStock && (
              <button
                onClick={() => setIsTransferModalOpen(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium hover:from-blue-600 hover:to-indigo-700 transition-all"
              >
                <Truck className="w-5 h-5" />
                Send stock
              </button>
            )}
          </div>
        </div>

        {isSharedGodown && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90">
            <p className="font-medium text-emerald-200">
              Shared godown stock is on
            </p>
            <p className="text-xs text-emerald-100/70 mt-1">
              This shop sells from {labels.warehouseSingularTitle} stock. Sale
              +/− happens on the godown — no sending needed. Change this in
              Settings.
            </p>
          </div>
        )}

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <MapPin className="w-4 h-4" />
              <span className="text-sm">Address</span>
            </div>
            <p className="text-white text-sm">
              {store.address}, {store.city}, {store.state} - {store.pincode}
            </p>
          </div>

          <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Phone className="w-4 h-4" />
              <span className="text-sm">Contact</span>
            </div>
            <p className="text-white text-sm">{store.phone}</p>
            {store.email && (
              <p className="text-zinc-400 text-xs mt-1">{store.email}</p>
            )}
          </div>

          <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <User className="w-4 h-4" />
              <span className="text-sm">Operator</span>
            </div>
            <p className="text-white text-sm">
              {store.operatorName || "Not assigned"}
            </p>
            {store.operatorPhone && (
              <p className="text-zinc-400 text-xs mt-1">
                {store.operatorPhone}
              </p>
            )}
          </div>

          <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Package className="w-4 h-4" />
              <span className="text-sm">Inventory</span>
            </div>
            <p className="text-white text-sm">
              {analyticsLoading ? (
                <span className="inline-block w-12 h-4 bg-zinc-700 rounded animate-pulse" />
              ) : (
                <>
                  {analytics?.totalProducts ?? store.stockCount} products
                  {lowStockItems.length > 0 && (
                    <span className="text-amber-400 ml-2">
                      ({lowStockItems.length} low)
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Analytics KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span className="text-sm">Purchase Value</span>
            </div>
            {analyticsLoading ? (
              <div className="h-7 w-24 bg-zinc-700 rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-emerald-400">
                ₹{((analytics?.totalPurchaseValue ?? 0) / 1000).toFixed(1)}K
              </p>
            )}
            {!analyticsLoading && (
              <p className="text-xs text-zinc-500 mt-1">
                {analytics?.totalStockQuantity ?? 0} total units
              </p>
            )}
          </div>

          <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <ShoppingCart className="w-4 h-4 text-purple-400" />
              <span className="text-sm">Total Sales</span>
            </div>
            {analyticsLoading ? (
              <div className="h-7 w-16 bg-zinc-700 rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-white">
                {analytics?.sales.totalTransactions ?? 0}
              </p>
            )}
            {!analyticsLoading && (
              <p className="text-xs text-zinc-500 mt-1">
                {analytics?.sales.totalQtySold ?? 0} items sold
              </p>
            )}
          </div>

          <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Tag className="w-4 h-4 text-amber-400" />
              <span className="text-sm">Revenue</span>
            </div>
            {analyticsLoading ? (
              <div className="h-7 w-24 bg-zinc-700 rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-amber-400">
                ₹{((analytics?.sales.totalRevenue ?? 0) / 1000).toFixed(1)}K
              </p>
            )}
          </div>

          <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Bell className="w-4 h-4 text-orange-400" />
              <span className="text-sm">Brand Alerts</span>
            </div>
            {analyticsLoading ? (
              <div className="h-7 w-10 bg-zinc-700 rounded animate-pulse" />
            ) : (
              <p className={`text-2xl font-bold ${(analytics?.lowBrandAlerts.length ?? 0) > 0 ? "text-orange-400" : "text-white"}`}>
                {analytics?.lowBrandAlerts.length ?? 0}
              </p>
            )}
            {!analyticsLoading && (analytics?.lowBrandAlerts.length ?? 0) > 0 && (
              <p className="text-xs text-orange-400/70 mt-1">
                brands &lt; 50 units
              </p>
            )}
          </div>
        </div>

        {/* Low Stock Alert */}
        {lowStockItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-4"
          >
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            <div className="flex-1">
              <p className="text-amber-300 font-medium">
                {lowStockItems.length} product(s) below threshold (
                {store.lowStockThreshold})
              </p>
              <p className="text-amber-400/70 text-sm">
                {isSharedGodown
                  ? "Add more stock in Godown (Update stock) — all shops share it"
                  : "Consider sending more stock from the godown"}
              </p>
            </div>
            {isTransferStock && (
              <button
                onClick={() => setIsTransferModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors text-sm font-medium"
              >
                Send stock
              </button>
            )}
          </motion.div>
        )}

        {/* Tabs */}
        <div className="border-b border-zinc-800">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab("stock")}
              className={`pb-4 px-1 text-sm font-medium transition-colors relative ${
                activeTab === "stock"
                  ? "text-emerald-400"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                Stock Inventory
              </div>
              {activeTab === "stock" && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400"
                />
              )}
            </button>
            {isTransferStock && (
              <button
                onClick={() => setActiveTab("transfers")}
                className={`pb-4 px-1 text-sm font-medium transition-colors relative ${
                  activeTab === "transfers"
                    ? "text-emerald-400"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4" />
                  Transfers
                  {transfers.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-xs bg-zinc-800 text-zinc-400">
                      {transfers.length}
                    </span>
                  )}
                </div>
                {activeTab === "transfers" && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400"
                  />
                )}
              </button>
            )}
            <button
              onClick={() => setActiveTab("analytics")}
              className={`pb-4 px-1 text-sm font-medium transition-colors relative ${
                activeTab === "analytics"
                  ? "text-emerald-400"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Brand Analytics
                {(analytics?.lowBrandAlerts.length ?? 0) > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400">
                    {analytics!.lowBrandAlerts.length}
                  </span>
                )}
              </div>
              {activeTab === "analytics" && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400"
                />
              )}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl">
          {activeTab === "stock" ? (
            <StockTable
              stock={stock}
              isLoading={stockLoading}
              isSharedGodown={isSharedGodown}
            />
          ) : activeTab === "transfers" && isTransferStock ? (
            <TransfersTable
              transfers={transfers}
              isLoading={transfersLoading}
              onDispatch={handleDispatch}
              onReceive={handleReceive}
              isDispatching={dispatchMutation.isPending}
              dispatchingId={dispatchingId}
            />
          ) : (
            <BrandAnalyticsTable
              analytics={analytics ?? null}
              isLoading={analyticsLoading}
            />
          )}
        </div>
      </div>

      {/* Transfer Modal */}
      <AnimatePresence>
        {isTransferModalOpen && (
          <TransferStockModal
            isOpen={isTransferModalOpen}
            onClose={() => setIsTransferModalOpen(false)}
            storeId={storeId}
            storeName={store.name}
            onSuccess={handleRefresh}
          />
        )}
      </AnimatePresence>

      {/* Receive Modal */}
      <AnimatePresence>
        {isReceiveModalOpen && (
          <ReceiveTransferModal
            isOpen={isReceiveModalOpen}
            onClose={() => {
              setIsReceiveModalOpen(false);
              setSelectedTransfer(null);
            }}
            transfer={selectedTransfer}
            onSuccess={handleRefresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
