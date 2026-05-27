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

// Daily revenue type
interface DailyRevenue {
  date: string;
  revenue: number;
}

interface RevenueChartProps {
  data: DailyRevenue[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Handle empty data
  if (!data || data.length === 0) {
    return (
      <div className="p-5 rounded-xl bg-[#1A1B23]/60 backdrop-blur-xl border border-white/[0.08]">
        <h3 className="text-lg font-semibold text-[#F5F6FA] mb-4">Revenue Trend</h3>
        <p className="text-sm text-[#6F7285] text-center py-12">No revenue data available</p>
      </div>
    );
  }

  // Calculate chart dimensions
  const chartHeight = 200;
  const chartPadding = { top: 20, right: 20, bottom: 30, left: 60 };
  
  // Get min/max for scaling
  const revenues = data.map(d => d.revenue);
  const minRevenue = Math.min(...revenues) * 0.9;
  const maxRevenue = Math.max(...revenues) * 1.1;
  
  // Scale functions
  const scaleY = (value: number) => {
    const range = maxRevenue - minRevenue;
    if (range === 0) return chartHeight / 2;
    return chartHeight - chartPadding.bottom - ((value - minRevenue) / range) * (chartHeight - chartPadding.top - chartPadding.bottom);
  };

  // Generate path
  const generatePath = () => {
    if (data.length === 0) return "";
    
    const width = 700;
    const stepX = (width - chartPadding.left - chartPadding.right) / (data.length - 1 || 1);
    
    const points = data.map((d, i) => ({
      x: chartPadding.left + i * stepX,
      y: scaleY(d.revenue),
    }));
    
    // Create smooth curve using bezier
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cp1x = prev.x + (curr.x - prev.x) / 3;
      const cp2x = prev.x + (curr.x - prev.x) * 2 / 3;
      path += ` C ${cp1x} ${prev.y}, ${cp2x} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    
    return path;
  };

  // Generate Y-axis labels
  const yLabels = [minRevenue, (minRevenue + maxRevenue) / 2, maxRevenue].map(v => ({
    value: v,
    y: scaleY(v),
    label: formatCurrency(v),
  }));

  const width = 700;
  const stepX = (width - chartPadding.left - chartPadding.right) / (data.length - 1 || 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="p-5 rounded-xl bg-[#1A1B23]/60 backdrop-blur-xl border border-white/[0.08]"
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#F5F6FA]">Revenue Trend</h3>
        <p className="text-sm text-[#6F7285]">Last 30 days</p>
      </div>

      <div ref={containerRef} className="relative overflow-x-auto">
        <svg
          width="100%"
          height={chartHeight}
          viewBox={`0 0 ${width} ${chartHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className="min-w-[500px]"
        >
          {/* Gridlines */}
          {yLabels.map((label, i) => (
            <g key={i}>
              <line
                x1={chartPadding.left}
                y1={label.y}
                x2={width - chartPadding.right}
                y2={label.y}
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="4 4"
              />
              <text
                x={chartPadding.left - 8}
                y={label.y + 4}
                fill="#6F7285"
                fontSize="10"
                textAnchor="end"
              >
                {label.label}
              </text>
            </g>
          ))}

          {/* Line */}
          <motion.path
            d={generatePath()}
            fill="none"
            stroke="#6366F1"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: "easeInOut" }}
          />

          {/* Dots and hover areas */}
          {data.map((d, i) => {
            const x = chartPadding.left + i * stepX;
            const y = scaleY(d.revenue);
            const isHovered = hoveredIndex === i;

            return (
              <g key={i}>
                {/* Hover area */}
                <rect
                  x={x - stepX / 2}
                  y={chartPadding.top}
                  width={stepX}
                  height={chartHeight - chartPadding.top - chartPadding.bottom}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
                
                {/* Dot */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 5 : 3}
                  fill={isHovered ? "#6366F1" : "#111111"}
                  stroke="#6366F1"
                  strokeWidth="2"
                  style={{ transition: "r 0.15s" }}
                />

                {/* Tooltip */}
                {isHovered && (
                  <g>
                    <rect
                      x={x - 50}
                      y={y - 45}
                      width={100}
                      height={35}
                      rx={6}
                      fill="#1A1B23"
                      stroke="rgba(255,255,255,0.1)"
                    />
                    <text x={x} y={y - 30} fill="#F5F6FA" fontSize="11" textAnchor="middle" fontWeight="600">
                      {formatCurrency(d.revenue)}
                    </text>
                    <text x={x} y={y - 17} fill="#6F7285" fontSize="9" textAnchor="middle">
                      {new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* X-axis labels (every 7 days) */}
          {data.filter((_, i) => i % 7 === 0 || i === data.length - 1).map((d, i) => {
            const originalIndex = data.indexOf(d);
            const x = chartPadding.left + originalIndex * stepX;
            return (
              <text
                key={i}
                x={x}
                y={chartHeight - 8}
                fill="#6F7285"
                fontSize="10"
                textAnchor="middle"
              >
                {new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Summary text for accessibility */}
      <p className="sr-only">
        Revenue trend over 30 days, ranging from {formatCurrency(minRevenue)} to {formatCurrency(maxRevenue)}
      </p>
    </motion.div>
  );
}
