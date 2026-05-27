"use client";

import * as React from "react";
import { Search, X, SlidersHorizontal, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useWarehouses, useCategories } from "@/hooks";
import { useAuth } from "@/lib/auth";
import { adminHref } from "@/lib/admin-routes";

export type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";
export type SortOption = "name" | "stock" | "price";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  stockFilter: StockFilter;
  onStockFilterChange: (filter: StockFilter) => void;
  categoryFilter: string;
  onCategoryChange: (category: string) => void;
  warehouseFilter: string;
  onWarehouseChange: (warehouse: string) => void;
  brandFilter?: string;
  onBrandChange?: (brand: string) => void;
  // Phase 10B: Show deleted (Admin only)
  showDeleted?: boolean;
  onShowDeletedChange?: (show: boolean) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  stockFilter,
  onStockFilterChange,
  categoryFilter,
  onCategoryChange,
  warehouseFilter,
  onWarehouseChange,
  brandFilter = "",
  onBrandChange,
  showDeleted = false,
  onShowDeletedChange,
  sortBy,
  onSortChange,
  onReset,
  hasActiveFilters,
}: FilterBarProps) {
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const { data: warehousesData } = useWarehouses();
  const warehouses = warehousesData || [];

  // Fetch dynamic categories from API
  const { data: categoriesData } = useCategories();
  const categories = categoriesData || [];

  return (
    <div className="space-y-4">
      {/* Search + Mobile Filter Toggle */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6F7285] stroke-[1.5]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by product name or SKU..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/[0.1] transition-colors"
            >
              <X className="w-4 h-4 text-[#6F7285]" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] text-sm hover:bg-white/[0.08] transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Desktop Filters */}
      <div className="hidden lg:flex items-center gap-3 flex-wrap">
        {/* Stock Status */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          {(
            ["all", "in_stock", "low_stock", "out_of_stock"] as StockFilter[]
          ).map((status) => (
            <button
              key={status}
              onClick={() => onStockFilterChange(status)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                stockFilter === status
                  ? "bg-[#C6A15B] text-[#0E0F13]"
                  : "text-[#A1A4B3] hover:text-[#F5F6FA] hover:bg-white/[0.05]"
              }`}
            >
              {status === "all"
                ? "All"
                : status === "in_stock"
                  ? "In Stock"
                  : status === "low_stock"
                    ? "Low Stock"
                    : "Out of Stock"}
            </button>
          ))}
        </div>

        {/* Category - Dynamic from API */}
        <select
          value={categoryFilter}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] cursor-pointer"
        >
          <option value="">All Categories</option>
          {categories.map((cat: { id: string; name: string }) => (
            <option key={cat.id} value={cat.name}>
              {cat.name}
            </option>
          ))}
        </select>

        {/* Brand */}
        {onBrandChange && (
          <input
            type="text"
            value={brandFilter}
            onChange={(e) => onBrandChange(e.target.value)}
            placeholder="Brand..."
            className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] w-28"
          />
        )}

        {/* Warehouse (optional link for admins) */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={warehouseFilter}
            onChange={(e) => onWarehouseChange(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] cursor-pointer"
          >
            <option value="">All Warehouses</option>
            {warehouses.map((wh: { id: string; name: string }) => (
              <option key={wh.id} value={wh.id}>
                {wh.name}
              </option>
            ))}
          </select>
          {isAdmin && (
            <Link
              href={adminHref("/warehouses")}
              className="text-xs text-[#C6A15B] hover:underline whitespace-nowrap"
            >
              Add or edit warehouses
            </Link>
          )}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] cursor-pointer"
        >
          <option value="name">Sort: Name</option>
          <option value="stock">Sort: Stock Level</option>
          <option value="price">Sort: Price</option>
        </select>

        {/* Show Deleted Toggle - Admin Only */}
        {isAdmin && onShowDeletedChange && (
          <button
            onClick={() => onShowDeletedChange(!showDeleted)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              showDeleted
                ? "bg-[#E74C3C]/20 text-[#E74C3C] border border-[#E74C3C]/30"
                : "bg-white/[0.05] border border-white/[0.08] text-[#A1A4B3] hover:text-[#F5F6FA]"
            }`}
          >
            {showDeleted ? (
              <>
                <Eye className="w-4 h-4" />
                Showing Deleted
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4" />
                Show Deleted
              </>
            )}
          </button>
        )}

        {/* Reset */}
        {hasActiveFilters && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={onReset}
            className="px-3 py-2 rounded-lg text-sm text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors"
          >
            Reset Filters
          </motion.button>
        )}
      </div>

      {/* Mobile Filters */}
      <AnimatePresence>
        {showMobileFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="lg:hidden space-y-3 overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3">
              <select
                value={stockFilter}
                onChange={(e) =>
                  onStockFilterChange(e.target.value as StockFilter)
                }
                className="px-3 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA]"
              >
                <option value="all">All Stock</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="px-3 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA]"
              >
                <option value="">All Categories</option>
                {categories.map((cat: { id: string; name: string }) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>

              {onBrandChange && (
                <input
                  type="text"
                  value={brandFilter}
                  onChange={(e) => onBrandChange(e.target.value)}
                  placeholder="Brand name..."
                  className="col-span-2 px-3 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B]"
                />
              )}

              <select
                value={warehouseFilter}
                onChange={(e) => onWarehouseChange(e.target.value)}
                className="px-3 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA]"
              >
                <option value="">All Warehouses</option>
                {warehouses.map((wh: { id: string; name: string }) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name}
                  </option>
                ))}
              </select>

              {isAdmin && (
                <p className="col-span-2 text-xs text-[#6F7285]">
                  <Link
                    href={adminHref("/warehouses")}
                    className="text-[#C6A15B] hover:underline font-medium"
                  >
                    Add or edit warehouses
                  </Link>{" "}
                  for stock storage.
                </p>
              )}

              <select
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as SortOption)}
                className="px-3 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA]"
              >
                <option value="name">Sort: Name</option>
                <option value="stock">Sort: Stock</option>
                <option value="price">Sort: Price</option>
              </select>
            </div>

            {/* Mobile: Show Deleted */}
            {isAdmin && onShowDeletedChange && (
              <button
                onClick={() => onShowDeletedChange(!showDeleted)}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  showDeleted
                    ? "bg-[#E74C3C]/20 text-[#E74C3C] border border-[#E74C3C]/30"
                    : "bg-white/[0.05] border border-white/[0.08] text-[#A1A4B3]"
                }`}
              >
                {showDeleted ? (
                  <>
                    <Eye className="w-4 h-4" />
                    Showing Deleted Products
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4" />
                    Show Deleted Products
                  </>
                )}
              </button>
            )}

            {hasActiveFilters && (
              <button
                onClick={onReset}
                className="w-full px-3 py-2 rounded-lg text-sm text-[#E74C3C] border border-[#E74C3C]/30 hover:bg-[#E74C3C]/10 transition-colors"
              >
                Reset All Filters
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
