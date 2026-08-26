/**
 * Reports Dashboard Layout
 *
 * PHASE 17: DASHBOARDS & VISUAL ANALYTICS
 *
 * Provides:
 * - Filter context for all dashboard pages
 * - Sidebar navigation between report sections
 * - RBAC for admin-only sections
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  // <> Phase 1 reports basic only (prompt.md) — subsections below commented in nav array
  // RotateCcw,
  DollarSign,
  ChevronRight,
  // Tags,
  // Bookmark,
  // Layers,
  // Truck,
  // Warehouse,
  // ShoppingBag,
} from "lucide-react";
import { DashboardFilterProvider } from "@/hooks";
import { useAuth } from "@/lib/auth";
import { adminHref } from "@/lib/admin-routes";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
  adminOnly?: boolean;
}

const reportNavItems: NavItem[] = [
  {
    label: "Overview",
    href: adminHref("/reports"),
    icon: LayoutDashboard,
    description: "Executive summary & KPIs",
  },
  {
    label: "Inventory",
    href: adminHref("/reports/inventory"),
    icon: Package,
    description: "Stock levels & aging",
  },
  {
    label: "Sales",
    href: adminHref("/reports/sales"),
    icon: TrendingUp,
    description: "Revenue & product performance",
  },
  // <>
  // {
  //   label: "Returns",
  //   href: "/reports/returns",
  //   icon: RotateCcw,
  //   description: "Refunds & adjustments",
  //   adminOnly: true,
  // },
  {
    label: "Profit & Tax",
    href: adminHref("/reports/profit"),
    icon: DollarSign,
    description: "Margins & GST",
    adminOnly: true,
  },
  // {
  //   label: "Category",
  //   href: "/reports/category",
  //   icon: Tags,
  //   description: "Sales by product category",
  // },
  // {
  //   label: "Brand",
  //   href: "/reports/brand",
  //   icon: Bookmark,
  //   description: "Sales by product brand",
  // },
  // {
  //   label: "Variants",
  //   href: "/reports/size",
  //   icon: Layers,
  //   description: "Sales by variant option (API size field)",
  // },
  // {
  //   label: "Supplier",
  //   href: "/reports/supplier",
  //   icon: Truck,
  //   description: "Purchases by supplier",
  // },
  // {
  //   label: "Supplier Sales",
  //   href: "/reports/supplier-sales",
  //   icon: ShoppingBag,
  //   description: "Products sold by supplier",
  // },
  // {
  //   label: "Warehouse",
  //   href: "/reports/warehouse",
  //   icon: Warehouse,
  //   description: "Sales by store location",
  // },
];

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  // Filter nav items based on role
  const filteredNavItems = React.useMemo(() => {
    if (isAdmin) return reportNavItems;
    return reportNavItems.filter((item) => !item.adminOnly);
  }, [isAdmin]);

  const reportsRoot = adminHref("/reports");
  const isActive = (href: string) => {
    if (href === reportsRoot) return pathname === reportsRoot;
    return pathname.startsWith(href);
  };

  return (
    <DashboardFilterProvider>
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Navigation */}
        <nav className="lg:w-64 flex-shrink-0">
          <div className="sticky top-6 space-y-1">
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 px-3">
              Reports
            </h2>

            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group
                    ${
                      active
                        ? "bg-[var(--brand-muted)] text-[var(--brand)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                    }
                  `}
                >
                  <div
                    className={`p-1.5 rounded-md transition-colors ${
                      active
                        ? "bg-[var(--brand)]/20"
                        : "bg-[var(--bg-elevated)] group-hover:bg-[var(--brand-muted)]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-inherit">{item.label}</p>
                    <p
                      className={`text-xs truncate ${
                        active
                          ? "text-[var(--text-secondary)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {item.description}
                    </p>
                  </div>
                  {active && <ChevronRight className="w-4 h-4 opacity-60" />}
                </Link>
              );
            })}

            {/* Data source info */}
            <div className="mt-6 p-3 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-default)]">
              <p className="text-xs text-[var(--text-muted)]">
                All data derived from Phase 16 report APIs. No frontend
                calculations.
              </p>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <motion.div
          key={pathname}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-w-0"
        >
          {children}
        </motion.div>
      </div>
    </DashboardFilterProvider>
  );
}
