/**
 * Dashboard Filter Context
 * 
 * PHASE 17: Global filtering for dashboards
 * 
 * Provides:
 * - Date range picker state
 * - Warehouse selector state
 * - URL sync for filters (query params)
 */
"use client";

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { localYmd } from "@/lib/local-date";

export interface DashboardFilters {
  dateFrom: string | null;
  dateTo: string | null;
  warehouseId: string | null;
}

interface DashboardFilterContextValue {
  filters: DashboardFilters;
  setDateRange: (from: string | null, to: string | null) => void;
  setWarehouse: (warehouseId: string | null) => void;
  resetFilters: () => void;
  isFiltersApplied: boolean;
}

const DashboardFilterContext = React.createContext<DashboardFilterContextValue | null>(null);

// Default date range: Last 30 days (local calendar)
function getDefaultDateRange() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  return {
    from: localYmd(thirtyDaysAgo),
    to: localYmd(today),
  };
}

export function DashboardFilterProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Initialize filters from URL or defaults
  const [filters, setFilters] = React.useState<DashboardFilters>(() => {
    const defaults = getDefaultDateRange();
    return {
      dateFrom: searchParams.get('date_from') || defaults.from,
      dateTo: searchParams.get('date_to') || defaults.to,
      warehouseId: searchParams.get('warehouse_id') || null,
    };
  });

  // Sync URL when filters change
  const updateURL = React.useCallback((newFilters: DashboardFilters) => {
    const params = new URLSearchParams();
    
    if (newFilters.dateFrom) {
      params.set('date_from', newFilters.dateFrom);
    }
    if (newFilters.dateTo) {
      params.set('date_to', newFilters.dateTo);
    }
    if (newFilters.warehouseId) {
      params.set('warehouse_id', newFilters.warehouseId);
    }
    
    const queryString = params.toString();
    const newPath = queryString ? `${pathname}?${queryString}` : pathname;
    router.replace(newPath, { scroll: false });
  }, [pathname, router]);

  const setDateRange = React.useCallback((from: string | null, to: string | null) => {
    const newFilters = { ...filters, dateFrom: from, dateTo: to };
    setFilters(newFilters);
    updateURL(newFilters);
  }, [filters, updateURL]);

  const setWarehouse = React.useCallback((warehouseId: string | null) => {
    const newFilters = { ...filters, warehouseId };
    setFilters(newFilters);
    updateURL(newFilters);
  }, [filters, updateURL]);

  const resetFilters = React.useCallback(() => {
    const defaults = getDefaultDateRange();
    const newFilters: DashboardFilters = {
      dateFrom: defaults.from,
      dateTo: defaults.to,
      warehouseId: null,
    };
    setFilters(newFilters);
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  const isFiltersApplied = Boolean(filters.warehouseId);

  const value = React.useMemo(() => ({
    filters,
    setDateRange,
    setWarehouse,
    resetFilters,
    isFiltersApplied,
  }), [filters, setDateRange, setWarehouse, resetFilters, isFiltersApplied]);

  return (
    <DashboardFilterContext.Provider value={value}>
      {children}
    </DashboardFilterContext.Provider>
  );
}

export function useDashboardFilters() {
  const context = React.useContext(DashboardFilterContext);
  if (!context) {
    throw new Error('useDashboardFilters must be used within DashboardFilterProvider');
  }
  return context;
}
