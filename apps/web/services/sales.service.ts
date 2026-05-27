/**
 * Sales/POS Service
 * Handles all POS and sales-related API calls
 */
import { api } from "@/lib/api";

// Types
/** POST /sales/scan/ — ledger-backed product row */
export interface BarcodeScanResponse {
  item_type: string;
  product_id: string;
  barcode: string;
  sku: string;
  product_name: string;
  selling_price: string;
  gst_percentage?: string;
  available_stock: number;
  requested_quantity: number;
  can_fulfill: boolean;
  warehouse_id: string;
  warehouse_name: string;
  pricing?: {
    selling_price: string;
    cost_price: string;
    gst_percentage: string;
  };
  size?: string;
  color?: string;
}

export interface CartItem {
  product_id: number;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface CheckoutRequest {
  items: { product_id: number; quantity: number }[];
  payment_method: "cash" | "card";
  discount_percent?: number;
  customer_name?: string;
  customer_phone?: string;
}

export interface CheckoutResponse {
  sale_id: number;
  invoice_number: string;
  items_count: number;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  status: string;
  message: string;
}

export interface Sale {
  id: number;
  invoice_number: string;
  date: string;
  items_count: number;
  subtotal: string;
  discount: string;
  total: string;
  payment_method: string;
  status: string;
  cashier: string;
}

export interface SaleListParams {
  date_from?: string;
  date_to?: string;
  status?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface PaginatedResponse<T> {
  results: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/** Row from GET /sales/pos/search/ (product bucket) */
export interface PosSearchProductRow {
  item_type: "PRODUCT";
  product_id: string;
  barcode: string;
  sku: string;
  product_name: string;
  selling_price: string;
  gst_percentage: string;
  available_stock: number;
  requested_quantity: number;
  can_fulfill: boolean;
  warehouse_id: string;
  warehouse_name: string;
  pricing: {
    selling_price: string;
    cost_price: string;
    gst_percentage: string;
  };
  pricing_source: string;
  variant_sku?: string;
  variant_barcode?: string;
  size?: string;
  color?: string;
}

/** Row from GET /sales/pos/search/ (service bucket) */
export interface PosSearchServiceRow {
  item_type: "SERVICE";
  service_item_id: string;
  service_name: string;
  default_price: string;
  gst_percent: string;
  hsn_code: string;
}

export interface PosSearchResponse {
  query: string;
  warehouse_id: string;
  limit: number;
  products: PosSearchProductRow[];
  services: PosSearchServiceRow[];
}

// API Endpoints
export const salesService = {
  scanBarcode: (params: {
    barcode: string;
    warehouse_id: string;
    quantity?: number;
  }) =>
    api.post<BarcodeScanResponse>("/sales/scan/", {
      barcode: params.barcode,
      warehouse_id: params.warehouse_id,
      ...(params.quantity != null ? { quantity: params.quantity } : {}),
    }),

  /**
   * POS text search (products + services), warehouse-scoped.
   * @param params.q optional; empty/whitespace returns empty lists from API
   */
  posSearch: (params: { warehouse_id: string; q?: string; limit?: number }) =>
    api.get<PosSearchResponse>("/sales/pos/search/", {
      warehouse_id: params.warehouse_id,
      q: params.q ?? "",
      ...(params.limit != null ? { limit: params.limit } : {}),
    }),
  
  // Checkout
  checkout: (data: CheckoutRequest) =>
    api.post<CheckoutResponse>("/sales/checkout/", data),
  
  // Sales history
  getSales: (params?: SaleListParams) =>
    api.get<PaginatedResponse<Sale>>("/sales/", params),
  
  // Single sale
  getSale: (id: number) => api.get<Sale>(`/sales/${id}/`),
};

export default salesService;
