"use client";

import * as React from "react";
import { DollarSign, ShoppingCart, TrendingUp, Wallet, Calendar, Building2, ChevronDown, BarChart3 } from "lucide-react";
import { PageTransition } from "@/components/layout";
import { KPICard, RevenueChart, InventoryHealth, DiscountImpact, PerformanceList } from "@/components/analytics";
import { EmptyState, emptyStates } from "@/components/ui/empty-state";
import { SkeletonCard, SkeletonChart } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { usePerformanceOverview, useSalesTrends } from "@/hooks";

// Format currency helper
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface TrendItem {
  date: string;
  revenue: number;
}

// API response structure for sales trends
interface TrendsResponse {
  labels?: string[];
  datasets?: {
    salesCount?: number[];
    revenue?: string[];
    unitsSold?: number[];
  };
}

export default function AnalyticsPage() {
  const { data, isLoading, isError, refetch } = usePerformanceOverview();
  const { data: trendsData } = useSalesTrends();

  // Transform trends data for chart - API returns { labels, datasets } structure
  const revenueByDay: TrendItem[] = React.useMemo(() => {
    if (!trendsData) return [];
    const response = trendsData as TrendsResponse;
    if (!response.labels || !response.datasets?.revenue) return [];
    
    return response.labels.map((label, index) => ({
      date: label,
      revenue: parseFloat(response.datasets?.revenue?.[index] || '0') || 0,
    }));
  }, [trendsData]);

  // Check if there's any data (using snake_case as API types not fully updated)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kpis = data?.kpis as any;
  const hasData = data && kpis && (kpis.totalSales > 0 || kpis.total_sales > 0);

  // Loading state
  if (isLoading) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[#f3eee4] flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[#c4a574]" />
              Analytics
            </h1>
            <p className="text-sm text-[#8a867c] mt-1">Loading analytics...</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <SkeletonChart />
        </div>
      </PageTransition>
    );
  }

  // Error state
  if (isError) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-[#f3eee4] flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#c4a574]" />
            Analytics
          </h1>
          <div className="rounded-xl bg-[#111318]/60 border border-white/[0.08]">
            <ErrorState 
              message="Could not load analytics. Check if backend is running."
              onRetry={() => refetch()}
            />
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#f3eee4] flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[#c4a574]" />
              Analytics
            </h1>
            <p className="text-sm text-[#8a867c] mt-1">Business intelligence & insights</p>
          </div>
          
          {/* Selectors */}
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] text-sm hover:bg-white/[0.08] transition-colors">
              <Calendar className="w-4 h-4 stroke-[1.5]" />
              <span>Last 30 Days</span>
              <ChevronDown className="w-4 h-4 text-[#8a867c]" />
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] text-sm hover:bg-white/[0.08] transition-colors">
              <Building2 className="w-4 h-4 stroke-[1.5]" />
              <span>All Warehouses</span>
              <ChevronDown className="w-4 h-4 text-[#8a867c]" />
            </button>
          </div>
        </div>

        {/* Content or Empty State */}
        {!hasData ? (
          <div className="rounded-xl bg-[#111318]/60 border border-white/[0.08]">
            <EmptyState
              icon={BarChart3}
              title={emptyStates.analytics.title}
              description={emptyStates.analytics.description}
            />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                label="Total Revenue"
                value={formatCurrency(data.kpis.total_revenue || 0)}
                delta={data.kpis.revenue_delta || 0}
                icon={<DollarSign className="w-4 h-4 text-[#c4a574]" />}
                delay={0}
              />
              <KPICard
                label="Total Sales"
                value={(data.kpis.total_sales || 0).toString()}
                delta={data.kpis.sales_delta || 0}
                icon={<ShoppingCart className="w-4 h-4 text-[#c4a574]" />}
                delay={0.05}
              />
              <KPICard
                label="Avg Order Value"
                value={formatCurrency(data.kpis.avg_order_value || 0)}
                delta={data.kpis.aov_delta || 0}
                icon={<TrendingUp className="w-4 h-4 text-[#c4a574]" />}
                delay={0.1}
              />
              <KPICard
                label="Profit"
                value={formatCurrency(data.kpis.profit || 0)}
                delta={data.kpis.profit_delta || 0}
                icon={<Wallet className="w-4 h-4 text-[#c4a574]" />}
                delay={0.15}
              />
            </div>

            {/* Primary Chart */}
            {revenueByDay.length > 0 && <RevenueChart data={revenueByDay} />}

            {/* Secondary Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <InventoryHealth
                inStock={data.inventory_health?.in_stock || 0}
                lowStock={data.inventory_health?.low_stock || 0}
                outOfStock={data.inventory_health?.out_of_stock || 0}
              />
              <DiscountImpact
                discountedSales={data.discount_metrics?.discounted_sales || 0}
                regularSales={data.discount_metrics?.regular_sales || 0}
                totalDiscountAmount={data.discount_metrics?.total_discount_amount || 0}
              />
            </div>

            {/* Performance Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PerformanceList
                title="Top Products"
                products={data.top_products || []}
                type="top"
              />
              <PerformanceList
                title="Low Performers"
                products={data.low_performers || []}
                type="low"
              />
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
