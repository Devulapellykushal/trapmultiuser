/**
 * Stores Service for Quake Inventory System.
 * Handles all API calls related to stores and stock transfers.
 */

import { api } from "@/lib/api";

// =============================================================================
// STORE TYPES
// =============================================================================

export interface Store {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  operator: string | null;
  operatorName: string | null;
  operatorPhone: string;
  lowStockThreshold: number;
  isActive: boolean;
  stockCount: number;
  lowStockCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreListItem {
  id: string;
  name: string;
  code: string;
  city: string;
  operatorName: string | null;
  isActive: boolean;
}

export interface CreateStoreData {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email?: string;
  operator?: string;
  operatorPhone?: string;
  lowStockThreshold?: number;
}

export interface UpdateStoreData extends Partial<CreateStoreData> {}

export interface StoreStock {
  productId: string;
  productName: string;
  productSku: string;
  stock: number;
  isLowStock: boolean;
}

export interface LowStockAlert {
  storeId: string;
  storeName: string;
  storeCode: string;
  lowStockCount: number;
  products: Array<{
    product_id: string;
    product__name: string;
    product__sku: string;
    stock: number;
  }>;
}

export interface BrandLowStockAlert {
  storeId: string;
  storeName: string;
  storeCode: string;
  brand: string;
  totalStock: number;
  threshold: number;
}

export interface LowStockAlertsResponse {
  totalAlerts: number;
  stores: LowStockAlert[];
  brandAlerts: BrandLowStockAlert[];
  totalBrandAlerts: number;
}

// Store Analytics
export interface BrandAnalytics {
  brand: string;
  productCount: number;
  totalStock: number;
  description: string;
  sizes: string[];
  categories: string[];
  isLowBrandStock: boolean;
}

export interface StoreAnalytics {
  storeId: string;
  storeName: string;
  totalProducts: number;
  totalStockQuantity: number;
  totalPurchaseValue: number;
  sales: {
    totalTransactions: number;
    totalQtySold: number;
    totalRevenue: number;
  };
  brands: BrandAnalytics[];
  lowBrandAlerts: Array<{
    brand: string;
    totalStock: number;
    threshold: number;
  }>;
  brandAlertThreshold: number;
}

// =============================================================================
// STOCK TRANSFER TYPES
// =============================================================================

export interface StockTransferItem {
  id: string;
  product: string;
  productName: string;
  productSku: string;
  quantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
  isFullyReceived: boolean;
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  sourceWarehouse: string;
  sourceWarehouseName: string;
  destinationStore: string;
  destinationStoreName: string;
  status: "PENDING" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  transferDate: string;
  dispatchDate: string | null;
  receivedDate: string | null;
  notes: string;
  createdBy: string;
  createdByName: string;
  dispatchedBy: string | null;
  dispatchedByName: string | null;
  receivedBy: string | null;
  receivedByName: string | null;
  items: StockTransferItem[];
  createdAt: string;
  updatedAt: string;
}

export interface StockTransferListItem {
  id: string;
  transferNumber: string;
  sourceWarehouseName: string;
  destinationStoreName: string;
  status: "PENDING" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  transferDate: string;
  itemCount: number;
  createdAt: string;
}

export interface CreateTransferItemData {
  product: string;
  quantity: number;
}

export interface CreateTransferData {
  sourceWarehouse: string;
  destinationStore: string;
  transferDate: string;
  notes?: string;
  items: CreateTransferItemData[];
}

export interface ReceiveItemData {
  itemId: string;
  quantity: number;
}

export interface ReceiveTransferData {
  items: ReceiveItemData[];
}

export interface TransferListParams {
  status?: string;
  warehouse?: string;
  store?: string;
  startDate?: string;
  endDate?: string;
}

export interface StoreListParams {
  isActive?: boolean;
  city?: string;
  search?: string;
}

// =============================================================================
// STORE API
// =============================================================================

export const storesService = {
  // List all stores
  getStores: (params?: StoreListParams): Promise<StoreListItem[]> => {
    const queryParams: Record<string, string> = {};
    if (params?.isActive !== undefined) {
      queryParams.is_active = params.isActive.toString();
    }
    if (params?.city) {
      queryParams.city = params.city;
    }
    if (params?.search) {
      queryParams.search = params.search;
    }
    return api.get<StoreListItem[]>("/inventory/stores/", queryParams);
  },

  // Get single store
  getStore: (id: string): Promise<Store> => {
    return api.get<Store>(`/inventory/stores/${id}/`);
  },

  // Create store
  createStore: (data: CreateStoreData): Promise<Store> => {
    const payload = {
      name: data.name,
      address: data.address,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      phone: data.phone,
      email: data.email || "",
      operator: data.operator,
      operator_phone: data.operatorPhone || "",
      low_stock_threshold: data.lowStockThreshold ?? 10,
    };
    return api.post<Store>("/inventory/stores/", payload);
  },

  // Update store
  updateStore: (id: string, data: UpdateStoreData): Promise<Store> => {
    const payload: Record<string, unknown> = {};
    if (data.name) payload.name = data.name;
    if (data.address) payload.address = data.address;
    if (data.city) payload.city = data.city;
    if (data.state) payload.state = data.state;
    if (data.pincode) payload.pincode = data.pincode;
    if (data.phone) payload.phone = data.phone;
    if (data.email !== undefined) payload.email = data.email;
    if (data.operator) payload.operator = data.operator;
    if (data.operatorPhone !== undefined)
      payload.operator_phone = data.operatorPhone;
    if (data.lowStockThreshold !== undefined)
      payload.low_stock_threshold = data.lowStockThreshold;

    return api.patch<Store>(`/inventory/stores/${id}/`, payload);
  },

  // Delete (soft) store
  deleteStore: (id: string): Promise<void> => {
    return api.delete<void>(`/inventory/stores/${id}/`);
  },

  // Get store stock
  getStoreStock: (id: string): Promise<StoreStock[]> => {
    return api.get<StoreStock[]>(`/inventory/stores/${id}/stock/`);
  },

  // Get low stock alerts (product-level + brand-level)
  getLowStockAlerts: (): Promise<LowStockAlertsResponse> => {
    return api.get<LowStockAlertsResponse>(
      "/inventory/stores/low-stock-alerts/",
    );
  },

  // Get detailed analytics for a store
  getStoreAnalytics: (id: string): Promise<StoreAnalytics> => {
    return api.get<StoreAnalytics>(`/inventory/stores/${id}/analytics/`);
  },
};

// =============================================================================
// STOCK TRANSFER API
// =============================================================================

export const stockTransfersService = {
  // List transfers
  getTransfers: (
    params?: TransferListParams,
  ): Promise<StockTransferListItem[]> => {
    const queryParams: Record<string, string> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.warehouse) queryParams.warehouse = params.warehouse;
    if (params?.store) queryParams.store = params.store;
    if (params?.startDate) queryParams.start_date = params.startDate;
    if (params?.endDate) queryParams.end_date = params.endDate;

    return api.get<StockTransferListItem[]>(
      "/inventory/stock-transfers/",
      queryParams,
    );
  },

  // Get single transfer
  getTransfer: (id: string): Promise<StockTransfer> => {
    return api.get<StockTransfer>(`/inventory/stock-transfers/${id}/`);
  },

  // Create transfer
  createTransfer: (data: CreateTransferData): Promise<StockTransfer> => {
    const payload = {
      source_warehouse: data.sourceWarehouse,
      destination_store: data.destinationStore,
      transfer_date: data.transferDate,
      notes: data.notes || "",
      items: data.items.map((item) => ({
        product: item.product,
        quantity: item.quantity,
      })),
    };
    return api.post<StockTransfer>("/inventory/stock-transfers/", payload);
  },

  // Dispatch transfer
  dispatchTransfer: (id: string): Promise<StockTransfer> => {
    return api.post<StockTransfer>(
      `/inventory/stock-transfers/${id}/dispatch/`,
    );
  },

  // Receive transfer
  receiveTransfer: (
    id: string,
    data: ReceiveTransferData,
  ): Promise<{
    transferNumber: string;
    status: string;
    itemsReceived: Array<{
      product: string;
      quantityReceived: number;
      totalReceived: number;
      pending: number;
    }>;
  }> => {
    const payload = {
      items: data.items.map((item) => ({
        item_id: item.itemId,
        quantity: item.quantity,
      })),
    };
    return api.post(`/inventory/stock-transfers/${id}/receive/`, payload);
  },
};

export default storesService;
