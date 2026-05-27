/**
 * Section Card Component
 *
 * PHASE 17: Container for dashboard sections
 */
"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface SectionCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className = "",
}: SectionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-[var(--bg-surface)] backdrop-blur-sm rounded-xl border border-[var(--border-default)] ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-6 pb-0">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="p-2 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-default)]">
              <Icon className="w-5 h-5 text-[var(--accent-primary)]" />
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
            {description && (
              <p className="text-sm text-[var(--text-muted)] mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {action && <div>{action}</div>}
      </div>

      {/* Content */}
      <div className="p-6">{children}</div>
    </motion.div>
  );
}

export default SectionCard;
