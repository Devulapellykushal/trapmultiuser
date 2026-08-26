"use client";

import * as React from "react";
import { motion } from "framer-motion";

interface InventoryHealthProps {
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

export function InventoryHealth({ inStock, lowStock, outOfStock }: InventoryHealthProps) {
  const total = inStock + lowStock + outOfStock;
  
  const segments = [
    { label: "In Stock", value: inStock, color: "#3f9d7a", percent: Math.round((inStock / total) * 100) },
    { label: "Low Stock", value: lowStock, color: "#d4a054", percent: Math.round((lowStock / total) * 100) },
    { label: "Out of Stock", value: outOfStock, color: "#c45c5c", percent: Math.round((outOfStock / total) * 100) },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="p-5 rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08]"
    >
      <h3 className="text-lg font-semibold text-[#f3eee4] mb-4">Inventory Health</h3>

      {/* Segmented Bar */}
      <div className="h-4 rounded-full overflow-hidden flex mb-4">
        {segments.map((seg, i) => (
          <motion.div
            key={seg.label}
            initial={{ width: 0 }}
            animate={{ width: `${seg.percent}%` }}
            transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ backgroundColor: seg.color }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-3">
        {segments.map((seg) => (
          <div key={seg.label} className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-xs text-[#c5c0b5]">{seg.label}</span>
            </div>
            <p className="text-lg font-semibold text-[#f3eee4] tabular-nums">
              {seg.percent}%
            </p>
          </div>
        ))}
      </div>

      {/* Accessibility summary */}
      <p className="sr-only">
        Inventory health: {inStock}% in stock, {lowStock}% low stock, {outOfStock}% out of stock
      </p>
    </motion.div>
  );
}
