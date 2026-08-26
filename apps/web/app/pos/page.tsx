"use client";

import { StoreSelector, WarehouseSelector } from "@/components/dashboard";
import {
  BarcodeInput,
  CartPanel,
  CartProvider,
  CheckoutModal,
  PosSearchBar,
  ProductGrid,
  useCart,
} from "@/components/pos";
import { InvoicePreview } from "@/components/invoices";
import {
  inventoryService,
  StoreListItem,
  storesService,
  Warehouse,
} from "@/services";
import { inventoryKeys, useLocationLabels } from "@/hooks";
import { usePosStore } from "@/features/pos/store/usePosStore";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiInvoice, Invoice } from "@/lib/invoices/transform-api-invoice";
import { transformInvoiceDetail } from "@/lib/invoices/transform-api-invoice";
import { useIndustryProfile } from "@/lib/industry";
import * as React from "react";

type InventoryMode = "warehouse" | "store";

const POS_SHOP_STORAGE_KEY = "quake-pos-selling-shop-id";

export default function POSPage() {
  const {
    isSingleShop,
    isGodownAndShops,
    isSharedGodown,
    isTransferStock,
    barcodeEnabled,
    labels,
  } = useLocationLabels();
  const industry = useIndustryProfile();
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [posInvoicePreview, setPosInvoicePreview] =
    React.useState<Invoice | null>(null);
  const [posInvoicePreviewOpen, setPosInvoicePreviewOpen] =
    React.useState(false);
  const [inventoryMode, setInventoryMode] =
    React.useState<InventoryMode>("warehouse");
  const [warehouseId, setWarehouseId] = React.useState<string | null>(null);
  const [storeId, setStoreId] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(POS_SHOP_STORAGE_KEY);
  });

  const persistedWarehouseId = usePosStore((s) => s.warehouseId);
  const posHydrated = usePosStore((s) => s._hasHydrated);
  const cartLineCount = usePosStore((s) => s.cart.items.length);
  const clearCart = usePosStore((s) => s.clearCart);

  /** Petpooja-style: don't silently sell a draft bill against a different stock ledger. */
  const confirmStockLocationChange = React.useCallback(
    (next: () => void, label: string) => {
      if (cartLineCount === 0) {
        next();
        return;
      }
      const ok = window.confirm(
        `Changing ${label} will clear the current bill (${cartLineCount} line${
          cartLineCount === 1 ? "" : "s"
        }). Continue?`,
      );
      if (!ok) return;
      clearCart();
      next();
    },
    [cartLineCount, clearCart],
  );

  const handleWarehouseChange = React.useCallback(
    (id: string | null) => {
      if (id === warehouseId) return;
      confirmStockLocationChange(() => setWarehouseId(id), "godown");
    },
    [warehouseId, confirmStockLocationChange],
  );

  const handleInventoryModeChange = React.useCallback(
    (mode: InventoryMode) => {
      if (mode === inventoryMode) return;
      confirmStockLocationChange(() => setInventoryMode(mode), "stock source");
    },
    [inventoryMode, confirmStockLocationChange],
  );

  const handleStoreChange = React.useCallback(
    (id: string | null) => {
      if (id === storeId) return;
      // Shared godown: shop is only who is selling — stock still from godown
      if (isSharedGodown) {
        setStoreId(id);
        return;
      }
      if (inventoryMode === "store") {
        confirmStockLocationChange(() => setStoreId(id), "shop");
        return;
      }
      setStoreId(id);
    },
    [storeId, isSharedGodown, inventoryMode, confirmStockLocationChange],
  );

  const { data: warehouses } = useQuery({
    queryKey: inventoryKeys.warehouses(),
    queryFn: () => inventoryService.getWarehouses(),
    staleTime: 300000,
  });

  const { data: stores } = useQuery({
    queryKey: ["stores", { isActive: true }],
    queryFn: () => storesService.getStores({ isActive: true }),
    staleTime: 300000,
    enabled: isGodownAndShops,
  });

  // One-shop OR shared-godown: always sell from godown/warehouse stock
  React.useEffect(() => {
    if ((isSingleShop || isSharedGodown) && inventoryMode !== "warehouse") {
      setInventoryMode("warehouse");
    }
  }, [isSingleShop, isSharedGodown, inventoryMode]);

  // Restore last godown after cart hydrate; otherwise first warehouse
  React.useEffect(() => {
    if (!warehouses || warehouses.length === 0 || !posHydrated) return;
    const list = warehouses as Warehouse[];
    const stillValid =
      warehouseId && list.some((w) => w.id === warehouseId);
    if (stillValid) return;

    const fromPersist =
      persistedWarehouseId &&
      list.some((w) => w.id === persistedWarehouseId)
        ? persistedWarehouseId
        : null;
    setWarehouseId(fromPersist ?? list[0].id);
  }, [
    warehouses,
    warehouseId,
    posHydrated,
    persistedWarehouseId,
  ]);

  React.useEffect(() => {
    if (!stores || stores.length === 0) return;
    const list = stores as StoreListItem[];
    const stillValid = storeId && list.some((s) => s.id === storeId);
    if (!stillValid) {
      setStoreId(list[0].id);
    }
  }, [stores, storeId]);

  React.useEffect(() => {
    if (storeId) {
      window.localStorage.setItem(POS_SHOP_STORAGE_KEY, storeId);
    }
  }, [storeId]);

  React.useEffect(() => {
    usePosStore.getState().setWarehouseId(warehouseId);
  }, [warehouseId]);

  const selectedWarehouse = warehouses?.find(
    (w: Warehouse) => w.id === warehouseId,
  );
  const selectedStore = stores?.find((s: StoreListItem) => s.id === storeId);

  // Header: which shop is selling (shared / transfer-from-shop) or godown name
  React.useEffect(() => {
    const setHeader = usePosStore.getState().setHeaderLocation;
    if (isSharedGodown && selectedStore?.name) {
      setHeader(`Selling at ${selectedStore.name}`);
      return;
    }
    if (isTransferStock && inventoryMode === "store" && selectedStore?.name) {
      setHeader(`Selling at ${selectedStore.name}`);
      return;
    }
    if (selectedWarehouse?.name) {
      setHeader(
        isSingleShop
          ? selectedWarehouse.name
          : `${labels.warehouseSingularTitle}: ${selectedWarehouse.name}`,
      );
      return;
    }
    setHeader(null);
  }, [
    isSharedGodown,
    isTransferStock,
    isSingleShop,
    inventoryMode,
    selectedStore?.name,
    selectedWarehouse?.name,
    labels.warehouseSingularTitle,
  ]);

  React.useEffect(() => {
    if (inventoryMode !== "warehouse") {
      usePosStore.getState().setSearchQuery("");
      usePosStore.getState().resetResults();
    }
  }, [inventoryMode]);

  const handleCheckout = () => {
    setCheckoutOpen(true);
  };

  const handleViewInvoiceFromCheckout = async ({
    saleId,
    invoiceId,
  }: {
    saleId?: string;
    invoiceId?: string;
  }) => {
    try {
      let id = invoiceId;
      if (!id && saleId) {
        const data = await api.get<{ results: ApiInvoice[] }>("/invoices/", {
          sale_id: saleId,
          page_size: 5,
        });
        const first = data.results?.[0];
        id = first?.id ? String(first.id) : undefined;
      }
      if (!id) {
        return;
      }
      const full = await api.get<ApiInvoice>(`/invoices/${id}/`);
      setPosInvoicePreview(transformInvoiceDetail(full));
      setPosInvoicePreviewOpen(true);
    } catch (e) {
      console.error(e);
    }
  };

  const closePosInvoicePreview = () => {
    setPosInvoicePreviewOpen(false);
    setTimeout(() => setPosInvoicePreview(null), 300);
  };

  const warehouseList = (warehouses as Warehouse[] | undefined) ?? [];
  const showWarehousePicker =
    inventoryMode === "warehouse" && warehouseList.length > 1;
  // Transfer mode: pick shop stock. Shared: pick which shop is selling (stock stays godown).
  const showModeToggle = isTransferStock;
  const showStorePicker =
    isSharedGodown || (isTransferStock && inventoryMode === "store");

  // Shared: stock from godown + attribute sale to shop
  const checkoutWarehouseId =
    inventoryMode === "warehouse" || isSharedGodown
      ? warehouseId || undefined
      : undefined;
  const checkoutStoreId = isSharedGodown
    ? storeId || undefined
    : inventoryMode === "store"
      ? storeId || undefined
      : undefined;

  const canCheckout = isSharedGodown
    ? Boolean(checkoutWarehouseId && checkoutStoreId)
    : Boolean(checkoutWarehouseId || checkoutStoreId);

  return (
    <CartProvider>
      <div className="flex h-[calc(100vh-56px)]">
        <div className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden">
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {barcodeEnabled ? (
                <BarcodeInput
                  warehouseId={
                    inventoryMode === "warehouse" ? warehouseId : undefined
                  }
                />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  {industry.labels.posBarcodeOff}
                </p>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                {showModeToggle && (
                  <div className="flex bg-[var(--bg-elevated)] rounded-lg p-0.5 border border-[var(--border-default)]">
                    <button
                      type="button"
                      onClick={() => handleInventoryModeChange("warehouse")}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        inventoryMode === "warehouse"
                          ? "bg-[var(--brand)] text-[var(--brand-contrast)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {labels.posFromGodown}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInventoryModeChange("store")}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        inventoryMode === "store"
                          ? "bg-[var(--brand)] text-[var(--brand-contrast)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {labels.posFromShop}
                    </button>
                  </div>
                )}

                {showWarehousePicker && (
                  <WarehouseSelector
                    value={warehouseId}
                    onChange={handleWarehouseChange}
                    showAllOption={false}
                    placeholder={`Select ${labels.warehouseSingularTitle.toLowerCase()}`}
                  />
                )}
                {showStorePicker && (
                  <StoreSelector
                    value={storeId}
                    onChange={handleStoreChange}
                    showAllOption={false}
                    placeholder={`Which ${labels.storeSingular}?`}
                  />
                )}
              </div>
            </div>

            {isSharedGodown ? (
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-[var(--text-muted)]">Selling at</span>
                <span className="font-medium px-2 py-0.5 rounded bg-[var(--brand-muted)] text-[var(--brand)]">
                  {selectedStore?.name ?? "Select shop"}
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className="text-[var(--text-muted)]">Stock from</span>
                <span className="font-medium px-2 py-0.5 rounded bg-[var(--brand-muted)] text-[var(--brand)]">
                  {selectedWarehouse?.name ?? labels.warehouseSingularTitle}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  Sale +/− on godown; shop is recorded on the bill
                </span>
              </div>
            ) : (
              (selectedWarehouse || selectedStore) && (
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-[var(--text-muted)]">
                    {isSingleShop ? "Selling from" : "Showing stock from"}
                  </span>
                  <span className="font-medium px-2 py-0.5 rounded bg-[var(--brand-muted)] text-[var(--brand)]">
                    {inventoryMode === "warehouse"
                      ? selectedWarehouse?.name
                      : selectedStore?.name}
                  </span>
                </div>
              )
            )}
          </div>

          <PosSearchBar
            enabled={inventoryMode === "warehouse" && !!warehouseId}
          />

          <div className="flex-1 overflow-auto -mx-1 px-1">
            <ProductGrid
              warehouseId={
                inventoryMode === "warehouse"
                  ? warehouseId || undefined
                  : undefined
              }
              storeId={
                inventoryMode === "store" ? storeId || undefined : undefined
              }
              warehouseName={selectedWarehouse?.name}
            />
          </div>
        </div>

        <div className="w-80 lg:w-96 flex flex-col border-l border-white/[0.08]">
          <div className="flex-1 overflow-hidden">
            <CartPanel />
          </div>

          <div className="p-4 border-t border-white/[0.08]">
            <CheckoutButton
              onCheckout={handleCheckout}
              disabled={!canCheckout}
              disabledReason={
                isSharedGodown && !storeId
                  ? "Select which shop is selling"
                  : !canCheckout
                    ? "Select stock location"
                    : undefined
              }
            />
          </div>
        </div>

        <CheckoutModal
          isOpen={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          warehouseId={checkoutWarehouseId}
          storeId={checkoutStoreId}
          onViewInvoice={handleViewInvoiceFromCheckout}
        />
        <InvoicePreview
          invoice={posInvoicePreview}
          isOpen={posInvoicePreviewOpen}
          onClose={closePosInvoicePreview}
        />
      </div>
    </CartProvider>
  );
}

function CheckoutButton({
  onCheckout,
  disabled,
  disabledReason,
}: {
  onCheckout: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const { items, hasHydrated } = useCart();
  const cartEmpty = hasHydrated && items.length === 0;
  const isDisabled = Boolean(disabled) || cartEmpty;
  const reason = cartEmpty
    ? "Add a product to the cart first"
    : disabledReason;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onCheckout}
        disabled={isDisabled}
        className="w-full py-4 rounded-xl [background:var(--grad-brand-diagonal)] text-[var(--brand-contrast)] font-bold text-lg hover:opacity-95 transition-all shadow-lg shadow-[var(--brand)]/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Proceed to Checkout
      </button>
      {isDisabled && reason && (
        <p className="text-center text-xs text-amber-400/80">{reason}</p>
      )}
    </div>
  );
}
