"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  History,
  Loader2,
  CreditCard,
  Banknote,
  Smartphone,
  User,
  Phone,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  creditSalesService,
  CreditSale,
  CreditPayment,
} from "@/services/credit-sales.service";
import { cn, formatCurrency } from "@/lib/utils";

interface PaymentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  creditSale: CreditSale | null;
}

const paymentMethodIcons: Record<string, React.ElementType> = {
  CASH: Banknote,
  UPI: Smartphone,
  CARD: CreditCard,
};

export function PaymentHistoryModal({
  isOpen,
  onClose,
  creditSale,
}: PaymentHistoryModalProps) {
  // Fetch payment history
  const { data: history, isLoading } = useQuery({
    queryKey: ["credit-payment-history", creditSale?.id],
    queryFn: () => creditSalesService.getPaymentHistory(creditSale!.id),
    enabled: isOpen && !!creditSale,
  });

  if (!creditSale) return null;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const statusInfo = creditSalesService.getCreditStatusInfo(
    history?.creditStatus || creditSale.creditStatus,
  );

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
            onClick={onClose}
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
            <div className="bg-[#111318] border border-[#1c1d22] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-[#1c1d22] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#c4a574]/20 rounded-xl flex items-center justify-center">
                    <History className="w-5 h-5 text-[#c4a574]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-[#f3eee4]">
                      Payment History
                    </h2>
                    <p className="text-sm text-[#8a867c]">
                      {creditSale.invoiceNumber}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-[#8a867c] hover:text-[#f3eee4] hover:bg-[#1c1d22] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[#c4a574]" />
                  </div>
                ) : history ? (
                  <div className="p-6 space-y-6">
                    {/* Customer & Summary */}
                    <div className="bg-[#1c1d22] rounded-xl p-4 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#1c1d22] rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-[#8a867c]" />
                        </div>
                        <div>
                          <p className="text-[#f3eee4] font-medium">
                            {history.customerName || "Walk-in Customer"}
                          </p>
                          {history.customerMobile && (
                            <p className="text-sm text-[#8a867c] flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {history.customerMobile}
                            </p>
                          )}
                        </div>
                        <div className="ml-auto">
                          <span
                            className={cn(
                              "px-3 py-1 rounded-full text-xs font-medium border",
                              statusInfo.color,
                            )}
                          >
                            {statusInfo.label}
                          </span>
                        </div>
                      </div>

                      <div className="h-px bg-[#1c1d22]" />

                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-xs text-[#8a867c]">
                            Original Credit
                          </p>
                          <p className="text-[#f3eee4] font-semibold">
                            {formatCurrency(parseFloat(history.originalCredit))}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#8a867c]">Total Paid</p>
                          <p className="text-emerald-400 font-semibold">
                            {formatCurrency(parseFloat(history.totalPaid))}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#8a867c]">Balance</p>
                          <p
                            className={cn(
                              "font-semibold",
                              parseFloat(history.currentBalance) > 0
                                ? "text-amber-400"
                                : "text-emerald-400",
                            )}
                          >
                            {formatCurrency(parseFloat(history.currentBalance))}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Payment Timeline */}
                    <div>
                      <h3 className="text-sm font-medium text-[#f3eee4] mb-4">
                        Payment Timeline
                      </h3>

                      {history.payments.length === 0 ? (
                        <div className="text-center py-8 text-[#8a867c]">
                          <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>No payments recorded yet</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {history.payments.map(
                            (payment: CreditPayment, index: number) => {
                              const Icon =
                                paymentMethodIcons[payment.method] ||
                                CreditCard;
                              return (
                                <div key={payment.id} className="relative pl-8">
                                  {/* Timeline line */}
                                  {index < history.payments.length - 1 && (
                                    <div className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-[#1c1d22]" />
                                  )}

                                  {/* Timeline dot */}
                                  <div className="absolute left-0 top-1 w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center">
                                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                                  </div>

                                  {/* Payment card */}
                                  <div className="bg-[#1c1d22] rounded-xl p-4">
                                    <div className="flex items-start justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-[#1c1d22] rounded-lg flex items-center justify-center">
                                          <Icon className="w-4 h-4 text-[#8a867c]" />
                                        </div>
                                        <div>
                                          <p className="text-[#f3eee4] font-medium">
                                            {formatCurrency(
                                              parseFloat(payment.amount),
                                            )}
                                          </p>
                                          <p className="text-xs text-[#8a867c]">
                                            {payment.method} •{" "}
                                            {payment.receivedByUsername}
                                          </p>
                                        </div>
                                      </div>
                                      <p className="text-xs text-[#8a867c]">
                                        {formatDate(payment.createdAt)}
                                      </p>
                                    </div>
                                    {payment.notes && (
                                      <p className="mt-2 text-sm text-[#8a867c] pl-11">
                                        &ldquo;{payment.notes}&rdquo;
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-[#8a867c]">
                    Failed to load payment history
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-[#1c1d22] flex-shrink-0">
                <button
                  onClick={onClose}
                  className="w-full py-3 bg-[#1c1d22] hover:bg-[#1c1d22] text-[#f3eee4] font-medium rounded-xl transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default PaymentHistoryModal;
