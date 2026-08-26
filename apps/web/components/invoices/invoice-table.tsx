"use client";

import * as React from "react";
import { FileText, ChevronRight, Banknote, CreditCard } from "lucide-react";
import { motion } from "framer-motion";
import { formatDateTimeIST } from "@/lib/invoices/format-ist";
import type { Invoice } from "@/lib/invoices/transform-api-invoice";

// Local helpers
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function warehouseLabel(invoice: Invoice): string {
  return invoice.warehouse?.name?.trim() || "—";
}

function formatInvoiceWhen(invoice: Invoice): string {
  if (invoice.occurredAtIso) return formatDateTimeIST(invoice.occurredAtIso);
  if (!invoice.date) return "—";
  const d = new Date(invoice.date);
  if (Number.isNaN(d.getTime())) return invoice.date;
  return formatDateTimeIST(d.toISOString());
}

interface InvoiceTableProps {
  invoices: Invoice[];
  onInvoiceClick: (invoice: Invoice) => void;
}

export function InvoiceTable({ invoices, onInvoiceClick }: InvoiceTableProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  if (invoices.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/[0.05] mb-4">
          <FileText className="w-8 h-8 text-[#8a867c]" />
        </div>
        <h3 className="text-lg font-semibold text-[#f3eee4] mb-2">
          No invoices found
        </h3>
        <p className="text-sm text-[#c5c0b5]">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
      {/* Table Header */}
      <div className="hidden md:grid grid-cols-[minmax(11rem,1.6fr)_168px_minmax(0,1fr)_minmax(96px,160px)_100px_120px_100px_40px] gap-4 px-4 py-3 bg-[#111318] border-b border-white/[0.08] text-xs font-medium text-[#8a867c] uppercase tracking-wide sticky top-0 z-10">
        <span>Invoice</span>
        <span>{"Date & time (IST)"}</span>
        <span>Customer</span>
        <span>Warehouse</span>
        <span>Payment</span>
        <span className="text-right">Amount</span>
        <span>Status</span>
        <span></span>
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-white/[0.06] max-h-[500px] overflow-auto">
        {invoices.map((invoice, index) => {
          const isHovered = hoveredId === invoice.id;

          return (
            <motion.button
              key={invoice.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.02, 0.3) }}
              onClick={() => onInvoiceClick(invoice)}
              onMouseEnter={() => setHoveredId(invoice.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`
                w-full grid grid-cols-1 md:grid-cols-[minmax(11rem,1.6fr)_168px_minmax(0,1fr)_minmax(96px,160px)_100px_120px_100px_40px] gap-2 md:gap-4 px-4 py-4 text-left cursor-pointer
                transition-all duration-150 ease-out
                focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c4a574]
                ${isHovered ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"}
              `}
            >
              {/* Invoice ID */}
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[#8a867c] hidden md:block shrink-0" />
                <span
                  className="text-sm font-mono text-[#c4a574] min-w-0 break-all md:break-words text-left"
                  title={invoice.invoiceNumber}
                >
                  {invoice.invoiceNumber}
                </span>
              </div>

              {/* Date */}
              <span className="hidden md:block text-sm text-[#c5c0b5] self-center whitespace-nowrap">
                {formatInvoiceWhen(invoice)}
              </span>

              {/* Customer */}
              <div className="self-center min-w-0">
                <span className="text-sm text-[#f3eee4] block truncate">
                  {invoice.customer.name}
                </span>
                <span className="md:hidden text-xs text-[#8a867c] truncate block mt-0.5">
                  {warehouseLabel(invoice)}
                </span>
              </div>

              {/* Warehouse (desktop) */}
              <span
                className="hidden md:block text-sm text-[#c5c0b5] self-center truncate"
                title={warehouseLabel(invoice)}
              >
                {warehouseLabel(invoice)}
              </span>

              {/* Mobile: Row 2 */}
              <div className="md:hidden flex items-center justify-between text-xs text-[#c5c0b5]">
                <span className="whitespace-nowrap">{formatInvoiceWhen(invoice)}</span>
                <PaymentBadge method={invoice.paymentMethod} />
                <StatusBadge status={invoice.status} />
              </div>

              {/* Payment */}
              <div className="hidden md:flex items-center self-center">
                <PaymentBadge method={invoice.paymentMethod} />
              </div>

              {/* Amount */}
              <span
                className={`
                hidden md:block text-sm font-semibold self-center text-right tabular-nums
                ${invoice.status === "cancelled" || invoice.status === "refunded" ? "text-[#8a867c] line-through" : "text-[#f3eee4]"}
              `}
              >
                {formatCurrency(invoice.total)}
              </span>

              {/* Status */}
              <div className="hidden md:flex items-center self-center">
                <StatusBadge status={invoice.status} />
              </div>

              {/* Chevron */}
              <div className="hidden md:flex items-center justify-end self-center">
                <ChevronRight
                  className={`w-4 h-4 text-[#8a867c] transition-opacity duration-150 ${
                    isHovered ? "opacity-100" : "opacity-0"
                  }`}
                />
              </div>

              {/* Mobile: Amount */}
              <div className="md:hidden flex items-center justify-between">
                <span className="text-xs text-[#8a867c]">
                  {invoice.items.length} items
                </span>
                <span
                  className={`text-base font-semibold tabular-nums ${
                    invoice.status === "cancelled" ||
                    invoice.status === "refunded"
                      ? "text-[#8a867c] line-through"
                      : "text-[#c4a574]"
                  }`}
                >
                  {formatCurrency(invoice.total)}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function PaymentBadge({
  method,
}: {
  method: "cash" | "card" | "upi" | "credit";
}) {
  const config = {
    cash: {
      bg: "bg-[#3f9d7a]/15",
      text: "text-[#3f9d7a]",
      icon: Banknote,
      label: "Cash",
    },
    card: {
      bg: "bg-[#c4a574]/15",
      text: "text-[#c4a574]",
      icon: CreditCard,
      label: "Card",
    },
    upi: {
      bg: "bg-[#b8956a]/15",
      text: "text-[#b8956a]",
      icon: CreditCard,
      label: "UPI",
    },
    credit: {
      bg: "bg-[#d4a054]/15",
      text: "text-[#d4a054]",
      icon: CreditCard,
      label: "Credit",
    },
  }[method] || {
    bg: "bg-[#3f9d7a]/15",
    text: "text-[#3f9d7a]",
    icon: Banknote,
    label: "Cash",
  };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${config.bg} ${config.text}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
      <span>{config.label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    paid: { bg: "bg-[#3f9d7a]/15", text: "text-[#3f9d7a]", label: "Paid" },
    credit: {
      bg: "bg-[#d4a054]/18",
      text: "text-[#d4a054]",
      label: "Outstanding",
    },
    cancelled: {
      bg: "bg-[#c45c5c]/15",
      text: "text-[#c45c5c]",
      label: "Cancelled",
    },
    refunded: {
      bg: "bg-[#b8956a]/15",
      text: "text-[#b8956a]",
      label: "Refunded",
    },
  }[status] || { bg: "bg-white/[0.1]", text: "text-[#c5c0b5]", label: status };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span>{config.label}</span>
    </span>
  );
}
