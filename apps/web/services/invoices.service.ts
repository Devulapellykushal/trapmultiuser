/**
 * Invoices Service
 * Handles all invoice-related API calls
 */
import { api } from "@/lib/api";

// Types
export interface InvoiceItem {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: string;
  total: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  date: string;
  time: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  items: InvoiceItem[];
  subtotal: string;
  discount: string;
  discount_percent: number;
  total: string;
  payment_method: "cash" | "card" | "upi" | "credit";
  status: "paid" | "cancelled" | "refunded" | "credit";
  cashier: string;
  created_at: string;
}

export interface InvoiceListParams {
  search?: string;
  /** When set, list returns invoice(s) for this sale (POS “View Invoice” deep link). */
  sale_id?: string;
  status?: "paid" | "cancelled" | "refunded" | "credit";
  payment_method?: "cash" | "card" | "upi" | "credit";
  date_from?: string;
  date_to?: string;
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

export interface InvoiceSummary {
  total_invoices: number;
  paid_count: number;
  cancelled_count: number;
  total_revenue: number;
  avg_value: number;
}

// API Endpoints
export const invoicesService = {
  // Get invoice list
  getInvoices: (params?: InvoiceListParams) =>
    api.get<PaginatedResponse<Invoice>>("/invoices/", params),

  // Get single invoice
  getInvoice: (id: number) => api.get<Invoice>(`/invoices/${id}/`),

  // Get invoice PDF download URL
  getInvoicePdfUrl: (id: number) =>
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/invoices/${id}/pdf/`,

  // Generate invoice from sale
  generateInvoice: (saleId: number) =>
    api.post<Invoice>("/invoices/generate/", { sale_id: saleId }),

  // Get summary stats
  getInvoiceSummary: (params?: { period?: string }) =>
    api.get<InvoiceSummary>("/invoices/summary/", params),
};

export default invoicesService;
