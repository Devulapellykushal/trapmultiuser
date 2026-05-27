/**
 * Inventory Service
 * Handles all inventory-related API calls
 *
 * Phase 10B: Updated for Phase 10A Product Master fields
 */
import { api, API_BASE_URL, apiClient } from "@/lib/api";

// =============================================================================
// TYPES
// =============================================================================

export interface Category {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code?: string;
  address?: string;
  email?: string;
  phone?: string;
  sellerImageUrl?: string;
  /** Response keys are camelCase (API renderer). */
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  isActive: boolean;
}

/** Request body uses snake_case (DRF default parser). */
export interface WarehouseWritePayload {
  name: string;
  code?: string;
  address: string;
  email?: string;
  phone?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  is_active?: boolean;
}

/** Create payload with optional cropped seller image (multipart when set). */
export type WarehouseCreatePayload = WarehouseWritePayload & {
  sellerImage?: Blob | File | null;
};

/** PATCH payload: partial fields plus optional new image or explicit clear. */
export type WarehouseUpdatePayload = Partial<WarehouseWritePayload> & {
  sellerImage?: Blob | File | null;
  /** When true (and no new sellerImage), PATCH clears stored banner. */
  clearSellerImage?: boolean;
};

const ACCESS_TOKEN_KEY = "Quake_access_token";

function formatDrfErrorPayload(body: Record<string, unknown>): string {
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
      .join(" ");
  }
  const parts: string[] = [];
  for (const [key, val] of Object.entries(body)) {
    if (key === "detail") continue;
    if (val == null) continue;
    if (Array.isArray(val)) {
      const msgs = val
        .map((item) =>
          typeof item === "string"
            ? item
            : typeof item === "object" && item !== null
              ? JSON.stringify(item)
              : String(item),
        )
        .filter(Boolean);
      if (msgs.length) parts.push(`${key}: ${msgs.join(" ")}`);
    } else if (typeof val === "string") {
      parts.push(`${key}: ${val}`);
    } else {
      parts.push(`${key}: ${JSON.stringify(val)}`);
    }
  }
  if (parts.length) return parts.join(" · ");
  return JSON.stringify(body);
}

async function postWarehouseWithOptionalImage(
  payload: WarehouseCreatePayload,
): Promise<Warehouse> {
  const { sellerImage, ...rest } = payload;
  if (!sellerImage) {
    return api.post<Warehouse>("/inventory/warehouses/", rest);
  }

  const fd = new FormData();
  fd.append("name", rest.name);
  fd.append("address", rest.address);
  if (rest.code?.trim()) fd.append("code", rest.code.trim());
  if (rest.email?.trim()) fd.append("email", rest.email.trim());
  if (rest.phone?.trim()) fd.append("phone", rest.phone.trim());
  if (rest.bank_name?.trim()) fd.append("bank_name", rest.bank_name.trim());
  if (rest.bank_account_number?.trim()) {
    fd.append("bank_account_number", rest.bank_account_number.trim());
  }
  if (rest.bank_ifsc?.trim()) fd.append("bank_ifsc", rest.bank_ifsc.trim());
  if (rest.is_active !== undefined) {
    fd.append("is_active", rest.is_active ? "true" : "false");
  }
  fd.append(
    "seller_image",
    sellerImage,
    sellerImage instanceof File ? sellerImage.name : "seller.jpg",
  );

  const token =
    typeof window !== "undefined" ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
  const headers: HeadersInit = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}/inventory/warehouses/`, {
    method: "POST",
    headers,
    body: fd,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as Record<string, unknown>;
      message = formatDrfErrorPayload(body);
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<Warehouse>;
}

async function patchWarehouseWithOptionalImage(
  id: string,
  payload: WarehouseUpdatePayload,
): Promise<Warehouse> {
  const { sellerImage, clearSellerImage, ...rest } = payload;

  if (!sellerImage && clearSellerImage) {
    return api.patch<Warehouse>(`/inventory/warehouses/${id}/`, {
      ...rest,
      seller_image: null,
    });
  }

  if (!sellerImage) {
    return api.patch<Warehouse>(`/inventory/warehouses/${id}/`, rest);
  }

  const fd = new FormData();
  if (rest.name !== undefined) fd.append("name", rest.name);
  if (rest.address !== undefined) fd.append("address", rest.address);
  if (rest.code?.trim()) fd.append("code", rest.code.trim());
  if (rest.email?.trim()) fd.append("email", rest.email.trim());
  if (rest.phone?.trim()) fd.append("phone", rest.phone.trim());
  if (rest.bank_name?.trim()) {
    fd.append("bank_name", rest.bank_name.trim());
  }
  if (rest.bank_account_number?.trim()) {
    fd.append("bank_account_number", rest.bank_account_number.trim());
  }
  if (rest.bank_ifsc?.trim()) fd.append("bank_ifsc", rest.bank_ifsc.trim());
  if (rest.is_active !== undefined) {
    fd.append("is_active", rest.is_active ? "true" : "false");
  }
  fd.append(
    "seller_image",
    sellerImage,
    sellerImage instanceof File ? sellerImage.name : "seller.jpg",
  );

  const token =
    typeof window !== "undefined" ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
  const headers: HeadersInit = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}/inventory/warehouses/${id}/`, {
    method: "PATCH",
    headers,
    body: fd,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as Record<string, unknown>;
      message = formatDrfErrorPayload(body);
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<Warehouse>;
}

export interface ProductPricing {
  id?: string;
  costPrice: string;
  mrp: string;
  sellingPrice: string;
  gstPercentage: string;
  marginPercentage?: string; // Computed, read-only
  profitAmount?: string; // Computed, read-only
  gstAmount?: string; // Computed, read-only
}

export interface ProductImage {
  id?: string;
  imageUrl: string;
  isPrimary: boolean;
  createdAt?: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  barcode?: string;
  size?: string;
  color?: string;
  costPrice: string;
  sellingPrice: string;
  reorderThreshold: number;
  isActive: boolean;
  stock?: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string; // Phase 10.1: Auto-generated, immutable
  barcodeValue: string; // Auto-generated, immutable
  barcodeImageUrl?: string; // SVG URL
  brand: string;
  brandId?: string;
  category: string;
  categoryId?: string;
  description?: string;
  countryOfOrigin?: string;
  attributes: Record<string, string | number | string[]>;
  gender: "MENS" | "WOMENS" | "UNISEX" | "KIDS";
  material?: string;
  season?: string;
  supplier?: string; // Supplier ID
  supplierName?: string; // Supplier name
  supplierCode?: string; // Supplier code
  isActive: boolean;
  isDeleted: boolean; // Phase 10A soft delete
  pricing?: ProductPricing; // Nested pricing object
  images?: ProductImage[];
  variants?: ProductVariant[];
  totalStock: number;
  daysInInventory?: number | null; // Days since first purchase order
  firstPurchaseDate?: string | null; // Date of first purchase order
  createdAt: string;
  updatedAt: string;
}

export interface ProductCreateData {
  name: string;
  brand: string;
  category: string;
  description?: string;
  countryOfOrigin?: string;
  attributes?: Record<string, string | number | string[]>;
  gender?: "MENS" | "WOMENS" | "UNISEX" | "KIDS";
  material?: string;
  season?: string;
  isActive?: boolean;
  pricing?: {
    costPrice: string;
    mrp: string;
    sellingPrice: string;
    gstPercentage?: string;
  };
  warehouseId?: string;
  variants?: {
    sku?: string;
    size?: string;
    color?: string;
    costPrice: number;
    sellingPrice: number;
    reorderThreshold?: number;
    initialStock?: number;
  }[];
}

export interface ProductUpdateData {
  name?: string;
  brand?: string;
  category?: string;
  description?: string;
  countryOfOrigin?: string;
  attributes?: Record<string, string | number | string[]>;
  gender?: "MENS" | "WOMENS" | "UNISEX" | "KIDS";
  material?: string;
  season?: string;
  isActive?: boolean;
  pricing?: {
    costPrice?: string;
    mrp?: string;
    sellingPrice?: string;
    gstPercentage?: string;
  };
}

/** Normalized counts for the dashboard (see getStockSummary). */
export interface StockSummary {
  total_products: number;
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
  total_stock: number;
}

/** Raw API shape from /inventory/stock/summary/ (CamelCaseJSONRenderer). */
type StockSummaryApi = {
  totalStock?: number;
  total_stock?: number;
  totalProducts?: number;
  total_products?: number;
  lowStockCount?: number;
  low_stock_count?: number;
  outOfStockCount?: number;
  out_of_stock_count?: number;
};

export interface ProductListParams {
  search?: string;
  category?: string;
  warehouse?: string;
  stock_status?: "in_stock" | "low_stock" | "out_of_stock";
  gender?: string;
  brand?: string;
  material?: string;
  season?: string;
  price_min?: number;
  price_max?: number;
  is_deleted?: boolean; // Phase 10A: Show deleted products (admin only)
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

/** Options for listing warehouses (matches inventory API query params). */
export interface WarehouseListOptions {
  /** When true, sends `include_inactive=true` so deactivated warehouses are included in each page request. */
  includeInactive?: boolean;
}

export interface BulkImportResult {
  created: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
  created_ids: string[];
}

export const inventoryService = {
  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------
  getCategories: async (): Promise<Category[]> => {
    const response = await api.get<PaginatedResponse<Category> | Category[]>(
      "/inventory/categories/",
    );
    if (Array.isArray(response)) {
      return response;
    }
    return response.results || [];
  },

  getCategory: (id: string) =>
    api.get<Category>(`/inventory/categories/${id}/`),

  createCategory: (data: { name: string; description?: string }) =>
    api.post<Category>("/inventory/categories/", data),

  updateCategory: (id: string, data: { name?: string; description?: string }) =>
    api.patch<Category>(`/inventory/categories/${id}/`, data),

  deleteCategory: (id: string) => api.delete(`/inventory/categories/${id}/`),

  // -------------------------------------------------------------------------
  // Warehouses
  // -------------------------------------------------------------------------
  getWarehouses: async (
    options?: WarehouseListOptions,
  ): Promise<Warehouse[]> => {
    const all: Warehouse[] = [];
    let page = 1;
    const pageSize = 100;
    const maxPages = 100;

    while (page <= maxPages) {
      const params: Record<string, string | number | boolean> = {
        page,
        page_size: pageSize,
      };
      if (options?.includeInactive) {
        params.include_inactive = true;
      }

      const response = await api.get<PaginatedResponse<Warehouse> | Warehouse[]>(
        "/inventory/warehouses/",
        params,
      );

      if (Array.isArray(response)) {
        return response;
      }

      const rows = response.results || [];
      all.push(...rows);

      if (!response.meta?.hasNext) {
        break;
      }
      page += 1;
    }

    return all;
  },

  getWarehouse: (id: string) =>
    api.get<Warehouse>(`/inventory/warehouses/${id}/`),

  createWarehouse: (data: WarehouseCreatePayload) =>
    postWarehouseWithOptionalImage(data),

  updateWarehouse: (id: string, data: WarehouseUpdatePayload) =>
    patchWarehouseWithOptionalImage(id, data),

  deleteWarehouse: (id: string) => api.delete(`/inventory/warehouses/${id}/`),

  // -------------------------------------------------------------------------
  // Products - CRUD
  // -------------------------------------------------------------------------
  getProducts: (params?: ProductListParams) =>
    api.get<PaginatedResponse<Product>>(
      "/inventory/products/",
      params as Record<string, unknown>,
    ),

  getProduct: (id: string) => api.get<Product>(`/inventory/products/${id}/`),

  getProductBySku: async (sku: string): Promise<Product[]> => {
    const response = await api.get<PaginatedResponse<Product>>(
      "/inventory/products/",
      { search: sku },
    );
    return response.results || [];
  },

  createProduct: (data: ProductCreateData) =>
    api.post<Product>("/inventory/products/", data),

  updateProduct: (id: string, data: ProductUpdateData) =>
    api.patch<Product>(`/inventory/products/${id}/`, data),

  deleteProduct: (id: string) => api.delete(`/inventory/products/${id}/`),

  downloadProductImportTemplate: async (format: "csv" | "xlsx") => {
    const res = await apiClient.get("/inventory/products/import-template/", {
      // `format` is reserved by DRF (FORMAT_SUFFIX_KWARG); use file_format.
      params: { file_format: format },
      responseType: "blob",
    });
    const mime =
      format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv;charset=utf-8";
    const blob = new Blob([res.data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      format === "xlsx"
        ? "quake_product_import_template.xlsx"
        : "quake_product_import_template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  bulkImportProducts: async (
    file: File,
    defaultWarehouseId?: string,
  ): Promise<BulkImportResult> => {
    const fd = new FormData();
    fd.append("file", file);
    if (defaultWarehouseId) {
      fd.append("default_warehouse_id", defaultWarehouseId);
    }
    // Do not use apiClient default Content-Type: application/json (DRF returns 415).
    const token =
      typeof window !== "undefined" ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const headers: HeadersInit = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/inventory/products/import-bulk/`, {
      method: "POST",
      headers,
      body: fd,
    });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = (await res.json()) as Record<string, unknown>;
        message = formatDrfErrorPayload(body);
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    return res.json() as Promise<BulkImportResult>;
  },

  // -------------------------------------------------------------------------
  // Stock Operations
  // -------------------------------------------------------------------------
  getStockSummary: async (): Promise<StockSummary> => {
    const raw = await api.get<StockSummaryApi>("/inventory/stock/summary/");
    const totalProducts = Number(
      raw.totalProducts ?? raw.total_products ?? 0,
    );
    const low = Number(raw.lowStockCount ?? raw.low_stock_count ?? 0);
    const out = Number(raw.outOfStockCount ?? raw.out_of_stock_count ?? 0);
    const inStock = Math.max(0, totalProducts - low - out);
    return {
      total_products: totalProducts,
      in_stock: inStock,
      low_stock: low,
      out_of_stock: out,
      total_stock: Number(raw.totalStock ?? raw.total_stock ?? 0),
    };
  },

  purchaseStock: (data: {
    product_id: string;
    warehouse_id: string;
    quantity: number;
  }) => api.post("/inventory/stock/purchase/", data),

  adjustStock: (data: {
    product_id: string;
    warehouse_id: string;
    quantity: number;
    reason: string;
  }) => api.post("/inventory/stock/adjust/", data),

  // -------------------------------------------------------------------------
  // POS Products
  // -------------------------------------------------------------------------
  getPOSProducts: (params?: {
    warehouse_id?: string;
    store_id?: string;
    search?: string;
    category?: string;
    in_stock_only?: boolean;
  }) =>
    api.get<PaginatedResponse<POSProduct>>(
      "/inventory/pos/products/",
      params as Record<string, unknown>,
    ),
};

// POS Product type - flattened variant for POS grid
export interface POSProduct {
  id: string;
  name: string;
  productName: string;
  brand: string;
  category: string;
  description: string;
  sku: string;
  barcode: string;
  size: string | null;
  color: string | null;
  sellingPrice: string;
  costPrice: string;
  mrp: string;
  gstPercentage: string;
  stock: number;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  reorderThreshold: number;
  barcodeImageUrl: string | null;
  // Supplier tracking
  supplierId: string | null;
  supplierName: string | null;
  supplierCode: string | null;
}

export default inventoryService;
