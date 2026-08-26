"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { adminHref } from "@/lib/admin-routes";
import {
  CheckCircle,
  FileText,
  Printer,
  RotateCcw,
  AlertCircle,
  Loader2,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Clock,
  User,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Plus,
  ShoppingBag,
  Sparkles,
  Percent,
  Calculator,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryKeys } from "@/hooks/use-inventory";
import { useCart } from "./cart-context";
import {
  computeTotalGstInclusiveExtract,
  roundMoney2,
} from "@/features/pos/cart-utils";
import { api, apiClient } from "@/lib/api";
import { customersService } from "@/services/customers.service";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TYPES
// =============================================================================

type PaymentMethod = "CASH" | "CARD" | "UPI" | "CREDIT";
type Step =
  | "review"
  | "customer"
  | "payment"
  | "processing"
  | "success"
  | "error";

interface PaymentEntry {
  id: string;
  method: PaymentMethod;
  amount: string;
}

interface CustomerDetails {
  id?: string;
  name: string;
  mobile: string;
  email: string;
  address: string;
}

interface CheckoutRequest {
  idempotency_key: string;
  warehouse_id?: string;
  store_id?: string;
  items: {
    barcode?: string;
    product_id?: string;
    quantity: number;
  }[];
  payments: { method: string; amount: string }[];
  discount_type?: string | null;
  discount_value?: string;
  customer_id?: string;
  customer_name?: string;
  customer_mobile?: string;
  customer_email?: string;
  customer_address?: string;
  /** When true, server extracts CGST/SGST from GST-inclusive prices. Default false at checkout. */
  apply_automatic_gst?: boolean;
}

interface CheckoutResponse {
  success: boolean;
  sale_id: string;
  invoice_number: string;
  subtotal: string;
  discount_type?: string;
  discount_value?: string;
  discount_amount?: string;
  total_gst?: string;
  total: string;
  /** API renderer camelCases this to totalItems */
  total_items?: number;
  totalItems?: number;
  status: string;
  message: string;
  is_credit_sale?: boolean;
  isCreditSale?: boolean;
  credit_balance?: string;
  creditBalance?: string;
  invoice_id?: string;
  invoiceId?: string;
  pdf_url?: string;
  pdfUrl?: string;
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouseId?: string;
  storeId?: string;
  /** When set, "View Invoice" opens this instead of navigating away (e.g. POS inline preview). */
  onViewInvoice?: (payload: {
    saleId?: string;
    invoiceId?: string;
  }) => void | Promise<void>;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const PAYMENT_METHODS: {
  key: PaymentMethod;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}[] = [
  {
    key: "CASH",
    label: "Cash",
    icon: Banknote,
    color: "#3f9d7a",
    bgColor: "rgba(46, 204, 113, 0.15)",
  },
  {
    key: "CARD",
    label: "Card",
    icon: CreditCard,
    color: "#c4a574",
    bgColor: "rgba(52, 152, 219, 0.15)",
  },
  {
    key: "UPI",
    label: "UPI",
    icon: Smartphone,
    color: "#b8956a",
    bgColor: "rgba(155, 89, 182, 0.15)",
  },
  {
    key: "CREDIT",
    label: "Credit",
    icon: Clock,
    color: "#d4a054",
    bgColor: "rgba(230, 126, 34, 0.15)",
  },
];

const QUICK_AMOUNTS = [100, 500, 1000, 2000, 5000];

/** Ensure payment rows sum to ≤ cart total (server uses 2dp; trims float/rounding drift). */
function normalizeCheckoutPayments(
  payments: PaymentEntry[],
  cartTotal: number,
): { method: string; amount: string }[] {
  const target = roundMoney2(cartTotal);
  const rows = payments.map((p) => ({
    method: p.method,
    amount: roundMoney2(parseFloat(p.amount) || 0),
  }));
  let paid = roundMoney2(rows.reduce((s, r) => s + r.amount, 0));
  if (paid <= target + 0.005) {
    return rows.map((r) => ({ method: r.method, amount: r.amount.toFixed(2) }));
  }
  let over = roundMoney2(paid - target);
  for (let i = rows.length - 1; i >= 0 && over > 0.005; i--) {
    if (rows[i].method === "CREDIT") continue;
    const red = Math.min(rows[i].amount, over);
    rows[i].amount = roundMoney2(rows[i].amount - red);
    over = roundMoney2(over - red);
  }
  paid = roundMoney2(rows.reduce((s, r) => s + r.amount, 0));
  if (paid > target + 0.005 && rows.length > 0) {
    const last = rows.length - 1;
    if (rows[last].method !== "CREDIT") {
      rows[last].amount = roundMoney2(
        Math.max(0, rows[last].amount - roundMoney2(paid - target)),
      );
    }
  }
  return rows.map((r) => ({ method: r.method, amount: r.amount.toFixed(2) }));
}

function resolvePdfOpenUrl(pdfUrl: string): string {
  if (pdfUrl.startsWith("http")) return pdfUrl;
  const apiBase =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:8000/api/v1"
      : "https://trapmultiuser.onrender.com/api/v1");
  const root = apiBase.replace(/\/api\/v1\/?$/, "");
  return `${root}${pdfUrl.startsWith("/") ? pdfUrl : `/${pdfUrl}`}`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CheckoutModal({
  isOpen,
  onClose,
  warehouseId,
  storeId,
  onViewInvoice,
}: CheckoutModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    items,
    itemCount,
    subtotal,
    total,
    discount,
    appliedDiscount,
    clearCart,
  } = useCart();

  const estimatedGstInclusive = React.useMemo(
    () => computeTotalGstInclusiveExtract(items, subtotal, discount),
    [items, subtotal, discount],
  );

  // State
  const [step, setStep] = React.useState<Step>("review");
  const [applyAutomaticGst, setApplyAutomaticGst] = React.useState(false);
  const [skipCustomer, setSkipCustomer] = React.useState(false);
  const [customerDetails, setCustomerDetails] = React.useState<CustomerDetails>(
    {
      name: "",
      mobile: "",
      email: "",
      address: "",
    },
  );
  const [payments, setPayments] = React.useState<PaymentEntry[]>([]);
  const [checkoutResult, setCheckoutResult] =
    React.useState<CheckoutResponse | null>(null);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
  /** Snapshot before clearCart — success UI must not read emptied cart */
  const [soldItemCount, setSoldItemCount] = React.useState(0);
  /** One key per open checkout attempt — reused on retry so double-submit is safe */
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = React.useState(
    () => uuidv4(),
  );

  const itemCountRef = React.useRef(itemCount);
  itemCountRef.current = itemCount;

  // Calculate totals
  const paidAmount = roundMoney2(
    payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0),
  );
  const remainingAmount = roundMoney2(total - paidAmount);
  const hasCredit = payments.some((p) => p.method === "CREDIT");
  const isFullyPaid = Math.abs(remainingAmount) < 0.01 || hasCredit;

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: async (data: CheckoutRequest) => {
      return api.post<CheckoutResponse>("/sales/checkout/", data);
    },
    onSuccess: (result) => {
      const fromApi = Number(result.totalItems ?? result.total_items ?? 0);
      setSoldItemCount(
        fromApi > 0 ? fromApi : itemCountRef.current,
      );
      setCheckoutResult(result);
      setCheckoutError(null);
      setStep("success");
      // Bill settled — drop draft cart so refresh cannot re-checkout the same lines
      clearCart();
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      // Soft signal for dashboard home (non-React-Query fetch)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("quake:sales-updated"));
      }
    },
    onError: (error: Error & { response?: { data?: { error?: unknown } } }) => {
      const raw = error.response?.data?.error;
      let message = error.message || "Checkout failed";
      if (typeof raw === "string" && raw.trim()) {
        message = raw.trim();
      } else if (raw && typeof raw === "object" && "message" in raw) {
        const m = (raw as { message?: unknown }).message;
        if (typeof m === "string" && m.trim()) {
          message = m.trim();
        } else {
          message = "Checkout failed";
        }
      }
      setCheckoutError(message);
      setStep("error");
    },
  });

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setStep("review");
      setSkipCustomer(false);
      setCustomerDetails({
        id: undefined,
        name: "",
        mobile: "",
        email: "",
        address: "",
      });
      setPayments([]);
      setCheckoutResult(null);
      setCheckoutError(null);
      setSoldItemCount(0);
      setApplyAutomaticGst(false);
      setCheckoutIdempotencyKey(uuidv4());
    }
  }, [isOpen]);

  // Handlers
  const handleCustomerChange = (
    field: keyof CustomerDetails,
    value: string,
  ) => {
    setCustomerDetails((prev) => ({
      ...prev,
      [field]: value,
      // Manual edits detach from a picked CRM row (server still upserts by phone)
      ...(field !== "id" ? { id: undefined } : {}),
    }));
  };

  const handleAddPayment = (method: PaymentMethod) => {
    // For single payment, set full amount
    const amount =
      payments.length === 0
        ? roundMoney2(total).toFixed(2)
        : Math.max(0, roundMoney2(remainingAmount)).toFixed(2);
    if (parseFloat(amount) > 0 || method === "CREDIT") {
      setPayments((prev) => [...prev, { id: uuidv4(), method, amount }]);
    }
  };

  const handleRemovePayment = (id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  };

  const handlePaymentAmountChange = (id: string, amount: string) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, amount } : p)),
    );
  };

  const handleQuickAmount = (id: string, quickAmount: number) => {
    const payment = payments.find((p) => p.id === id);
    if (payment) {
      const currentAmount = parseFloat(payment.amount) || 0;
      const newAmount = currentAmount + quickAmount;
      handlePaymentAmountChange(id, newAmount.toFixed(2));
    }
  };

  const handleSetFullAmount = (id: string) => {
    handlePaymentAmountChange(id, roundMoney2(total).toFixed(2));
  };

  const handleProceedFromReview = () => {
    if (skipCustomer) {
      setStep("payment");
    } else {
      setStep("customer");
    }
  };

  const handleProceedFromCustomer = () => {
    setStep("payment");
  };

  const handleProceedToCheckout = () => {
    if (checkoutMutation.isPending || step === "processing") return;

    if (!warehouseId && !storeId) {
      setCheckoutError("Please select a warehouse or store before checkout");
      setStep("error");
      return;
    }

    if (!isFullyPaid) {
      setCheckoutError("Payment amount does not match total");
      return;
    }

    setStep("processing");

    const request: CheckoutRequest = {
      idempotency_key: checkoutIdempotencyKey,
      warehouse_id: warehouseId,
      store_id: storeId,
      items: items.map((item) => {
        const barcode = (item.product.barcode || "").trim();
        return {
          ...(barcode ? { barcode } : {}),
          product_id: item.product.id,
          quantity: item.quantity,
        };
      }),
      payments: normalizeCheckoutPayments(payments, total),
      customer_name: customerDetails.name,
      customer_mobile: customerDetails.mobile,
      customer_email: customerDetails.email,
      customer_address: customerDetails.address,
      ...(customerDetails.id ? { customer_id: customerDetails.id } : {}),
    };

    if (appliedDiscount && discount > 0) {
      request.discount_type = appliedDiscount.type;
      request.discount_value = appliedDiscount.value.toString();
    }

    request.apply_automatic_gst = applyAutomaticGst;

    checkoutMutation.mutate(request);
  };

  const handleNewSale = () => {
    // Cart already cleared on successful settle; keep call for safety
    clearCart();
    onClose();
  };

  /** Failed checkout: keep draft cart (don't lose the bill). */
  const handleCloseAfterError = () => {
    setCheckoutError(null);
    onClose();
  };

  const handleViewInvoice = () => {
    const saleId = (
      checkoutResult?.sale_id ??
      (checkoutResult as { saleId?: string } | null)?.saleId ??
      ""
    )
      .toString()
      .trim();
    const rawInv = checkoutResult
      ? (checkoutResult as unknown as Record<string, unknown>).invoiceId ??
        (checkoutResult as unknown as Record<string, unknown>).invoice_id
      : undefined;
    const invoiceId =
      rawInv !== undefined && rawInv !== null
        ? String(rawInv).trim()
        : undefined;

    if (onViewInvoice) {
      void onViewInvoice({
        saleId: saleId || undefined,
        invoiceId: invoiceId || undefined,
      });
      clearCart();
      onClose();
      return;
    }

    if (saleId) {
      router.push(`${adminHref("/invoices")}?sale_id=${saleId}`);
    } else {
      router.push(adminHref("/invoices"));
    }
    clearCart();
    onClose();
  };

  const handleRetry = () => {
    setStep("payment");
    setCheckoutError(null);
  };

  const handleBack = () => {
    if (step === "payment") {
      if (skipCustomer) {
        setStep("review");
      } else {
        setStep("customer");
      }
    } else if (step === "customer") {
      setStep("review");
    }
  };

  // Step indicator
  const stepNumber =
    step === "review"
      ? 1
      : step === "customer"
        ? 2
        : step === "payment"
          ? skipCustomer
            ? 2
            : 3
          : 0;
  const totalSteps = skipCustomer ? 2 : 3;

  // Render
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 modal-scrim"
            onClick={
              step === "success"
                ? handleNewSale
                : step === "error"
                  ? handleCloseAfterError
                  : undefined
            }
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-2xl mx-4"
          >
            <div className="bg-gradient-to-b from-[#1c1d22] to-[#111318] rounded-3xl border border-white/[0.08] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
              {/* Animated Header */}
              {(step === "review" ||
                step === "customer" ||
                step === "payment") && (
                <div className="relative overflow-hidden">
                  {/* Background gradient */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#c4a574]/20 via-[#d4b88a]/10 to-[#c4a574]/20" />

                  <div className="relative px-6 py-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {step !== "review" && (
                          <button
                            onClick={handleBack}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                          >
                            <ChevronLeft className="w-5 h-5 text-[#f3eee4]" />
                          </button>
                        )}
                        <div>
                          <h2 className="text-xl font-bold text-[#f3eee4] flex items-center gap-2">
                            <ShoppingBag className="w-5 h-5 text-[#c4a574]" />
                            Checkout
                          </h2>
                          <div className="flex items-center gap-2 mt-1">
                            {[...Array(totalSteps)].map((_, i) => (
                              <div
                                key={i}
                                className={`h-1 rounded-full transition-all duration-300 ${
                                  i + 1 <= stepNumber
                                    ? "w-8 bg-[#c4a574]"
                                    : "w-4 bg-white/20"
                                }`}
                              />
                            ))}
                            <span className="text-xs text-[#8a867c] ml-2">
                              Step {stepNumber} of {totalSteps}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-[#8a867c] uppercase tracking-wide">
                            Total
                          </p>
                          <p className="text-2xl font-bold bg-gradient-to-r from-[#c4a574] to-[#e0cba0] bg-clip-text text-transparent">
                            {formatCurrency(total)}
                          </p>
                        </div>
                        <button
                          onClick={onClose}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          <X className="w-5 h-5 text-[#8a867c]" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Content */}
              <AnimatePresence mode="wait">
                {step === "review" && (
                  <motion.div
                    key="review"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <ReviewStep
                      items={items}
                      itemCount={itemCount}
                      subtotal={subtotal}
                      discount={discount}
                      total={total}
                      skipCustomer={skipCustomer}
                      onToggleSkipCustomer={() =>
                        setSkipCustomer(!skipCustomer)
                      }
                      onProceed={handleProceedFromReview}
                    />
                  </motion.div>
                )}

                {step === "customer" && (
                  <motion.div
                    key="customer"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <CustomerStep
                      details={customerDetails}
                      onChange={handleCustomerChange}
                      onSelectCustomer={(c) =>
                        setCustomerDetails({
                          id: c.id,
                          name: c.name,
                          mobile: c.phone,
                          email: c.email || "",
                          address: c.address || "",
                        })
                      }
                      onUnlinkCustomer={() =>
                        setCustomerDetails((prev) => ({
                          ...prev,
                          id: undefined,
                        }))
                      }
                      onProceed={handleProceedFromCustomer}
                      onSkip={() => {
                        setSkipCustomer(true);
                        setStep("payment");
                      }}
                    />
                  </motion.div>
                )}

                {step === "payment" && (
                  <motion.div
                    key="payment"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <PaymentStep
                      total={total}
                      payments={payments}
                      paidAmount={paidAmount}
                      remainingAmount={remainingAmount}
                      onAddPayment={handleAddPayment}
                      onRemovePayment={handleRemovePayment}
                      onAmountChange={handlePaymentAmountChange}
                      onQuickAmount={handleQuickAmount}
                      onSetFullAmount={handleSetFullAmount}
                      onProceed={handleProceedToCheckout}
                      isSubmitting={checkoutMutation.isPending}
                      hasCredit={hasCredit}
                      isFullyPaid={isFullyPaid}
                      applyAutomaticGst={applyAutomaticGst}
                      onApplyAutomaticGstChange={setApplyAutomaticGst}
                      estimatedGstInclusive={estimatedGstInclusive}
                    />
                  </motion.div>
                )}

                {step === "processing" && (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                  >
                    <ProcessingView />
                  </motion.div>
                )}

                {step === "error" && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                  >
                    <ErrorView
                      error={checkoutError || "Unknown error"}
                      onRetry={handleRetry}
                      onClose={handleCloseAfterError}
                    />
                  </motion.div>
                )}

                {step === "success" && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                  >
                    <SuccessView
                      result={checkoutResult}
                      itemCount={soldItemCount}
                      onNewSale={handleNewSale}
                      onViewInvoice={handleViewInvoice}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// STEP COMPONENTS
// =============================================================================

function ReviewStep({
  items,
  itemCount,
  subtotal,
  discount,
  total,
  skipCustomer,
  onToggleSkipCustomer,
  onProceed,
}: {
  items: Array<{
    product: { name: string; sku: string; pricing?: { sellingPrice: number } };
    quantity: number;
  }>;
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  skipCustomer: boolean;
  onToggleSkipCustomer: () => void;
  onProceed: () => void;
}) {
  return (
    <div className="p-6">
      {/* Order Summary */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingBag className="w-5 h-5 text-[#c4a574]" />
          <h3 className="text-lg font-semibold text-[#f3eee4]">
            Order Summary
          </h3>
          <span className="ml-auto px-2 py-0.5 rounded-full bg-[#c4a574]/20 text-[#c4a574] text-xs font-medium">
            {itemCount} item{itemCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Items List */}
        <div className="max-h-48 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-white/10">
          {items.map((item, index) => {
            const itemTotal =
              (item.product.pricing?.sellingPrice || 0) * item.quantity;
            return (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#f3eee4] truncate">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-[#8a867c]">{item.product.sku}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[#c5c0b5]">
                    × {item.quantity}
                  </span>
                  <span className="text-sm font-medium text-[#f3eee4] w-20 text-right">
                    {formatCurrency(itemTotal)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Price Breakdown */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.05] mb-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[#c5c0b5]">Subtotal</span>
            <span className="text-[#f3eee4]">{formatCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#3f9d7a] flex items-center gap-1">
                <Percent className="w-3 h-3" />
                Discount
              </span>
              <span className="text-[#3f9d7a]">
                -{formatCurrency(discount)}
              </span>
            </div>
          )}
          <div className="h-px bg-white/[0.08] my-2" />
          <div className="flex justify-between">
            <span className="text-[#c5c0b5] font-medium">Total</span>
            <span className="text-xl font-bold text-[#c4a574]">
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Checkout Toggle */}
      <label className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05] cursor-pointer hover:bg-white/[0.05] transition-colors mb-6">
        <div className="relative">
          <input
            type="checkbox"
            checked={skipCustomer}
            onChange={onToggleSkipCustomer}
            className="sr-only"
          />
          <div
            className={`w-10 h-6 rounded-full transition-colors ${skipCustomer ? "bg-[#c4a574]" : "bg-white/10"}`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                skipCustomer ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </div>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[#f3eee4]">Quick Checkout</p>
          <p className="text-xs text-[#8a867c]">
            Skip customer details for faster checkout
          </p>
        </div>
        <Sparkles className="w-5 h-5 text-[#c4a574]" />
      </label>

      {/* Proceed Button */}
      <button
        onClick={onProceed}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-[#c4a574] to-[#d4b88a] text-[#0c0d10] font-bold text-lg hover:from-[#d4b88a] hover:to-[#e0cba0] transition-all shadow-lg shadow-[#c4a574]/20"
      >
        {skipCustomer ? "Proceed to Payment" : "Continue"}
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

function CustomerStep({
  details,
  onChange,
  onSelectCustomer,
  onUnlinkCustomer,
  onProceed,
  onSkip,
}: {
  details: CustomerDetails;
  onChange: (field: keyof CustomerDetails, value: string) => void;
  onSelectCustomer: (c: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
  }) => void;
  onUnlinkCustomer: () => void;
  onProceed: () => void;
  onSkip: () => void;
}) {
  const [mobileError, setMobileError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [hits, setHits] = React.useState<
    Array<{
      id: string;
      name: string;
      phone: string;
      email?: string;
      address?: string;
      gstin?: string;
    }>
  >([]);
  const [searching, setSearching] = React.useState(false);

  type MatchCandidate = {
    id: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    matchVia: "mobile" | "email";
  };
  const [matchPrompt, setMatchPrompt] = React.useState<MatchCandidate | null>(
    null,
  );
  const [lookupBusy, setLookupBusy] = React.useState(false);
  const [proceedChecking, setProceedChecking] = React.useState(false);
  const [changeHint, setChangeHint] = React.useState<string | null>(null);
  const lastLookupKeyRef = React.useRef("");
  /** After Continue, Use-profile should then go to payment */
  const pendingProceedRef = React.useRef(false);
  const [awaitingMatchForProceed, setAwaitingMatchForProceed] =
    React.useState(false);
  const mobileInputRef = React.useRef<HTMLInputElement>(null);
  const emailInputRef = React.useRef<HTMLInputElement>(null);

  const setPendingProceed = (value: boolean) => {
    pendingProceedRef.current = value;
    setAwaitingMatchForProceed(value);
  };

  const buildMatch = (
    customer: {
      id: string;
      name: string;
      phone: string;
      email?: string;
      address?: string;
    },
    phoneReady: boolean,
  ): MatchCandidate => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    matchVia: phoneReady && customer.phone ? "mobile" : "email",
  });

  React.useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await customersService.list({
          search: q,
          is_active: true,
          page: 1,
          page_size: 8,
        });
        if (!cancelled) {
          setHits(
            res.results.map((c) => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
              email: c.email,
              address: c.address,
              gstin: c.gstin,
            })),
          );
        }
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [search]);

  // Live lookup while typing / scanning mobile or email
  React.useEffect(() => {
    if (details.id) {
      setMatchPrompt(null);
      // Sentinel so Unlink / field-edit (clears id) re-runs lookup for same contact
      lastLookupKeyRef.current = `__linked:${details.id}`;
      return;
    }
    const phone = details.mobile.trim();
    const email = details.email.trim();
    const phoneReady = phone.replace(/\D/g, "").length >= 8;
    const emailReady = email.includes("@") && email.includes(".");
    if (!phoneReady && !emailReady) {
      setMatchPrompt(null);
      lastLookupKeyRef.current = "";
      return;
    }
    const key = `${phone}|${email.toLowerCase()}`;
    if (key === lastLookupKeyRef.current) return;

    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLookupBusy(true);
      try {
        const { matched, customer } = await customersService.lookup({
          phone: phoneReady ? phone : undefined,
          email: emailReady ? email : undefined,
        });
        if (cancelled) return;
        lastLookupKeyRef.current = key;
        if (matched && customer) {
          setMatchPrompt(buildMatch(customer, phoneReady));
          setChangeHint(null);
        } else {
          setMatchPrompt(null);
        }
      } catch {
        if (!cancelled) setMatchPrompt(null);
      } finally {
        if (!cancelled) setLookupBusy(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [details.mobile, details.email, details.id]);

  /** Use the existing CRM profile (e.g. Kushal) — only choice if keeping this contact */
  const useExistingProfile = () => {
    if (!matchPrompt) return;
    onSelectCustomer({
      id: matchPrompt.id,
      name: matchPrompt.name,
      phone: matchPrompt.phone || details.mobile,
      email: matchPrompt.email || details.email,
      address: matchPrompt.address || details.address,
    });
    setMatchPrompt(null);
    setChangeHint(null);
    setMobileError("");
    const goPay = pendingProceedRef.current;
    setPendingProceed(false);
    if (goPay) onProceed();
  };

  /**
   * Counter rule: same mobile/email = that person only.
   * Cashier must enter another contact — cannot invent a second person on same number.
   */
  const enterAnotherContact = () => {
    if (!matchPrompt) return;
    const via = matchPrompt.matchVia;
    const existingName = matchPrompt.name;
    setMatchPrompt(null);
    setPendingProceed(false);
    lastLookupKeyRef.current = "";
    if (via === "mobile") {
      onChange("mobile", "");
      setChangeHint(
        `This mobile belongs to ${existingName}. Enter another mobile, or put that number back and use ${existingName} only.`,
      );
      window.setTimeout(() => mobileInputRef.current?.focus(), 50);
    } else {
      onChange("email", "");
      setChangeHint(
        `This email belongs to ${existingName}. Enter another email, or use ${existingName} only.`,
      );
      window.setTimeout(() => emailInputRef.current?.focus(), 50);
    }
  };

  const handleUnlink = () => {
    onUnlinkCustomer();
    // Force lookup again for the same mobile/email still on the form
    lastLookupKeyRef.current = "";
    setChangeHint(null);
    setMatchPrompt(null);
    setPendingProceed(false);
  };

  const handleProceed = async () => {
    if (!details.mobile.trim()) {
      setMobileError("Mobile number is required");
      mobileInputRef.current?.focus();
      return;
    }
    setMobileError("");

    // Already linked — payment
    if (details.id) {
      onProceed();
      return;
    }

    // Modal open — must Use profile or enter another contact first
    if (matchPrompt) {
      setPendingProceed(true);
      return;
    }

    const phone = details.mobile.trim();
    const email = details.email.trim();
    const phoneReady = phone.replace(/\D/g, "").length >= 8;
    const emailReady = email.includes("@") && email.includes(".");

    if (!phoneReady && !emailReady) {
      onProceed();
      return;
    }

    // Final gate before payment (covers Continue before live lookup finishes)
    setProceedChecking(true);
    try {
      const { matched, customer } = await customersService.lookup({
        phone: phoneReady ? phone : undefined,
        email: emailReady ? email : undefined,
      });
      if (matched && customer) {
        setPendingProceed(true);
        setMatchPrompt(buildMatch(customer, phoneReady));
        setChangeHint(null);
        return;
      }
      onProceed();
    } catch {
      onProceed();
    } finally {
      setProceedChecking(false);
    }
  };

  return (
    <div className="p-6 relative">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-[#f3eee4] flex items-center gap-2">
            <User className="w-5 h-5 text-[#c4a574]" />
            Customer
          </h3>
          <p className="text-sm text-[#8a867c] mt-1">
            Same mobile or email = that customer only. We&apos;ll confirm if it
            already exists.
          </p>
        </div>
        {!matchPrompt ? (
          <button
            type="button"
            onClick={onSkip}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-[#c4a574] hover:bg-[#c4a574]/10 transition-colors"
          >
            Skip
          </button>
        ) : null}
      </div>

      {details.id ? (
        <div className="mb-4 px-3 py-2 rounded-xl border border-[#c4a574]/30 bg-[#c4a574]/10 text-xs text-[#d4b88a] flex items-center justify-between gap-2">
          <span>
            Linked to CRM profile
            {details.name ? ` · ${details.name}` : ""}
          </span>
          <button
            type="button"
            className="underline opacity-80 hover:opacity-100"
            onClick={handleUnlink}
          >
            Unlink
          </button>
        </div>
      ) : null}

      {changeHint && !matchPrompt ? (
        <div className="mb-4 px-3 py-2.5 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-muted)] text-xs text-[var(--warning)]">
          {changeHint}
        </div>
      ) : null}

      <div className="mb-4">
        <label className="text-sm font-medium text-[#c5c0b5] mb-2 block">
          Find in Customers
        </label>
        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone, or GSTIN"
            className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent"
          />
          {searching ? (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[#8a867c]" />
          ) : null}
        </div>
        {hits.length > 0 ? (
          <ul className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#1c1d22] divide-y divide-white/[0.06]">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectCustomer(h);
                    setSearch("");
                    setHits([]);
                    setMatchPrompt(null);
                    setMobileError("");
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
                >
                  <p className="text-sm font-medium text-[#f3eee4]">{h.name}</p>
                  <p className="text-xs text-[#8a867c]">
                    {h.phone || "No phone"}
                    {h.gstin ? ` · ${h.gstin}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="flex items-center gap-2 text-sm font-medium text-[#c5c0b5] mb-2">
            <User className="w-4 h-4" />
            Name
          </label>
          <input
            type="text"
            value={details.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="Customer name"
            className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent transition-all"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="flex items-center gap-2 text-sm font-medium text-[#c5c0b5] mb-2">
            <Phone className="w-4 h-4" />
            Mobile <span className="text-red-400">*</span>
            {lookupBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8a867c]" />
            ) : null}
          </label>
          <input
            ref={mobileInputRef}
            type="tel"
            value={details.mobile}
            onChange={(e) => {
              onChange("mobile", e.target.value);
              lastLookupKeyRef.current = "";
              setChangeHint(null);
              if (e.target.value.trim()) setMobileError("");
            }}
            placeholder="10-digit number"
            className={`w-full px-4 py-3 rounded-xl bg-white/[0.05] border text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
              mobileError
                ? "border-red-400/60 focus:ring-red-400/50"
                : "border-white/[0.08] focus:ring-[#c4a574]"
            }`}
          />
          {mobileError && (
            <p className="text-xs text-red-400 mt-1">{mobileError}</p>
          )}
        </div>

        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-[#c5c0b5] mb-2">
            <Mail className="w-4 h-4" />
            Email
            <span className="text-xs text-[#8a867c] font-normal">(optional)</span>
          </label>
          <input
            ref={emailInputRef}
            type="email"
            value={details.email}
            onChange={(e) => {
              onChange("email", e.target.value);
              lastLookupKeyRef.current = "";
              setChangeHint(null);
            }}
            placeholder="customer@email.com"
            className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent transition-all"
          />
        </div>

        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-[#c5c0b5] mb-2">
            <MapPin className="w-4 h-4" />
            Address
            <span className="text-xs text-[#8a867c] font-normal">(optional)</span>
          </label>
          <textarea
            value={details.address}
            onChange={(e) => onChange("address", e.target.value)}
            placeholder="Delivery/billing address"
            rows={2}
            className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent transition-all resize-none"
          />
        </div>
      </div>

      <button
        onClick={() => void handleProceed()}
        disabled={proceedChecking}
        className="w-full mt-6 flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-[#c4a574] to-[#d4b88a] text-[#0c0d10] font-bold text-lg hover:from-[#d4b88a] hover:to-[#e0cba0] transition-all shadow-lg shadow-[#c4a574]/20 disabled:opacity-60"
      >
        {proceedChecking ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Checking customer…
          </>
        ) : (
          <>
            Continue to Payment
            <ChevronRight className="w-5 h-5" />
          </>
        )}
      </button>

      {/* Existing contact — Use that person, or enter another mobile/email */}
      <AnimatePresence>
        {matchPrompt ? (
          <motion.div
            key="match-confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center p-4 rounded-2xl"
          >
            <div
              className="absolute inset-0 modal-scrim rounded-2xl"
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              className="relative z-10 w-full max-w-sm modal-panel rounded-2xl p-5 shadow-2xl border border-[var(--border-default)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="match-customer-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-[var(--brand-muted)]">
                  <User className="w-5 h-5 text-[var(--brand)]" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    {matchPrompt.matchVia === "mobile"
                      ? "Mobile already on file"
                      : "Email already on file"}
                  </p>
                  <h4
                    id="match-customer-title"
                    className="text-base font-semibold text-[var(--text-primary)] leading-snug"
                  >
                    This{" "}
                    {matchPrompt.matchVia === "mobile" ? "mobile" : "email"}{" "}
                    exists with{" "}
                    <span className="text-[var(--brand)]">
                      {matchPrompt.name}
                    </span>
                  </h4>
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
                Use that customer only, or enter another{" "}
                {matchPrompt.matchVia === "mobile" ? "mobile" : "email"}. Same
                number can&apos;t be two people.
              </p>

              <div className="rounded-xl bg-[var(--bg-page)] border border-[var(--border-default)] px-3 py-2.5 text-sm text-[var(--text-secondary)] space-y-1 mb-4">
                {matchPrompt.phone ? (
                  <p className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[var(--brand)]" />
                    {matchPrompt.phone}
                  </p>
                ) : null}
                {matchPrompt.email ? (
                  <p className="flex items-center gap-2 truncate">
                    <Mail className="w-3.5 h-3.5 text-[var(--brand)]" />
                    {matchPrompt.email}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={useExistingProfile}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)]"
                >
                  Use {matchPrompt.name}
                </button>
                <button
                  type="button"
                  onClick={enterAnotherContact}
                  className="w-full py-3 rounded-xl text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                >
                  Enter another{" "}
                  {matchPrompt.matchVia === "mobile" ? "mobile" : "email"}
                </button>
              </div>
              {awaitingMatchForProceed ? (
                <p className="text-[11px] text-center text-[var(--brand)] mt-3">
                  Choose one to continue to payment
                </p>
              ) : (
                <p className="text-[11px] text-center text-[var(--text-muted)] mt-3">
                  Tap outside won&apos;t close this
                </p>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PaymentStep({
  total,
  payments,
  paidAmount,
  remainingAmount,
  onAddPayment,
  onRemovePayment,
  onAmountChange,
  onQuickAmount,
  onSetFullAmount,
  onProceed,
  isSubmitting = false,
  hasCredit,
  isFullyPaid,
  applyAutomaticGst,
  onApplyAutomaticGstChange,
  estimatedGstInclusive,
}: {
  total: number;
  payments: PaymentEntry[];
  paidAmount: number;
  remainingAmount: number;
  onAddPayment: (method: PaymentMethod) => void;
  onRemovePayment: (id: string) => void;
  onAmountChange: (id: string, amount: string) => void;
  onQuickAmount: (id: string, amount: number) => void;
  onSetFullAmount: (id: string) => void;
  onProceed: () => void;
  isSubmitting?: boolean;
  hasCredit: boolean;
  isFullyPaid: boolean;
  applyAutomaticGst: boolean;
  onApplyAutomaticGstChange: (value: boolean) => void;
  estimatedGstInclusive: number;
}) {
  return (
    <div className="p-6">
      <div className="mb-6 p-4 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={applyAutomaticGst}
            onChange={(e) => onApplyAutomaticGstChange(e.target.checked)}
            className="mt-1 rounded border-white/20 bg-white/10 text-[#c4a574] focus:ring-[#c4a574]"
          />
          <div>
            <span className="text-sm font-medium text-[#f3eee4]">
              Calculate GST on invoice (CGST / SGST)
            </span>
            <p className="text-xs text-[#8a867c] mt-1 leading-relaxed">
              {applyAutomaticGst ? (
                <>
                  GST is extracted from selling prices (GST-inclusive model).
                  Estimated total GST on this sale:{" "}
                  <span className="text-[#c4a574] font-medium">
                    {formatCurrency(estimatedGstInclusive)}
                  </span>
                  . Amount due is unchanged.
                </>
              ) : (
                <>
                  Off by default: invoice lines show 0% GST and no CGST/SGST
                  split; amount due stays the same as the cart total.
                </>
              )}
            </p>
          </div>
        </label>
      </div>

      {/* Payment Methods - Pill Style */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-[#c5c0b5] mb-3 flex items-center gap-2">
          <Calculator className="w-4 h-4" />
          Add Payment Method
        </h3>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map(({ key, label, icon: Icon, color, bgColor }) => (
            <button
              key={key}
              onClick={() => onAddPayment(key)}
              disabled={
                remainingAmount <= 0 && !payments.some((p) => p.method === key)
              }
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 hover:border-white/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: bgColor }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
              <span className="text-sm font-medium" style={{ color }}>
                {label}
              </span>
              <Plus className="w-3.5 h-3.5" style={{ color }} />
            </button>
          ))}
        </div>
      </div>

      {/* Added Payments - Card Style */}
      {payments.length > 0 && (
        <div className="space-y-3 mb-6">
          {payments.map((payment) => {
            const methodInfo = PAYMENT_METHODS.find(
              (m) => m.key === payment.method,
            );
            const Icon = methodInfo?.icon || Banknote;
            return (
              <div
                key={payment.id}
                className="p-4 rounded-2xl border border-white/[0.08]"
                style={{ backgroundColor: methodInfo?.bgColor }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon
                      className="w-5 h-5"
                      style={{ color: methodInfo?.color }}
                    />
                    <span
                      className="font-medium"
                      style={{ color: methodInfo?.color }}
                    >
                      {methodInfo?.label}
                    </span>
                  </div>
                  <button
                    onClick={() => onRemovePayment(payment.id)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-[#c45c5c]" />
                  </button>
                </div>

                {/* Amount Input */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a867c] text-lg">
                      ₹
                    </span>
                    <input
                      type="number"
                      value={payment.amount}
                      onChange={(e) =>
                        onAmountChange(payment.id, e.target.value)
                      }
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/10 text-[#f3eee4] text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={() => onSetFullAmount(payment.id)}
                    className="px-3 py-3 rounded-xl bg-white/10 text-[#f3eee4] text-sm font-medium hover:bg-white/20 transition-colors"
                  >
                    Full
                  </button>
                </div>

                {/* Quick Amount Buttons */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {QUICK_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => onQuickAmount(payment.id, amount)}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-[#c5c0b5] text-xs font-medium hover:bg-white/20 hover:text-[#f3eee4] transition-colors"
                    >
                      +₹{amount}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment Summary - Visual Progress */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.05] mb-6">
        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-[#c5c0b5]">Payment Progress</span>
            <span className="text-[#f3eee4] font-medium">
              {Math.min(100, Math.round((paidAmount / total) * 100))}%
            </span>
          </div>
          <div className="h-3 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, (paidAmount / total) * 100)}%`,
              }}
              transition={{ type: "spring", damping: 20 }}
              className="h-full rounded-full bg-gradient-to-r from-[#3f9d7a] to-[#3f9d7a]"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-[#8a867c] mb-1">Total</p>
            <p className="text-lg font-bold text-[#f3eee4]">
              {formatCurrency(total)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#8a867c] mb-1">Paid</p>
            <p className="text-lg font-bold text-[#3f9d7a]">
              {formatCurrency(paidAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#8a867c] mb-1">Remaining</p>
            <p
              className={`text-lg font-bold ${remainingAmount > 0 ? "text-[#c45c5c]" : "text-[#3f9d7a]"}`}
            >
              {formatCurrency(Math.max(0, remainingAmount))}
            </p>
          </div>
        </div>

        {hasCredit && remainingAmount > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-[#d4a054]/10 border border-[#d4a054]/20">
            <p className="text-sm text-[#d4a054] flex items-center gap-2">
              <Clock className="w-4 h-4" />₹{remainingAmount.toFixed(2)} will be
              recorded as credit (pay later)
            </p>
          </div>
        )}
      </div>

      {/* Complete Sale Button */}
      <button
        type="button"
        onClick={onProceed}
        disabled={!isFullyPaid || payments.length === 0 || isSubmitting}
        className="w-full flex items-center justify-center gap-3 py-4 rounded-xl bg-gradient-to-r from-[#3f9d7a] to-[#3f9d7a] text-white font-bold text-lg hover:from-[#3f9d7a] hover:to-[#3f9d7a] transition-all shadow-lg shadow-[#3f9d7a]/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-600 disabled:to-gray-700"
      >
        {isSubmitting ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <CheckCircle className="w-6 h-6" />
        )}
        {isSubmitting ? "Processing…" : "Complete Sale"}
      </button>
    </div>
  );
}

function ProcessingView() {
  return (
    <div className="p-12 text-center">
      <div className="relative w-24 h-24 mx-auto mb-8">
        <div className="absolute inset-0 rounded-full bg-[#c4a574]/20 animate-ping" />
        <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-[#c4a574] to-[#d4b88a]">
          <Loader2 className="w-10 h-10 text-[#0c0d10] animate-spin" />
        </div>
      </div>
      <h3 className="text-2xl font-bold text-[#f3eee4] mb-2">
        Processing Payment
      </h3>
      <p className="text-[#c5c0b5]">
        Please wait while we complete your transaction...
      </p>
    </div>
  );
}

function ErrorView({
  error,
  onRetry,
  onClose,
}: {
  error: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="p-8">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="w-24 h-24 mx-auto mb-6 rounded-full bg-[#c45c5c]/20 flex items-center justify-center"
      >
        <AlertCircle className="w-12 h-12 text-[#c45c5c]" />
      </motion.div>

      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-[#f3eee4] mb-3">
          Checkout Failed
        </h3>
        <p className="text-[#c45c5c] px-4 py-2 rounded-xl bg-[#c45c5c]/10">
          {error}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onClose}
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] font-medium hover:bg-white/[0.08] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-[#c4a574] text-[#0c0d10] font-semibold hover:bg-[#d4b88a] transition-colors"
        >
          <RotateCcw className="w-5 h-5" />
          Retry
        </button>
      </div>
    </div>
  );
}

function SuccessView({
  result,
  itemCount,
  onNewSale,
  onViewInvoice,
}: {
  result: CheckoutResponse | null;
  itemCount: number;
  onNewSale: () => void;
  onViewInvoice: () => void;
}) {
  const [isPrinting, setIsPrinting] = React.useState(false);

  const handlePrintInvoice = async () => {
    if (!result) return;
    const pdfUrl = result.pdfUrl ?? result.pdf_url;
    const invoiceId = result.invoiceId ?? result.invoice_id;
    if (pdfUrl) {
      window.open(resolvePdfOpenUrl(pdfUrl), "_blank", "noopener,noreferrer");
      return;
    }
    if (!invoiceId) return;
    setIsPrinting(true);
    try {
      const response = await apiClient.get(
        `/invoices/${invoiceId}/pdf/`,
        {
          responseType: "blob",
          headers: { Accept: "application/pdf,*/*" },
        },
      );
      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch {
      // PDF may still be generating; user can open from Invoices.
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="p-8">
      {/* Success Animation */}
      <div className="relative w-28 h-28 mx-auto mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.2, 1] }}
          transition={{ duration: 0.5, times: [0, 0.6, 1] }}
          className="absolute inset-0 rounded-full bg-gradient-to-br from-[#3f9d7a] to-[#3f9d7a]"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <CheckCircle className="w-14 h-14 text-white" />
        </motion.div>
        {/* Celebration particles */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, x: 0, y: 0 }}
            animate={{
              scale: [0, 1, 0],
              x: Math.cos((i * 45 * Math.PI) / 180) * 60,
              y: Math.sin((i * 45 * Math.PI) / 180) * 60,
            }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-[#c4a574]"
          />
        ))}
      </div>

      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-[#f3eee4] mb-2">
          Payment Successful!
        </h3>
        <p className="text-[#c5c0b5]">Your transaction has been completed</p>
        {result?.invoice_number && (
          <p className="text-[#c4a574] font-medium mt-2">
            Invoice: {result.invoice_number}
          </p>
        )}
      </div>

      {/* Summary Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.08] mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-sm text-[#8a867c]">Items Sold</p>
            <p className="text-xl font-bold text-[#f3eee4]">
              {Number(
                result?.totalItems ?? result?.total_items ?? itemCount,
              ) || itemCount}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-[#8a867c]">Total Amount</p>
            <p className="text-2xl font-bold bg-gradient-to-r from-[#c4a574] to-[#e0cba0] bg-clip-text text-transparent">
              {formatCurrency(parseFloat(result?.total || "0"))}
            </p>
          </div>
        </div>

        {(result?.isCreditSale ?? result?.is_credit_sale) &&
          (result?.creditBalance ?? result?.credit_balance) && (
          <div className="pt-4 border-t border-white/[0.08]">
            <div className="flex justify-between items-center">
              <span className="text-[#d4a054] flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Credit Balance Due
              </span>
              <span className="text-[#d4a054] font-bold">
                ₹
                {parseFloat(
                  String(result.creditBalance ?? result.credit_balance),
                ).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => void handlePrintInvoice()}
          disabled={
            isPrinting ||
            !(
              result?.pdfUrl ||
              result?.pdf_url ||
              result?.invoiceId ||
              result?.invoice_id
            )
          }
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] font-medium hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Printer className="w-5 h-5" />
          {isPrinting ? "Opening…" : "Print"}
        </button>
        <button
          type="button"
          onClick={onViewInvoice}
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] font-medium hover:bg-white/[0.08] transition-colors"
        >
          <FileText className="w-5 h-5" />
          View Invoice
        </button>
        <button
          type="button"
          onClick={onNewSale}
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-[#c4a574] to-[#d4b88a] text-[#0c0d10] font-semibold hover:from-[#d4b88a] hover:to-[#e0cba0] transition-all shadow-lg shadow-[#c4a574]/20"
        >
          <RotateCcw className="w-5 h-5" />
          New Sale
        </button>
      </div>
    </div>
  );
}
