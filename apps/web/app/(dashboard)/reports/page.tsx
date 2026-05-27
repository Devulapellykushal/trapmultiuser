/**
 * Reports Overview Page (Executive Summary)
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 * ========================================
 *
 * KPIs (Cards):
 * - Total Revenue
 * - Total Orders
 * - Total Items Sold
 * - Total GST Collected
 * - Total Discounts Given
 *
 * Data from: /reports/sales/summary/ and /reports/sales/trends/
 *
 * Core Rule: Dashboards visualize answers. They do not calculate them.
 */
"use client";

import * as React from "react";
import {
  DollarSign,
  ShoppingCart,
  Package,
  Receipt,
  Percent,
  TrendingUp,
  LayoutDashboard,
} from "lucide-react";
import {
  LineChart,
  Line,
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
} from "@/components/dashboard";
import {
  useDashboardFilters,
  useSalesSummaryReport,
  useSalesTrendsReport,
} from "@/hooks";

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

// Format date for chart
function formatDate(dateStr: string, groupBy: "day" | "month"): string {
  const date = new Date(dateStr);
  if (groupBy === "month") {
    return date.toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
    });
  }
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export default function ReportsOverviewPage() {
  const { filters } = useDashboardFilters();
  const [groupBy, setGroupBy] = React.useState<"day" | "month">("day");

  // Fetch sales summary
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useSalesSummaryReport({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    warehouseId: filters.warehouseId || undefined,
  });

  // Fetch sales trends
  const {
    data: trends,
    isLoading: trendsLoading,
    error: trendsError,
    refetch: refetchTrends,
  } = useSalesTrendsReport({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    warehouseId: filters.warehouseId || undefined,
    groupBy,
  });

  const isLoading = summaryLoading || trendsLoading;
  const error = summaryError || trendsError;

  const handleRefresh = () => {
    refetchSummary();
    refetchTrends();
  };

  // Prepare chart data
  const chartData = React.useMemo(() => {
    if (!trends?.results) return [];
    return trends.results.map((item) => ({
      period: formatDate(item.period, groupBy),
      revenue: parseFloat(item.totalSales),
      orders: item.invoiceCount,
      items: item.totalItems,
    }));
  }, [trends, groupBy]);

  // Loading state
  if (isLoading && !summary) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Overview</h1>
            <p className="text-sm text-white/40 mt-1">
              Executive summary from sales data
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <KPICard key={i} title="" value="" loading />
          ))}
        </div>
        <ChartSkeleton height={400} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="text-sm text-white/40 mt-1">
            Executive summary from sales data
          </p>
        </div>
        <ErrorBanner
          message={(error as Error).message || "Failed to load overview data"}
          onRetry={handleRefresh}
        />
      </div>
    );
  }

  // Empty state
  if (!summary || summary.invoiceCount === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Overview</h1>
            <p className="text-sm text-white/40 mt-1">
              Executive summary from sales data
            </p>
          </div>
          <DashboardFilterBar onRefresh={handleRefresh} />
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10">
          <EmptyState
            icon={LayoutDashboard}
            title="No sales data for this period"
            description="There are no completed sales within the selected date range. Try adjusting the filters or make some sales through the POS system."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="text-sm text-white/40 mt-1">
            Executive summary • Data from /reports/sales/summary/
          </p>
        </div>
        <DashboardFilterBar
          onRefresh={handleRefresh}
          isRefreshing={isLoading}
        />
      </div>

      {/* KPI Cards - Data from /reports/sales/summary/ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          title="Total Revenue"
          value={formatCurrency(summary.totalSales)}
          subtitle="Completed sales"
          icon={DollarSign}
        />
        <KPICard
          title="Total Orders"
          value={(summary.invoiceCount ?? 0).toLocaleString()}
          subtitle="Invoices generated"
          icon={ShoppingCart}
        />
        <KPICard
          title="Items Sold"
          value={(summary.totalItemsSold ?? 0).toLocaleString()}
          subtitle="Total quantity"
          icon={Package}
        />
        <KPICard
          title="GST Collected"
          value={formatCurrency(summary.totalGst)}
          subtitle="Tax liability"
          icon={Receipt}
        />
        <KPICard
          title="Discounts Given"
          value={formatCurrency(summary.totalDiscount)}
          subtitle="Total discounts"
          icon={Percent}
        />
      </div>

      {/* Sales Trend Chart */}
      <SectionCard
        title="Sales Trend"
        description={`${groupBy === "day" ? "Daily" : "Monthly"} revenue and orders`}
        icon={TrendingUp}
        action={
          <div className="flex items-center gap-2">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as "day" | "month")}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50"
            >
              <option value="day">Daily</option>
              <option value="month">Monthly</option>
            </select>
          </div>
        }
      >
        {chartData.length > 0 ? (
          <>
            {/* Legend */}
            <div className="flex items-center gap-6 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#6366F1]"></div>
                <span className="text-sm text-white/60">Revenue (₹)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                <span className="text-sm text-white/60">Orders</span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.1)"
                />
                <XAxis
                  dataKey="period"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                  label={{
                    value: "Revenue",
                    angle: -90,
                    position: "insideLeft",
                    fill: "rgba(255,255,255,0.4)",
                    fontSize: 12,
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  label={{
                    value: "Orders",
                    angle: 90,
                    position: "insideRight",
                    fill: "rgba(255,255,255,0.4)",
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(6, 6, 8, 0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "white",
                  }}
                  formatter={(value, name) => {
                    if (value === undefined) return ["-", name];
                    const numValue = Number(value);
                    return [
                      name === "revenue" ? formatCurrency(numValue) : numValue,
                      name === "revenue" ? "Revenue" : "Orders",
                    ];
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke="#6366F1"
                  strokeWidth={2}
                  dot={{ fill: "#6366F1", strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5, fill: "#6366F1" }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  stroke="#A855F7"
                  strokeWidth={2}
                  dot={{ fill: "#A855F7", strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5, fill: "#A855F7" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="No trend data available"
            description="Sales trends will appear once you have sales data across multiple periods."
          />
        )}
      </SectionCard>

      {/* Data Source Attribution */}
      <div className="text-xs text-white/30 text-center py-4">
        Data derived from immutable sales ledger • No frontend calculations
      </div>
    </div>
  );
}
