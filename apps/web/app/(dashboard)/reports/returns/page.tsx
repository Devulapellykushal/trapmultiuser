/**
 * Returns & Adjustments Dashboard
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 * ========================================
 *
 * ADMIN ONLY
 *
 * Returns Summary:
 * - Total refund amount
 * - Most returned products
 * - Return count
 *
 * Adjustments Audit Table:
 * - Product, Quantity, Reason, User, Date
 * - This is an audit view, not a chart
 *
 * Data from:
 * - /reports/returns/
 * - /reports/adjustments/
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  RotateCcw,
  DollarSign,
  Package,
  AlertTriangle,
  ClipboardList,
  ShieldAlert,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  KPICard,
  ChartSkeleton,
  ErrorBanner,
  EmptyState,
  DashboardFilterBar,
  SectionCard,
  DataTable,
  Column,
  ReportExportButtons,
} from "@/components/dashboard";
import type { ReportExportConfig } from "@/components/dashboard";
import {
  useDashboardFilters,
  useReturnsSummary,
  useAdjustments,
} from "@/hooks";
import { useAuth } from "@/lib/auth";
import { adminHref } from "@/lib/admin-routes";
import { AdjustmentItem } from "@/services";

// Format currency
function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export default function ReturnsReportsPage() {
  const { filters } = useDashboardFilters();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [adjustmentPage, setAdjustmentPage] = React.useState(1);

  // Redirect non-admins
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push(adminHref("/reports"));
    }
  }, [authLoading, isAdmin, router]);

  // Fetch returns summary
  const {
    data: returnsData,
    isLoading: returnsLoading,
    error: returnsError,
    refetch: refetchReturns,
  } = useReturnsSummary({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    warehouseId: filters.warehouseId || undefined,
  });

  // Fetch adjustments
  const {
    data: adjustmentsData,
    isLoading: adjustmentsLoading,
    error: adjustmentsError,
    refetch: refetchAdjustments,
  } = useAdjustments({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    warehouseId: filters.warehouseId || undefined,
    page: adjustmentPage,
    pageSize: 15,
  });

  const isLoading = returnsLoading || adjustmentsLoading;
  const error = returnsError || adjustmentsError;

  const handleRefresh = () => {
    refetchReturns();
    refetchAdjustments();
  };

  // Prepare top returned products chart
  const topReturnedProducts = React.useMemo(() => {
    if (!returnsData?.topReturnedProducts) return [];

    return returnsData.topReturnedProducts.map((item) => ({
      name:
        item.productName.length > 15
          ? item.productName.substring(0, 15) + "..."
          : item.productName,
      fullName: item.productName,
      returned: item.totalReturned,
      refund: parseFloat(item.totalRefund),
    }));
  }, [returnsData]);

  // Adjustment table columns
  const adjustmentColumns: Column<AdjustmentItem>[] = [
    {
      key: "createdAt",
      header: "Date",
      render: (item) => (
        <span className="text-white/60">
          {new Date(item.createdAt).toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
            year: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "product",
      header: "Product",
      render: (item) => (
        <div>
          <p className="text-white font-medium">{item.productName}</p>
          <p className="text-white/40 text-xs">{item.productSku}</p>
        </div>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (item) => (
        <span
          className={`font-medium ${item.quantity >= 0 ? "text-emerald-400" : "text-rose-400"}`}
        >
          {item.quantity > 0 ? "+" : ""}
          {item.quantity}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (item) => (
        <span className="text-white/70 text-sm">{item.reason || "—"}</span>
      ),
    },
    {
      key: "createdBy",
      header: "User",
      render: (item) => (
        <span className="text-white/60">{item.createdBy || "System"}</span>
      ),
    },
    {
      key: "warehouseName",
      header: "Warehouse",
      render: (item) => (
        <span className="text-white/60">{item.warehouseName || "—"}</span>
      ),
    },
  ];

  // Prepare export configuration
  const exportConfig: ReportExportConfig = React.useMemo(() => {
    if (!adjustmentsData?.results) {
      return {
        title: "Returns & Adjustments Report",
        filename: "returns-adjustments-report",
        columns: [],
        data: [],
      };
    }

    return {
      title: "Returns & Adjustments Report",
      filename: `returns-adjustments-report-${filters.dateFrom || "all"}-to-${filters.dateTo || "all"}`,
      columns: [
        { header: "Date", key: "date", width: 15 },
        { header: "Product Name", key: "productName", width: 30 },
        { header: "SKU", key: "productSku", width: 15 },
        {
          header: "Quantity",
          key: "quantity",
          width: 12,
          align: "right" as const,
        },
        { header: "Reason", key: "reason", width: 25 },
        { header: "User", key: "createdBy", width: 15 },
        { header: "Warehouse", key: "warehouseName", width: 18 },
      ],
      data: adjustmentsData.results.map((item) => ({
        date: new Date(item.createdAt).toLocaleDateString("en-IN"),
        productName: item.productName,
        productSku: item.productSku,
        quantity: item.quantity,
        reason: item.reason || "—",
        createdBy: item.createdBy || "System",
        warehouseName: item.warehouseName || "—",
      })),
      summary: {
        "Total Refunds": formatCurrency(
          returnsData?.summary?.totalRefundAmount || "0",
        ),
        "Refund GST": formatCurrency(
          returnsData?.summary?.totalRefundGst || "0",
        ),
        "Return Count": (
          returnsData?.summary?.returnCount || 0
        ).toLocaleString(),
      },
      dateRange:
        filters.dateFrom && filters.dateTo
          ? { from: filters.dateFrom, to: filters.dateTo }
          : undefined,
    };
  }, [adjustmentsData, returnsData, filters]);

  // Auth loading or non-admin
  if (authLoading || !isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <ShieldAlert className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/40">Checking permissions...</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading && !returnsData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Returns & Adjustments
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Refunds and stock adjustments audit
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <KPICard key={i} title="" value="" loading />
          ))}
        </div>
        <ChartSkeleton height={300} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Returns & Adjustments
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Refunds and stock adjustments audit
          </p>
        </div>
        <ErrorBanner
          message={(error as Error).message || "Failed to load returns data"}
          onRetry={handleRefresh}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">
              Returns & Adjustments
            </h1>
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded">
              Admin Only
            </span>
          </div>
          <p className="text-sm text-white/40">
            Refund and audit data • From /reports/returns/ and
            /reports/adjustments/
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReportExportButtons
            config={exportConfig}
            disabled={!adjustmentsData?.results?.length}
          />
          <DashboardFilterBar
            onRefresh={handleRefresh}
            isRefreshing={isLoading}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          title="Total Refunds"
          value={formatCurrency(returnsData?.summary?.totalRefundAmount || "0")}
          subtitle="Refunded to customers"
          icon={DollarSign}
        />
        <KPICard
          title="Return Count"
          value={(returnsData?.summary?.returnCount || 0).toLocaleString()}
          subtitle="Return transactions"
          icon={RotateCcw}
        />
        <KPICard
          title="Adjustments"
          value={(
            adjustmentsData?.summary?.totalAdjustments || 0
          ).toLocaleString()}
          subtitle={`+${adjustmentsData?.summary?.totalPositiveQty || 0} / ${adjustmentsData?.summary?.totalNegativeQty || 0} units`}
          icon={ClipboardList}
        />
      </div>

      {/* Most Returned Products */}
      <SectionCard
        title="Most Returned Products"
        description="Top products by return quantity"
        icon={Package}
      >
        {topReturnedProducts.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={topReturnedProducts} layout="vertical">
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(6, 6, 8, 0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "white",
                }}
                formatter={(value) => {
                  if (value === undefined) return ["-", "Units Returned"];
                  return [Number(value).toLocaleString(), "Units Returned"];
                }}
                labelFormatter={(label, payload) =>
                  payload?.[0]?.payload?.fullName || label
                }
                labelStyle={{
                  color: "rgba(255,255,255,0.8)",
                  fontWeight: "bold",
                }}
              />
              <Bar dataKey="returned" fill="#EC4899" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={RotateCcw}
            title="No returns recorded"
            description="Returned products will appear here once you process returns."
          />
        )}
      </SectionCard>

      {/* Adjustments Audit Table */}
      <SectionCard
        title="Stock Adjustments Audit"
        description="All manual inventory adjustments • Read-only audit log"
        icon={AlertTriangle}
      >
        {adjustmentsError ? (
          <ErrorBanner
            message={
              (adjustmentsError as Error).message ||
              "Failed to load adjustments"
            }
            onRetry={refetchAdjustments}
          />
        ) : (
          <DataTable
            data={adjustmentsData?.results || []}
            columns={adjustmentColumns}
            keyExtractor={(item) => item.id}
            loading={adjustmentsLoading}
            emptyMessage="No stock adjustments found for the selected period"
            pagination={
              adjustmentsData
                ? {
                    page: adjustmentsData.page,
                    pageSize: adjustmentsData.pageSize,
                    total: adjustmentsData.total,
                    onPageChange: setAdjustmentPage,
                  }
                : undefined
            }
          />
        )}
      </SectionCard>

      {/* Data Source Attribution */}
      <div className="text-xs text-white/30 text-center py-4">
        Audit data from returns and adjustment ledgers • No inline editing
      </div>
    </div>
  );
}
