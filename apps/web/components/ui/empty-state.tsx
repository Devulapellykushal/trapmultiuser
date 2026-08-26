"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: EmptyStateAction[];
}

export function EmptyState({ icon: Icon, title, description, actions }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-16 px-6"
    >
      {/* Icon Container */}
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#c4a574]/20 to-[#c4a574]/5 flex items-center justify-center mb-6">
        <Icon className="w-10 h-10 text-[#c4a574] stroke-[1.5]" />
      </div>

      {/* Text */}
      <h3 className="text-xl font-semibold text-[#f3eee4] text-center mb-2">
        {title}
      </h3>
      <p className="text-sm text-[#c5c0b5] text-center max-w-md mb-6">
        {description}
      </p>

      {/* CTAs */}
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-3">
          {actions.map((action, index) => {
            const className = `
              px-5 py-2.5 rounded-lg text-sm font-medium transition-all
              ${action.variant === "secondary"
                ? "bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] hover:bg-white/[0.08]"
                : "bg-[#c4a574] text-[#0c0d10] hover:bg-[#d4b88a]"
              }
            `;

            // If onClick is provided, render a button
            if (action.onClick) {
              return (
                <button
                  key={index}
                  onClick={action.onClick}
                  className={className}
                >
                  {action.label}
                </button>
              );
            }

            // Otherwise, render a Link
            return (
              <Link
                key={index}
                href={action.href || "#"}
                className={className}
              >
                {action.label}
              </Link>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// Pre-configured empty states for common screens
export const emptyStates = {
  dashboard: {
    title: "No business activity yet",
    description: "Start by adding products to your inventory and making your first sale. Your dashboard will come alive with insights.",
  },
  inventory: {
    title: "No products in your list yet",
    description:
      "When you add a product, it shows up here with stock and prices. Start with “Add a product” (one at a time) or “Import from file” if you already have a list.",
  },
  pos: {
    title: "No products available for sale",
    description: "Add products to your inventory first. Once you have items in stock, they'll appear here for quick checkout.",
  },
  analytics: {
    title: "Analytics will appear once sales start",
    description: "Complete some sales to see revenue trends, top products, and business insights here.",
  },
  invoices: {
    title: "No invoices yet",
    description: "Invoices are generated automatically when you complete sales. Make your first sale to get started.",
  },
};
