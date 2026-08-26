/**
 * Report Export Buttons Component
 *
 * Provides PDF and Excel export buttons for report dashboards.
 */
"use client";

import * as React from "react";
import { FileText, FileSpreadsheet, Download, Loader2 } from "lucide-react";
import {
  exportToPDF,
  exportToExcel,
  type ReportExportConfig,
} from "@/lib/report-export";

interface ReportExportButtonsProps {
  config: ReportExportConfig;
  disabled?: boolean;
}

export function ReportExportButtons({
  config,
  disabled = false,
}: ReportExportButtonsProps) {
  const [exportingPDF, setExportingPDF] = React.useState(false);
  const [exportingExcel, setExportingExcel] = React.useState(false);

  const handleExportPDF = async () => {
    if (disabled || exportingPDF) return;
    setExportingPDF(true);
    try {
      // Small delay to show loading state
      await new Promise((resolve) => setTimeout(resolve, 100));
      exportToPDF(config);
    } catch (error) {
      console.error("PDF export failed:", error);
    } finally {
      setExportingPDF(false);
    }
  };

  const handleExportExcel = async () => {
    if (disabled || exportingExcel) return;
    setExportingExcel(true);
    try {
      // Small delay to show loading state
      await new Promise((resolve) => setTimeout(resolve, 100));
      exportToExcel(config);
    } catch (error) {
      console.error("Excel export failed:", error);
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleExportPDF}
        disabled={disabled || exportingPDF || config.data.length === 0}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
          transition-all duration-200
          ${
            disabled || config.data.length === 0
              ? "bg-white/5 text-white/30 cursor-not-allowed"
              : "bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300"
          }
        `}
        title="Export to PDF"
      >
        {exportingPDF ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileText className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">PDF</span>
      </button>

      <button
        onClick={handleExportExcel}
        disabled={disabled || exportingExcel || config.data.length === 0}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
          transition-all duration-200
          ${
            disabled || config.data.length === 0
              ? "bg-white/5 text-white/30 cursor-not-allowed"
              : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
          }
        `}
        title="Export to Excel"
      >
        {exportingExcel ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">Excel</span>
      </button>
    </div>
  );
}

// Export dropdown menu component for more compact UI
export function ReportExportDropdown({
  config,
  disabled = false,
}: ReportExportButtonsProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [exportingPDF, setExportingPDF] = React.useState(false);
  const [exportingExcel, setExportingExcel] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExportPDF = async () => {
    if (disabled || exportingPDF) return;
    setExportingPDF(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      exportToPDF(config);
    } catch (error) {
      console.error("PDF export failed:", error);
    } finally {
      setExportingPDF(false);
      setIsOpen(false);
    }
  };

  const handleExportExcel = async () => {
    if (disabled || exportingExcel) return;
    setExportingExcel(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      exportToExcel(config);
    } catch (error) {
      console.error("Excel export failed:", error);
    } finally {
      setExportingExcel(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || config.data.length === 0}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
          transition-all duration-200
          ${
            disabled || config.data.length === 0
              ? "bg-white/5 text-white/30 cursor-not-allowed"
              : "bg-[#c4a574]/10 text-[#c4a574] hover:bg-[#c4a574]/20"
          }
        `}
      >
        <Download className="w-4 h-4" />
        <span>Export</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 popover-panel rounded-lg z-[80] overflow-hidden">
          <button
            onClick={handleExportPDF}
            disabled={exportingPDF}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors"
          >
            {exportingPDF ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-400" />
            ) : (
              <FileText className="w-4 h-4 text-red-400" />
            )}
            <span>Export as PDF</span>
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exportingExcel}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors border-t border-white/5"
          >
            {exportingExcel ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            )}
            <span>Export as Excel</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default ReportExportButtons;
