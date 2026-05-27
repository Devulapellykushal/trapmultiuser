/**
 * Reports Hooks
 * React Query hooks for Phase 16 report APIs
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 * ========================================
 *
 * Core Rule: Dashboards visualize answers. They do not calculate them.
 * All data comes from Phase 16 report APIs.
 */
import { useQuery } from "@tanstack/react-query";
import {
  reportsService,
  ReportParams,
  MovementParams,
  TrendsParams,
  type SalesSummaryReport,
  type SalesTrendsReport,
  type SalesTrendItem,
} from "@/services";

/** Normalize DRF responses that may be snake_case (e.g. plain JSONRenderer). */
export function normalizeSalesSummary(raw: SalesSummaryReport): SalesSummaryReport {
  const d = raw as unknown as Record<string, unknown>;
  const period = (d.period ?? {}) as Record<string, unknown>;
  const num = (camel: string, snake: string) =>
    Number(d[camel] ?? d[snake] ?? 0);
  const str = (camel: string, snake: string) =>
    String(d[camel] ?? d[snake] ?? "0");
  return {
    period: {
      from: (period.from as string | null) ?? null,
      to: (period.to as string | null) ?? null,
    },
    totalSales: str("totalSales", "total_sales"),
    totalSubtotal: str("totalSubtotal", "total_subtotal"),
    totalDiscount: str("totalDiscount", "total_discount"),
    totalGst: str("totalGst", "total_gst"),
    invoiceCount: num("invoiceCount", "invoice_count"),
    totalItemsSold: num("totalItemsSold", "total_items_sold"),
  };
}

/** Normalize sales trends rows that may use snake_case from the API. */
export function normalizeSalesTrends(raw: SalesTrendsReport): SalesTrendsReport {
  const d = raw as unknown as Record<string, unknown>;
  const gb = d.groupBy ?? d.group_by;
  const groupBy = gb === "month" ? "month" : "day";
  const rows = (Array.isArray(d.results) ? d.results : []) as Record<
    string,
    unknown
  >[];
  const results: SalesTrendItem[] = rows.map((r) => ({
    period: String(r.period ?? ""),
    totalSales: String(r.totalSales ?? r.total_sales ?? "0"),
    invoiceCount: Number(r.invoiceCount ?? r.invoice_count ?? 0),
    totalItems: Number(r.totalItems ?? r.total_items ?? 0),
  }));
  return { groupBy, results };
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const reportKeys = {
  all: ["reports"] as const,

  // Inventory
  inventory: () => [...reportKeys.all, "inventory"] as const,
  currentStock: (params?: ReportParams) =>
    [...reportKeys.inventory(), "current", params] as const,
  stockAging: (params?: { warehouseId?: string }) =>
    [...reportKeys.inventory(), "aging", params] as const,
  stockMovements: (params?: MovementParams) =>
    [...reportKeys.inventory(), "movements", params] as const,

  // Sales
  sales: () => [...reportKeys.all, "sales"] as const,
  salesSummary: (params?: ReportParams) =>
    [...reportKeys.sales(), "summary", params] as const,
  productSales: (params?: ReportParams) =>
    [...reportKeys.sales(), "by-product", params] as const,
  salesTrends: (params?: TrendsParams) =>
    [...reportKeys.sales(), "trends", params] as const,

  // Returns & Adjustments
  returns: (params?: ReportParams) =>
    [...reportKeys.all, "returns", params] as const,
  adjustments: (params?: ReportParams) =>
    [...reportKeys.all, "adjustments", params] as const,

  // Profit & Tax
  profit: (params?: ReportParams) =>
    [...reportKeys.all, "profit", params] as const,
  gstSummary: (params?: ReportParams) =>
    [...reportKeys.all, "gst", params] as const,

  // Dimension Reports
  categorySales: (params?: ReportParams) =>
    [...reportKeys.all, "by-category", params] as const,
  brandSales: (params?: ReportParams) =>
    [...reportKeys.all, "by-brand", params] as const,
  sizeSales: (params?: ReportParams) =>
    [...reportKeys.all, "by-size", params] as const,
  supplierReport: (params?: ReportParams) =>
    [...reportKeys.all, "by-supplier", params] as const,
  warehouseSales: (params?: ReportParams) =>
    [...reportKeys.all, "by-warehouse", params] as const,
};

// =============================================================================
// INVENTORY HOOKS
// =============================================================================

/**
 * Current Stock Report
 * Source: /reports/inventory/current/
 */
export function useCurrentStock(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.currentStock(params),
    queryFn: () => reportsService.getCurrentStock(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Stock Aging Report
 * Source: /reports/inventory/aging/
 */
export function useStockAging(params?: { warehouseId?: string }) {
  return useQuery({
    queryKey: reportKeys.stockAging(params),
    queryFn: () => reportsService.getStockAging(params),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Stock Movement Report
 * Source: /reports/inventory/movements/
 */
export function useStockMovements(params?: MovementParams) {
  return useQuery({
    queryKey: reportKeys.stockMovements(params),
    queryFn: () => reportsService.getStockMovements(params),
    staleTime: 30000,
  });
}

// =============================================================================
// SALES HOOKS
// =============================================================================

/**
 * Sales Summary Report
 * Source: /reports/sales/summary/
 *
 * Returns: total_sales, invoice_count, total_items_sold, total_gst, total_discount
 */
export function useSalesSummaryReport(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.salesSummary(params),
    queryFn: async () => {
      const data = await reportsService.getSalesSummary(params);
      return normalizeSalesSummary(data);
    },
    staleTime: 30000,
  });
}

/**
 * Product Sales Report
 * Source: /reports/sales/by-product/
 */
export function useProductSales(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.productSales(params),
    queryFn: () => reportsService.getProductSales(params),
    staleTime: 30000,
  });
}

/**
 * Sales Trends Report
 * Source: /reports/sales/trends/
 *
 * Supports daily or monthly grouping for charts.
 */
export function useSalesTrendsReport(params?: TrendsParams) {
  return useQuery({
    queryKey: reportKeys.salesTrends(params),
    queryFn: () => reportsService.getSalesTrends(params),
    staleTime: 30000,
  });
}

// =============================================================================
// RETURNS & ADJUSTMENTS HOOKS
// =============================================================================

/**
 * Returns Summary Report
 * Source: /reports/returns/
 */
export function useReturnsSummary(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.returns(params),
    queryFn: () => reportsService.getReturnsSummary(params),
    staleTime: 30000,
  });
}

/**
 * Adjustments Report (Admin Only)
 * Source: /reports/adjustments/
 */
export function useAdjustments(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.adjustments(params),
    queryFn: () => reportsService.getAdjustments(params),
    staleTime: 30000,
  });
}

// =============================================================================
// PROFIT & TAX HOOKS (ADMIN ONLY)
// =============================================================================

/**
 * Gross Profit Report
 * Source: /reports/profit/
 */
export function useGrossProfit(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.profit(params),
    queryFn: () => reportsService.getGrossProfit(params),
    staleTime: 60000,
  });
}

/**
 * GST Summary Report
 * Source: /reports/tax/gst/
 */
export function useGstSummary(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.gstSummary(params),
    queryFn: () => reportsService.getGstSummary(params),
    staleTime: 60000,
  });
}

// =============================================================================
// DIMENSION REPORT HOOKS
// =============================================================================

/**
 * Category-wise Sales Report
 * Source: /reports/by-category/
 */
export function useCategorySales(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.categorySales(params),
    queryFn: () => reportsService.getCategorySales(params),
    staleTime: 30000,
  });
}

/**
 * Brand-wise Sales Report
 * Source: /reports/by-brand/
 */
export function useBrandSales(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.brandSales(params),
    queryFn: () => reportsService.getBrandSales(params),
    staleTime: 30000,
  });
}

/**
 * Variant-option sales rollup (each row’s `size` field from API)
 * Source: /reports/by-size/
 */
export function useSizeSales(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.sizeSales(params),
    queryFn: () => reportsService.getSizeSales(params),
    staleTime: 30000,
  });
}

/**
 * Supplier-wise Report
 * Source: /reports/by-supplier/
 */
export function useSupplierReport(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.supplierReport(params),
    queryFn: () => reportsService.getSupplierReport(params),
    staleTime: 30000,
  });
}

/**
 * Warehouse-wise Sales Report
 * Source: /reports/by-warehouse/
 */
export function useWarehouseSales(params?: ReportParams) {
  return useQuery({
    queryKey: reportKeys.warehouseSales(params),
    queryFn: () => reportsService.getWarehouseSales(params),
    staleTime: 30000,
  });
}
