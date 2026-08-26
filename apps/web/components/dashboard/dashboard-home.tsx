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
  Store,
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
import { useLocationLabels } from "@/hooks/use-business-setup";
import { adminHref } from "@/lib/admin-routes";
import { localYmd } from "@/lib/local-date";

type PeriodKey = "today" | "month" | "all";

function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const safe = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safe);
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n || 0);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function periodRange(period: PeriodKey): {
  dateFrom?: string;
  dateTo?: string;
  label: string;
  groupBy: "day" | "month";
} {
  const now = new Date();
  const today = localYmd(now);
  switch (period) {
    case "today":
      return {
        dateFrom: today,
        dateTo: today,
        label: "Today",
        groupBy: "day",
      };
    case "month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        dateFrom: localYmd(first),
        dateTo: today,
        label: now.toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric",
        }),
        groupBy: "day",
      };
    }
    case "all":
      return { label: "All time", groupBy: "month" };
    default: {
      const _exhaustive: never = period;
      return _exhaustive;
    }
  }
}

/** Readable Y-axis labels for revenue. */
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
  const { isSharedGodown, isGodownAndShops, labels } = useLocationLabels();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [summary, setSummary] = useState<SalesSummaryReport | null>(null);
  const [trends, setTrends] = useState<SalesTrendsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => periodRange(period), [period]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      };
      const [summaryRes, trendsRes] = await Promise.all([
        reportsService.getSalesSummary(params),
        reportsService.getSalesTrends({
          ...params,
          groupBy: range.groupBy,
        }),
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
  }, [range.dateFrom, range.dateTo, range.groupBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh after POS sale / when tab becomes visible again
  useEffect(() => {
    const onSalesUpdated = () => {
      void fetchData();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchData();
      }
    };
    window.addEventListener("quake:sales-updated", onSalesUpdated);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("quake:sales-updated", onSalesUpdated);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchData]);

  const paddedSinglePeriod = (trends?.results?.length ?? 0) === 1;

  const chartData = useMemo(() => {
    const rawRows = trends?.results ?? [];
    if (rawRows.length === 0) return [];
    if (rawRows.length === 1) {
      const item = rawRows[0];
      const periodLabel = formatDate(item.period);
      const revenue = parseFloat(String(item.totalSales)) || 0;
      const orders = item.invoiceCount;
      const items = item.totalItems;
      return [
        { idx: 0, period: periodLabel, revenue, orders, items },
        { idx: 1, period: periodLabel, revenue, orders, items },
      ];
    }
    return rawRows.map((item) => ({
      period: formatDate(item.period),
      revenue: parseFloat(String(item.totalSales)) || 0,
      orders: item.invoiceCount,
      items: item.totalItems,
    }));
  }, [trends]);

  const shopRows = useMemo(() => {
    const rows = summary?.byStore ?? [];
    if (!isGodownAndShops) return [];
    // Only show when at least one sale is attributed to a shop
    const attributed = rows.filter((r) => r.storeId);
    return attributed.length > 0 ? rows : [];
  }, [summary?.byStore, isGodownAndShops]);

  const axisMuted = "var(--text-muted)";
  const axisLine = "var(--border-default)";
  const gridStroke = "var(--border-default)";

  const periodButtons: { key: PeriodKey; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "month", label: "This month" },
    { key: "all", label: "All time" },
  ];

  if (loading && !summary) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                <LayoutDashboard className="w-6 h-6 text-[#c4a574]" />
                Dashboard
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Loading sales for {range.label}…
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
              <LayoutDashboard className="w-6 h-6 text-[#c4a574]" />
              Dashboard
            </h1>
          </div>
          <ErrorBanner message={error} onRetry={fetchData} />
        </div>
      </PageTransition>
    );
  }

  const hasSales = (summary?.invoiceCount ?? 0) > 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6 text-[#c4a574]" />
              Dashboard
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Completed sales · {range.label}
              {isSharedGodown
                ? ` · Stock from ${labels.warehouseSingularTitle.toLowerCase()}, sales by shop`
                : ""}
            </p>
          </div>

          <div className="flex bg-[var(--bg-surface)] rounded-lg p-0.5 border border-[var(--border-default)]">
            {periodButtons.map((btn) => (
              <button
                key={btn.key}
                type="button"
                onClick={() => setPeriod(btn.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  period === btn.key
                    ? "bg-[#c4a574] text-white"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {!hasSales ? (
          <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)]">
            <EmptyState
              icon={LayoutDashboard}
              title={`No sales ${period === "all" ? "yet" : `in ${range.label.toLowerCase()}`}`}
              description={
                period === "all"
                  ? "Complete a sale at POS to see revenue and orders here."
                  : "Try another period, or make a sale at POS."
              }
              action={{
                label: "Go to POS",
                onClick: () => {
                  window.location.href = "/pos";
                },
              }}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <KPICard
                title="Revenue"
                value={formatCurrency(summary!.totalSales)}
                subtitle={range.label}
                icon={DollarSign}
              />
              <KPICard
                title="Orders"
                value={formatCount(summary!.invoiceCount)}
                subtitle="Completed bills"
                icon={ShoppingCart}
              />
              <KPICard
                title="Items sold"
                value={formatCount(summary!.totalItemsSold)}
                subtitle="Total quantity"
                icon={Package}
              />
              <KPICard
                title="GST (extracted)"
                value={formatCurrency(summary!.totalGst)}
                subtitle="From GST-inclusive prices"
                icon={Receipt}
                tooltip="GST shown for tax reporting. Sale totals already include GST (MRP)."
              />
              <KPICard
                title="Discounts"
                value={formatCurrency(summary!.totalDiscount)}
                subtitle="Off list price"
                icon={Percent}
              />
            </div>

            {shopRows.length > 0 && (
              <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Store className="w-4 h-4 text-[#d4b88a]" />
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    Sales by shop
                  </h2>
                  <span className="text-xs text-[var(--text-muted)]">
                    · {range.label}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {shopRows.map((row) => (
                    <div
                      key={row.storeId ?? row.storeName}
                      className="rounded-lg border border-[var(--border-default)] bg-white/[0.02] px-4 py-3"
                    >
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {row.storeName}
                      </p>
                      <p className="text-xl font-bold text-[var(--text-primary)] mt-1">
                        {formatCurrency(row.totalSales)}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {formatCount(row.invoiceCount)} orders ·{" "}
                        {formatCount(row.totalItemsSold)} items
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-[var(--bg-surface)] backdrop-blur-sm rounded-xl border border-[var(--border-default)] p-6">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    Sales trend
                  </h2>
                  <p className="text-sm text-[var(--text-muted)]">
                    {range.groupBy === "day" ? "Daily" : "Monthly"} revenue ·{" "}
                    {range.label}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#c4a574]" />
                    <span className="text-[var(--text-secondary)]">Revenue</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#d4b88a]" />
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
                      allowDecimals={false}
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
                          name === "revenue"
                            ? formatCurrency(numValue)
                            : formatCount(numValue),
                          name === "revenue" ? "Revenue" : "Orders",
                        ];
                      }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#c4a574"
                      strokeWidth={2}
                      dot={{ fill: "#c4a574", strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: "#c4a574" }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="orders"
                      stroke="#d4b88a"
                      strokeWidth={2}
                      dot={{ fill: "#d4b88a", strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: "#d4b88a" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="No trend points in this period"
                  description="Sales will appear on the chart as you bill more days."
                />
              )}
            </div>
          </>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[var(--bg-surface)] backdrop-blur-sm rounded-xl border border-[var(--border-default)] p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5">
              Quick actions
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "New sale", icon: ShoppingCart, href: "/pos" },
                {
                  label: "Inventory",
                  icon: Package,
                  href: adminHref("/inventory"),
                },
                {
                  label: "Sales",
                  icon: FileText,
                  href: adminHref("/invoices"),
                },
                {
                  label: "Reports",
                  icon: BarChart3,
                  href: adminHref("/reports"),
                },
                {
                  label: "Customers",
                  icon: UserRound,
                  href: adminHref("/customers"),
                },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <a
                    key={action.label}
                    href={action.href}
                    className="flex items-center gap-3 p-4 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all group"
                  >
                    <div className="p-2 rounded-md bg-[#c4a574]/10 group-hover:bg-[#c4a574]/15 transition-colors">
                      <Icon className="w-4 h-4 text-[#c4a574] stroke-[1.5]" />
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
