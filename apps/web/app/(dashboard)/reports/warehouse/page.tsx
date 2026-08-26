/**
 * Warehouse-wise Sales Report Dashboard
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 * ========================================
 *
 * Warehouse/Store Performance:
 * - Bar chart (warehouses by sales/items)
 * - Toggle: Sales / Items
 * - Pie chart for distribution
 *
 * Data from:
 * - /reports/by-warehouse/
 */
"use client";

import * as React from "react";
import { CHART_SERIES } from "@/lib/brand-colors";
import {
  Warehouse,
  BarChart3,
  DollarSign,
  Package,
  FileText,
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
import { useDashboardFilters, useWarehouseSales } from "@/hooks";

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

export default function WarehouseReportsPage() {
  const { filters } = useDashboardFilters();
  const [metric, setMetric] = React.useState<"sales" | "items">("sales");

  // Fetch warehouse sales
  const {
    data: warehouseData,
    isLoading,
    error,
    refetch,
  } = useWarehouseSales({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    pageSize: 50,
  });

  const handleRefresh = () => {
    refetch();
  };

  // Prepare bar chart data
  const barChartData = React.useMemo(() => {
    if (!warehouseData?.results) return [];

    return warehouseData.results.map((item) => ({
      name:
        item.warehouseName.length > 15
          ? item.warehouseName.substring(0, 15) + "..."
          : item.warehouseName,
      fullName: item.warehouseName,
      code: item.warehouseCode,
      sales: parseFloat(item.totalSales),
      items: item.totalItems,
      invoices: item.invoiceCount,
      gst: parseFloat(item.totalGst),
    }));
  }, [warehouseData]);

  // Prepare pie chart data
  const pieChartData = React.useMemo(() => {
    if (!warehouseData?.results) return [];

    return warehouseData.results.map((item) => ({
      name: item.warehouseName,
      value: metric === "sales" ? parseFloat(item.totalSales) : item.totalItems,
    }));
  }, [warehouseData, metric]);

  // Prepare export configuration
  const exportConfig: ReportExportConfig = React.useMemo(() => {
    if (!warehouseData?.results) {
      return {
        title: "Warehouse-wise Sales Report",
        filename: "warehouse-sales-report",
        columns: [],
        data: [],
      };
    }

    return {
      title: "Warehouse-wise Sales Report",
      filename: `warehouse-sales-report-${filters.dateFrom || "all"}-to-${filters.dateTo || "all"}`,
      columns: [
        { header: "Warehouse Name", key: "warehouseName", width: 30 },
        { header: "Code", key: "warehouseCode", width: 12 },
        {
          header: "Total Sales (₹)",
          key: "totalSales",
          width: 20,
          align: "right" as const,
        },
        {
          header: "Total Items",
          key: "totalItems",
          width: 15,
          align: "right" as const,
        },
        {
          header: "Invoice Count",
          key: "invoiceCount",
          width: 15,
          align: "right" as const,
        },
        {
          header: "Total GST (₹)",
          key: "totalGst",
          width: 18,
          align: "right" as const,
        },
        {
          header: "Avg. Invoice Value (₹)",
          key: "avgInvoiceValue",
          width: 20,
          align: "right" as const,
        },
      ],
      data: warehouseData.results.map((item) => ({
        warehouseName: item.warehouseName,
        warehouseCode: item.warehouseCode,
        totalSales: parseFloat(item.totalSales).toFixed(2),
        totalItems: item.totalItems,
        invoiceCount: item.invoiceCount,
        totalGst: parseFloat(item.totalGst).toFixed(2),
        avgInvoiceValue:
          item.invoiceCount > 0
            ? (parseFloat(item.totalSales) / item.invoiceCount).toFixed(2)
            : "0.00",
      })),
      summary: {
        "Total Sales": formatFullCurrency(
          warehouseData.summary.totalSales || "0",
        ),
        "Total Items Sold": (
          warehouseData.summary.totalItems || 0
        ).toLocaleString(),
        "Total GST": formatFullCurrency(warehouseData.summary.totalGst || "0"),
        Warehouses: (warehouseData.summary.warehouseCount || 0).toString(),
      },
      dateRange:
        filters.dateFrom && filters.dateTo
          ? { from: filters.dateFrom, to: filters.dateTo }
          : undefined,
    };
  }, [warehouseData, filters]);

  // Loading state
  if (isLoading && !warehouseData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Warehouse-wise Sales
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Sales breakdown by warehouse/store
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
            Warehouse-wise Sales
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Sales breakdown by warehouse/store
          </p>
        </div>
        <ErrorBanner
          message={(error as Error).message || "Failed to load warehouse data"}
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
            Warehouse-wise Sales
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Sales breakdown by warehouse/store • Data from
            /reports/by-warehouse/
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReportExportButtons
            config={exportConfig}
            disabled={!warehouseData?.results?.length}
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
          title="Total Sales"
          value={formatFullCurrency(warehouseData?.summary.totalSales || "0")}
          subtitle="All warehouses"
          icon={DollarSign}
        />
        <KPICard
          title="Items Sold"
          value={(warehouseData?.summary.totalItems || 0).toLocaleString()}
          subtitle="Total quantity"
          icon={Package}
        />
        <KPICard
          title="Invoices"
          value={(warehouseData?.summary.invoiceCount || 0).toLocaleString()}
          subtitle="Total invoices"
          icon={FileText}
        />
        <KPICard
          title="Warehouses"
          value={(warehouseData?.summary.warehouseCount || 0).toLocaleString()}
          subtitle="Active locations"
          icon={Warehouse}
        />
      </div>

      {/* Warehouse Bar Chart */}
      <SectionCard
        title="Sales by Warehouse"
        description={`By ${metric === "sales" ? "total sales" : "items sold"}`}
        icon={BarChart3}
        action={
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => setMetric("sales")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                metric === "sales"
                  ? "bg-[#c4a574] text-white font-medium"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Sales
            </button>
            <button
              onClick={() => setMetric("items")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                metric === "items"
                  ? "bg-[#c4a574] text-white font-medium"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Items
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
                  metric === "sales"
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
                    name === "sales"
                      ? formatFullCurrency(numValue)
                      : numValue.toLocaleString(),
                    name === "sales" ? "Sales" : "Items",
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
              <Bar dataKey={metric} fill="#c4a574" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No warehouse sales data"
            description="Warehouse sales will appear once you have completed sales."
          />
        )}
      </SectionCard>

      {/* Warehouse Distribution Pie Chart */}
      <SectionCard
        title="Warehouse Distribution"
        description={`${metric === "sales" ? "Sales" : "Items"} share by warehouse`}
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
                label={({ name, percent }) => {
                  const n = name ?? "";
                  return `${n.length > 12 ? n.substring(0, 12) + "..." : n} (${((percent ?? 0) * 100).toFixed(0)}%)`;
                }}
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
                  metric === "sales"
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
        Data derived from Sale aggregation by warehouse • No frontend
        calculations
      </div>
    </div>
  );
}
