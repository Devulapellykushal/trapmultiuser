/**
 * Supplier-wise Report Dashboard
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 * ========================================
 *
 * Supplier Performance:
 * - Bar chart (top suppliers by purchase amount)
 * - Toggle: Amount / Quantity
 * - Pie chart for distribution
 *
 * Data from:
 * - /reports/by-supplier/
 */
"use client";

import * as React from "react";
import {
  Truck,
  BarChart3,
  DollarSign,
  Package,
  ClipboardList,
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
import { useDashboardFilters, useSupplierReport } from "@/hooks";

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

export default function SupplierReportsPage() {
  const { filters } = useDashboardFilters();
  const [metric, setMetric] = React.useState<"amount" | "quantity">("amount");

  // Fetch supplier report
  const {
    data: supplierData,
    isLoading,
    error,
    refetch,
  } = useSupplierReport({
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
    if (!supplierData?.results) return [];

    return supplierData.results.slice(0, 10).map((item) => ({
      name:
        item.supplierName.length > 15
          ? item.supplierName.substring(0, 15) + "..."
          : item.supplierName,
      fullName: item.supplierName,
      code: item.supplierCode,
      amount: parseFloat(item.totalAmount),
      quantity: item.quantityOrdered,
      received: item.quantityReceived,
      orders: item.orderCount,
      products: item.productCount,
    }));
  }, [supplierData]);

  // Prepare pie chart data (top 6 + Others)
  const pieChartData = React.useMemo(() => {
    if (!supplierData?.results) return [];

    const top6 = supplierData.results.slice(0, 6);
    const others = supplierData.results.slice(6);

    const result = top6.map((item) => ({
      name: item.supplierName,
      value:
        metric === "amount"
          ? parseFloat(item.totalAmount)
          : item.quantityOrdered,
    }));

    if (others.length > 0) {
      const othersTotal = others.reduce(
        (sum, item) =>
          sum +
          (metric === "amount"
            ? parseFloat(item.totalAmount)
            : item.quantityOrdered),
        0,
      );
      result.push({ name: "Others", value: othersTotal });
    }

    return result;
  }, [supplierData, metric]);

  // Prepare export configuration
  const exportConfig: ReportExportConfig = React.useMemo(() => {
    if (!supplierData?.results) {
      return {
        title: "Supplier-wise Report",
        filename: "supplier-report",
        columns: [],
        data: [],
      };
    }

    return {
      title: "Supplier-wise Report",
      filename: `supplier-report-${filters.dateFrom || "all"}-to-${filters.dateTo || "all"}`,
      columns: [
        { header: "Supplier Name", key: "supplierName", width: 30 },
        { header: "Supplier Code", key: "supplierCode", width: 15 },
        {
          header: "Total Amount (₹)",
          key: "totalAmount",
          width: 20,
          align: "right" as const,
        },
        {
          header: "Qty Ordered",
          key: "quantityOrdered",
          width: 15,
          align: "right" as const,
        },
        {
          header: "Qty Received",
          key: "quantityReceived",
          width: 15,
          align: "right" as const,
        },
        {
          header: "Order Count",
          key: "orderCount",
          width: 12,
          align: "right" as const,
        },
        {
          header: "Product Count",
          key: "productCount",
          width: 12,
          align: "right" as const,
        },
      ],
      data: supplierData.results.map((item) => ({
        supplierName: item.supplierName,
        supplierCode: item.supplierCode,
        totalAmount: parseFloat(item.totalAmount).toFixed(2),
        quantityOrdered: item.quantityOrdered,
        quantityReceived: item.quantityReceived,
        orderCount: item.orderCount,
        productCount: item.productCount,
      })),
      summary: {
        "Total Purchase Amount": formatFullCurrency(
          supplierData.summary.totalAmount || "0",
        ),
        "Total Quantity Ordered": (
          supplierData.summary.totalQuantity || 0
        ).toLocaleString(),
        "Total Orders": (
          supplierData.summary.totalOrders || 0
        ).toLocaleString(),
        Suppliers: (supplierData.summary.supplierCount || 0).toString(),
      },
      dateRange:
        filters.dateFrom && filters.dateTo
          ? { from: filters.dateFrom, to: filters.dateTo }
          : undefined,
    };
  }, [supplierData, filters]);

  // Loading state
  if (isLoading && !supplierData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Supplier-wise Report
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Purchases breakdown by supplier
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
            Supplier-wise Report
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Purchases breakdown by supplier
          </p>
        </div>
        <ErrorBanner
          message={(error as Error).message || "Failed to load supplier data"}
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
            Supplier-wise Report
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Purchases breakdown by supplier • Data from /reports/by-supplier/
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReportExportButtons
            config={exportConfig}
            disabled={!supplierData?.results?.length}
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
          title="Total Amount"
          value={formatFullCurrency(supplierData?.summary.totalAmount || "0")}
          subtitle="Purchase value"
          icon={DollarSign}
        />
        <KPICard
          title="Items Ordered"
          value={(supplierData?.summary.totalQuantity || 0).toLocaleString()}
          subtitle="Total quantity"
          icon={Package}
        />
        <KPICard
          title="Purchase Orders"
          value={(supplierData?.summary.totalOrders || 0).toLocaleString()}
          subtitle="Total POs"
          icon={ClipboardList}
        />
        <KPICard
          title="Suppliers"
          value={(supplierData?.summary.supplierCount || 0).toLocaleString()}
          subtitle="Active suppliers"
          icon={Truck}
        />
      </div>

      {/* Supplier Bar Chart */}
      <SectionCard
        title="Top Suppliers"
        description={`By ${metric === "amount" ? "purchase amount" : "quantity ordered"}`}
        icon={BarChart3}
        action={
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => setMetric("amount")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                metric === "amount"
                  ? "bg-[#6366F1] text-white font-medium"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Amount
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
                  metric === "amount"
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
                    name === "amount"
                      ? formatFullCurrency(numValue)
                      : numValue.toLocaleString(),
                    name === "amount" ? "Amount" : "Quantity",
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
            title="No supplier data"
            description="Supplier data will appear once you have processed purchase orders."
          />
        )}
      </SectionCard>

      {/* Supplier Distribution Pie Chart */}
      <SectionCard
        title="Supplier Distribution"
        description={`${metric === "amount" ? "Amount" : "Quantity"} share by supplier`}
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
                  return `${n.length > 10 ? n.substring(0, 10) + "..." : n} (${((percent ?? 0) * 100).toFixed(0)}%)`;
                }}
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
                  metric === "amount"
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
            description="Distribution chart will appear once you have purchase order data."
          />
        )}
      </SectionCard>

      {/* Data Source Attribution */}
      <div className="text-xs text-white/30 text-center py-4">
        Data derived from PurchaseOrderItem aggregation by supplier • No
        frontend calculations
      </div>
    </div>
  );
}
