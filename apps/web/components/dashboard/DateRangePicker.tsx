/**
 * Date Range Picker Component
 *
 * PHASE 17: Global dashboard filtering
 */
"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronDown } from "lucide-react";
import { localYmd } from "@/lib/local-date";

interface DateRangePickerProps {
  dateFrom: string | null;
  dateTo: string | null;
  onChange: (from: string | null, to: string | null) => void;
  className?: string;
}

const presets = [
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "This month", type: "month" as const },
  { label: "Last month", type: "lastMonth" as const },
];

function getPresetDates(preset: (typeof presets)[number]) {
  const today = new Date();

  if (preset.type === "month") {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      from: localYmd(firstDay),
      to: localYmd(today),
    };
  }

  if (preset.type === "lastMonth") {
    const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      from: localYmd(firstDay),
      to: localYmd(lastDay),
    };
  }

  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - (preset.days || 0));

  return {
    from: localYmd(fromDate),
    to: localYmd(today),
  };
}

function formatDateRange(from: string | null, to: string | null): string {
  if (!from && !to) return "Select dates";

  const formatDate = (d: string) => {
    const date = new Date(`${d}T12:00:00`);
    return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  };

  if (from && to) {
    return `${formatDate(from)} - ${formatDate(to)}`;
  }

  return from ? `From ${formatDate(from)}` : `Until ${formatDate(to!)}`;
}

export function DateRangePicker({
  dateFrom,
  dateTo,
  onChange,
  className = "",
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [localFrom, setLocalFrom] = React.useState(dateFrom || "");
  const [localTo, setLocalTo] = React.useState(dateTo || "");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = React.useState<{
    top: number;
    right: number;
  } | null>(null);

  const updatePanelPos = React.useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    updatePanelPos();
    window.addEventListener("resize", updatePanelPos);
    window.addEventListener("scroll", updatePanelPos, true);
    return () => {
      window.removeEventListener("resize", updatePanelPos);
      window.removeEventListener("scroll", updatePanelPos, true);
    };
  }, [isOpen, updatePanelPos]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    setLocalFrom(dateFrom || "");
    setLocalTo(dateTo || "");
  }, [dateFrom, dateTo]);

  const handlePreset = (preset: (typeof presets)[number]) => {
    const dates = getPresetDates(preset);
    setLocalFrom(dates.from);
    setLocalTo(dates.to);
    onChange(dates.from, dates.to);
    setIsOpen(false);
  };

  const handleApply = () => {
    onChange(localFrom || null, localTo || null);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-modal)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] hover:border-[var(--brand)]/40 transition-colors"
      >
        <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
        <span>{formatDateRange(dateFrom, dateTo)}</span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && panelPos && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="fixed z-[80] w-72 popover-panel rounded-xl overflow-hidden"
                style={{ top: panelPos.top, right: panelPos.right }}
                role="dialog"
                aria-label="Date range"
              >
                <div className="p-3 border-b border-[var(--border-default)] bg-[var(--bg-modal)]">
                  <p className="text-xs text-[var(--text-secondary)] mb-2 font-medium">
                    Quick select
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {presets.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handlePreset(preset)}
                        className="px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--brand-muted)] hover:text-[var(--brand)] rounded-md transition-colors text-left font-medium"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 space-y-3 bg-[var(--bg-modal)]">
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">
                      From
                    </label>
                    <input
                      type="date"
                      value={localFrom}
                      onChange={(e) => setLocalFrom(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">
                      To
                    </label>
                    <input
                      type="date"
                      value={localTo}
                      onChange={(e) => setLocalTo(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLocalFrom("");
                        setLocalTo("");
                        onChange(null, null);
                        setIsOpen(false);
                      }}
                      className="flex-1 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-page)] rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={handleApply}
                      className="flex-1 px-3 py-2 bg-[var(--brand)] text-[var(--brand-contrast)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

export default DateRangePicker;
