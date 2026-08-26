"use client";

import { motion } from "framer-motion";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <motion.div
      className={`bg-white/[0.05] rounded animate-pulse ${className}`}
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 0.8, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="p-5 rounded-xl bg-[#111318]/60 border border-white/[0.08] space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl bg-[#111318]/60 border border-white/[0.08] overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 border-b border-white/[0.08]">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28 ml-auto" />
      </div>
      {/* Rows */}
      <div className="divide-y divide-white/[0.06]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="p-5 rounded-xl bg-[#111318]/60 border border-white/[0.08]">
      <Skeleton className="h-5 w-32 mb-4" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}
