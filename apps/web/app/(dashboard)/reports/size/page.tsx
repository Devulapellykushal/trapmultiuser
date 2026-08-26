/**
 * Variant-option sales report (API field: size — used for any industry:
 * apparel size, pack, grade, potency, SKU option, etc.)
 */
"use client";

import * as React from "react";
import { CHART_SERIES } from "@/lib/brand-colors";
import {
  Layers,
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
import { useDashboardFilters, useSizeSales } from "@/hooks";

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
const COLORS = [...CHART_SERIES];

export default function SizeReportsPage() {
  const { filters } = useDashboardFilters();
  const [metric, setMetric] = React.useState<"revenue" | "quantity">("revenue");

  // Fetch size sales
  const {
    data: sizeData,
    isLoading,
    error,
    refetch,
  } = useSizeSales({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    warehouseId: filters.warehouseId || undefined,
    pageSize: 50,
  });

  const handleRefresh = () => {
    refetch();
  };

  // Prepare bar chart data
  const barChartData = React.useMemo(() => {
    if (!sizeData?.results) return [];

    return sizeData.results.slice(0, 15).map((item) => ({
      name: item.size,
      fullName: item.size,
      revenue: parseFloat(item.revenue),
      quantity: item.quantitySold,
      orders: item.orderCount,
      products: item.productCount,
    }));
  }, [sizeData]);

  // Prepare pie chart data
  const pieChartData = React.useMemo(() => {
    if (!sizeData?.results) return [];

    const top8 = sizeData.results.slice(0, 8);
    const others = sizeData.results.slice(8);

    const result = top8.map((item) => ({
      name: item.size,
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
  }, [sizeData, metric]);

  // Prepare export configuration
  const exportConfig: ReportExportConfig = React.useMemo(() => {
    if (!sizeData?.results) {
      return {
        title: "Sales by variant option",
        filename: "variant-option-sales-report",
        columns: [],
        data: [],
      };
    }

    return {
      title: "Sales by variant option",
      filename: `variant-option-sales-${filters.dateFrom || "all"}-to-${filters.dateTo || "all"}`,
      columns: [
        {
          header: "Variant option (size field)",
          key: "size",
          width: 22,
        },
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
      data: sizeData.results.map((item) => ({
        size: item.size,
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
          sizeData.summary.totalRevenue || "0",
        ),
        "Total Items Sold": (
          sizeData.summary.totalQuantity || 0
        ).toLocaleString(),
        "Total Orders": (sizeData.summary.totalOrders || 0).toLocaleString(),
        "Variant options": (sizeData.summary.sizeCount || 0).toString(),
      },
      dateRange:
        filters.dateFrom && filters.dateTo
          ? { from: filters.dateFrom, to: filters.dateTo }
          : undefined,
    };
  }, [sizeData, filters]);

  // Loading state
  if (isLoading && !sizeData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Sales by variant option
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Uses each product&apos;s primary variant field (labeled &quot;size&quot;
            in the API)—works for packs, grades, potency, SKU options, and more.
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
          <h1 className="text-2xl font-bold text-white">
            Sales by variant option
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Variant-level rollups from your sales ledger
          </p>
        </div>
        <ErrorBanner
          message={(error as Error).message || "Failed to load size data"}
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
          <h1 className="text-2xl font-bold text-white">
            Sales by variant option
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Source: /reports/by-size/ (variant dimension stored as{" "}
            <code className="text-white/60">size</code>)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReportExportButtons
            config={exportConfig}
            disabled={!sizeData?.results?.length}
          />
          <DashboardFilterBar
            onRefresh={handleRefresh}
            isRefreshing={isLoading}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KPICard
          title="Total Revenue"
          value={formatFullCurrency(sizeData?.summary.totalRevenue || "0")}
          subtitle="All variant options"
          icon={DollarSign}
        />
        <KPICard
          title="Items Sold"
          value={(sizeData?.summary.totalQuantity || 0).toLocaleString()}
          subtitle="Total quantity"
          icon={Package}
        />
        <KPICard
          title="Total Orders"
          value={(sizeData?.summary.totalOrders || 0).toLocaleString()}
          subtitle="Unique orders"
          icon={ShoppingCart}
        />
        <KPICard
          title="Variant options"
          value={(sizeData?.summary.sizeCount || 0).toLocaleString()}
          subtitle="Distinct option values"
          icon={Layers}
        />
      </div>

      {/* Variant option bar chart */}
      <SectionCard
        title="Sales by variant option"
        description={`By ${metric === "revenue" ? "revenue" : "quantity sold"}`}
        icon={BarChart3}
        action={
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => setMetric("revenue")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                metric === "revenue"
                  ? "bg-[#c4a574] text-white font-medium"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Revenue
            </button>
            <button
              onClick={() => setMetric("quantity")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                metric === "quantity"
                  ? "bg-[#c4a574] text-white font-medium"
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
              margin={{ left: 10, right: 20, bottom: 20 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
              />
              <XAxis
                dataKey="name"
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickFormatter={(value) =>
                  metric === "revenue"
                    ? formatCurrency(value)
                    : value.toLocaleString()
                }
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
                labelStyle={{
                  color: "rgba(255,255,255,0.8)",
                  fontWeight: "bold",
                }}
              />
              <Bar dataKey={metric} fill="#c4a574" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No variant-option sales yet"
            description="Sold lines with a variant option (API size field) will appear here across any vertical."
          />
        )}
      </SectionCard>

      {/* Variant option distribution */}
      <SectionCard
        title="Option mix"
        description={`${metric === "revenue" ? "Revenue" : "Quantity"} share by variant option`}
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
                fill="#d4b88a"
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
        Data derived from SaleItem aggregation by product variant size • No
        frontend calculations
      </div>
    </div>
  );
}
