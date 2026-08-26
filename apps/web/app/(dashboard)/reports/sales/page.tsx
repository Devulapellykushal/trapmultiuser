/**
 * Sales Reports Dashboard
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 * ========================================
 *
 * Sales by Product:
 * - Bar chart (top 10)
 * - Toggle: Quantity / Revenue
 *
 * Invoice Count Trend:
 * - Area or line chart
 * - Focus on volume, not value
 *
 * Data from:
 * - /reports/sales/by-product/
 * - /reports/sales/trends/
 */
"use client";

import * as React from "react";
import {
  TrendingUp,
  BarChart3,
  FileText,
  Package,
  DollarSign,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  KPICard,
  ChartSkeleton,
  ErrorBanner,
  EmptyState,
  DashboardFilterBar,
  SectionCard,
  ReportExportButtons,
} from "@/components/dashboard";
import type { ReportExportConfig } from "@/components/dashboard";
import {
  useDashboardFilters,
  useProductSales,
  useSalesTrendsReport,
  useSalesSummaryReport,
} from "@/hooks";

// Format currency
function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (num >= 1000000) {
    return `₹${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `₹${(num / 1000).toFixed(0)}K`;
  }
  return `₹${num.toFixed(0)}`;
}

// Format full currency
function formatFullCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

// Format date
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

export default function SalesReportsPage() {
  const { filters } = useDashboardFilters();
  const [productMetric, setProductMetric] = React.useState<
    "revenue" | "quantity"
  >("revenue");
  const [trendGroupBy, setTrendGroupBy] = React.useState<"day" | "month">(
    "day",
  );

  // Fetch sales summary for KPIs
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

  // Fetch product sales
  const {
    data: productSales,
    isLoading: productLoading,
    error: productError,
    refetch: refetchProducts,
  } = useProductSales({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    warehouseId: filters.warehouseId || undefined,
    pageSize: 10, // Top 10
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
    groupBy: trendGroupBy,
  });

  const isLoading = summaryLoading || productLoading || trendsLoading;
  const error = summaryError || productError || trendsError;

  const handleRefresh = () => {
    refetchSummary();
    refetchProducts();
    refetchTrends();
  };

  // Prepare product chart data (top 10)
  const productChartData = React.useMemo(() => {
    if (!productSales?.results) return [];

    return productSales.results.slice(0, 10).map((item) => ({
      name:
        item.productName.length > 20
          ? item.productName.substring(0, 20) + "..."
          : item.productName,
      fullName: item.productName,
      revenue: parseFloat(item.revenue),
      quantity: item.quantitySold,
      sku: item.sku,
    }));
  }, [productSales]);

  // Prepare trend chart data
  const trendChartData = React.useMemo(() => {
    if (!trends?.results) return [];

    return trends.results.map((item) => ({
      period: formatDate(item.period, trendGroupBy),
      invoices: item.invoiceCount,
      items: item.totalItems,
      revenue: parseFloat(item.totalSales),
    }));
  }, [trends, trendGroupBy]);

  // Prepare export configuration
  const exportConfig: ReportExportConfig = React.useMemo(() => {
    if (!productSales?.results) {
      return {
        title: "Sales Report - By Product",
        filename: "sales-by-product-report",
        columns: [],
        data: [],
      };
    }

    return {
      title: "Sales Report - By Product",
      filename: `sales-by-product-report-${filters.dateFrom || "all"}-to-${filters.dateTo || "all"}`,
      columns: [
        { header: "Product Name", key: "productName", width: 35 },
        { header: "SKU", key: "sku", width: 15 },
        {
          header: "Quantity Sold",
          key: "quantitySold",
          width: 15,
          align: "right" as const,
        },
        {
          header: "Revenue (₹)",
          key: "revenue",
          width: 20,
          align: "right" as const,
        },
        {
          header: "Avg. Price (₹)",
          key: "avgPrice",
          width: 18,
          align: "right" as const,
        },
      ],
      data: productSales.results.map((item) => ({
        productName: item.productName,
        sku: item.sku,
        quantitySold: item.quantitySold,
        revenue: parseFloat(item.revenue).toFixed(2),
        avgPrice:
          item.quantitySold > 0
            ? (parseFloat(item.revenue) / item.quantitySold).toFixed(2)
            : "0.00",
      })),
      summary: {
        "Total Revenue": formatFullCurrency(summary?.totalSales || "0"),
        "Total Orders": (summary?.invoiceCount || 0).toLocaleString(),
        "Items Sold": (summary?.totalItemsSold || 0).toLocaleString(),
      },
      dateRange:
        filters.dateFrom && filters.dateTo
          ? { from: filters.dateFrom, to: filters.dateTo }
          : undefined,
    };
  }, [productSales, summary, filters]);

  // Loading state
  if (isLoading && !summary) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales</h1>
          <p className="text-sm text-white/40 mt-1">
            Product performance from sales ledger
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <KPICard key={i} title="" value="" loading />
          ))}
        </div>
        <ChartSkeleton height={350} />
        <ChartSkeleton height={350} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales</h1>
          <p className="text-sm text-white/40 mt-1">
            Product performance from sales ledger
          </p>
        </div>
        <ErrorBanner
          message={(error as Error).message || "Failed to load sales data"}
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
          <h1 className="text-2xl font-bold text-white">Sales</h1>
          <p className="text-sm text-white/40 mt-1">
            Product performance • Data from /reports/sales/by-product/
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReportExportButtons
            config={exportConfig}
            disabled={!productSales?.results?.length}
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
          title="Total Revenue"
          value={formatFullCurrency(summary?.totalSales || "0")}
          subtitle="From completed sales"
          icon={DollarSign}
        />
        <KPICard
          title="Total Orders"
          value={(summary?.invoiceCount || 0).toLocaleString()}
          subtitle="Invoices generated"
          icon={FileText}
        />
        <KPICard
          title="Items Sold"
          value={(summary?.totalItemsSold || 0).toLocaleString()}
          subtitle="Total quantity"
          icon={Package}
        />
      </div>

      {/* Sales by Product */}
      <SectionCard
        title="Top Products"
        description={`By ${productMetric === "revenue" ? "revenue" : "quantity sold"}`}
        icon={BarChart3}
        action={
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => setProductMetric("revenue")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                productMetric === "revenue"
                  ? "bg-[#c4a574] text-white font-medium"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Revenue
            </button>
            <button
              onClick={() => setProductMetric("quantity")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                productMetric === "quantity"
                  ? "bg-[#c4a574] text-white font-medium"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Quantity
            </button>
          </div>
        }
      >
        {productChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={productChartData}
              layout="vertical"
              margin={{ left: 20, right: 20 }}
            >
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
                tickFormatter={(value) =>
                  productMetric === "revenue"
                    ? formatCurrency(value)
                    : value.toLocaleString()
                }
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                width={150}
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
                    name === "revenue"
                      ? formatFullCurrency(numValue)
                      : numValue.toLocaleString(),
                    name === "revenue" ? "Revenue" : "Quantity",
                  ];
                }}
                labelFormatter={(label, payload) =>
                  payload?.[0]?.payload?.fullName || label
                }
                labelStyle={{
                  color: "rgba(255,255,255,0.8)",
                  fontWeight: "bold",
                }}
              />
              <Bar
                dataKey={productMetric}
                fill="#c4a574"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No product sales data"
            description="Product sales will appear once you have completed sales."
          />
        )}
      </SectionCard>

      {/* Invoice Count Trend */}
      <SectionCard
        title="Order Volume Trend"
        description={`${trendGroupBy === "day" ? "Daily" : "Monthly"} invoice count`}
        icon={TrendingUp}
        action={
          <select
            value={trendGroupBy}
            onChange={(e) => setTrendGroupBy(e.target.value as "day" | "month")}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c4a574]/50"
          >
            <option value="day">Daily</option>
            <option value="month">Monthly</option>
          </select>
        }
      >
        {trendChartData.length > 0 ? (
          <>
            {/* Legend */}
            <div className="flex items-center gap-6 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#c4a574]"></div>
                <span className="text-sm text-white/60">Invoices</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                <span className="text-sm text-white/60">Items Sold</span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendChartData}>
                <defs>
                  <linearGradient
                    id="invoiceGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#c4a574" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#c4a574" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id="itemsGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#d4b88a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#d4b88a" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(6, 6, 8, 0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "white",
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                />
                <Area
                  type="monotone"
                  dataKey="invoices"
                  stroke="#c4a574"
                  strokeWidth={2}
                  fill="url(#invoiceGradient)"
                  name="Invoices"
                />
                <Area
                  type="monotone"
                  dataKey="items"
                  stroke="#d4b88a"
                  strokeWidth={2}
                  fill="url(#itemsGradient)"
                  name="Items Sold"
                />
              </AreaChart>
            </ResponsiveContainer>
          </>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="No trend data"
            description="Sales volume trends will appear once you have sales across multiple periods."
          />
        )}
      </SectionCard>

      {/* Data Source Attribution */}
      <div className="text-xs text-white/30 text-center py-4">
        Data derived from SaleItem aggregation • No frontend calculations
      </div>
    </div>
  );
}
