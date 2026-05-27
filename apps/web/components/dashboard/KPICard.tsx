/**
 * KPI Card Component
 *
 * PHASE 17: Display large metrics with labels
 * No calculations - displays API-derived values only
 */
"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { LucideIcon, Info } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  tooltip?: string;
  loading?: boolean;
  className?: string;
}

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  tooltip,
  loading = false,
  className = "",
}: KPICardProps) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  if (loading) {
    return (
      <div
        className={`bg-[var(--bg-surface)] backdrop-blur-sm rounded-xl border border-[var(--border-default)] p-6 ${className}`}
      >
        <div className="animate-pulse">
          <div className="h-4 bg-[var(--border-default)] rounded w-24 mb-4"></div>
          <div className="h-8 bg-[var(--border-default)] rounded w-32 mb-2"></div>
          <div className="h-3 bg-[var(--border-default)] rounded w-20"></div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-[var(--bg-surface)] backdrop-blur-sm rounded-xl border border-[var(--border-default)] p-6 hover:border-[var(--border-hover)] transition-all ${className}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-secondary)] font-medium">{title}</span>
          {tooltip && (
            <div className="relative">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
              {showTooltip && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-lg z-50 w-48">
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {tooltip}
                  </p>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-elevated)] border-r border-b border-[var(--border-default)] transform rotate-45 -mt-1"></div>
                </div>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <div className="p-2 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-default)]">
            <Icon className="w-4 h-4 text-[var(--text-muted)]" />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>

        {subtitle && <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>}

        {trend && (
          <div className="flex items-center gap-1 mt-2">
            <span
              className={`text-xs font-medium ${
                trend.value >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value}%
            </span>
            <span className="text-xs text-[var(--text-muted)]">{trend.label}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default KPICard;
