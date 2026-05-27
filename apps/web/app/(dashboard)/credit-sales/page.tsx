"use client";

import * as React from "react";
import { Suspense } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  IndianRupee,
  User,
  Phone,
  Clock,
  History,
  Banknote,
  Users,
  Receipt,
} from "lucide-react";
import { PageTransition } from "@/components/layout";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { creditSalesService, CreditSale } from "@/services";
import { inventoryService } from "@/services/inventory.service";
import { inventoryKeys } from "@/hooks";
import {
  RecordCreditPaymentModal,
  PaymentHistoryModal,
} from "@/components/credit-sales";
import { cn, formatCurrency } from "@/lib/utils";

type StatusFilter = "all" | "PENDING" | "PARTIAL" | "PAID";

export default function CreditSalesPage() {
  return (
    <Suspense fallback={<CreditSalesPageSkeleton />}>
      <CreditSalesPageContent />
    </Suspense>
  );
}

function CreditSalesPageSkeleton() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F6FA] flex items-center gap-2">
              <Banknote className="w-6 h-6 text-[#6366F1]" />
              Credit Sales
            </h1>
            <p className="text-sm text-[#6F7285] mt-1">Loading...</p>
          </div>
        </div>
        <SkeletonTable rows={6} />
      </div>
    </PageTransition>
  );
}

function CreditSalesPageContent() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [warehouseFilter, setWarehouseFilter] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  // Modal states
  const [selectedSaleForPayment, setSelectedSaleForPayment] =
    React.useState<CreditSale | null>(null);
  const [selectedSaleForHistory, setSelectedSaleForHistory] =
    React.useState<CreditSale | null>(null);

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch credit sales
  const {
    data: creditSales,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      "credit-sales",
      statusFilter === "all" ? undefined : statusFilter,
      warehouseFilter || undefined,
    ],
    queryFn: () =>
      creditSalesService.getCreditSales({
        credit_status:
          statusFilter === "all"
            ? undefined
            : (statusFilter as "PENDING" | "PARTIAL" | "PAID"),
        warehouse_id: warehouseFilter || undefined,
      }),
  });

  // Fetch warehouses for filter
  const { data: warehouses } = useQuery({
    queryKey: inventoryKeys.warehouses(),
    queryFn: () => inventoryService.getWarehouses(),
  });

  // Filter by search query
  const filteredSales = React.useMemo(() => {
    if (!creditSales) return [];
    if (!debouncedSearch) return creditSales;

    const query = debouncedSearch.toLowerCase();
    return creditSales.filter(
      (sale) =>
        sale.invoiceNumber.toLowerCase().includes(query) ||
        sale.customerName?.toLowerCase().includes(query) ||
        sale.customerMobile?.includes(query),
    );
  }, [creditSales, debouncedSearch]);

  // Calculate summary stats
  const stats = React.useMemo(() => {
    if (!creditSales)
      return { total: 0, pending: 0, partial: 0, paid: 0, totalOwed: 0 };

    return creditSales.reduce(
      (acc, sale) => {
        acc.total++;
        if (sale.creditStatus === "PENDING") acc.pending++;
        if (sale.creditStatus === "PARTIAL") acc.partial++;
        if (sale.creditStatus === "PAID") acc.paid++;
        acc.totalOwed += parseFloat(sale.creditBalance);
        return acc;
      },
      { total: 0, pending: 0, partial: 0, paid: 0, totalOwed: 0 },
    );
  }, [creditSales]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handlePaymentSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["credit-sales"] });
  };

  if (error) {
    return (
      <PageTransition>
        <ErrorState
          message="Failed to load credit sales"
          onRetry={() =>
            queryClient.invalidateQueries({ queryKey: ["credit-sales"] })
          }
        />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F6FA] flex items-center gap-2">
              <Banknote className="w-6 h-6 text-[#6366F1]" />
              Credit Sales
            </h1>
            <p className="text-sm text-[#6F7285] mt-1">
              Track and collect outstanding customer credit
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Total Credit Sales"
            value={stats.total.toString()}
            color="purple"
          />
          <StatCard
            icon={Clock}
            label="Pending Collection"
            value={stats.pending.toString()}
            color="amber"
          />
          <StatCard
            icon={Receipt}
            label="Fully Collected"
            value={stats.paid.toString()}
            color="green"
          />
          <StatCard
            icon={IndianRupee}
            label="Total Outstanding"
            value={formatCurrency(stats.totalOwed)}
            color="red"
            highlight
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6F7285]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by invoice, customer name or phone..."
              className="w-full pl-11 pr-4 py-2.5 bg-[#1A1B23] border border-[#2A2B35] rounded-xl text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:border-[#6C5DD3] transition-colors"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6F7285]" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="pl-11 pr-10 py-2.5 bg-[#1A1B23] border border-[#2A2B35] rounded-xl text-[#F5F6FA] focus:outline-none focus:border-[#6C5DD3] transition-colors appearance-none cursor-pointer min-w-[160px]"
            >
              <option value="all">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIAL">Partial</option>
              <option value="PAID">Paid</option>
            </select>
          </div>

          {/* Warehouse Filter */}
          {warehouses && warehouses.length > 0 && (
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="px-4 py-2.5 bg-[#1A1B23] border border-[#2A2B35] rounded-xl text-[#F5F6FA] focus:outline-none focus:border-[#6C5DD3] transition-colors appearance-none cursor-pointer min-w-[140px]"
            >
              <option value="">All Stores</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.code}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Credit Sales Table */}
        {isLoading ? (
          <SkeletonTable rows={6} />
        ) : filteredSales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No credit sales found"
            description={
              searchQuery
                ? "Try adjusting your search or filters"
                : "Credit sales with outstanding balances will appear here"
            }
          />
        ) : (
          <div className="bg-[#1A1B23] border border-[#2A2B35] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2A2B35]">
                    <th className="text-left px-6 py-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Invoice
                    </th>
                    <th className="text-right px-6 py-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Sale Total
                    </th>
                    <th className="text-right px-6 py-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Credit
                    </th>
                    <th className="text-right px-6 py-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Balance
                    </th>
                    <th className="text-center px-6 py-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-center px-6 py-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Days
                    </th>
                    <th className="text-right px-6 py-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2B35]">
                  {filteredSales.map((sale) => {
                    const statusInfo = creditSalesService.getCreditStatusInfo(
                      sale.creditStatus,
                    );
                    const hasOutstanding = parseFloat(sale.creditBalance) > 0;

                    return (
                      <motion.tr
                        key={sale.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-[#23242F] transition-colors"
                      >
                        {/* Customer */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-[#2A2B35] rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-[#6F7285]" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-[#F5F6FA]">
                                {sale.customerName || "Walk-in Customer"}
                              </p>
                              {sale.customerMobile && (
                                <p className="text-xs text-[#6F7285] flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {sale.customerMobile}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Invoice */}
                        <td className="px-6 py-4">
                          <p className="text-sm text-[#F5F6FA] font-mono">
                            {sale.invoiceNumber}
                          </p>
                          <p className="text-xs text-[#6F7285]">
                            {formatDate(sale.createdAt)}
                          </p>
                        </td>

                        {/* Sale Total */}
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm text-[#F5F6FA]">
                            {formatCurrency(parseFloat(sale.total))}
                          </span>
                        </td>

                        {/* Credit Amount */}
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm text-[#6F7285]">
                            {formatCurrency(parseFloat(sale.creditAmount))}
                          </span>
                        </td>

                        {/* Balance */}
                        <td className="px-6 py-4 text-right">
                          <span
                            className={cn(
                              "text-sm font-semibold",
                              hasOutstanding
                                ? "text-amber-400"
                                : "text-emerald-400",
                            )}
                          >
                            {formatCurrency(parseFloat(sale.creditBalance))}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4 text-center">
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-full text-xs font-medium border",
                              statusInfo.color,
                            )}
                          >
                            {statusInfo.label}
                          </span>
                        </td>

                        {/* Days Pending */}
                        <td className="px-6 py-4 text-center">
                          <span
                            className={cn(
                              "text-sm",
                              sale.daysPending > 30
                                ? "text-red-400"
                                : sale.daysPending > 7
                                  ? "text-amber-400"
                                  : "text-[#6F7285]",
                            )}
                          >
                            {sale.daysPending}d
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedSaleForHistory(sale)}
                              className="p-2 text-[#6F7285] hover:text-[#F5F6FA] hover:bg-[#2A2B35] rounded-lg transition-colors"
                              title="View History"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            {hasOutstanding && (
                              <button
                                onClick={() => setSelectedSaleForPayment(sale)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6C5DD3] hover:bg-[#5B4EC2] text-white text-sm font-medium rounded-lg transition-colors"
                              >
                                <Banknote className="w-4 h-4" />
                                Collect
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <RecordCreditPaymentModal
        isOpen={!!selectedSaleForPayment}
        onClose={() => setSelectedSaleForPayment(null)}
        creditSale={selectedSaleForPayment}
        onSuccess={handlePaymentSuccess}
      />

      {/* Payment History Modal */}
      <PaymentHistoryModal
        isOpen={!!selectedSaleForHistory}
        onClose={() => setSelectedSaleForHistory(null)}
        creditSale={selectedSaleForHistory}
      />
    </PageTransition>
  );
}

// Stat Card Component
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: "purple" | "amber" | "blue" | "red" | "green";
  highlight?: boolean;
}) {
  const colorClasses = {
    purple: "bg-[#6C5DD3]/20 text-[#6C5DD3]",
    amber: "bg-amber-500/20 text-amber-400",
    blue: "bg-blue-500/20 text-blue-400",
    red: "bg-red-500/20 text-red-400",
    green: "bg-emerald-500/20 text-emerald-400",
  };

  return (
    <div
      className={cn(
        "bg-[#1A1B23] border border-[#2A2B35] rounded-2xl p-5",
        highlight && "ring-2 ring-red-500/30",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            colorClasses[color],
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-[#6F7285]">{label}</p>
          <p
            className={cn(
              "text-xl font-bold",
              highlight ? "text-red-400" : "text-[#F5F6FA]",
            )}
          >
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
