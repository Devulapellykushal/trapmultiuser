/**
 * POS/Sales Hooks
 * React Query hooks for POS operations
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { salesService, CheckoutRequest } from "@/services";

export const salesKeys = {
  all: ["sales"] as const,
  list: (params?: any) => [...salesKeys.all, "list", params] as const,
  detail: (id: number) => [...salesKeys.all, "detail", id] as const,
  scan: (barcode: string, warehouseId?: string | null) =>
    [...salesKeys.all, "scan", barcode, warehouseId] as const,
};

export function useScanBarcode(params: {
  barcode: string;
  warehouse_id: string | null | undefined;
}) {
  const { barcode, warehouse_id } = params;
  return useQuery({
    queryKey: salesKeys.scan(barcode, warehouse_id),
    queryFn: () =>
      salesService.scanBarcode({
        barcode,
        warehouse_id: warehouse_id as string,
      }),
    enabled: !!barcode && barcode.length > 0 && !!warehouse_id,
    retry: false,
  });
}

export function useCheckout() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CheckoutRequest) => salesService.checkout(data),
    onSuccess: () => {
      // Invalidate relevant queries after checkout
      queryClient.invalidateQueries({ queryKey: salesKeys.all });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("quake:sales-updated"));
      }
    },
  });
}

export function useSales(params?: any) {
  return useQuery({
    queryKey: salesKeys.list(params),
    queryFn: () => salesService.getSales(params),
  });
}

export function useSale(id: number) {
  return useQuery({
    queryKey: salesKeys.detail(id),
    queryFn: () => salesService.getSale(id),
    enabled: !!id,
  });
}
