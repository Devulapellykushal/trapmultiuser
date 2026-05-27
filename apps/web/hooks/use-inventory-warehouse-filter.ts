"use client";

import { create } from "zustand";

/**
 * Shared warehouse filter for Inventory: top bar selector and filter bar stay in sync.
 * Empty string means all warehouses (no `warehouse` query param).
 */
interface InventoryWarehouseFilterState {
  warehouseId: string;
  setWarehouseId: (id: string) => void;
  resetWarehouse: () => void;
}

export const useInventoryWarehouseFilterStore =
  create<InventoryWarehouseFilterState>((set) => ({
    warehouseId: "",
    setWarehouseId: (warehouseId) => set({ warehouseId }),
    resetWarehouse: () => set({ warehouseId: "" }),
  }));
