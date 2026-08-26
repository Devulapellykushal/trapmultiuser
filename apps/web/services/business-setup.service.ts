/**
 * Business setup (stock layout + barcode + GST preference) API
 */
import { api } from "@/lib/api";
import {
  InventoryLocationMode,
  ShopStockMode,
  normalizeInventoryLocationMode,
  normalizeShopStockMode,
} from "@/lib/business-location";

export interface StockConsolidationResult {
  warehouseId: string;
  warehouseName: string;
  warehouseCount: number;
  storesConsolidated: number;
  linesMoved: number;
  unitsMoved: number;
}

export interface BusinessSetup {
  inventoryLocationMode: InventoryLocationMode;
  shopStockMode: ShopStockMode;
  /** When true: auto barcodes + POS scan. When false: barcodes optional. */
  barcodeEnabled: boolean;
  /** When true: GST on products/POS. When false: tax off everywhere. */
  gstEnabled: boolean;
  businessName: string;
  consolidation?: StockConsolidationResult | null;
}

type BusinessSetupApi = {
  inventoryLocationMode?: string;
  inventory_location_mode?: string;
  shopStockMode?: string;
  shop_stock_mode?: string;
  barcodeEnabled?: boolean;
  barcode_enabled?: boolean;
  gstEnabled?: boolean;
  gst_enabled?: boolean;
  businessName?: string;
  business_name?: string;
  consolidation?: Record<string, unknown> | null;
};

function mapConsolidation(
  raw: Record<string, unknown> | null | undefined,
): StockConsolidationResult | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    warehouseId: String(raw.warehouseId ?? raw.warehouse_id ?? ""),
    warehouseName: String(raw.warehouseName ?? raw.warehouse_name ?? ""),
    warehouseCount: Number(raw.warehouseCount ?? raw.warehouse_count ?? 0),
    storesConsolidated: Number(
      raw.storesConsolidated ?? raw.stores_consolidated ?? 0,
    ),
    linesMoved: Number(raw.linesMoved ?? raw.lines_moved ?? 0),
    unitsMoved: Number(raw.unitsMoved ?? raw.units_moved ?? 0),
  };
}

function mapBusinessSetup(raw: BusinessSetupApi): BusinessSetup {
  const barcodeRaw = raw.barcodeEnabled ?? raw.barcode_enabled;
  const gstRaw = raw.gstEnabled ?? raw.gst_enabled;
  return {
    inventoryLocationMode: normalizeInventoryLocationMode(
      raw.inventoryLocationMode ?? raw.inventory_location_mode,
    ),
    shopStockMode: normalizeShopStockMode(
      raw.shopStockMode ?? raw.shop_stock_mode,
    ),
    barcodeEnabled: barcodeRaw !== false,
    gstEnabled: gstRaw !== false,
    businessName: String(raw.businessName ?? raw.business_name ?? "Quake"),
    consolidation: mapConsolidation(
      raw.consolidation as Record<string, unknown> | null | undefined,
    ),
  };
}

export const businessSetupService = {
  get: async (): Promise<BusinessSetup> => {
    const raw = await api.get<BusinessSetupApi>(
      "/invoices/settings/business-setup/",
    );
    return mapBusinessSetup(raw);
  },

  update: async (data: {
    inventory_location_mode?: InventoryLocationMode;
    shop_stock_mode?: ShopStockMode;
    barcode_enabled?: boolean;
    gst_enabled?: boolean;
    primary_warehouse_id?: string;
  }): Promise<BusinessSetup> => {
    const raw = await api.patch<BusinessSetupApi>(
      "/invoices/settings/business-setup/",
      data,
    );
    return mapBusinessSetup(raw);
  },
};

export default businessSetupService;
