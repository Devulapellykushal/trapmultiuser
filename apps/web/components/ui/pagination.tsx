/**
 * Pagination Component
 *
 * Reusable pagination controls for list views.
 * Extracted from DataTable.tsx for use in non-table layouts.
 */
"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  showItemCount?: boolean;
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  showItemCount = true,
  className = "",
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);

  // Don't show pagination if only one page
  if (totalPages <= 1) return null;

  // Calculate visible page numbers
  const getVisiblePages = () => {
    const pages: number[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (page <= 3) {
      for (let i = 1; i <= maxVisible; i++) pages.push(i);
    } else if (page >= totalPages - 2) {
      for (let i = totalPages - maxVisible + 1; i <= totalPages; i++)
        pages.push(i);
    } else {
      for (let i = page - 2; i <= page + 2; i++) pages.push(i);
    }

    return pages;
  };

  return (
    <div
      className={`flex items-center justify-between pt-4 border-t border-white/10 ${className}`}
    >
      {showItemCount && (
        <p className="text-sm text-white/40">
          Page {page} of {totalPages} ({total} items)
        </p>
      )}

      {!showItemCount && <div />}

      <div className="flex items-center gap-1">
        {/* First Page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="First page"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        {/* Previous Page */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1 mx-2">
          {getVisiblePages().map((pageNum) => (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`px-2.5 py-1 text-sm rounded transition-colors ${
                pageNum === page
                  ? "bg-[#c4a574] text-black font-medium"
                  : "text-white/60 hover:bg-white/10"
              }`}
            >
              {pageNum}
            </button>
          ))}
        </div>

        {/* Next Page */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Last Page */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Last page"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
