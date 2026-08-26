/**
 * Maps DRF invoice payloads (camelCase and snake_case) to the shape used by
 * `InvoicePreview` and the invoices list page.
 */

export interface InvoiceItem {
  productId: string;
  name: string;
  sku?: string;
  variantDetails?: string;
  quantity: number;
  unitPrice?: number;
  total: number;
  gstPercentage?: number;
  gstAmount?: number;
}

export interface PaymentDetail {
  method: string;
  amount: number;
}

export interface InvoiceWarehouse {
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  /** Absolute or API-relative URL for printed seller banner (16:9 asset). */
  sellerImageUrl?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
}

/** Selling shop on the sale (shared godown — stock from godown, bill from shop). */
export interface InvoiceStore {
  id?: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  saleId?: string;
  date: string;
  time?: string;
  customer: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    gstin?: string;
  };
  items: InvoiceItem[];
  subtotal?: number;
  discount?: number;
  discountType?: string;
  discountPercent?: number;
  gstTotal?: number;
  total: number;
  paymentMethod: "cash" | "card" | "upi" | "credit";
  paymentMethods?: PaymentDetail[];
  /** Sale lifecycle / settlement: credit = amount still owed (unpaid or partial). */
  status: "paid" | "cancelled" | "refunded" | "credit";
  /** ISO instant for IST date+time display (prefer sale checkout time). */
  occurredAtIso?: string;
  cashier?: string;
  /** Seller / dispatch location from the invoice warehouse (detail API). */
  warehouse?: InvoiceWarehouse | null;
  /** Shop that sold (when attributed); preferred over warehouse for seller block. */
  store?: InvoiceStore | null;
}

export interface ApiInvoice {
  id: string;
  invoiceNumber?: string;
  invoice_number?: string;
  invoiceDate?: string;
  invoice_date?: string;
  createdAt?: string;
  created_at?: string;
  billingName?: string;
  billing_name?: string;
  billingPhone?: string;
  billing_phone?: string;
  billingGstin?: string;
  billing_gstin?: string;
  saleCustomerEmail?: string;
  sale_customer_email?: string;
  saleCustomerAddress?: string;
  sale_customer_address?: string;
  discountAmount?: string;
  discount_amount?: string;
  discountType?: string;
  discount_type?: string;
  gstTotal?: string;
  gst_total?: string;
  totalAmount?: string;
  total_amount?: string;
  subtotalAmount?: string;
  subtotal_amount?: string;
  discountValue?: string;
  discount_value?: string;
  salePayments?: Array<{ method?: string; amount?: string }>;
  sale_payments?: Array<{ method?: string; amount?: string }>;
  saleCreatedBy?: { name?: string; username?: string };
  sale_created_by?: { name?: string; username?: string };
  saleCreatedByName?: string;
  sale_created_by_name?: string;
  saleStatus?: string;
  sale_status?: string;
  salePaymentStatus?: string;
  sale_payment_status?: string;
  saleIsCreditSale?: boolean;
  sale_is_credit_sale?: boolean;
  saleDueAmount?: string;
  sale_due_amount?: string;
  saleCreatedAt?: string;
  sale_created_at?: string;
  warehouseName?: string;
  warehouse_name?: string;
  warehouseAddress?: string;
  warehouse_address?: string;
  warehouseEmail?: string;
  warehouse_email?: string;
  warehousePhone?: string;
  warehouse_phone?: string;
  warehouseSellerImageUrl?: string;
  warehouse_seller_image_url?: string;
  warehouseBankName?: string;
  warehouse_bank_name?: string;
  warehouseBankAccountNumber?: string;
  warehouse_bank_account_number?: string;
  warehouseBankIfsc?: string;
  warehouse_bank_ifsc?: string;
  saleId?: string;
  sale_id?: string;
  sale?: string;
  items?: Array<{
    id: string;
    productName?: string;
    product_name?: string;
    sku?: string;
    variantDetails?: string;
    variant_details?: string;
    quantity?: number;
    qty?: number;
    unitPrice?: string;
    unit_price?: string;
    lineTotal?: string;
    line_total?: string;
    lineTotalWithGst?: string;
    line_total_with_gst?: string;
    gstPercentage?: string;
    gst_percentage?: string;
    gstAmount?: string;
    gst_amount?: string;
  }>;
}

function getPrimaryPaymentMethod(
  payments?: Array<{ method?: string; amount?: string }>,
): "cash" | "card" | "upi" | "credit" {
  if (!payments || payments.length === 0) return "cash";
  if (payments.some((p) => (p.method || "").toUpperCase() === "CREDIT")) {
    return "credit";
  }
  const method = (payments[0]?.method || "CASH").toUpperCase();
  switch (method) {
    case "UPI":
      return "upi";
    case "CARD":
      return "card";
    case "CREDIT":
      return "credit";
    case "CASH":
    default:
      return "cash";
  }
}

function formatDateSafe(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

export function parseApiMoney(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pickRecord(obj: unknown): Record<string, unknown> {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
}

function pickStr(
  r: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): string {
  const v = r[camelKey] ?? r[snakeKey];
  if (v === undefined || v === null) return "";
  return String(v);
}

function pickOptionalStr(
  r: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): string | undefined {
  const s = pickStr(r, camelKey, snakeKey).trim();
  return s || undefined;
}

function salePaymentsFromRecord(
  r: Record<string, unknown>,
): Array<{ method?: string; amount?: string }> {
  const raw = r.salePayments ?? r.sale_payments;
  if (!Array.isArray(raw)) return [];
  return raw as Array<{ method?: string; amount?: string }>;
}

function mapInvoiceStatusFromSale(r: Record<string, unknown>): Invoice["status"] {
  const saleStatus = pickStr(r, "saleStatus", "sale_status").toUpperCase();
  if (saleStatus === "CANCELLED" || saleStatus === "FAILED") return "cancelled";
  if (saleStatus === "REFUNDED") return "refunded";
  const pay = pickStr(r, "salePaymentStatus", "sale_payment_status").toUpperCase();
  if (pay === "PAID") return "paid";
  return "credit";
}

function saleCreatedByFromRecord(
  r: Record<string, unknown>,
): { name?: string; username?: string } | undefined {
  const raw = r.saleCreatedBy ?? r.sale_created_by;
  if (!raw || typeof raw !== "object") return undefined;
  return raw as { name?: string; username?: string };
}

function mapApiInvoiceItem(rawUnknown: unknown): InvoiceItem {
  const item = pickRecord(rawUnknown);
  const productName = String(
    item.productName ?? item.product_name ?? "",
  ).trim();
  const sku = String(item.sku ?? "").trim();
  const name = productName || sku || "Unknown Product";
  const qtyRaw = item.quantity ?? item.qty;
  let quantity = 0;
  if (typeof qtyRaw === "number" && Number.isFinite(qtyRaw)) {
    quantity = Math.max(0, Math.floor(qtyRaw));
  } else {
    const q = parseInt(String(qtyRaw ?? "0"), 10);
    quantity = Number.isFinite(q) && q > 0 ? q : 0;
  }
  const unitPrice = parseApiMoney(item.unitPrice ?? item.unit_price);
  const lineWithGst = parseApiMoney(
    item.lineTotalWithGst ?? item.line_total_with_gst,
  );
  const lineNet = parseApiMoney(item.lineTotal ?? item.line_total);
  const total =
    lineWithGst > 0
      ? lineWithGst
      : lineNet > 0
        ? lineNet
        : quantity > 0 && unitPrice > 0
          ? quantity * unitPrice
          : 0;
  const gstPercentage = parseApiMoney(
    item.gstPercentage ?? item.gst_percentage,
  );
  const gstAmount = parseApiMoney(item.gstAmount ?? item.gst_amount);
  const variantDetails = String(
    item.variantDetails ?? item.variant_details ?? "",
  ).trim();
  const id =
    item.id !== undefined && item.id !== null ? String(item.id) : "line";
  return {
    productId: id,
    name,
    sku,
    variantDetails,
    quantity,
    unitPrice,
    total,
    gstPercentage,
    gstAmount,
  };
}

function warehouseFromDetailRecord(
  r: Record<string, unknown>,
): Invoice["warehouse"] | undefined {
  const name = pickStr(r, "warehouseName", "warehouse_name").trim();
  if (!name) return undefined;
  return {
    name,
    address: pickOptionalStr(r, "warehouseAddress", "warehouse_address"),
    email: pickOptionalStr(r, "warehouseEmail", "warehouse_email"),
    phone: pickOptionalStr(r, "warehousePhone", "warehouse_phone"),
    sellerImageUrl: pickOptionalStr(
      r,
      "warehouseSellerImageUrl",
      "warehouse_seller_image_url",
    ),
    bankName: pickOptionalStr(r, "warehouseBankName", "warehouse_bank_name"),
    bankAccount: pickOptionalStr(
      r,
      "warehouseBankAccountNumber",
      "warehouse_bank_account_number",
    ),
    bankIfsc: pickOptionalStr(r, "warehouseBankIfsc", "warehouse_bank_ifsc"),
  };
}

function storeFromDetailRecord(
  r: Record<string, unknown>,
): Invoice["store"] | undefined {
  const name = pickStr(r, "saleStoreName", "sale_store_name").trim();
  if (!name) return undefined;
  return {
    id: pickOptionalStr(r, "saleStoreId", "sale_store_id"),
    name,
    address: pickOptionalStr(r, "saleStoreAddress", "sale_store_address"),
    email: pickOptionalStr(r, "saleStoreEmail", "sale_store_email"),
    phone: pickOptionalStr(r, "saleStorePhone", "sale_store_phone"),
  };
}

function parseSaleIdFromApi(api: ApiInvoice): string | undefined {
  const r = pickRecord(api);
  const sid =
    r.saleId ?? r.sale_id ?? r.sale ?? api.saleId ?? api.sale_id ?? api.sale;
  if (sid === undefined || sid === null) return undefined;
  const s = String(sid).trim();
  return s || undefined;
}

export function transformInvoiceList(apiInvoice: ApiInvoice): Invoice {
  const r = pickRecord(apiInvoice);
  const payments = salePaymentsFromRecord(r);
  const paymentMethod = getPrimaryPaymentMethod(payments);
  const createdBy = saleCreatedByFromRecord(r);
  const createdAt = pickStr(r, "createdAt", "created_at");
  const saleCreatedAt = pickStr(r, "saleCreatedAt", "sale_created_at");
  const occurredIso =
    (saleCreatedAt || createdAt || "").trim() || undefined;

  return {
    id: String(apiInvoice.id),
    invoiceNumber: pickStr(r, "invoiceNumber", "invoice_number"),
    saleId: parseSaleIdFromApi(apiInvoice),
    date:
      formatDateSafe(pickStr(r, "invoiceDate", "invoice_date")) ||
      formatDateSafe(occurredIso || createdAt),
    time: occurredIso?.split("T")[1]?.slice(0, 5) || "",
    occurredAtIso: occurredIso,
    customer: {
      name: pickStr(r, "billingName", "billing_name") || "Walk-in Customer",
      phone: pickOptionalStr(r, "billingPhone", "billing_phone"),
    },
    items: [],
    subtotal: parseApiMoney(r.subtotalAmount ?? r.subtotal_amount),
    discount: parseApiMoney(r.discountAmount ?? r.discount_amount),
    discountType: pickStr(r, "discountType", "discount_type") || "NONE",
    gstTotal: parseApiMoney(r.gstTotal ?? r.gst_total),
    total: parseApiMoney(r.totalAmount ?? r.total_amount),
    paymentMethod: paymentMethod,
    status: mapInvoiceStatusFromSale(r),
    cashier:
      createdBy?.name ||
      createdBy?.username ||
      pickStr(r, "saleCreatedByName", "sale_created_by_name") ||
      "Admin",
    warehouse: warehouseFromDetailRecord(r),
    store: storeFromDetailRecord(r),
  };
}

export function transformInvoiceDetail(apiInvoice: ApiInvoice): Invoice {
  const r = pickRecord(apiInvoice);
  const payments = salePaymentsFromRecord(r);
  const paymentMethod = getPrimaryPaymentMethod(payments);
  const createdBy = saleCreatedByFromRecord(r);
  const createdAt = pickStr(r, "createdAt", "created_at");
  const saleCreatedAt = pickStr(r, "saleCreatedAt", "sale_created_at");
  const occurredIso =
    (saleCreatedAt || createdAt || "").trim() || undefined;

  const paymentMethods = payments.map((p) => ({
    method: p.method || "CASH",
    amount: parseApiMoney(p.amount),
  }));

  const cashierName =
    createdBy?.name ||
    createdBy?.username ||
    pickStr(r, "saleCreatedByName", "sale_created_by_name") ||
    "Admin";

  const itemsRaw = r.items;
  const itemsArray = Array.isArray(itemsRaw) ? itemsRaw : [];

  return {
    id: String(apiInvoice.id),
    invoiceNumber: pickStr(r, "invoiceNumber", "invoice_number"),
    saleId: parseSaleIdFromApi(apiInvoice),
    date:
      formatDateSafe(pickStr(r, "invoiceDate", "invoice_date")) ||
      formatDateSafe(occurredIso || createdAt),
    time: occurredIso?.split("T")[1]?.slice(0, 5) || "",
    occurredAtIso: occurredIso,
    customer: {
      name: pickStr(r, "billingName", "billing_name") || "Walk-in Customer",
      phone: pickOptionalStr(r, "billingPhone", "billing_phone"),
      email: pickOptionalStr(r, "saleCustomerEmail", "sale_customer_email"),
      address: pickOptionalStr(r, "saleCustomerAddress", "sale_customer_address"),
      gstin: pickOptionalStr(r, "billingGstin", "billing_gstin"),
    },
    items: itemsArray.map(mapApiInvoiceItem),
    subtotal: parseApiMoney(r.subtotalAmount ?? r.subtotal_amount),
    discount: parseApiMoney(r.discountAmount ?? r.discount_amount),
    discountType: pickStr(r, "discountType", "discount_type") || "NONE",
    discountPercent: parseApiMoney(r.discountValue ?? r.discount_value),
    gstTotal: parseApiMoney(r.gstTotal ?? r.gst_total),
    total: parseApiMoney(r.totalAmount ?? r.total_amount),
    paymentMethod: paymentMethod,
    paymentMethods: paymentMethods,
    status: mapInvoiceStatusFromSale(r),
    cashier: cashierName,
    warehouse: warehouseFromDetailRecord(r),
    store: storeFromDetailRecord(r),
  };
}
