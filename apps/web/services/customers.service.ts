/**
 * Customers CRM Service — directory, profile, segments, POS upsert.
 */
import { api } from "@/lib/api";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  saleCount?: number;
  lastSaleAt?: string | null;
  totalRevenue?: string | number;
  creditOutstanding?: string | number;
}

export interface CustomerSale {
  id: string;
  invoiceNumber: string;
  total: string | number;
  totalItems: number;
  createdAt: string;
  creditStatus: string;
  creditBalance: string | number;
  warehouseName?: string | null;
  storeName?: string | null;
  linked?: boolean;
}

export interface CustomerSegmentCounts {
  allActive: number;
  creditOutstanding: number;
  repeatBuyers: number;
  fleetGstin: number;
  lapsed90d: number;
  newThisMonth: number;
}

export interface CustomerHubSummary {
  activeCustomers: number;
  totalCustomers: number;
  linkedRevenue: string | number;
  creditOutstanding: string | number;
  segments: CustomerSegmentCounts;
}

export interface CustomerListParams {
  search?: string;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}

export interface CustomerListMeta {
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CustomerListResponse {
  results: Customer[];
  meta: CustomerListMeta;
}

export interface CustomerWritePayload {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  notes?: string;
  is_active?: boolean;
}

export type CustomerUpdatePayload = Partial<CustomerWritePayload>;

export interface CustomerUpsertPayload {
  name?: string;
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  notes?: string;
}

function normalizeListResponse(data: unknown): CustomerListResponse {
  if (Array.isArray(data)) {
    return {
      results: data as Customer[],
      meta: {
        page: 1,
        pageSize: data.length || 20,
        total: data.length,
        hasNext: false,
        hasPrev: false,
      },
    };
  }
  const body = data as {
    results?: Customer[];
    meta?: Partial<CustomerListMeta> & {
      page_size?: number;
      has_next?: boolean;
      has_prev?: boolean;
    };
  };
  const meta = body.meta ?? {};
  return {
    results: body.results ?? [],
    meta: {
      page: meta.page ?? 1,
      pageSize: meta.pageSize ?? meta.page_size ?? 20,
      total: meta.total ?? (body.results?.length ?? 0),
      hasNext: meta.hasNext ?? meta.has_next ?? false,
      hasPrev: meta.hasPrev ?? meta.has_prev ?? false,
    },
  };
}

function normalizeSegments(raw: Record<string, unknown>): CustomerSegmentCounts {
  return {
    allActive: Number(raw.allActive ?? raw.all_active ?? 0),
    creditOutstanding: Number(
      raw.creditOutstanding ?? raw.credit_outstanding ?? 0,
    ),
    repeatBuyers: Number(raw.repeatBuyers ?? raw.repeat_buyers ?? 0),
    fleetGstin: Number(raw.fleetGstin ?? raw.fleet_gstin ?? 0),
    lapsed90d: Number(raw.lapsed90d ?? raw.lapsed_90d ?? 0),
    newThisMonth: Number(raw.newThisMonth ?? raw.new_this_month ?? 0),
  };
}

export const customersService = {
  list: async (params?: CustomerListParams): Promise<CustomerListResponse> => {
    const query: Record<string, string | number | boolean> = {};
    if (params?.search?.trim()) query.search = params.search.trim();
    if (params?.is_active !== undefined) query.is_active = params.is_active;
    if (params?.page) query.page = params.page;
    if (params?.page_size) query.page_size = params.page_size;
    const data = await api.get<unknown>("/customers/", query);
    return normalizeListResponse(data);
  },

  get: (id: string): Promise<Customer> => {
    return api.get<Customer>(`/customers/${id}/`);
  },

  create: (payload: CustomerWritePayload): Promise<Customer> => {
    return api.post<Customer>("/customers/", payload);
  },

  update: (id: string, payload: CustomerUpdatePayload): Promise<Customer> => {
    return api.patch<Customer>(`/customers/${id}/`, payload);
  },

  deactivate: (id: string): Promise<Customer> => {
    return api.patch<Customer>(`/customers/${id}/`, { is_active: false });
  },

  activate: (id: string): Promise<Customer> => {
    return api.patch<Customer>(`/customers/${id}/`, { is_active: true });
  },

  summary: async (): Promise<CustomerHubSummary> => {
    const raw = await api.get<Record<string, unknown>>("/customers/summary/");
    const segs = (raw.segments ?? {}) as Record<string, unknown>;
    return {
      activeCustomers: Number(raw.activeCustomers ?? raw.active_customers ?? 0),
      totalCustomers: Number(raw.totalCustomers ?? raw.total_customers ?? 0),
      linkedRevenue: (raw.linkedRevenue ?? raw.linked_revenue ?? 0) as
        | string
        | number,
      creditOutstanding: (raw.creditOutstanding ??
        raw.credit_outstanding ??
        0) as string | number,
      segments: normalizeSegments(segs),
    };
  },

  segments: async (): Promise<CustomerSegmentCounts> => {
    const raw = await api.get<Record<string, unknown>>("/customers/segments/");
    return normalizeSegments(raw);
  },

  sales: async (id: string): Promise<CustomerSale[]> => {
    const data = await api.get<{ results?: CustomerSale[] }>(
      `/customers/${id}/sales/`,
    );
    return data.results ?? [];
  },

  linkSales: (
    id: string,
  ): Promise<{ linked: number; stats: Record<string, unknown> }> => {
    return api.post(`/customers/${id}/link-sales/`);
  },

  upsert: async (
    payload: CustomerUpsertPayload,
  ): Promise<{ customer: Customer; linkedSales: number }> => {
    const data = await api.post<{
      customer: Customer;
      linkedSales?: number;
      linked_sales?: number;
    }>("/customers/upsert/", payload);
    return {
      customer: data.customer,
      linkedSales: Number(data.linkedSales ?? data.linked_sales ?? 0),
    };
  },

  /** Match existing CRM row by phone and/or email (no create). */
  lookup: async (params: {
    phone?: string;
    email?: string;
  }): Promise<{ matched: boolean; customer: Customer | null }> => {
    const query: Record<string, string> = {};
    if (params.phone?.trim()) query.phone = params.phone.trim();
    if (params.email?.trim()) query.email = params.email.trim();
    if (!query.phone && !query.email) {
      return { matched: false, customer: null };
    }
    const data = await api.get<{
      matched?: boolean;
      customer?: Customer | null;
    }>("/customers/lookup/", query);
    return {
      matched: Boolean(data.matched && data.customer),
      customer: data.customer ?? null,
    };
  },

  syncFromSales: async (): Promise<{
    customersCreated: number;
    salesLinked: number;
    salesSkipped: number;
    duplicatesMerged: number;
    totalCustomers: number;
  }> => {
    const raw = await api.post<Record<string, unknown>>(
      "/customers/sync-from-sales/",
    );
    return {
      customersCreated: Number(
        raw.customersCreated ?? raw.customers_created ?? 0,
      ),
      salesLinked: Number(raw.salesLinked ?? raw.sales_linked ?? 0),
      salesSkipped: Number(raw.salesSkipped ?? raw.sales_skipped ?? 0),
      duplicatesMerged: Number(
        raw.duplicatesMerged ?? raw.duplicates_merged ?? 0,
      ),
      totalCustomers: Number(raw.totalCustomers ?? raw.total_customers ?? 0),
    };
  },
};
