/**
 * Business stock-layout setup (one shop vs godown + shops, transfer vs shared,
 * barcodes on/off)
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { businessSetupService } from "@/services/business-setup.service";
import {
  DEFAULT_INVENTORY_LOCATION_MODE,
  DEFAULT_SHOP_STOCK_MODE,
  InventoryLocationMode,
  ShopStockMode,
  isGodownAndShopsMode,
  isSharedGodownStock,
  isSingleShopMode,
  locationLabels,
} from "@/lib/business-location";

export const businessSetupKeys = {
  all: ["business-setup"] as const,
  detail: () => [...businessSetupKeys.all, "detail"] as const,
};

export function useBusinessSetup() {
  return useQuery({
    queryKey: businessSetupKeys.detail(),
    queryFn: () => businessSetupService.get(),
    staleTime: 60_000,
  });
}

/** Resolved mode + friendly labels (defaults to one-shop while loading). */
export function useLocationLabels() {
  const { data, isLoading, isError } = useBusinessSetup();
  const mode =
    data?.inventoryLocationMode ?? DEFAULT_INVENTORY_LOCATION_MODE;
  const shopStockMode = data?.shopStockMode ?? DEFAULT_SHOP_STOCK_MODE;
  const barcodeEnabled = data?.barcodeEnabled !== false;
  return {
    mode,
    shopStockMode,
    barcodeEnabled,
    labels: locationLabels(mode, shopStockMode),
    isSingleShop: isSingleShopMode(mode),
    isGodownAndShops: isGodownAndShopsMode(mode),
    isSharedGodown: isSharedGodownStock(mode, shopStockMode),
    /** Current way: send stock to each shop before selling */
    isTransferStock:
      isGodownAndShopsMode(mode) &&
      !isSharedGodownStock(mode, shopStockMode),
    isLoading,
    isError,
  };
}

export function useUpdateBusinessSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      inventory_location_mode?: InventoryLocationMode;
      shop_stock_mode?: ShopStockMode;
      barcode_enabled?: boolean;
      primary_warehouse_id?: string;
    }) => businessSetupService.update(payload),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(businessSetupKeys.detail(), data);
      queryClient.invalidateQueries({ queryKey: businessSetupKeys.all });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      if (typeof variables.barcode_enabled === "boolean") {
        toast.success(
          data.barcodeEnabled
            ? "Saved: Use barcodes"
            : "Saved: No barcodes needed",
        );
        return;
      }
      if (
        variables.inventory_location_mode === "SINGLE_SHOP" &&
        data.consolidation
      ) {
        const c = data.consolidation;
        if (c.unitsMoved > 0) {
          toast.success(
            `One shop mode on. Pulled ${c.unitsMoved} units from shop counters into ${c.warehouseName}.`,
          );
        } else {
          toast.success(
            `One shop mode on. Stock stays in ${c.warehouseName || "My shop"} (nothing to pull from counters).`,
          );
        }
        return;
      }
      const labels = locationLabels(
        data.inventoryLocationMode,
        data.shopStockMode,
      );
      const detail =
        data.inventoryLocationMode === "GODOWN_AND_SHOPS"
          ? data.shopStockMode === "SHARED_GODOWN"
            ? labels.shopStockSharedTitle
            : labels.shopStockTransferTitle
          : labels.setupTitle;
      toast.success(`Saved: ${detail}`);
    },
    onError: (error: unknown) => {
      let message = "Could not save setup. Try again.";
      if (error instanceof AxiosError) {
        const body = error.response?.data as
          | {
              detail?: string;
              inventory_location_mode?: string[];
              shop_stock_mode?: string[];
              barcode_enabled?: string[];
            }
          | undefined;
        if (typeof body?.detail === "string") message = body.detail;
        else if (body?.inventory_location_mode?.[0]) {
          message = body.inventory_location_mode[0];
        } else if (body?.shop_stock_mode?.[0]) {
          message = body.shop_stock_mode[0];
        } else if (body?.barcode_enabled?.[0]) {
          message = body.barcode_enabled[0];
        }
      }
      toast.error(message);
    },
  });
}
