/**
 * Customers — in-app CRM shell (Directory · Segments · Outreach).
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BookUser,
  ChevronRight,
  IndianRupee,
  Megaphone,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import { adminHref } from "@/lib/admin-routes";
import { useCustomerHubSummary } from "@/hooks/use-customers";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
}

const customersRoot = adminHref("/customers");
const segmentsHref = adminHref("/customers/segments");
const outreachHref = adminHref("/customers/outreach");

const customerNavItems: NavItem[] = [
  {
    label: "Directory",
    href: customersRoot,
    icon: BookUser,
    description: "Every buyer from the counter",
  },
  {
    label: "Segments",
    href: segmentsHref,
    icon: UsersRound,
    description: "Live lists for WhatsApp & Meta",
  },
  {
    label: "Outreach",
    href: outreachHref,
    icon: Megaphone,
    description: "Templates & channels",
  },
];

function isNavActive(pathname: string, href: string): boolean {
  if (href === customersRoot) {
    if (pathname === customersRoot) return true;
    if (
      pathname.startsWith(`${customersRoot}/`) &&
      !pathname.startsWith(segmentsHref) &&
      !pathname.startsWith(outreachHref)
    ) {
      return true;
    }
    return false;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatInr(amount: string | number | undefined): string {
  const n = typeof amount === "string" ? Number(amount) : amount ?? 0;
  if (!Number.isFinite(n)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: summary } = useCustomerHubSummary();
  const isProfile =
    pathname.startsWith(`${customersRoot}/`) &&
    !pathname.startsWith(segmentsHref) &&
    !pathname.startsWith(outreachHref) &&
    pathname !== customersRoot;

  return (
    <div className="space-y-5">
      {/* App masthead */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 0% 0%, rgba(196,165,116,0.18), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(196,165,116,0.08), transparent 50%)",
          }}
        />
        <div className="relative px-5 py-5 sm:px-6 sm:py-6">
          <p className="font-[family-name:var(--font-display,Cormorant_Garamond),Georgia,serif] text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
            Customers
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)] max-w-xl">
            CRM for your tyre counter — every invoice with a phone lands here,
            ready for WhatsApp and fleet follow-up.
          </p>

          {!isProfile && (
            <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi
                icon={Users}
                label="Active"
                value={String(summary?.activeCustomers ?? "—")}
              />
              <Kpi
                icon={UsersRound}
                label="In directory"
                value={String(summary?.totalCustomers ?? "—")}
              />
              <Kpi
                icon={IndianRupee}
                label="Linked revenue"
                value={
                  summary ? formatInr(summary.linkedRevenue) : "—"
                }
              />
              <Kpi
                icon={Wallet}
                label="Credit due"
                value={
                  summary ? formatInr(summary.creditOutstanding) : "—"
                }
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-56 xl:w-64 flex-shrink-0">
          <div className="sticky top-6 space-y-1">
            <h2 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.14em] mb-3 px-3">
              Inside Customers
            </h2>

            {customerNavItems.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group
                    ${
                      active
                        ? "bg-[var(--brand-muted)] text-[var(--brand)] shadow-[var(--shadow-glow-rest)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                    }
                  `}
                >
                  <div
                    className={`p-1.5 rounded-lg transition-colors ${
                      active
                        ? "bg-[var(--brand)]/20"
                        : "bg-[var(--bg-elevated)] group-hover:bg-[var(--brand-muted)]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-inherit">
                      {item.label}
                    </p>
                    <p
                      className={`text-[11px] truncate ${
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

            <div className="mt-5 p-3 popover-panel rounded-xl border border-[var(--border-default)]">
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                Same mobile or same email = one customer. Alias names from other
                invoices are kept in notes. Sync from invoices anytime.
              </p>
            </div>
          </div>
        </nav>

        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="flex-1 min-w-0"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)]/60 backdrop-blur-sm px-3.5 py-3">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <Icon className="w-3.5 h-3.5 text-[var(--brand)]" />
        <span className="text-[10px] uppercase tracking-wider font-medium">
          {label}
        </span>
      </div>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-[var(--text-primary)] tracking-tight">
        {value}
      </p>
    </div>
  );
}
