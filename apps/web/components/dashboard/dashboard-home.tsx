/**
 * Dashboard Overview Page (admin home)
 */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart3,
  DollarSign,
  ShoppingCart,
  Receipt,
  Percent,
  TrendingUp,
  Package,
  FileText,
  LayoutDashboard,
  Calendar,
  UserRound,
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
import { PageTransition } from "@/components/layout";
import {
  reportsService,
  SalesSummaryReport,
  SalesTrendsReport,
} from "@/services";
import {
  KPICard,
  ChartSkeleton,
  ErrorBanner,
  EmptyState,
} from "@/components/dashboard";
import { LowStockWidget } from "@/components/notifications";
import {
  normalizeSalesSummary,
  normalizeSalesTrends,
} from "@/hooks/use-reports";
import { adminHref } from "@/lib/admin-routes";

function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

/** Readable Y-axis labels for revenue (avoids ₹0k for small totals in light mode). */
function formatYAxisRevenue(value: number): string {
  const v = Math.abs(value);
  if (v < 1000) return `₹${Math.round(value)}`;
  if (v < 100_000) {
    const k = value / 1000;
    return `₹${v >= 10_000 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  if (v < 10_000_000) return `₹${(value / 100_000).toFixed(1)}L`;
  return formatCurrency(value);
}

export default function DashboardHomePage() {
  const [summary, setSummary] = useState<SalesSummaryReport | null>(null);
  const [trends, setTrends] = useState<SalesTrendsReport | null>(null);
  const [groupBy, setGroupBy] = useState<"day" | "month">("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, trendsRes] = await Promise.all([
        reportsService.getSalesSummary(),
        reportsService.getSalesTrends({ groupBy }),
      ]);
      setSummary(normalizeSalesSummary(summaryRes));
      setTrends(normalizeSalesTrends(trendsRes));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard data",
      );
    } finally {
      setLoading(false);
    }
  }, [groupBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const paddedSinglePeriod = (trends?.results?.length ?? 0) === 1;

  const chartData = useMemo(() => {
    const rawRows = trends?.results ?? [];
    if (rawRows.length === 0) return [];
    if (rawRows.length === 1) {
      const item = rawRows[0];
      const period = formatDate(item.period);
      const revenue = parseFloat(String(item.totalSales));
      const orders = item.invoiceCount;
      const items = item.totalItems;
      return [
        { idx: 0, period, revenue, orders, items },
        { idx: 1, period, revenue, orders, items },
      ];
    }
    return rawRows.map((item) => ({
      period: formatDate(item.period),
      revenue: parseFloat(String(item.totalSales)),
      orders: item.invoiceCount,
      items: item.totalItems,
    }));
  }, [trends]);

  const axisMuted = "var(--text-muted)";
  const axisLine = "var(--border-default)";
  const gridStroke = "var(--border-default)";

  if (loading && !summary) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                <LayoutDashboard className="w-6 h-6 text-[#6366F1]" />
                Dashboard
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Analytics overview from report APIs
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
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6 text-[#6366F1]" />
              Dashboard
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Analytics overview from report APIs
            </p>
          </div>
          <ErrorBanner message={error} onRetry={fetchData} />
        </div>
      </PageTransition>
    );
  }

  if (!summary || summary.invoiceCount === 0) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6 text-[#6366F1]" />
              Dashboard
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Analytics overview from report APIs
            </p>
          </div>
          <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)]">
            <EmptyState
              icon={LayoutDashboard}
              title="No sales data yet"
              description="Start making sales through the POS system to see analytics here. All data is derived from your sales and inventory records."
              action={{
                label: "Go to POS",
                onClick: () => {
                  window.location.href = "/pos";
                },
              }}
            />
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6 text-[#6366F1]" />
              Dashboard
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Data derived from Phase 16 report APIs • No frontend calculations
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as "day" | "month")}
              className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50"
            >
              <option value="day">Daily</option>
              <option value="month">Monthly</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            title="Total Revenue"
            value={formatCurrency(summary.totalSales)}
            subtitle="All completed sales"
            icon={DollarSign}
          />
          <KPICard
            title="Total Orders"
            value={summary.invoiceCount}
            subtitle="Invoices generated"
            icon={ShoppingCart}
          />
          <KPICard
            title="Items Sold"
            value={summary.totalItemsSold}
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

        <div className="bg-[var(--bg-surface)] backdrop-blur-sm rounded-xl border border-[var(--border-default)] p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sales Trend</h2>
              <p className="text-sm text-[var(--text-muted)]">
                {groupBy === "day" ? "Daily" : "Monthly"} revenue from completed
                sales
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#6366F1]"></div>
                <span className="text-[var(--text-secondary)]">Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#A855F7]"></div>
                <span className="text-[var(--text-secondary)]">Orders</span>
              </div>
            </div>
          </div>

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={gridStroke}
                  opacity={0.55}
                />
                {paddedSinglePeriod ? (
                  <XAxis
                    dataKey="idx"
                    type="number"
                    domain={[0, 1]}
                    ticks={[0.5]}
                    tickFormatter={() => chartData[0]?.period ?? ""}
                    tick={{ fill: axisMuted, fontSize: 12 }}
                    axisLine={{ stroke: axisLine }}
                  />
                ) : (
                  <XAxis
                    dataKey="period"
                    tick={{ fill: axisMuted, fontSize: 12 }}
                    axisLine={{ stroke: axisLine }}
                  />
                )}
                <YAxis
                  yAxisId="left"
                  tick={{ fill: axisMuted, fontSize: 12 }}
                  axisLine={{ stroke: axisLine }}
                  tickFormatter={formatYAxisRevenue}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: axisMuted, fontSize: 12 }}
                  axisLine={{ stroke: axisLine }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "8px",
                    color: "var(--text-primary)",
                  }}
                  formatter={(value, name) => {
                    if (value === undefined) return ["-", name];
                    const numValue = Number(value);
                    return [
                      name === "revenue" ? formatCurrency(numValue) : numValue,
                      name === "revenue" ? "Revenue" : "Orders",
                    ];
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke="#6366F1"
                  strokeWidth={2}
                  dot={{ fill: "#6366F1", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "#6366F1" }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  stroke="#A855F7"
                  strokeWidth={2}
                  dot={{ fill: "#A855F7", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "#A855F7" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="No trend data available"
              description="Sales trends will appear here once you have sales data across multiple periods."
            />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[var(--bg-surface)] backdrop-blur-sm rounded-xl border border-[var(--border-default)] p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5">
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "New Sale", icon: ShoppingCart, href: "/pos" },
                { label: "Inventory", icon: Package, href: adminHref("/inventory") },
                { label: "Sales", icon: FileText, href: adminHref("/invoices") },
                { label: "Reports", icon: BarChart3, href: adminHref("/reports") },
                { label: "Customers", icon: UserRound, href: adminHref("/customers") },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <a
                    key={action.label}
                    href={action.href}
                    className="flex items-center gap-3 p-4 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all group"
                  >
                    <div className="p-2 rounded-md bg-[#6366F1]/10 group-hover:bg-[#6366F1]/15 transition-colors">
                      <Icon className="w-4 h-4 text-[#6366F1] stroke-[1.5]" />
                    </div>
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {action.label}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>

          <LowStockWidget maxItems={5} />
        </div>
      </div>
    </PageTransition>
  );
}
