"use client";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion } from "framer-motion";

interface KPICardProps {
  label: string;
  value: string;
  delta?: number;
  icon?: React.ReactNode;
  delay?: number;
}

export function KPICard({ label, value, delta, icon, delay = 0 }: KPICardProps) {
  const getDeltaColor = () => {
    if (!delta) return "text-[#c5c0b5]";
    if (delta > 0) return "text-[#3f9d7a]";
    if (delta < 0) return "text-[#c45c5c]";
    return "text-[#c5c0b5]";
  };

  const getDeltaIcon = () => {
    if (!delta || delta === 0) return <Minus className="w-3 h-3" />;
    if (delta > 0) return <TrendingUp className="w-3 h-3" />;
    return <TrendingDown className="w-3 h-3" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="p-5 rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08]"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-[#8a867c] uppercase tracking-wide">
          {label}
        </span>
        {icon && (
          <div className="p-2 rounded-lg bg-[#c4a574]/10">
            {icon}
          </div>
        )}
      </div>
      
      <p className="text-3xl font-bold text-[#f3eee4] tabular-nums mb-2">
        {value}
      </p>
      
      {typeof delta === "number" && (
        <div className={`flex items-center gap-1 text-sm ${getDeltaColor()}`}>
          {getDeltaIcon()}
          <span className="tabular-nums">{Math.abs(delta)}%</span>
          <span className="text-[#8a867c]">vs last month</span>
        </div>
      )}
    </motion.div>
  );
}
