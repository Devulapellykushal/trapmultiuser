"use client";

import * as React from "react";
import { motion } from "framer-motion";

// Local format helper
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface DiscountImpactProps {
  discountedSales: number;
  regularSales: number;
  totalDiscountAmount: number;
}

export function DiscountImpact({ discountedSales, regularSales, totalDiscountAmount }: DiscountImpactProps) {
  const total = discountedSales + regularSales;
  const discountedPercent = total > 0 ? Math.round((discountedSales / total) * 100) : 0;
  const regularPercent = 100 - discountedPercent;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="p-5 rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08]"
    >
      <h3 className="text-lg font-semibold text-[#f3eee4] mb-4">Discount Impact</h3>

      {/* Bar Chart */}
      <div className="space-y-3 mb-4">
        {/* Discounted Sales */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-[#c5c0b5]">Discounted Sales</span>
            <span className="text-sm font-medium text-[#f3eee4] tabular-nums">{discountedSales}</span>
          </div>
          <div className="h-3 rounded-full bg-white/[0.05] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${discountedPercent}%` }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="h-full rounded-full bg-[#d4a054]"
            />
          </div>
        </div>

        {/* Regular Sales */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-[#c5c0b5]">Regular Sales</span>
            <span className="text-sm font-medium text-[#f3eee4] tabular-nums">{regularSales}</span>
          </div>
          <div className="h-3 rounded-full bg-white/[0.05] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${regularPercent}%` }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="h-full rounded-full bg-[#3f9d7a]"
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="p-3 rounded-lg bg-[#d4a054]/10 border border-[#d4a054]/20">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#d4a054]">Total Discount Given</span>
          <span className="text-lg font-semibold text-[#d4a054] tabular-nums">
            {formatCurrency(totalDiscountAmount)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
