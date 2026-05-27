/**
 * Supplier Sales Report Dashboard
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 * ========================================
 *
 * Shows which suppliers' products are selling best:
 * - Bar chart (top suppliers by sales revenue)
 * - Toggle: Revenue / Quantity
 * - Pie chart for sales distribution
 *
 * Data from:
 * - /reports/by-supplier-sales/
 */
"use client";

import * as React from "react";
import {
  Truck,
  BarChart3,
  DollarSign,
  Package,
  ShoppingCart,
  PieChart,
  TrendingUp,
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
import { useDashboardFilters } from "@/hooks";
import { useQuery } from "@tanstack/react-query";
import { reportsService } from "@/services";

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

export default function SupplierSalesReportsPage() {
  const { filters } = useDashboardFilters();
  const [metric, setMetric] = React.useState<"revenue" | "quantity">("revenue");

  // Fetch supplier sales report
  const {
    data: supplierSalesData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["supplierSales", filters],
    queryFn: () =>
      reportsService.getSupplierSales({
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        warehouseId: filters.warehouseId || undefined,
      }),
  });

  // Prepare chart data
  const chartData = React.useMemo(() => {
    if (!supplierSalesData?.results) return [];
    return supplierSalesData.results.slice(0, 10).map((item) => ({
      name:
        item.supplierName.length > 12
          ? item.supplierName.slice(0, 12) + "..."
          : item.supplierName,
      fullName: item.supplierName,
      revenue: parseFloat(item.totalRevenue),
      quantity: item.quantitySold,
      products: item.productCount,
      sales: item.saleCount,
    }));
  }, [supplierSalesData]);

  // Prepare pie chart data
  const pieData = React.useMemo(() => {
    if (!supplierSalesData?.results) return [];
    const top5 = supplierSalesData.results.slice(0, 5);
    const others = supplierSalesData.results.slice(5);

    const data = top5.map((item) => ({
      name: item.supplierName,
      value:
        metric === "revenue"
          ? parseFloat(item.totalRevenue)
          : item.quantitySold,
    }));

    if (others.length > 0) {
      const othersTotal = others.reduce(
        (sum, item) =>
          sum +
          (metric === "revenue"
            ? parseFloat(item.totalRevenue)
            : item.quantitySold),
        0,
      );
      data.push({ name: "Others", value: othersTotal });
    }

    return data;
  }, [supplierSalesData, metric]);

  // Export configuration
  const exportConfig: ReportExportConfig = React.useMemo(() => {
    if (!supplierSalesData?.results) {
      return {
        title: "Supplier Sales Report",
        filename: "supplier-sales-report",
        columns: [],
        data: [],
      };
    }

    return {
      title: "Supplier Sales Report",
      filename: `supplier-sales-report-${filters.dateFrom || "all"}-to-${filters.dateTo || "all"}`,
      columns: [
        { header: "Supplier Name", key: "supplierName", width: 30 },
        { header: "Code", key: "supplierCode", width: 12 },
        {
          header: "Qty Sold",
          key: "quantitySold",
          width: 12,
          align: "right" as const,
        },
        {
          header: "Revenue (₹)",
          key: "totalRevenue",
          width: 20,
          align: "right" as const,
        },
        {
          header: "GST (₹)",
          key: "totalGst",
          width: 15,
          align: "right" as const,
        },
        {
          header: "Products",
          key: "productCount",
          width: 12,
          align: "right" as const,
        },
        {
          header: "Sales",
          key: "saleCount",
          width: 12,
          align: "right" as const,
        },
      ],
      data: supplierSalesData.results.map((item) => ({
        supplierName: item.supplierName,
        supplierCode: item.supplierCode || "-",
        quantitySold: item.quantitySold,
        totalRevenue: parseFloat(item.totalRevenue).toFixed(2),
        totalGst: parseFloat(item.totalGst).toFixed(2),
        productCount: item.productCount,
        saleCount: item.saleCount,
      })),
      summary: {
        "Total Revenue": formatFullCurrency(
          supplierSalesData.summary.totalRevenue,
        ),
        "Total GST": formatFullCurrency(supplierSalesData.summary.totalGst),
        "Total Quantity Sold":
          supplierSalesData.summary.totalQuantity.toLocaleString(),
        "Total Sales": supplierSalesData.summary.totalSales.toLocaleString(),
        "Active Suppliers":
          supplierSalesData.summary.supplierCount.toLocaleString(),
      },
      dateRange:
        filters.dateFrom && filters.dateTo
          ? { from: filters.dateFrom, to: filters.dateTo }
          : undefined,
    };
  }, [supplierSalesData, filters]);

  // Custom tooltip for bar chart
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{
      payload: {
        fullName: string;
        revenue: number;
        quantity: number;
        products: number;
      };
    }>;
  }) => {
    if (!active || !payload?.length) return null;
    const data = payload[0].payload;
    return (
      <div className="bg-[#1A1B23] border border-white/10 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-white font-medium text-sm">{data.fullName}</p>
        <p className="text-[#6366F1] text-sm">
          Revenue: {formatFullCurrency(data.revenue)}
        </p>
        <p className="text-[#6F7285] text-xs">
          Qty Sold: {data.quantity.toLocaleString()}
        </p>
        <p className="text-[#6F7285] text-xs">Products: {data.products}</p>
      </div>
    );
  };

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <DashboardFilterBar />
        <ErrorBanner
          message="Failed to load supplier sales report"
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <DashboardFilterBar />

      {/* Header with Export */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F5F6FA]">
            Supplier Sales Performance
          </h1>
          <p className="text-sm text-[#6F7285] mt-1">
            Track which suppliers&apos; products are selling best
          </p>
        </div>
        <ReportExportButtons config={exportConfig} />
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-24 bg-[#1A1B23] rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : supplierSalesData?.summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            title="Total Revenue"
            value={formatCurrency(supplierSalesData.summary.totalRevenue)}
            icon={DollarSign}
          />
          <KPICard
            title="Quantity Sold"
            value={supplierSalesData.summary.totalQuantity.toLocaleString()}
            icon={Package}
          />
          <KPICard
            title="Total Sales"
            value={supplierSalesData.summary.totalSales.toLocaleString()}
            icon={ShoppingCart}
          />
          <KPICard
            title="Active Suppliers"
            value={supplierSalesData.summary.supplierCount.toLocaleString()}
            icon={Truck}
          />
        </div>
      ) : null}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart - Top Suppliers */}
        <SectionCard
          title="Top Suppliers by Sales"
          icon={BarChart3}
          className="lg:col-span-2"
          action={
            <div className="flex gap-1 bg-[#0E0F13] rounded-lg p-1">
              <button
                onClick={() => setMetric("revenue")}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  metric === "revenue"
                    ? "bg-[#6366F1] text-white font-medium"
                    : "text-[#A1A4B3] hover:text-white"
                }`}
              >
                Revenue
              </button>
              <button
                onClick={() => setMetric("quantity")}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  metric === "quantity"
                    ? "bg-[#6366F1] text-white font-medium"
                    : "text-[#A1A4B3] hover:text-white"
                }`}
              >
                Quantity
              </button>
            </div>
          }
        >
          {isLoading ? (
            <ChartSkeleton height={300} />
          ) : chartData.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No sales data"
              description="No supplier sales found for the selected period"
            />
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ left: 10, right: 20, top: 10, bottom: 10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                    horizontal={true}
                    vertical={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: "#6F7285", fontSize: 11 }}
                    tickFormatter={(v) =>
                      metric === "revenue" ? formatCurrency(v) : v.toString()
                    }
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#A1A4B3", fontSize: 11 }}
                    width={80}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey={metric}
                    fill="#6366F1"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        {/* Pie Chart - Distribution */}
        <SectionCard title="Sales Distribution" icon={PieChart}>
          {isLoading ? (
            <ChartSkeleton height={300} />
          ) : pieData.length === 0 ? (
            <EmptyState
              icon={PieChart}
              title="No data"
              description="No supplier data available"
            />
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => {
                      const displayName = String(name || "Unknown");
                      const pct = typeof percent === "number" ? percent : 0;
                      return `${displayName.slice(0, 8)}${displayName.length > 8 ? ".." : ""} ${(
                        pct * 100
                      ).toFixed(0)}%`;
                    }}
                    labelLine={{ stroke: "#6F7285", strokeWidth: 1 }}
                  >
                    {pieData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => (
                      <span className="text-xs text-[#A1A4B3]">{value}</span>
                    )}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Data Table */}
      <SectionCard title="Supplier Sales Details" icon={TrendingUp}>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-12 bg-[#0E0F13] rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : !supplierSalesData?.results?.length ? (
          <EmptyState
            icon={Truck}
            title="No supplier sales data"
            description="No sales data available for the selected period"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left py-3 px-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                    Code
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                    Qty Sold
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                    GST
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                    Products
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                    Sales
                  </th>
                </tr>
              </thead>
              <tbody>
                {supplierSalesData.results.map((item, idx) => (
                  <tr
                    key={item.supplierId || idx}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#6366F1]/20 flex items-center justify-center">
                          <Truck className="w-4 h-4 text-[#6366F1]" />
                        </div>
                        <span className="text-sm font-medium text-[#F5F6FA]">
                          {item.supplierName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-[#A1A4B3]">
                      {item.supplierCode || "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-[#F5F6FA] text-right font-medium">
                      {item.quantitySold.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm text-[#A855F7] text-right font-medium">
                      {formatFullCurrency(item.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-sm text-[#A1A4B3] text-right">
                      {formatFullCurrency(item.totalGst)}
                    </td>
                    <td className="py-3 px-4 text-sm text-[#A1A4B3] text-right">
                      {item.productCount}
                    </td>
                    <td className="py-3 px-4 text-sm text-[#A1A4B3] text-right">
                      {item.saleCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
