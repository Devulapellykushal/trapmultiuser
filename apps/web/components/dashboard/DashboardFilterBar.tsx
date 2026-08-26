/**
 * Dashboard Filter Bar Component
 *
 * PHASE 17: Combined filter controls for dashboards
 *
 * Includes:
 * - Date range picker
 * - Warehouse selector
 * - Reset button
 */
"use client";

import * as React from "react";
import { RefreshCw, Filter } from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";
import { WarehouseSelector } from "./WarehouseSelector";
import { useDashboardFilters } from "@/hooks";

interface DashboardFilterBarProps {
  showWarehouse?: boolean;
  showDateRange?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

export function DashboardFilterBar({
  showWarehouse = true,
  showDateRange = true,
  onRefresh,
  isRefreshing = false,
  className = "",
}: DashboardFilterBarProps) {
  const {
    filters,
    setDateRange,
    setWarehouse,
    resetFilters,
    isFiltersApplied,
  } = useDashboardFilters();

  return (
    <div className={`flex items-center gap-3 flex-wrap ${className}`}>
      {/* Filter indicator */}
      {isFiltersApplied && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#c4a574]/10 rounded-lg">
          <Filter className="w-3 h-3 text-[#c4a574]" />
          <span className="text-xs text-[#c4a574] font-medium">
            Filters active
          </span>
        </div>
      )}

      {/* Date Range */}
      {showDateRange && (
        <DateRangePicker
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onChange={setDateRange}
        />
      )}

      {/* Warehouse */}
      {showWarehouse && (
        <WarehouseSelector
          value={filters.warehouseId}
          onChange={setWarehouse}
        />
      )}

      {/* Reset */}
      {isFiltersApplied && (
        <button
          onClick={resetFilters}
          className="px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          Reset
        </button>
      )}

      {/* Refresh */}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh data"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </button>
      )}
    </div>
  );
}

export default DashboardFilterBar;
