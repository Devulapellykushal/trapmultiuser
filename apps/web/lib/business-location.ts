/**
 * Plain-language labels for stock locations.
 * Businessmen should never see confusing "warehouse / store" jargon.
 */

export type InventoryLocationMode = "SINGLE_SHOP" | "GODOWN_AND_SHOPS";

/** How shops take stock when using Godown + shops. */
export type ShopStockMode = "TRANSFER" | "SHARED_GODOWN";

export const DEFAULT_INVENTORY_LOCATION_MODE: InventoryLocationMode =
  "SINGLE_SHOP";

export const DEFAULT_SHOP_STOCK_MODE: ShopStockMode = "TRANSFER";

export function normalizeInventoryLocationMode(
  value: unknown,
): InventoryLocationMode {
  if (value === "GODOWN_AND_SHOPS") return "GODOWN_AND_SHOPS";
  return "SINGLE_SHOP";
}

export function normalizeShopStockMode(value: unknown): ShopStockMode {
  if (value === "SHARED_GODOWN") return "SHARED_GODOWN";
  return "TRANSFER";
}

export function isSingleShopMode(mode?: InventoryLocationMode | null): boolean {
  return normalizeInventoryLocationMode(mode) === "SINGLE_SHOP";
}

export function isGodownAndShopsMode(
  mode?: InventoryLocationMode | null,
): boolean {
  return normalizeInventoryLocationMode(mode) === "GODOWN_AND_SHOPS";
}

/** All shops sell from one godown pool (no transfers). */
export function isSharedGodownStock(
  locationMode?: InventoryLocationMode | null,
  shopStockMode?: ShopStockMode | null,
): boolean {
  return (
    isGodownAndShopsMode(locationMode) &&
    normalizeShopStockMode(shopStockMode) === "SHARED_GODOWN"
  );
}

/** Friendly nouns for UI copy based on business setup. */
export function locationLabels(
  mode?: InventoryLocationMode | null,
  shopStockMode?: ShopStockMode | null,
) {
  const shared = isSharedGodownStock(mode, shopStockMode);

  if (isGodownAndShopsMode(mode)) {
    return {
      warehouseNav: "Godown",
      warehouseSingular: "godown",
      warehouseSingularTitle: "Godown",
      warehousePlural: "godowns",
      warehousePluralTitle: "Godowns",
      warehousePageSubtitle: shared
        ? "One stock pool — every shop sells from here"
        : "Where bulk stock is kept before sending to shops",
      storeNav: "Shops",
      storeSingular: "shop",
      storeSingularTitle: "Shop",
      storePlural: "shops",
      storePluralTitle: "Shops",
      storePageSubtitle: shared
        ? "Counters that sell from shared godown stock"
        : "Retail counters that sell to customers",
      filterAll: "All godowns",
      filterLabel: "Filter by godown",
      posFromGodown: "Godown",
      posFromShop: "Shop",
      setupTitle: "Godown + shops",
      setupHint: shared
        ? "All shops use the same godown stock (no sending needed)"
        : "Usually 1 godown feeds many shops — stock is sent by transfer",
      shopStockTransferTitle: "Send stock to each shop",
      shopStockTransferBody:
        "Godown holds bulk. You send tyres to a shop, then that shop sells its own stock.",
      shopStockSharedTitle: "All shops use godown stock",
      shopStockSharedBody:
        "Every shop sells from the same godown. Pick the shop at POS so you know who sold. Sale +/− on godown. No sending.",
    } as const;
  }

  return {
    warehouseNav: "My shop",
    warehouseSingular: "shop",
    warehouseSingularTitle: "My shop",
    warehousePlural: "shop",
    warehousePluralTitle: "My shop",
    warehousePageSubtitle: "Your shop details for stock and invoices",
    storeNav: "Shops",
    storeSingular: "shop",
    storeSingularTitle: "Shop",
    storePlural: "shops",
    storePluralTitle: "Shops",
    storePageSubtitle: "Retail locations",
    filterAll: "All stock",
    filterLabel: "Filter by shop",
    posFromGodown: "Shop",
    posFromShop: "Shop",
    setupTitle: "One shop only",
    setupHint: "Simplest — sell and keep stock in one place",
    shopStockTransferTitle: "Send stock to each shop",
    shopStockTransferBody:
      "Godown holds bulk. You send tyres to a shop, then that shop sells its own stock.",
    shopStockSharedTitle: "All shops use godown stock",
    shopStockSharedBody:
      "Every shop sells from the same godown. Pick the shop at POS so you know who sold. Sale +/− on godown. No sending.",
  } as const;
}
