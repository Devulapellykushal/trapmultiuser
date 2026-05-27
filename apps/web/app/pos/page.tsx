"use client";

import { StoreSelector, WarehouseSelector } from "@/components/dashboard";
import {
  BarcodeInput,
  CartPanel,
  CartProvider,
  CheckoutModal,
  PosSearchBar,
  ProductGrid,
} from "@/components/pos";
import { InvoicePreview } from "@/components/invoices";
import { inventoryService, StoreListItem, storesService, Warehouse } from "@/services";
import { inventoryKeys } from "@/hooks";
import { usePosStore } from "@/features/pos/store/usePosStore";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiInvoice, Invoice } from "@/lib/invoices/transform-api-invoice";
import { transformInvoiceDetail } from "@/lib/invoices/transform-api-invoice";
import * as React from "react";

type InventoryMode = "warehouse" | "store";

export default function POSPage() {
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [posInvoicePreview, setPosInvoicePreview] = React.useState<Invoice | null>(
    null,
  );
  const [posInvoicePreviewOpen, setPosInvoicePreviewOpen] =
    React.useState(false);
  const [inventoryMode, setInventoryMode] =
    React.useState<InventoryMode>("warehouse");
  const [warehouseId, setWarehouseId] = React.useState<string | null>(null);
  const [storeId, setStoreId] = React.useState<string | null>(null);

  // Fetch warehouses to auto-select the first one
  const { data: warehouses } = useQuery({
    queryKey: inventoryKeys.warehouses(),
    queryFn: () => inventoryService.getWarehouses(),
    staleTime: 300000, // 5 minutes
  });

  // Fetch stores
  const { data: stores } = useQuery({
    queryKey: ["stores", { isActive: true }],
    queryFn: () => storesService.getStores({ isActive: true }),
    staleTime: 300000,
  });

  // Auto-select first warehouse when data loads
  React.useEffect(() => {
    if (warehouses && warehouses.length > 0 && !warehouseId) {
      setWarehouseId((warehouses as Warehouse[])[0].id);
    }
  }, [warehouses, warehouseId]);

  // Auto-select first store when data loads
  React.useEffect(() => {
    if (stores && stores.length > 0 && !storeId) {
      setStoreId((stores as StoreListItem[])[0].id);
    }
  }, [stores, storeId]);

  React.useEffect(() => {
    usePosStore.getState().setWarehouseId(warehouseId);
  }, [warehouseId]);

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

  // Get selected warehouse/store name for display
  const selectedWarehouse = warehouses?.find(
    (w: Warehouse) => w.id === warehouseId,
  );
  const selectedStore = stores?.find((s: StoreListItem) => s.id === storeId);
  const currentLocationName =
    inventoryMode === "warehouse"
      ? selectedWarehouse?.name
      : selectedStore?.name;

  return (
    <CartProvider>
      <div className="flex h-[calc(100vh-56px)]">
        {/* Left Panel - Products */}
        <div className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden">
          {/* Header with Mode Toggle and Selectors */}
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex items-center justify-between gap-4">
              <BarcodeInput
                warehouseId={
                  inventoryMode === "warehouse" ? warehouseId : undefined
                }
              />

              <div className="flex items-center gap-3">
                {/* Inventory Mode Toggle */}
                <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                  <button
                    onClick={() => setInventoryMode("warehouse")}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      inventoryMode === "warehouse"
                        ? "bg-[#6366F1] text-white"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    Warehouse
                  </button>
                  <button
                    onClick={() => setInventoryMode("store")}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      inventoryMode === "store"
                        ? "bg-[#A855F7] text-white"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    Store
                  </button>
                </div>

                {/* Dynamic Selector based on mode */}
                {inventoryMode === "warehouse" ? (
                  <WarehouseSelector
                    value={warehouseId}
                    onChange={setWarehouseId}
                    showAllOption={false}
                    placeholder="Select Warehouse"
                  />
                ) : (
                  <StoreSelector
                    value={storeId}
                    onChange={setStoreId}
                    showAllOption={false}
                    placeholder="Select Store"
                  />
                )}
              </div>
            </div>

            {/* Current Location Indicator */}
            {currentLocationName && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-white/40">Showing stock from:</span>
                <span
                  className={`font-medium px-2 py-0.5 rounded ${
                    inventoryMode === "warehouse"
                      ? "bg-[#6366F1]/20 text-[#6366F1]"
                      : "bg-[#A855F7]/20 text-[#A855F7]"
                  }`}
                >
                  {currentLocationName}
                </span>
              </div>
            )}
          </div>

          <PosSearchBar
            enabled={inventoryMode === "warehouse" && !!warehouseId}
          />

          {/* Product Grid */}
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
            />
          </div>
        </div>

        {/* Right Panel - Cart */}
        <div className="w-80 lg:w-96 flex flex-col border-l border-white/[0.08]">
          <div className="flex-1 overflow-hidden">
            <CartPanel />
          </div>

          {/* Checkout Button */}
          <div className="p-4 border-t border-white/[0.08]">
            <CheckoutButton onCheckout={handleCheckout} />
          </div>
        </div>

        {/* Checkout Modal */}
        <CheckoutModal
          isOpen={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          warehouseId={
            inventoryMode === "warehouse" ? warehouseId || undefined : undefined
          }
          storeId={inventoryMode === "store" ? storeId || undefined : undefined}
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

// Simple checkout button that opens the checkout modal
function CheckoutButton({ onCheckout }: { onCheckout: () => void }) {
  return (
    <button
      onClick={onCheckout}
    className="w-full py-4 rounded-xl [background:var(--grad-brand-diagonal)] text-white font-bold text-lg hover:opacity-95 transition-all shadow-lg shadow-[#6366F1]/20"
    >
      Proceed to Checkout
    </button>
  );
}
