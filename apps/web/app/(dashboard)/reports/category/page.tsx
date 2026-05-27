/**
 * Category-wise Sales Report Dashboard
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 * ========================================
 *
 * Category Performance:
 * - Bar chart (top categories by revenue/quantity)
 * - Toggle: Revenue / Quantity
 * - Pie chart for distribution
 *
 * Data from:
 * - /reports/by-category/
 */
"use client";

import * as React from "react";
import {
  Tags,
  BarChart3,
  DollarSign,
  Package,
  ShoppingCart,
  PieChart,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Legend,
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
import { useDashboardFilters, useCategorySales } from "@/hooks";

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

// Colors for pie chart
const COLORS = [
  "#6366F1",
  "#A855F7",
  "#EC4899",
  "#6366F1",
  "#A855F7",
  "#EC4899",
  "#6366F1",
  "#A855F7",
  "#EC4899",
  "#6366F1",
];

export default function CategoryReportsPage() {
  const { filters } = useDashboardFilters();
  const [metric, setMetric] = React.useState<"revenue" | "quantity">("revenue");

  // Fetch category sales
  const {
    data: categoryData,
    isLoading,
    error,
    refetch,
  } = useCategorySales({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    warehouseId: filters.warehouseId || undefined,
    pageSize: 50,
  });

  const handleRefresh = () => {
    refetch();
  };

  // Prepare bar chart data (top 10)
  const barChartData = React.useMemo(() => {
    if (!categoryData?.results) return [];

    return categoryData.results.slice(0, 10).map((item) => ({
      name:
        item.category.length > 15
          ? item.category.substring(0, 15) + "..."
          : item.category,
      fullName: item.category,
      revenue: parseFloat(item.revenue),
      quantity: item.quantitySold,
      orders: item.orderCount,
      products: item.productCount,
    }));
  }, [categoryData]);

  // Prepare pie chart data (top 6 + Others)
  const pieChartData = React.useMemo(() => {
    if (!categoryData?.results) return [];

    const top6 = categoryData.results.slice(0, 6);
    const others = categoryData.results.slice(6);

    const result = top6.map((item) => ({
      name: item.category,
      value:
        metric === "revenue" ? parseFloat(item.revenue) : item.quantitySold,
    }));

    if (others.length > 0) {
      const othersTotal = others.reduce(
        (sum, item) =>
          sum +
          (metric === "revenue" ? parseFloat(item.revenue) : item.quantitySold),
        0,
      );
      result.push({ name: "Others", value: othersTotal });
    }

    return result;
  }, [categoryData, metric]);

  // Prepare export configuration
  const exportConfig: ReportExportConfig = React.useMemo(() => {
    if (!categoryData?.results) {
      return {
        title: "Category-wise Sales Report",
        filename: "category-sales-report",
        columns: [],
        data: [],
      };
    }

    return {
      title: "Category-wise Sales Report",
      filename: `category-sales-report-${filters.dateFrom || "all"}-to-${filters.dateTo || "all"}`,
      columns: [
        { header: "Category", key: "category", width: 30 },
        {
          header: "Revenue (₹)",
          key: "revenue",
          width: 20,
          align: "right" as const,
        },
        {
          header: "Quantity Sold",
          key: "quantitySold",
          width: 15,
          align: "right" as const,
        },
        {
          header: "Order Count",
          key: "orderCount",
          width: 15,
          align: "right" as const,
        },
        {
          header: "Product Count",
          key: "productCount",
          width: 15,
          align: "right" as const,
        },
        {
          header: "Avg. Order Value (₹)",
          key: "avgOrderValue",
          width: 20,
          align: "right" as const,
        },
      ],
      data: categoryData.results.map((item) => ({
        category: item.category,
        revenue: parseFloat(item.revenue).toFixed(2),
        quantitySold: item.quantitySold,
        orderCount: item.orderCount,
        productCount: item.productCount,
        avgOrderValue:
          item.orderCount > 0
            ? (parseFloat(item.revenue) / item.orderCount).toFixed(2)
            : "0.00",
      })),
      summary: {
        "Total Revenue": formatFullCurrency(
          categoryData.summary.totalRevenue || "0",
        ),
        "Total Items Sold": (
          categoryData.summary.totalQuantity || 0
        ).toLocaleString(),
        "Total Orders": (
          categoryData.summary.totalOrders || 0
        ).toLocaleString(),
        Categories: (categoryData.summary.categoryCount || 0).toString(),
      },
      dateRange:
        filters.dateFrom && filters.dateTo
          ? { from: filters.dateFrom, to: filters.dateTo }
          : undefined,
    };
  }, [categoryData, filters]);

  // Loading state
  if (isLoading && !categoryData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Category-wise Sales</h1>
          <p className="text-sm text-white/40 mt-1">
            Sales breakdown by product category
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
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
          <h1 className="text-2xl font-bold text-white">Category-wise Sales</h1>
          <p className="text-sm text-white/40 mt-1">
            Sales breakdown by product category
          </p>
        </div>
        <ErrorBanner
          message={(error as Error).message || "Failed to load category data"}
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
          <h1 className="text-2xl font-bold text-white">Category-wise Sales</h1>
          <p className="text-sm text-white/40 mt-1">
            Sales breakdown by product category • Data from
            /reports/by-category/
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReportExportButtons
            config={exportConfig}
            disabled={!categoryData?.results?.length}
          />
          <DashboardFilterBar
            onRefresh={handleRefresh}
            isRefreshing={isLoading}
          />
        </div>
        <KPICard
          title="Total Revenue"
          value={formatFullCurrency(categoryData?.summary.totalRevenue || "0")}
          subtitle="From all categories"
          icon={DollarSign}
        />
        <KPICard
          title="Items Sold"
          value={(categoryData?.summary.totalQuantity || 0).toLocaleString()}
          subtitle="Total quantity"
          icon={Package}
        />
        <KPICard
          title="Total Orders"
          value={(categoryData?.summary.totalOrders || 0).toLocaleString()}
          subtitle="Unique orders"
          icon={ShoppingCart}
        />
        <KPICard
          title="Categories"
          value={(categoryData?.summary.categoryCount || 0).toLocaleString()}
          subtitle="Active categories"
          icon={Tags}
        />
      </div>

      {/* Category Bar Chart */}
      <SectionCard
        title="Top Categories"
        description={`By ${metric === "revenue" ? "revenue" : "quantity sold"}`}
        icon={BarChart3}
        action={
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => setMetric("revenue")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                metric === "revenue"
                  ? "bg-[#6366F1] text-white font-medium"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Revenue
            </button>
            <button
              onClick={() => setMetric("quantity")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                metric === "quantity"
                  ? "bg-[#6366F1] text-white font-medium"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Quantity
            </button>
          </div>
        }
      >
        {barChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={barChartData}
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
                  metric === "revenue"
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
                width={120}
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
              <Bar dataKey={metric} fill="#6366F1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No category sales data"
            description="Category sales will appear once you have completed sales."
          />
        )}
      </SectionCard>

      {/* Category Distribution Pie Chart */}
      <SectionCard
        title="Category Distribution"
        description={`${metric === "revenue" ? "Revenue" : "Quantity"} share by category`}
        icon={PieChart}
      >
        {pieChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <RechartsPie>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                }
                outerRadius={120}
                fill="#A855F7"
                dataKey="value"
              >
                {pieChartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(6, 6, 8, 0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "white",
                }}
                formatter={(value) =>
                  metric === "revenue"
                    ? formatFullCurrency(Number(value))
                    : Number(value).toLocaleString()
                }
              />
              <Legend
                wrapperStyle={{ color: "rgba(255,255,255,0.6)" }}
                formatter={(value) => (
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>
                    {value}
                  </span>
                )}
              />
            </RechartsPie>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={PieChart}
            title="No distribution data"
            description="Distribution chart will appear once you have sales data."
          />
        )}
      </SectionCard>

      {/* Data Source Attribution */}
      <div className="text-xs text-white/30 text-center py-4">
        Data derived from SaleItem aggregation by category • No frontend
        calculations
      </div>
    </div>
  );
}
