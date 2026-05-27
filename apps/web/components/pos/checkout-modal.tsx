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
  name: string;
  mobile: string;
  email: string;
  address: string;
}

interface CheckoutRequest {
  idempotency_key: string;
  warehouse_id?: string;
  store_id?: string;
  items: { barcode: string; quantity: number }[];
  payments: { method: string; amount: string }[];
  discount_type?: string | null;
  discount_value?: string;
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
  total_items: number;
  status: string;
  message: string;
  is_credit_sale?: boolean;
  credit_balance?: string;
  invoice_id?: string;
  pdf_url?: string;
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
    color: "#2ECC71",
    bgColor: "rgba(46, 204, 113, 0.15)",
  },
  {
    key: "CARD",
    label: "Card",
    icon: CreditCard,
    color: "#3498DB",
    bgColor: "rgba(52, 152, 219, 0.15)",
  },
  {
    key: "UPI",
    label: "UPI",
    icon: Smartphone,
    color: "#9B59B6",
    bgColor: "rgba(155, 89, 182, 0.15)",
  },
  {
    key: "CREDIT",
    label: "Credit",
    icon: Clock,
    color: "#E67E22",
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
    "http://localhost:8000/api/v1";
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
      setCheckoutResult(result);
      setCheckoutError(null);
      setStep("success");
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
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
      setCustomerDetails({ name: "", mobile: "", email: "", address: "" });
      setPayments([]);
      setCheckoutResult(null);
      setCheckoutError(null);
      setApplyAutomaticGst(false);
    }
  }, [isOpen]);

  // Handlers
  const handleCustomerChange = (
    field: keyof CustomerDetails,
    value: string,
  ) => {
    setCustomerDetails((prev) => ({ ...prev, [field]: value }));
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
      idempotency_key: uuidv4(),
      warehouse_id: warehouseId,
      store_id: storeId,
      items: items.map((item) => ({
        barcode: item.product.barcode,
        quantity: item.quantity,
      })),
      payments: normalizeCheckoutPayments(payments, total),
      customer_name: customerDetails.name,
      customer_mobile: customerDetails.mobile,
      customer_email: customerDetails.email,
      customer_address: customerDetails.address,
    };

    if (appliedDiscount && discount > 0) {
      request.discount_type = appliedDiscount.type;
      request.discount_value = appliedDiscount.value.toString();
    }

    request.apply_automatic_gst = applyAutomaticGst;

    checkoutMutation.mutate(request);
  };

  const handleNewSale = () => {
    clearCart();
    onClose();
  };

  const handleViewInvoice = () => {
    const saleId = checkoutResult?.sale_id?.trim();
    const rawInv = checkoutResult
      ? (checkoutResult as unknown as Record<string, unknown>).invoice_id ??
        (checkoutResult as unknown as Record<string, unknown>).invoiceId
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

    if (checkoutResult?.sale_id) {
      router.push(`${adminHref("/invoices")}?sale_id=${checkoutResult.sale_id}`);
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
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={
              step === "success" || step === "error" ? handleNewSale : undefined
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
            <div className="bg-gradient-to-b from-[#1E1F28] to-[#15161D] rounded-3xl border border-white/[0.08] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
              {/* Animated Header */}
              {(step === "review" ||
                step === "customer" ||
                step === "payment") && (
                <div className="relative overflow-hidden">
                  {/* Background gradient */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#C6A15B]/20 via-[#D4B06A]/10 to-[#C6A15B]/20" />

                  <div className="relative px-6 py-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {step !== "review" && (
                          <button
                            onClick={handleBack}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                          >
                            <ChevronLeft className="w-5 h-5 text-[#F5F6FA]" />
                          </button>
                        )}
                        <div>
                          <h2 className="text-xl font-bold text-[#F5F6FA] flex items-center gap-2">
                            <ShoppingBag className="w-5 h-5 text-[#C6A15B]" />
                            Checkout
                          </h2>
                          <div className="flex items-center gap-2 mt-1">
                            {[...Array(totalSteps)].map((_, i) => (
                              <div
                                key={i}
                                className={`h-1 rounded-full transition-all duration-300 ${
                                  i + 1 <= stepNumber
                                    ? "w-8 bg-[#C6A15B]"
                                    : "w-4 bg-white/20"
                                }`}
                              />
                            ))}
                            <span className="text-xs text-[#6F7285] ml-2">
                              Step {stepNumber} of {totalSteps}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-[#6F7285] uppercase tracking-wide">
                            Total
                          </p>
                          <p className="text-2xl font-bold bg-gradient-to-r from-[#C6A15B] to-[#E0C080] bg-clip-text text-transparent">
                            {formatCurrency(total)}
                          </p>
                        </div>
                        <button
                          onClick={onClose}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          <X className="w-5 h-5 text-[#6F7285]" />
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
                      onClose={handleNewSale}
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
                      itemCount={itemCount}
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
          <ShoppingBag className="w-5 h-5 text-[#C6A15B]" />
          <h3 className="text-lg font-semibold text-[#F5F6FA]">
            Order Summary
          </h3>
          <span className="ml-auto px-2 py-0.5 rounded-full bg-[#C6A15B]/20 text-[#C6A15B] text-xs font-medium">
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
                  <p className="text-sm font-medium text-[#F5F6FA] truncate">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-[#6F7285]">{item.product.sku}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[#A1A4B3]">
                    × {item.quantity}
                  </span>
                  <span className="text-sm font-medium text-[#F5F6FA] w-20 text-right">
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
            <span className="text-[#A1A4B3]">Subtotal</span>
            <span className="text-[#F5F6FA]">{formatCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#2ECC71] flex items-center gap-1">
                <Percent className="w-3 h-3" />
                Discount
              </span>
              <span className="text-[#2ECC71]">
                -{formatCurrency(discount)}
              </span>
            </div>
          )}
          <div className="h-px bg-white/[0.08] my-2" />
          <div className="flex justify-between">
            <span className="text-[#A1A4B3] font-medium">Total</span>
            <span className="text-xl font-bold text-[#C6A15B]">
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
            className={`w-10 h-6 rounded-full transition-colors ${skipCustomer ? "bg-[#C6A15B]" : "bg-white/10"}`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                skipCustomer ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </div>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[#F5F6FA]">Quick Checkout</p>
          <p className="text-xs text-[#6F7285]">
            Skip customer details for faster checkout
          </p>
        </div>
        <Sparkles className="w-5 h-5 text-[#C6A15B]" />
      </label>

      {/* Proceed Button */}
      <button
        onClick={onProceed}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-[#C6A15B] to-[#D4B06A] text-[#0E0F13] font-bold text-lg hover:from-[#D4B06A] hover:to-[#E0C080] transition-all shadow-lg shadow-[#C6A15B]/20"
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
  onProceed,
  onSkip,
}: {
  details: CustomerDetails;
  onChange: (field: keyof CustomerDetails, value: string) => void;
  onProceed: () => void;
  onSkip: () => void;
}) {
  const [mobileError, setMobileError] = React.useState("");

  const handleProceed = () => {
    if (!details.mobile.trim()) {
      setMobileError("Mobile number is required");
      return;
    }
    setMobileError("");
    onProceed();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-[#F5F6FA] flex items-center gap-2">
            <User className="w-5 h-5 text-[#C6A15B]" />
            Customer Details
          </h3>
          <p className="text-sm text-[#6F7285] mt-1">
            Mobile number required for billing
          </p>
        </div>
        <button
          onClick={onSkip}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-[#C6A15B] hover:bg-[#C6A15B]/10 transition-colors"
        >
          Skip
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Name */}
        <div className="col-span-2 sm:col-span-1">
          <label className="flex items-center gap-2 text-sm font-medium text-[#A1A4B3] mb-2">
            <User className="w-4 h-4" />
            Name
          </label>
          <input
            type="text"
            value={details.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="Customer name"
            className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
          />
        </div>

        {/* Mobile - Required */}
        <div className="col-span-2 sm:col-span-1">
          <label className="flex items-center gap-2 text-sm font-medium text-[#A1A4B3] mb-2">
            <Phone className="w-4 h-4" />
            Mobile <span className="text-red-400">*</span>
          </label>
          <input
            type="tel"
            value={details.mobile}
            onChange={(e) => {
              onChange("mobile", e.target.value);
              if (e.target.value.trim()) setMobileError("");
            }}
            placeholder="10-digit number"
            className={`w-full px-4 py-3 rounded-xl bg-white/[0.05] border text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
              mobileError
                ? "border-red-400/60 focus:ring-red-400/50"
                : "border-white/[0.08] focus:ring-[#C6A15B]"
            }`}
          />
          {mobileError && (
            <p className="text-xs text-red-400 mt-1">{mobileError}</p>
          )}
        </div>

        {/* Email - Optional */}
        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-[#A1A4B3] mb-2">
            <Mail className="w-4 h-4" />
            Email
            <span className="text-xs text-[#6F7285] font-normal">(optional)</span>
          </label>
          <input
            type="email"
            value={details.email}
            onChange={(e) => onChange("email", e.target.value)}
            placeholder="customer@email.com"
            className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
          />
        </div>

        {/* Address */}
        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-[#A1A4B3] mb-2">
            <MapPin className="w-4 h-4" />
            Address
            <span className="text-xs text-[#6F7285] font-normal">(optional)</span>
          </label>
          <textarea
            value={details.address}
            onChange={(e) => onChange("address", e.target.value)}
            placeholder="Delivery/billing address"
            rows={2}
            className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all resize-none"
          />
        </div>
      </div>

      {/* Proceed Button */}
      <button
        onClick={handleProceed}
        className="w-full mt-6 flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-[#C6A15B] to-[#D4B06A] text-[#0E0F13] font-bold text-lg hover:from-[#D4B06A] hover:to-[#E0C080] transition-all shadow-lg shadow-[#C6A15B]/20"
      >
        Continue to Payment
        <ChevronRight className="w-5 h-5" />
      </button>
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
            className="mt-1 rounded border-white/20 bg-white/10 text-[#C6A15B] focus:ring-[#C6A15B]"
          />
          <div>
            <span className="text-sm font-medium text-[#F5F6FA]">
              Calculate GST on invoice (CGST / SGST)
            </span>
            <p className="text-xs text-[#6F7285] mt-1 leading-relaxed">
              {applyAutomaticGst ? (
                <>
                  GST is extracted from selling prices (GST-inclusive model).
                  Estimated total GST on this sale:{" "}
                  <span className="text-[#C6A15B] font-medium">
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
        <h3 className="text-sm font-medium text-[#A1A4B3] mb-3 flex items-center gap-2">
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
                    <Trash2 className="w-4 h-4 text-[#E74C3C]" />
                  </button>
                </div>

                {/* Amount Input */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6F7285] text-lg">
                      ₹
                    </span>
                    <input
                      type="number"
                      value={payment.amount}
                      onChange={(e) =>
                        onAmountChange(payment.id, e.target.value)
                      }
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/10 text-[#F5F6FA] text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={() => onSetFullAmount(payment.id)}
                    className="px-3 py-3 rounded-xl bg-white/10 text-[#F5F6FA] text-sm font-medium hover:bg-white/20 transition-colors"
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
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-[#A1A4B3] text-xs font-medium hover:bg-white/20 hover:text-[#F5F6FA] transition-colors"
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
            <span className="text-[#A1A4B3]">Payment Progress</span>
            <span className="text-[#F5F6FA] font-medium">
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
              className="h-full rounded-full bg-gradient-to-r from-[#2ECC71] to-[#27AE60]"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-[#6F7285] mb-1">Total</p>
            <p className="text-lg font-bold text-[#F5F6FA]">
              {formatCurrency(total)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#6F7285] mb-1">Paid</p>
            <p className="text-lg font-bold text-[#2ECC71]">
              {formatCurrency(paidAmount)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#6F7285] mb-1">Remaining</p>
            <p
              className={`text-lg font-bold ${remainingAmount > 0 ? "text-[#E74C3C]" : "text-[#2ECC71]"}`}
            >
              {formatCurrency(Math.max(0, remainingAmount))}
            </p>
          </div>
        </div>

        {hasCredit && remainingAmount > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-[#E67E22]/10 border border-[#E67E22]/20">
            <p className="text-sm text-[#E67E22] flex items-center gap-2">
              <Clock className="w-4 h-4" />₹{remainingAmount.toFixed(2)} will be
              recorded as credit (pay later)
            </p>
          </div>
        )}
      </div>

      {/* Complete Sale Button */}
      <button
        onClick={onProceed}
        disabled={!isFullyPaid || payments.length === 0}
        className="w-full flex items-center justify-center gap-3 py-4 rounded-xl bg-gradient-to-r from-[#2ECC71] to-[#27AE60] text-white font-bold text-lg hover:from-[#27AE60] hover:to-[#219A52] transition-all shadow-lg shadow-[#2ECC71]/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-600 disabled:to-gray-700"
      >
        <CheckCircle className="w-6 h-6" />
        Complete Sale
      </button>
    </div>
  );
}

function ProcessingView() {
  return (
    <div className="p-12 text-center">
      <div className="relative w-24 h-24 mx-auto mb-8">
        <div className="absolute inset-0 rounded-full bg-[#C6A15B]/20 animate-ping" />
        <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-[#C6A15B] to-[#D4B06A]">
          <Loader2 className="w-10 h-10 text-[#0E0F13] animate-spin" />
        </div>
      </div>
      <h3 className="text-2xl font-bold text-[#F5F6FA] mb-2">
        Processing Payment
      </h3>
      <p className="text-[#A1A4B3]">
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
        className="w-24 h-24 mx-auto mb-6 rounded-full bg-[#E74C3C]/20 flex items-center justify-center"
      >
        <AlertCircle className="w-12 h-12 text-[#E74C3C]" />
      </motion.div>

      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-[#F5F6FA] mb-3">
          Checkout Failed
        </h3>
        <p className="text-[#E74C3C] px-4 py-2 rounded-xl bg-[#E74C3C]/10">
          {error}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onClose}
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] font-medium hover:bg-white/[0.08] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-[#C6A15B] text-[#0E0F13] font-semibold hover:bg-[#D4B06A] transition-colors"
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
    if (result.pdf_url) {
      window.open(resolvePdfOpenUrl(result.pdf_url), "_blank", "noopener,noreferrer");
      return;
    }
    if (!result.invoice_id) return;
    setIsPrinting(true);
    try {
      const response = await apiClient.get(
        `/invoices/${result.invoice_id}/pdf/`,
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
          className="absolute inset-0 rounded-full bg-gradient-to-br from-[#2ECC71] to-[#27AE60]"
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
            className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-[#C6A15B]"
          />
        ))}
      </div>

      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-[#F5F6FA] mb-2">
          Payment Successful!
        </h3>
        <p className="text-[#A1A4B3]">Your transaction has been completed</p>
        {result?.invoice_number && (
          <p className="text-[#C6A15B] font-medium mt-2">
            Invoice: {result.invoice_number}
          </p>
        )}
      </div>

      {/* Summary Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.08] mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-sm text-[#6F7285]">Items Sold</p>
            <p className="text-xl font-bold text-[#F5F6FA]">
              {result?.total_items || itemCount}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-[#6F7285]">Total Amount</p>
            <p className="text-2xl font-bold bg-gradient-to-r from-[#C6A15B] to-[#E0C080] bg-clip-text text-transparent">
              {formatCurrency(parseFloat(result?.total || "0"))}
            </p>
          </div>
        </div>

        {result?.is_credit_sale && result?.credit_balance && (
          <div className="pt-4 border-t border-white/[0.08]">
            <div className="flex justify-between items-center">
              <span className="text-[#E67E22] flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Credit Balance Due
              </span>
              <span className="text-[#E67E22] font-bold">
                ₹{parseFloat(result.credit_balance).toFixed(2)}
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
          disabled={isPrinting || (!result?.pdf_url && !result?.invoice_id)}
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] font-medium hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Printer className="w-5 h-5" />
          {isPrinting ? "Opening…" : "Print"}
        </button>
        <button
          type="button"
          onClick={onViewInvoice}
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] font-medium hover:bg-white/[0.08] transition-colors"
        >
          <FileText className="w-5 h-5" />
          View Invoice
        </button>
        <button
          type="button"
          onClick={onNewSale}
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-[#C6A15B] to-[#D4B06A] text-[#0E0F13] font-semibold hover:from-[#D4B06A] hover:to-[#E0C080] transition-all shadow-lg shadow-[#C6A15B]/20"
        >
          <RotateCcw className="w-5 h-5" />
          New Sale
        </button>
      </div>
    </div>
  );
}
