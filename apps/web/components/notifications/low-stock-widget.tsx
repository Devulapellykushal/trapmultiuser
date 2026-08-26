"use client";

import * as React from "react";
import { AlertTriangle, ArrowRight, Package, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getLowStockProducts,
  LowStockResponse,
} from "@/services/notifications.service";
import Link from "next/link";
import { adminHref } from "@/lib/admin-routes";

interface LowStockWidgetProps {
  className?: string;
  warehouseId?: string;
  maxItems?: number;
}

const URGENCY_STYLES: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  CRITICAL: {
    bg: "bg-red-500/10",
    text: "text-red-500",
    border: "border-red-500/20",
  },
  HIGH: {
    bg: "bg-orange-500/10",
    text: "text-orange-500",
    border: "border-orange-500/20",
  },
  MEDIUM: {
    bg: "bg-amber-500/10",
    text: "text-amber-500",
    border: "border-amber-500/20",
  },
  LOW: {
    bg: "bg-green-500/10",
    text: "text-green-500",
    border: "border-green-500/20",
  },
};

export function LowStockWidget({
  className,
  warehouseId,
  maxItems = 5,
}: LowStockWidgetProps) {
  const [data, setData] = React.useState<LowStockResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getLowStockProducts(warehouseId);
      setData(response);
    } catch (err) {
      console.error("Failed to fetch low stock data:", err);
      setError("Failed to load low stock data");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  React.useEffect(() => {
    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 300000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const displayItems = data?.items.slice(0, maxItems) || [];
  const hasMore = (data?.count || 0) > maxItems;

  if (loading) {
    return (
      <div
        className={cn(
          "bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5",
          className,
        )}
      >
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-[#c4a574] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5",
          className,
        )}
      >
        <div className="flex flex-col items-center justify-center py-8">
          <AlertTriangle className="w-8 h-8 text-[#c45c5c] mb-2" />
          <p className="text-sm text-[var(--text-muted)]">{error}</p>
          <button
            onClick={fetchData}
            className="mt-2 text-xs text-[#c4a574] hover:text-[#d4b88a] flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#c45c5c]/10">
            <AlertTriangle className="w-4 h-4 text-[#c45c5c]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Low Stock Alert
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              {data?.count || 0} products need restocking
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg hover:bg-white/[0.05] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Summary */}
      {data && data.count > 0 && (
        <div className="grid grid-cols-4 gap-2 px-5 py-3 border-b border-[var(--border-default)]">
          {[
            {
              label: "Critical",
              count: data.summary.critical,
              color: "text-red-500",
            },
            {
              label: "High",
              count: data.summary.high,
              color: "text-orange-500",
            },
            {
              label: "Medium",
              count: data.summary.medium,
              color: "text-amber-500",
            },
            { label: "Low", count: data.summary.low, color: "text-green-500" },
          ].map(({ label, count, color }) => (
            <div key={label} className="text-center">
              <p className={cn("text-lg font-semibold", color)}>{count}</p>
              <p className="text-xs text-[var(--text-muted)]">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Items List */}
      <div className="divide-y divide-white/[0.05]">
        {displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-5">
            <Package className="w-10 h-10 text-[#1c1d22] mb-2" />
            <p className="text-sm text-[var(--text-muted)]">
              All products are well-stocked!
            </p>
          </div>
        ) : (
          displayItems.map((item) => {
            const styles =
              URGENCY_STYLES[item.urgency] || URGENCY_STYLES.MEDIUM;
            const stockPercentage = Math.round(
              (item.current_stock / item.reorder_threshold) * 100,
            );

            return (
              <div
                key={`${item.id}-${item.warehouse_id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors"
              >
                {/* Urgency Badge */}
                <div
                  className={cn(
                    "flex-shrink-0 px-2 py-1 rounded text-xs font-medium",
                    styles.bg,
                    styles.text,
                  )}
                >
                  {item.urgency}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {item.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[var(--text-muted)]">{item.sku}</span>
                    {item.brand && (
                      <span className="text-xs text-[var(--text-muted)]">
                        • {item.brand}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stock Progress */}
                <div className="flex-shrink-0 text-right">
                  <p className={cn("text-sm font-medium", styles.text)}>
                    {item.current_stock} / {item.reorder_threshold}
                  </p>
                  <div className="w-16 h-1.5 bg-white/[0.1] rounded-full mt-1 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        styles.bg.replace("/10", "/60"),
                      )}
                      style={{ width: `${Math.min(100, stockPercentage)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {hasMore && (
        <div className="px-5 py-3 border-t border-[var(--border-default)]">
          <Link
            href={`${adminHref("/inventory")}?filter=low-stock`}
            className="flex items-center justify-center gap-1 text-xs text-[#c4a574] hover:text-[#d4b88a] transition-colors"
          >
            View all {data?.count} low stock products
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
