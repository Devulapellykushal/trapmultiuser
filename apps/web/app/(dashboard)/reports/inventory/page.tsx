/**
 * Inventory Reports Dashboard
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 * ========================================
 *
 * Stock Snapshot:
 * - Total SKUs
 * - Total units in stock
 * - Low-stock count
 *
 * Stock Aging Chart:
 * - 0-30, 31-60, 61-90, 90+ days buckets
 * - Answers: "What money is stuck on shelves?"
 *
 * Movement Table:
 * - Filterable by date range, movement type, warehouse
 * - No inline edits
 *
 * Data from:
 * - /reports/inventory/current/
 * - /reports/inventory/aging/
 * - /reports/inventory/movements/
 */
"use client";

import * as React from "react";
import {
  Package,
  Boxes,
  Clock,
  ArrowUpDown,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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
import {
  useDashboardFilters,
  useCurrentStock,
  useStockAging,
  useStockMovements,
} from "@/hooks";
import { MovementItem } from "@/services";

// Aging bucket colors - professional palette
const AGING_COLORS: Record<string, string> = {
  "0-30 days": "#c4a574",
  "31-60 days": "#d4b88a",
  "61-90 days": "#d4a054",
  "90+ days": "#c45c5c",
};

// Movement type badges
function MovementTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    SALE: "bg-rose-500/20 text-rose-400",
    PURCHASE: "bg-emerald-500/20 text-emerald-400",
    RETURN: "bg-blue-500/20 text-blue-400",
    ADJUSTMENT: "bg-amber-500/20 text-amber-400",
    TRANSFER: "bg-purple-500/20 text-purple-400",
  };

  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colors[type] || "bg-white/10 text-white/60"}`}
    >
      {type}
    </span>
  );
}

export default function InventoryReportsPage() {
  const { filters } = useDashboardFilters();
  const [movementType, setMovementType] = React.useState<string>("");
  const [movementPage, setMovementPage] = React.useState(1);

  // Fetch current stock
  const {
    data: stockData,
    isLoading: stockLoading,
    error: stockError,
    refetch: refetchStock,
  } = useCurrentStock({
    warehouseId: filters.warehouseId || undefined,
    pageSize: 1000, // Get all for summary
  });

  // Fetch stock aging
  const {
    data: agingData,
    isLoading: agingLoading,
    error: agingError,
    refetch: refetchAging,
  } = useStockAging({
    warehouseId: filters.warehouseId || undefined,
  });

  // Fetch movements
  const {
    data: movementsData,
    isLoading: movementsLoading,
    error: movementsError,
    refetch: refetchMovements,
  } = useStockMovements({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    warehouseId: filters.warehouseId || undefined,
    movementType: movementType || undefined,
    page: movementPage,
    pageSize: 15,
  });

  const isLoading = stockLoading || agingLoading;
  const error = stockError || agingError;

  const handleRefresh = () => {
    refetchStock();
    refetchAging();
    refetchMovements();
  };

  // Calculate KPIs from current stock (no frontend math, just aggregation of API data)
  const kpis = React.useMemo(() => {
    if (!stockData?.results) {
      return { totalSKUs: 0, totalUnits: 0, lowStockCount: 0 };
    }

    const totalSKUs = stockData.total || 0;
    const totalUnits = stockData.results.reduce(
      (sum, item) => sum + (item.availableStock || 0),
      0,
    );
    const lowStockCount = stockData.results.filter(
      (item) => item.availableStock > 0 && item.availableStock <= 10,
    ).length;

    return { totalSKUs, totalUnits, lowStockCount };
  }, [stockData]);

  // Prepare aging chart data
  const agingChartData = React.useMemo(() => {
    if (!agingData?.summary) return [];

    return [
      {
        bucket: "0-30 days",
        count: agingData.summary["0-30 days"].count,
        stock: agingData.summary["0-30 days"].totalStock,
      },
      {
        bucket: "31-60 days",
        count: agingData.summary["31-60 days"].count,
        stock: agingData.summary["31-60 days"].totalStock,
      },
      {
        bucket: "61-90 days",
        count: agingData.summary["61-90 days"].count,
        stock: agingData.summary["61-90 days"].totalStock,
      },
      {
        bucket: "90+ days",
        count: agingData.summary["90+ days"].count,
        stock: agingData.summary["90+ days"].totalStock,
      },
    ];
  }, [agingData]);

  // Movement table columns
  const movementColumns: Column<MovementItem>[] = [
    {
      key: "createdAt",
      header: "Date",
      render: (item) => (
        <span className="text-white/60">
          {new Date(item.createdAt).toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "product",
      header: "Product",
      render: (item) => (
        <div>
          <p className="text-white font-medium">{item.productName}</p>
          <p className="text-white/40 text-xs">{item.productSku}</p>
        </div>
      ),
    },
    {
      key: "productCategory",
      header: "Category",
      render: (item) => (
        <span className="text-white/60">{item.productCategory || "—"}</span>
      ),
    },
    {
      key: "productBrand",
      header: "Brand",
      render: (item) => (
        <span className="text-white/60">{item.productBrand || "—"}</span>
      ),
    },
    {
      key: "movementType",
      header: "Type",
      render: (item) => <MovementTypeBadge type={item.movementType} />,
    },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (item) => (
        <span
          className={`font-medium ${item.quantity >= 0 ? "text-emerald-400" : "text-rose-400"}`}
        >
          {item.quantity > 0 ? "+" : ""}
          {item.quantity}
        </span>
      ),
    },
    {
      key: "warehouseName",
      header: "Warehouse",
      render: (item) => (
        <span className="text-white/60">{item.warehouseName || "—"}</span>
      ),
    },
    {
      key: "createdBy",
      header: "User",
      render: (item) => (
        <span className="text-white/60">{item.createdBy || "System"}</span>
      ),
    },
  ];

  // Prepare export configuration
  const exportConfig: ReportExportConfig = React.useMemo(() => {
    if (!movementsData?.results) {
      return {
        title: "Inventory Movements Report",
        filename: "inventory-movements-report",
        columns: [],
        data: [],
      };
    }

    return {
      title: "Inventory Movements Report",
      filename: `inventory-movements-report-${filters.dateFrom || "all"}-to-${filters.dateTo || "all"}`,
      columns: [
        { header: "Date", key: "date", width: 18 },
        { header: "Product Name", key: "productName", width: 28 },
        { header: "SKU", key: "productSku", width: 15 },
        { header: "Category", key: "productCategory", width: 15 },
        { header: "Brand", key: "productBrand", width: 15 },
        { header: "Type", key: "movementType", width: 12 },
        {
          header: "Quantity",
          key: "quantity",
          width: 10,
          align: "right" as const,
        },
        { header: "Warehouse", key: "warehouseName", width: 18 },
        { header: "User", key: "createdBy", width: 15 },
      ],
      data: movementsData.results.map((item) => ({
        date: new Date(item.createdAt).toLocaleString("en-IN"),
        productName: item.productName,
        productSku: item.productSku,
        productCategory: item.productCategory || "—",
        productBrand: item.productBrand || "—",
        movementType: item.movementType,
        quantity: item.quantity,
        warehouseName: item.warehouseName || "—",
        createdBy: item.createdBy || "System",
      })),
      summary: {
        "Total SKUs": kpis.totalSKUs.toLocaleString(),
        "Total Units in Stock": kpis.totalUnits.toLocaleString(),
        "Low Stock Items": kpis.lowStockCount.toLocaleString(),
      },
      dateRange:
        filters.dateFrom && filters.dateTo
          ? { from: filters.dateFrom, to: filters.dateTo }
          : undefined,
    };
  }, [movementsData, kpis, filters]);

  // Loading state
  if (isLoading && !stockData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Inventory</h1>
            <p className="text-sm text-white/40 mt-1">
              Stock levels from inventory ledger
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <KPICard key={i} title="" value="" loading />
          ))}
        </div>
        <ChartSkeleton height={350} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-sm text-white/40 mt-1">
            Stock levels from inventory ledger
          </p>
        </div>
        <ErrorBanner
          message={(error as Error).message || "Failed to load inventory data"}
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
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-sm text-white/40 mt-1">
            Derived from SUM(InventoryMovement.quantity) • No cached totals
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReportExportButtons
            config={exportConfig}
            disabled={!movementsData?.results?.length}
          />
          <DashboardFilterBar
            onRefresh={handleRefresh}
            isRefreshing={isLoading}
            showDateRange={false}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          title="Total SKUs"
          value={kpis.totalSKUs.toLocaleString()}
          subtitle="Products tracked"
          icon={Package}
        />
        <KPICard
          title="Total Units"
          value={kpis.totalUnits.toLocaleString()}
          subtitle="In stock"
          icon={Boxes}
        />
        <KPICard
          title="Low Stock"
          value={kpis.lowStockCount.toLocaleString()}
          subtitle="≤10 units"
          icon={AlertTriangle}
        />
      </div>

      {/* Stock Aging Chart */}
      <SectionCard
        title="Stock Aging"
        description="Days since last movement • Identifies dead/slow stock"
        icon={Clock}
      >
        {/* Legend */}
        <div className="flex items-center flex-wrap gap-4 mb-4">
          {Object.entries(AGING_COLORS).map(([bucket, color]) => (
            <div key={bucket} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: color }}
              ></div>
              <span className="text-xs text-white/60">{bucket}</span>
            </div>
          ))}
        </div>

        {agingChartData.length > 0 &&
        agingChartData.some((d) => d.stock > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={agingChartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
              />
              <XAxis
                dataKey="bucket"
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                label={{
                  value: "Units in Stock",
                  angle: -90,
                  position: "insideLeft",
                  fill: "rgba(255,255,255,0.4)",
                  fontSize: 12,
                }}
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
                  return [
                    Number(value).toLocaleString(),
                    name === "stock" ? "Units" : "Products",
                  ];
                }}
                labelStyle={{ color: "rgba(255,255,255,0.6)" }}
              />
              <Bar dataKey="stock" radius={[4, 4, 0, 0]}>
                {agingChartData.map((entry) => (
                  <Cell key={entry.bucket} fill={AGING_COLORS[entry.bucket]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={Clock}
            title="No aging data"
            description="Stock aging data will appear once you have inventory with movement history."
          />
        )}
      </SectionCard>

      {/* Movements Table */}
      <SectionCard
        title="Stock Movements"
        description="Filterable transaction history from ledger"
        icon={ArrowUpDown}
        action={
          <select
            value={movementType}
            onChange={(e) => {
              setMovementType(e.target.value);
              setMovementPage(1);
            }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c4a574]/50"
          >
            <option value="">All Types</option>
            <option value="SALE">Sales</option>
            <option value="PURCHASE">Purchases</option>
            <option value="RETURN">Returns</option>
            <option value="ADJUSTMENT">Adjustments</option>
            <option value="TRANSFER">Transfers</option>
          </select>
        }
      >
        {movementsError ? (
          <ErrorBanner
            message={
              (movementsError as Error).message || "Failed to load movements"
            }
            onRetry={refetchMovements}
          />
        ) : (
          <DataTable
            data={movementsData?.results || []}
            columns={movementColumns}
            keyExtractor={(item) => item.id}
            loading={movementsLoading}
            emptyMessage="No stock movements found for the selected filters"
            pagination={
              movementsData
                ? {
                    page: movementsData.page,
                    pageSize: movementsData.pageSize,
                    total: movementsData.total,
                    onPageChange: setMovementPage,
                  }
                : undefined
            }
          />
        )}
      </SectionCard>

      {/* Data Source Attribution */}
      <div className="text-xs text-white/30 text-center py-4">
        Data derived from InventoryMovement ledger • No inline editing
      </div>
    </div>
  );
}
