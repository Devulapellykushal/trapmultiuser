"use client";

import * as React from "react";
import { Search, X, Calendar, CreditCard, Banknote, CheckCircle, XCircle, ChevronDown, Smartphone, Clock } from "lucide-react";

export type PaymentFilter = "all" | "cash" | "card" | "upi" | "credit";
export type StatusFilter = "all" | "paid" | "credit" | "cancelled" | "refunded";

interface InvoiceFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  paymentFilter: PaymentFilter;
  onPaymentChange: (filter: PaymentFilter) => void;
  statusFilter: StatusFilter;
  onStatusChange: (filter: StatusFilter) => void;
  dateRange: string;
  onDateRangeChange: (range: string) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}

export function InvoiceFilters({
  searchQuery,
  onSearchChange,
  paymentFilter,
  onPaymentChange,
  statusFilter,
  onStatusChange,
  dateRange,
  onDateRangeChange,
  onReset,
  hasActiveFilters,
}: InvoiceFiltersProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-3">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a867c]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search invoice ID or customer..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/[0.1]"
          >
            <X className="w-4 h-4 text-[#8a867c]" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Date Range */}
        <div className="relative">
          <select
            value={dateRange}
            onChange={(e) => onDateRangeChange(e.target.value)}
            className="appearance-none pl-9 pr-8 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#f3eee4] focus:outline-none focus:ring-2 focus:ring-[#c4a574] cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a867c] pointer-events-none" />
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a867c] pointer-events-none" />
        </div>

        {/* Payment Method */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <button
            onClick={() => onPaymentChange("all")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              paymentFilter === "all"
                ? "bg-[#c4a574] text-[#0c0d10]"
                : "text-[#c5c0b5] hover:text-[#f3eee4] hover:bg-white/[0.05]"
            }`}
          >
            All
          </button>
          <button
            onClick={() => onPaymentChange("cash")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              paymentFilter === "cash"
                ? "bg-[#c4a574] text-[#0c0d10]"
                : "text-[#c5c0b5] hover:text-[#f3eee4] hover:bg-white/[0.05]"
            }`}
          >
            <Banknote className="w-3.5 h-3.5 shrink-0 opacity-95" strokeWidth={2.25} />
            Cash
          </button>
          <button
            onClick={() => onPaymentChange("card")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              paymentFilter === "card"
                ? "bg-[#c4a574] text-[#0c0d10]"
                : "text-[#c5c0b5] hover:text-[#f3eee4] hover:bg-white/[0.05]"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 shrink-0 opacity-95" strokeWidth={2.25} />
            Card
          </button>
          <button
            onClick={() => onPaymentChange("upi")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              paymentFilter === "upi"
                ? "bg-[#c4a574] text-[#0c0d10]"
                : "text-[#c5c0b5] hover:text-[#f3eee4] hover:bg-white/[0.05]"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0 opacity-95" strokeWidth={2.25} />
            UPI
          </button>
          <button
            onClick={() => onPaymentChange("credit")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              paymentFilter === "credit"
                ? "bg-[#c4a574] text-[#0c0d10]"
                : "text-[#c5c0b5] hover:text-[#f3eee4] hover:bg-white/[0.05]"
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0 opacity-95" strokeWidth={2.25} />
            Credit
          </button>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <button
            onClick={() => onStatusChange("all")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              statusFilter === "all"
                ? "bg-[#c4a574] text-[#0c0d10]"
                : "text-[#c5c0b5] hover:text-[#f3eee4] hover:bg-white/[0.05]"
            }`}
          >
            All
          </button>
          <button
            onClick={() => onStatusChange("paid")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              statusFilter === "paid"
                ? "bg-[#3f9d7a] text-[#0c0d10]"
                : "text-[#c5c0b5] hover:text-[#f3eee4] hover:bg-white/[0.05]"
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5 shrink-0 opacity-95" strokeWidth={2.25} />
            Paid
          </button>
          <button
            onClick={() => onStatusChange("credit")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              statusFilter === "credit"
                ? "bg-[#d4a054] text-[#0c0d10]"
                : "text-[#c5c0b5] hover:text-[#f3eee4] hover:bg-white/[0.05]"
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0 opacity-95" strokeWidth={2.25} />
            Credit
          </button>
          <button
            onClick={() => onStatusChange("cancelled")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              statusFilter === "cancelled"
                ? "bg-[#c45c5c] text-white"
                : "text-[#c5c0b5] hover:text-[#f3eee4] hover:bg-white/[0.05]"
            }`}
          >
            <XCircle className="w-3.5 h-3.5 shrink-0 opacity-95" strokeWidth={2.25} />
            Cancelled
          </button>
          <button
            onClick={() => onStatusChange("refunded")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              statusFilter === "refunded"
                ? "bg-[#b8956a] text-white"
                : "text-[#c5c0b5] hover:text-[#f3eee4] hover:bg-white/[0.05]"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 shrink-0 opacity-95" strokeWidth={2.25} />
            Refunded
          </button>
        </div>

        {/* Reset */}
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="px-3 py-2 rounded-lg text-sm text-[#c45c5c] hover:bg-[#c45c5c]/10 transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
