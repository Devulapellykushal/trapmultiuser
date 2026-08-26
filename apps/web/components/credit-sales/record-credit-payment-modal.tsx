"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Loader2,
  CheckCircle,
  AlertCircle,
  IndianRupee,
  User,
  Phone,
  FileText,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  creditSalesService,
  CreditSale,
  RecordCreditPaymentRequest,
} from "@/services/credit-sales.service";
import { cn, formatCurrency } from "@/lib/utils";

interface RecordCreditPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  creditSale: CreditSale | null;
  onSuccess?: () => void;
}

const paymentMethods = [
  { value: "CASH", label: "Cash", icon: Banknote },
  { value: "UPI", label: "UPI", icon: Smartphone },
  { value: "CARD", label: "Card", icon: CreditCard },
] as const;

export function RecordCreditPaymentModal({
  isOpen,
  onClose,
  creditSale,
  onSuccess,
}: RecordCreditPaymentModalProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<"CASH" | "UPI" | "CARD">("CASH");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<{
    message: string;
    newBalance: string;
    isFullyPaid: boolean;
  } | null>(null);

  // Reset form when modal opens/closes
  React.useEffect(() => {
    if (isOpen && creditSale) {
      setAmount("");
      setMethod("CASH");
      setNotes("");
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, creditSale]);

  // Record payment mutation
  const recordMutation = useMutation({
    mutationFn: (data: RecordCreditPaymentRequest) =>
      creditSalesService.recordPayment(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["credit-sales"] });
      setSuccess({
        message: response.message,
        newBalance: response.newBalance,
        isFullyPaid: response.isFullyPaid,
      });
      onSuccess?.();
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to record payment");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!creditSale) return;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    const balance = parseFloat(creditSale.creditBalance);
    if (numAmount > balance) {
      setError(`Amount cannot exceed balance of ${formatCurrency(balance)}`);
      return;
    }

    recordMutation.mutate({
      sale_id: creditSale.id,
      amount: numAmount,
      method,
      notes: notes.trim() || undefined,
    });
  };

  const handlePayFullBalance = () => {
    if (creditSale) {
      setAmount(creditSale.creditBalance);
    }
  };

  const handleClose = () => {
    if (!recordMutation.isPending) {
      onClose();
    }
  };

  if (!creditSale) return null;

  const balance = parseFloat(creditSale.creditBalance);
  const enteredAmount = parseFloat(amount) || 0;
  const remainingAfterPayment = Math.max(0, balance - enteredAmount);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 modal-scrim z-50"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#111318] border border-[#1c1d22] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-[#1c1d22]">
                <div>
                  <h2 className="text-xl font-semibold text-[#f3eee4]">
                    Record Payment
                  </h2>
                  <p className="text-sm text-[#8a867c] mt-1">
                    Invoice: {creditSale.invoiceNumber}
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  disabled={recordMutation.isPending}
                  className="p-2 text-[#8a867c] hover:text-[#f3eee4] hover:bg-[#1c1d22] rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Success State */}
              {success ? (
                <div className="p-6 space-y-6">
                  <div className="text-center">
                    <div
                      className={cn(
                        "w-16 h-16 rounded-full mx-auto flex items-center justify-center",
                        success.isFullyPaid
                          ? "bg-emerald-500/20"
                          : "bg-blue-500/20",
                      )}
                    >
                      <CheckCircle
                        className={cn(
                          "w-8 h-8",
                          success.isFullyPaid
                            ? "text-emerald-400"
                            : "text-blue-400",
                        )}
                      />
                    </div>
                    <h3 className="text-lg font-semibold text-[#f3eee4] mt-4">
                      {success.isFullyPaid
                        ? "Payment Complete!"
                        : "Payment Recorded"}
                    </h3>
                    <p className="text-[#8a867c] mt-2">{success.message}</p>
                    {!success.isFullyPaid && (
                      <p className="text-sm text-[#8a867c] mt-1">
                        Remaining balance:{" "}
                        <span className="text-amber-400 font-medium">
                          {formatCurrency(parseFloat(success.newBalance))}
                        </span>
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleClose}
                    className="w-full py-3 bg-[#c4a574] hover:bg-[#8f7349] text-white font-medium rounded-xl transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {/* Customer Info */}
                  <div className="p-6 space-y-4 border-b border-[#1c1d22]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#1c1d22] rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-[#8a867c]" />
                      </div>
                      <div>
                        <p className="text-[#f3eee4] font-medium">
                          {creditSale.customerName || "Walk-in Customer"}
                        </p>
                        {creditSale.customerMobile && (
                          <p className="text-sm text-[#8a867c] flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {creditSale.customerMobile}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Balance Summary */}
                    <div className="bg-[#1c1d22] rounded-xl p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-[#8a867c]">Sale Total</span>
                        <span className="text-[#f3eee4]">
                          {formatCurrency(parseFloat(creditSale.total))}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#8a867c]">Credit Amount</span>
                        <span className="text-[#f3eee4]">
                          {formatCurrency(parseFloat(creditSale.creditAmount))}
                        </span>
                      </div>
                      <div className="h-px bg-[#1c1d22] my-2" />
                      <div className="flex justify-between">
                        <span className="text-[#8a867c] font-medium">
                          Outstanding Balance
                        </span>
                        <span className="text-amber-400 font-semibold text-lg">
                          {formatCurrency(balance)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Form */}
                  <div className="p-6 space-y-5">
                    {/* Error Message */}
                    {error && (
                      <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                      </div>
                    )}

                    {/* Amount Input */}
                    <div>
                      <label className="block text-sm font-medium text-[#f3eee4] mb-2">
                        Payment Amount
                      </label>
                      <div className="relative">
                        <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8a867c]" />
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={creditSale.creditBalance}
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-12 pr-4 py-3 bg-[#1c1d22] border border-[#1c1d22] rounded-xl text-[#f3eee4] text-lg font-medium placeholder:text-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors"
                          disabled={recordMutation.isPending}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handlePayFullBalance}
                          className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-medium bg-[#c4a574]/20 text-[#c4a574] rounded-lg hover:bg-[#c4a574]/30 transition-colors"
                        >
                          Pay Full
                        </button>
                      </div>
                      {enteredAmount > 0 && enteredAmount <= balance && (
                        <p className="text-xs text-[#8a867c] mt-2">
                          Balance after payment:{" "}
                          <span className="text-emerald-400">
                            {formatCurrency(remainingAfterPayment)}
                          </span>
                        </p>
                      )}
                    </div>

                    {/* Payment Method */}
                    <div>
                      <label className="block text-sm font-medium text-[#f3eee4] mb-2">
                        Payment Method
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {paymentMethods.map(({ value, label, icon: Icon }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setMethod(value)}
                            disabled={recordMutation.isPending}
                            className={cn(
                              "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all",
                              method === value
                                ? "bg-[#c4a574]/20 border-[#c4a574] text-[#c4a574]"
                                : "bg-[#1c1d22] border-[#1c1d22] text-[#8a867c] hover:border-[#8a867c]",
                            )}
                          >
                            <Icon className="w-5 h-5" />
                            <span className="text-sm font-medium">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes (Optional) */}
                    <div>
                      <label className="block text-sm font-medium text-[#f3eee4] mb-2">
                        Notes{" "}
                        <span className="text-[#8a867c] font-normal">
                          (Optional)
                        </span>
                      </label>
                      <div className="relative">
                        <FileText className="absolute left-4 top-3 w-4 h-4 text-[#8a867c]" />
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Add a note about this payment..."
                          rows={2}
                          className="w-full pl-11 pr-4 py-3 bg-[#1c1d22] border border-[#1c1d22] rounded-xl text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors resize-none"
                          disabled={recordMutation.isPending}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex gap-3 p-6 border-t border-[#1c1d22]">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={recordMutation.isPending}
                      className="flex-1 py-3 bg-[#1c1d22] hover:bg-[#1c1d22] text-[#f3eee4] font-medium rounded-xl transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={
                        recordMutation.isPending ||
                        !amount ||
                        parseFloat(amount) <= 0
                      }
                      className="flex-1 py-3 bg-[#c4a574] hover:bg-[#8f7349] text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {recordMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Recording...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Record Payment
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default RecordCreditPaymentModal;
