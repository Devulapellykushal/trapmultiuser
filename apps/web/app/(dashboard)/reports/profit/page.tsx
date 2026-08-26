/**
 * Profit & Tax Dashboard
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 * ========================================
 *
 * ADMIN ONLY
 *
 * Gross Profit:
 * - Total revenue, cost, profit
 * - Overall margin percentage
 * - Top profitable products
 *
 * GST Summary:
 * - GST collected
 * - GST refunded
 * - Net GST liability
 * - Breakdown by rate
 *
 * Data from:
 * - /reports/profit/
 * - /reports/tax/gst/
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  Percent,
  PiggyBank,
  Calculator,
  ShieldAlert,
  RotateCcw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
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
  DataTable,
  Column,
  ReportExportButtons,
} from "@/components/dashboard";
import type { ReportExportConfig } from "@/components/dashboard";
import { useDashboardFilters, useGrossProfit, useGstSummary } from "@/hooks";
import { useAuth } from "@/lib/auth";
import { adminHref } from "@/lib/admin-routes";
import { ProfitItem } from "@/services";
import { CHART_SERIES } from "@/lib/brand-colors";

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

// Format short currency
function formatShortCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (num >= 10000000) {
    return `₹${(num / 10000000).toFixed(1)}Cr`;
  }
  if (num >= 100000) {
    return `₹${(num / 100000).toFixed(1)}L`;
  }
  if (num >= 1000) {
    return `₹${(num / 1000).toFixed(0)}K`;
  }
  return `₹${num.toFixed(0)}`;
}

// GST rate colors
const GST_COLORS = [...CHART_SERIES];

export default function ProfitTaxReportsPage() {
  const { filters } = useDashboardFilters();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [profitPage, setProfitPage] = React.useState(1);

  // Redirect non-admins
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push(adminHref("/reports"));
    }
  }, [authLoading, isAdmin, router]);

  // Fetch gross profit
  const {
    data: profitData,
    isLoading: profitLoading,
    error: profitError,
    refetch: refetchProfit,
  } = useGrossProfit({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    warehouseId: filters.warehouseId || undefined,
    page: profitPage,
    pageSize: 10,
  });

  // Fetch GST summary
  const {
    data: gstData,
    isLoading: gstLoading,
    error: gstError,
    refetch: refetchGst,
  } = useGstSummary({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    warehouseId: filters.warehouseId || undefined,
  });

  const isLoading = profitLoading || gstLoading;
  const error = profitError || gstError;

  const handleRefresh = () => {
    refetchProfit();
    refetchGst();
  };

  // Prepare profit chart data (top 10 by profit)
  const profitChartData = React.useMemo(() => {
    if (!profitData?.results) return [];

    return profitData.results.slice(0, 10).map((item) => ({
      name:
        item.productName.length > 15
          ? item.productName.substring(0, 15) + "..."
          : item.productName,
      fullName: item.productName,
      profit: parseFloat(item.grossProfit),
      margin: parseFloat(item.marginPercent),
      revenue: parseFloat(item.totalRevenue),
    }));
  }, [profitData]);

  // Prepare GST pie chart data
  const gstPieData = React.useMemo(() => {
    if (!gstData?.breakdownByRate) return [];

    return gstData.breakdownByRate.map((item) => ({
      name: `${item.gstRate}%`,
      value: parseFloat(item.gstAmount),
      taxable: parseFloat(item.taxableAmount),
    }));
  }, [gstData]);

  // Profit table columns
  const profitColumns: Column<ProfitItem>[] = [
    {
      key: "product",
      header: "Product",
      render: (item) => (
        <div>
          <p className="text-white font-medium">{item.productName}</p>
          <p className="text-white/40 text-xs">{item.sku}</p>
        </div>
      ),
    },
    {
      key: "quantitySold",
      header: "Qty Sold",
      align: "right",
      render: (item) => (
        <span className="text-white/70">
          {item.quantitySold.toLocaleString()}
        </span>
      ),
    },
    {
      key: "totalRevenue",
      header: "Revenue",
      align: "right",
      render: (item) => (
        <span className="text-white">{formatCurrency(item.totalRevenue)}</span>
      ),
    },
    {
      key: "totalCost",
      header: "Cost",
      align: "right",
      render: (item) => (
        <span className="text-white/60">{formatCurrency(item.totalCost)}</span>
      ),
    },
    {
      key: "grossProfit",
      header: "Profit",
      align: "right",
      render: (item) => {
        const profit = parseFloat(item.grossProfit);
        return (
          <span
            className={
              profit >= 0
                ? "text-emerald-400 font-medium"
                : "text-rose-400 font-medium"
            }
          >
            {formatCurrency(item.grossProfit)}
          </span>
        );
      },
    },
    {
      key: "marginPercent",
      header: "Margin",
      align: "right",
      render: (item) => {
        const margin = parseFloat(item.marginPercent);
        return (
          <span
            className={`font-medium ${
              margin >= 20
                ? "text-emerald-400"
                : margin >= 10
                  ? "text-amber-400"
                  : "text-rose-400"
            }`}
          >
            {item.marginPercent}%
          </span>
        );
      },
    },
  ];

  // Prepare export configuration
  const exportConfig: ReportExportConfig = React.useMemo(() => {
    if (!profitData?.results) {
      return {
        title: "Profit & Tax Report",
        filename: "profit-tax-report",
        columns: [],
        data: [],
      };
    }

    return {
      title: "Profit & Tax Report",
      filename: `profit-tax-report-${filters.dateFrom || "all"}-to-${filters.dateTo || "all"}`,
      columns: [
        { header: "Product Name", key: "productName", width: 30 },
        { header: "SKU", key: "sku", width: 15 },
        {
          header: "Qty Sold",
          key: "quantitySold",
          width: 12,
          align: "right" as const,
        },
        {
          header: "Revenue (₹)",
          key: "totalRevenue",
          width: 18,
          align: "right" as const,
        },
        {
          header: "Cost (₹)",
          key: "totalCost",
          width: 18,
          align: "right" as const,
        },
        {
          header: "Gross Profit (₹)",
          key: "grossProfit",
          width: 18,
          align: "right" as const,
        },
        {
          header: "Margin %",
          key: "marginPercent",
          width: 12,
          align: "right" as const,
        },
      ],
      data: profitData.results.map((item) => ({
        productName: item.productName,
        sku: item.sku,
        quantitySold: item.quantitySold,
        totalRevenue: parseFloat(item.totalRevenue).toFixed(2),
        totalCost: parseFloat(item.totalCost).toFixed(2),
        grossProfit: parseFloat(item.grossProfit).toFixed(2),
        marginPercent: item.marginPercent + "%",
      })),
      summary: {
        "Total Revenue": formatCurrency(
          profitData.summary?.totalRevenue || "0",
        ),
        "Total Cost": formatCurrency(profitData.summary?.totalCost || "0"),
        "Gross Profit": formatCurrency(profitData.summary?.grossProfit || "0"),
        "Overall Margin":
          (profitData.summary?.overallMarginPercent || "0") + "%",
        "GST Collected": formatCurrency(gstData?.gstCollected || "0"),
        "GST Refunded": formatCurrency(gstData?.gstRefunded || "0"),
        "Net GST Liability": formatCurrency(gstData?.netGstLiability || "0"),
      },
      dateRange:
        filters.dateFrom && filters.dateTo
          ? { from: filters.dateFrom, to: filters.dateTo }
          : undefined,
    };
  }, [profitData, gstData, filters]);

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
  if (isLoading && !profitData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Profit & Tax</h1>
          <p className="text-sm text-white/40 mt-1">
            Financial performance and GST liability
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <KPICard key={i} title="" value="" loading />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton height={300} />
          <ChartSkeleton height={300} />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Profit & Tax</h1>
          <p className="text-sm text-white/40 mt-1">
            Financial performance and GST liability
          </p>
        </div>
        <ErrorBanner
          message={(error as Error).message || "Failed to load financial data"}
          onRetry={handleRefresh}
        />
      </div>
    );
  }

  const overallMargin = parseFloat(
    profitData?.summary?.overallMarginPercent || "0",
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">Profit & Tax</h1>
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded">
              Admin Only
            </span>
          </div>
          <p className="text-sm text-white/40">
            Financial data • From /reports/profit/ and /reports/tax/gst/
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReportExportButtons
            config={exportConfig}
            disabled={!profitData?.results?.length}
          />
          <DashboardFilterBar
            onRefresh={handleRefresh}
            isRefreshing={isLoading}
          />
        </div>
      </div>

      {/* Profit KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard
          title="Total Revenue"
          value={formatCurrency(profitData?.summary?.totalRevenue || "0")}
          subtitle="From sales"
          icon={DollarSign}
        />
        <KPICard
          title="Total Cost"
          value={formatCurrency(profitData?.summary?.totalCost || "0")}
          subtitle="Product cost"
          icon={TrendingDown}
        />
        <KPICard
          title="Gross Profit"
          value={formatCurrency(profitData?.summary?.grossProfit || "0")}
          subtitle="Revenue - Cost"
          icon={PiggyBank}
        />
        <KPICard
          title="Overall Margin"
          value={`${profitData?.summary?.overallMarginPercent || "0"}%`}
          subtitle={overallMargin >= 15 ? "Healthy" : "Review pricing"}
          icon={Percent}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit by Product */}
        <SectionCard
          title="Top Profitable Products"
          description="By gross profit amount"
          icon={TrendingUp}
        >
          {profitChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={profitChartData} layout="vertical">
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
                  tickFormatter={formatShortCurrency}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(6, 6, 8, 0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "white",
                  }}
                  formatter={(value) => {
                    if (value === undefined) return ["-", "Gross Profit"];
                    return [formatCurrency(Number(value)), "Gross Profit"];
                  }}
                  labelFormatter={(label, payload) =>
                    payload?.[0]?.payload?.fullName || label
                  }
                  labelStyle={{
                    color: "rgba(255,255,255,0.8)",
                    fontWeight: "bold",
                  }}
                />
                <Bar dataKey="profit" fill="#c4a574" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="No profit data"
              description="Profit data will appear once you have sales."
            />
          )}
        </SectionCard>

        {/* GST Breakdown */}
        <SectionCard
          title="GST Breakdown"
          description="Tax collected by rate"
          icon={Calculator}
        >
          {gstPieData.length > 0 && gstPieData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={gstPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {gstPieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={GST_COLORS[index % GST_COLORS.length]}
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
                  formatter={(value) => {
                    if (value === undefined) return ["-", "GST Amount"];
                    return [formatCurrency(Number(value)), "GST Amount"];
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-white/60 text-sm">{value} GST</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={Receipt}
              title="No GST data"
              description="GST breakdown will appear once you have taxable sales."
            />
          )}
        </SectionCard>
      </div>

      {/* GST Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          title="GST Collected"
          value={formatCurrency(gstData?.gstCollected || "0")}
          subtitle="From sales"
          icon={Receipt}
        />
        <KPICard
          title="GST Refunded"
          value={formatCurrency(gstData?.gstRefunded || "0")}
          subtitle="From returns"
          icon={RotateCcw}
        />
        <KPICard
          title="Net GST Liability"
          value={formatCurrency(gstData?.netGstLiability || "0")}
          subtitle="Collected - Refunded"
          icon={Calculator}
        />
      </div>

      {/* Profit Detail Table */}
      <SectionCard
        title="Profit by Product"
        description="Detailed profit breakdown per product"
        icon={DollarSign}
      >
        {profitError ? (
          <ErrorBanner
            message={
              (profitError as Error).message || "Failed to load profit data"
            }
            onRetry={refetchProfit}
          />
        ) : (
          <DataTable
            data={profitData?.results || []}
            columns={profitColumns}
            keyExtractor={(item) => item.productId}
            loading={profitLoading}
            emptyMessage="No profit data for the selected period"
            pagination={
              profitData
                ? {
                    page: profitData.page,
                    pageSize: profitData.pageSize,
                    total: profitData.total,
                    onPageChange: setProfitPage,
                  }
                : undefined
            }
          />
        )}
      </SectionCard>

      {/* Data Source Attribution */}
      <div className="text-xs text-white/30 text-center py-4">
        Profit derived from (selling_price - cost_price) × quantity • No
        frontend calculations
      </div>
    </div>
  );
}
