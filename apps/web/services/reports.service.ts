/**
 * Reports Service
 * Handles all Phase 16 report API calls for dashboards
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 * ========================================
 *
 * Core Rule: Dashboards visualize answers. They do not calculate them.
 * All data comes from Phase 16 report APIs.
 */
import { api } from "@/lib/api";

// =============================================================================
// TYPES
// =============================================================================

// Inventory Reports
export interface CurrentStockItem {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  brand: string;
  warehouseId: string | null;
  warehouseName: string;
  availableStock: number;
}

export interface CurrentStockReport {
  total: number;
  page: number;
  pageSize: number;
  results: CurrentStockItem[];
}

export interface AgingBucket {
  count: number;
  totalStock: number;
}

export interface StockAgingReport {
  asOfDate: string;
  summary: {
    "0-30 days": AgingBucket;
    "31-60 days": AgingBucket;
    "61-90 days": AgingBucket;
    "90+ days": AgingBucket;
  };
  details: {
    "0-30 days": Array<{
      productId: string;
      productName: string;
      sku: string;
      lastMovementDate: string;
      daysSinceMovement: number;
      currentStock: number;
    }>;
    "31-60 days": Array<any>;
    "61-90 days": Array<any>;
    "90+ days": Array<any>;
  };
}

export interface MovementItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string;
  productBrand: string;
  warehouseId: string | null;
  warehouseName: string | null;
  movementType: string;
  quantity: number;
  referenceType: string;
  referenceId: string;
  remarks: string;
  createdBy: string | null;
  createdAt: string;
}

export interface StockMovementReport {
  total: number;
  page: number;
  pageSize: number;
  results: MovementItem[];
}

// Sales Reports
export interface SalesSummaryStoreRow {
  storeId: string | null;
  storeName: string;
  totalSales: string;
  invoiceCount: number;
  totalItemsSold: number;
}

export interface SalesSummaryReport {
  period: {
    from: string | null;
    to: string | null;
  };
  totalSales: string;
  totalSubtotal: string;
  totalDiscount: string;
  totalGst: string;
  invoiceCount: number;
  totalItemsSold: number;
  byStore?: SalesSummaryStoreRow[];
}

export interface ProductSalesItem {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  brand: string;
  quantitySold: number;
  revenue: string;
  gstCollected: string;
  orderCount: number;
}

export interface ProductSalesReport {
  total: number;
  page: number;
  pageSize: number;
  results: ProductSalesItem[];
}

export interface SalesTrendItem {
  period: string;
  totalSales: string;
  invoiceCount: number;
  totalItems: number;
}

export interface SalesTrendsReport {
  groupBy: "day" | "month";
  results: SalesTrendItem[];
}

// Returns & Adjustments
export interface ReturnsSummaryReport {
  summary: {
    totalRefundAmount: string;
    totalRefundGst: string;
    returnCount: number;
  };
  topReturnedProducts: Array<{
    productId: string;
    productName: string;
    sku: string;
    totalReturned: number;
    totalRefund: string;
  }>;
}

export interface AdjustmentItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  warehouseName: string | null;
  quantity: number;
  reason: string;
  createdBy: string | null;
  createdAt: string;
}

export interface AdjustmentsReport {
  summary: {
    totalAdjustments: number;
    totalPositiveQty: number;
    totalNegativeQty: number;
  };
  total: number;
  page: number;
  pageSize: number;
  results: AdjustmentItem[];
}

// Profit & Tax
export interface ProfitItem {
  productId: string;
  productName: string;
  sku: string;
  quantitySold: number;
  totalRevenue: string;
  totalCost: string;
  grossProfit: string;
  marginPercent: string;
}

export interface GrossProfitReport {
  summary: {
    totalRevenue: string;
    totalCost: string;
    grossProfit: string;
    overallMarginPercent: string;
  };
  total: number;
  page: number;
  pageSize: number;
  results: ProfitItem[];
}

export interface GstBreakdownItem {
  gstRate: string;
  taxableAmount: string;
  gstAmount: string;
}

export interface GstSummaryReport {
  period: {
    from: string | null;
    to: string | null;
  };
  gstCollected: string;
  gstRefunded: string;
  netGstLiability: string;
  breakdownByRate: GstBreakdownItem[];
}

// Dimension Reports
export interface CategorySalesItem {
  category: string;
  quantitySold: number;
  revenue: string;
  gstCollected: string;
  orderCount: number;
  productCount: number;
}

export interface CategorySalesReport {
  summary: {
    totalRevenue: string;
    totalQuantity: number;
    totalOrders: number;
    categoryCount: number;
  };
  total: number;
  page: number;
  pageSize: number;
  results: CategorySalesItem[];
}

export interface BrandSalesItem {
  brand: string;
  quantitySold: number;
  revenue: string;
  gstCollected: string;
  orderCount: number;
  productCount: number;
}

export interface BrandSalesReport {
  summary: {
    totalRevenue: string;
    totalQuantity: number;
    totalOrders: number;
    brandCount: number;
  };
  total: number;
  page: number;
  pageSize: number;
  results: BrandSalesItem[];
}

export interface SizeSalesItem {
  size: string;
  quantitySold: number;
  revenue: string;
  gstCollected: string;
  orderCount: number;
  productCount: number;
}

export interface SizeSalesReport {
  summary: {
    totalRevenue: string;
    totalQuantity: number;
    totalOrders: number;
    sizeCount: number;
  };
  total: number;
  page: number;
  pageSize: number;
  results: SizeSalesItem[];
}

export interface SupplierReportItem {
  supplierId: string | null;
  supplierName: string;
  supplierCode: string;
  quantityOrdered: number;
  quantityReceived: number;
  totalAmount: string;
  orderCount: number;
  productCount: number;
}

export interface SupplierReport {
  summary: {
    totalAmount: string;
    totalQuantity: number;
    totalOrders: number;
    supplierCount: number;
  };
  total: number;
  page: number;
  pageSize: number;
  results: SupplierReportItem[];
}

export interface WarehouseSalesItem {
  warehouseId: string | null;
  warehouseName: string;
  warehouseCode: string;
  totalSales: string;
  totalGst: string;
  invoiceCount: number;
  totalItems: number;
}

export interface WarehouseSalesReport {
  summary: {
    totalSales: string;
    totalGst: string;
    invoiceCount: number;
    totalItems: number;
    warehouseCount: number;
  };
  total: number;
  page: number;
  pageSize: number;
  results: WarehouseSalesItem[];
}

// Supplier Sales Report (shows which suppliers' products are selling best)
export interface SupplierSalesItem {
  supplierId: string | null;
  supplierName: string;
  supplierCode: string;
  quantitySold: number;
  totalRevenue: string;
  totalGst: string;
  productCount: number;
  saleCount: number;
}

export interface SupplierSalesReport {
  summary: {
    totalRevenue: string;
    totalGst: string;
    totalQuantity: number;
    totalSales: number;
    supplierCount: number;
  };
  total: number;
  page: number;
  pageSize: number;
  results: SupplierSalesItem[];
}

// Params
export interface ReportParams {
  dateFrom?: string;
  dateTo?: string;
  warehouseId?: string;
  productId?: string;
  page?: number;
  pageSize?: number;
}

export interface MovementParams extends ReportParams {
  movementType?: string;
}

export interface TrendsParams extends ReportParams {
  groupBy?: "day" | "month";
}

// =============================================================================
// API SERVICE
// =============================================================================

export const reportsService = {
  // Inventory Reports
  getCurrentStock: (params?: ReportParams) =>
    api.get<CurrentStockReport>("/reports/inventory/current/", {
      warehouse_id: params?.warehouseId,
      product_id: params?.productId,
      page: params?.page,
      page_size: params?.pageSize,
    }),

  getStockAging: (params?: { warehouseId?: string }) =>
    api.get<StockAgingReport>("/reports/inventory/aging/", {
      warehouse_id: params?.warehouseId,
    }),

  getStockMovements: (params?: MovementParams) =>
    api.get<StockMovementReport>("/reports/inventory/movements/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      movement_type: params?.movementType,
      warehouse_id: params?.warehouseId,
      product_id: params?.productId,
      page: params?.page,
      page_size: params?.pageSize,
    }),

  // Sales Reports
  getSalesSummary: (params?: ReportParams) =>
    api.get<SalesSummaryReport>("/reports/sales/summary/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
    }),

  getProductSales: (params?: ReportParams) =>
    api.get<ProductSalesReport>("/reports/sales/by-product/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
      product_id: params?.productId,
      page: params?.page,
      page_size: params?.pageSize,
    }),

  getSalesTrends: (params?: TrendsParams) =>
    api.get<SalesTrendsReport>("/reports/sales/trends/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
      group_by: params?.groupBy || "day",
    }),

  // Returns & Adjustments
  getReturnsSummary: (params?: ReportParams) =>
    api.get<ReturnsSummaryReport>("/reports/returns/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
    }),

  getAdjustments: (params?: ReportParams) =>
    api.get<AdjustmentsReport>("/reports/adjustments/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
      product_id: params?.productId,
      page: params?.page,
      page_size: params?.pageSize,
    }),

  // Profit & Tax
  getGrossProfit: (params?: ReportParams) =>
    api.get<GrossProfitReport>("/reports/profit/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
      product_id: params?.productId,
      page: params?.page,
      page_size: params?.pageSize,
    }),

  getGstSummary: (params?: ReportParams) =>
    api.get<GstSummaryReport>("/reports/tax/gst/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
    }),

  // Dimension Reports
  getCategorySales: (params?: ReportParams) =>
    api.get<CategorySalesReport>("/reports/by-category/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
      page: params?.page,
      page_size: params?.pageSize,
    }),

  getBrandSales: (params?: ReportParams) =>
    api.get<BrandSalesReport>("/reports/by-brand/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
      page: params?.page,
      page_size: params?.pageSize,
    }),

  getSizeSales: (params?: ReportParams) =>
    api.get<SizeSalesReport>("/reports/by-size/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
      page: params?.page,
      page_size: params?.pageSize,
    }),

  getSupplierReport: (params?: ReportParams) =>
    api.get<SupplierReport>("/reports/by-supplier/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
      page: params?.page,
      page_size: params?.pageSize,
    }),

  // Supplier Sales Report (which suppliers' products are in demand)
  getSupplierSales: (params?: ReportParams) =>
    api.get<SupplierSalesReport>("/reports/by-supplier-sales/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      warehouse_id: params?.warehouseId,
      page: params?.page,
      page_size: params?.pageSize,
    }),

  getWarehouseSales: (params?: ReportParams) =>
    api.get<WarehouseSalesReport>("/reports/by-warehouse/", {
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      page: params?.page,
      page_size: params?.pageSize,
    }),
};

export default reportsService;
