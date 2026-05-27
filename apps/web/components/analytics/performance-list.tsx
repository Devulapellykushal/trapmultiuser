"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";

// Local format helper
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Product performance type
interface ProductPerformance {
  id: string | number;
  name: string;
  sku?: string;
  revenue?: number;
  unitsSold?: number;
  units_sold?: number;
  stockAge?: number;
}

interface PerformanceListProps {
  title: string;
  products: ProductPerformance[];
  type: "top" | "low";
}

export function PerformanceList({ title, products, type }: PerformanceListProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: type === "top" ? 0.4 : 0.45 }}
      className="p-5 rounded-xl bg-[#1A1B23]/60 backdrop-blur-xl border border-white/[0.08]"
    >
      <div className="flex items-center gap-2 mb-4">
        {type === "top" ? (
          <TrendingUp className="w-4 h-4 text-[#2ECC71]" />
        ) : (
          <TrendingDown className="w-4 h-4 text-[#E74C3C]" />
        )}
        <h3 className="text-lg font-semibold text-[#F5F6FA]">{title}</h3>
      </div>

      <div className="space-y-3">
        {products.length === 0 ? (
          <p className="text-sm text-[#6F7285] text-center py-4">No data available</p>
        ) : (
          products.map((product, index) => {
            const unitsSold = product.unitsSold || product.units_sold || 0;
            return (
              <div
                key={product.id || index}
                className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
              >
                {/* Rank */}
                <div className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
                  ${type === "top" 
                    ? index < 3 ? "bg-[#6366F1]/20 text-[#6366F1]" : "bg-white/[0.05] text-[#6F7285]"
                    : "bg-white/[0.05] text-[#6F7285]"
                  }
                `}>
                  {index + 1}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#F5F6FA] truncate">
                    {product.name}
                  </p>
                  {product.sku && <p className="text-xs text-[#6F7285]">{product.sku}</p>}
                </div>

                {/* Metrics */}
                <div className="text-right">
                  <p className={`text-sm font-semibold tabular-nums ${
                    type === "top" ? "text-[#2ECC71]" : "text-[#A1A4B3]"
                  }`}>
                    {type === "top" ? formatCurrency(product.revenue || 0) : `${unitsSold} sold`}
                  </p>
                  {type === "top" ? (
                    <p className="text-xs text-[#6F7285] tabular-nums">{unitsSold} units</p>
                  ) : product.stockAge ? (
                    <p className="text-xs text-[#F5A623] flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" />
                      {product.stockAge}d old
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
