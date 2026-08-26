/**
 * Data Table Component
 *
 * PHASE 17: Audit and movement tables for dashboards
 * No inline editing - read-only display
 */
"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  pagination,
  loading = false,
  emptyMessage = "No data available",
  className = "",
}: DataTableProps<T>) {
  const totalPages = pagination
    ? Math.ceil(pagination.total / pagination.pageSize)
    : 1;

  if (loading) {
    return (
      <div className={`overflow-x-auto ${className}`}>
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-white/40 border-b border-white/10">
              {columns.map((col) => (
                <th key={col.key} className="pb-3 font-medium">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                {columns.map((col) => (
                  <td key={col.key} className="py-3">
                    <div className="h-4 bg-white/10 rounded w-3/4"></div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center py-12 text-white/40 ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-white/40 border-b border-white/10">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`pb-3 font-medium ${col.className || ""}`}
                  style={{ textAlign: col.align || "left" }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.map((item, index) => (
              <motion.tr
                key={keyExtractor(item)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.02 }}
                className="text-sm hover:bg-white/[0.02] transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`py-3 ${col.className || ""}`}
                    style={{ textAlign: col.align || "left" }}
                  >
                    {col.render ? col.render(item) : item[col.key]}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
          <p className="text-sm text-white/40">
            Page {pagination.page} of {totalPages} ({pagination.total} items)
          </p>

          <div className="flex items-center gap-1">
            <button
              onClick={() => pagination.onPageChange(1)}
              disabled={pagination.page === 1}
              className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-1 mx-2">
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (pagination.page <= 3) {
                  pageNum = i + 1;
                } else if (pagination.page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = pagination.page - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => pagination.onPageChange(pageNum)}
                    className={`px-2.5 py-1 text-sm rounded transition-colors ${
                      pageNum === pagination.page
                        ? "bg-[#c4a574] text-black font-medium"
                        : "text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page === totalPages}
              className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => pagination.onPageChange(totalPages)}
              disabled={pagination.page === totalPages}
              className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
