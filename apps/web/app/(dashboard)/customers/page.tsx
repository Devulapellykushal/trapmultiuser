"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  IndianRupee,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  Wallet,
} from "lucide-react";
import { PageTransition } from "@/components/layout";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { CustomerFormModal } from "@/components/customers/customer-form-modal";
import {
  useCustomers,
  useSyncCustomersFromSales,
} from "@/hooks/use-customers";
import { adminHref } from "@/lib/admin-routes";
import type { Customer } from "@/services/customers.service";

type ActiveFilter = "all" | "active" | "inactive";

function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return d.toLocaleDateString("en-IN");
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatInr(amount: string | number | undefined): string {
  const n = typeof amount === "string" ? Number(amount) : amount ?? 0;
  if (!Number.isFinite(n) || n === 0) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function CustomersDirectoryPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>("active");
  const [page, setPage] = React.useState(1);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const pageSize = 20;

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilter]);

  const listParams = React.useMemo(
    () => ({
      search: debouncedSearch || undefined,
      is_active:
        activeFilter === "all" ? undefined : activeFilter === "active",
      page,
      page_size: pageSize,
    }),
    [debouncedSearch, activeFilter, page],
  );

  const { data, isLoading, isError, refetch, isFetching } =
    useCustomers(listParams);
  const syncFromSales = useSyncCustomersFromSales();

  const results = data?.results ?? [];
  const meta = data?.meta;
  const total = meta?.total ?? 0;

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (c: Customer, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditing(c);
    setModalOpen(true);
  };

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
              Directory
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              Unique by mobile or email — same contact maps to one person
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={syncFromSales.isPending}
              onClick={() => syncFromSales.mutate()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:opacity-50"
              title="Pull every invoice buyer into this directory"
            >
              {syncFromSales.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Sync from invoices
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)] shadow-[var(--shadow-glow-rest)]"
            >
              <Plus className="w-4 h-4" />
              Add customer
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, or GSTIN"
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40"
            />
          </div>
          <div className="flex rounded-xl border border-[var(--border-default)] overflow-hidden self-start">
            {(
              [
                ["active", "Active"],
                ["inactive", "Inactive"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setActiveFilter(value)}
                className={`px-3.5 py-2 text-xs font-medium transition-colors ${
                  activeFilter === value
                    ? "bg-[var(--brand-muted)] text-[var(--brand)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} />
        ) : isError ? (
          <ErrorState
            message="Couldn’t load customers. Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title={
              debouncedSearch
                ? "No matches"
                : activeFilter === "inactive"
                  ? "No inactive customers"
                  : "Directory is empty"
            }
            description={
              debouncedSearch
                ? "Try a different name, phone, or GSTIN."
                : "Add a buyer, or complete a POS sale with a mobile — they appear here automatically."
            }
            actions={
              !debouncedSearch
                ? [{ label: "Add customer", onClick: openCreate }]
                : undefined
            }
          />
        ) : (
          <div className="rounded-2xl border border-[var(--border-default)] overflow-hidden bg-[var(--bg-elevated)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed min-w-[720px]">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-left text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-4 py-3 font-medium w-[24%]">Name</th>
                    <th className="px-3 py-3 font-medium w-[14%]">Phone</th>
                    <th className="px-3 py-3 font-medium w-[12%]">GSTIN</th>
                    <th className="px-3 py-3 font-medium w-[10%]">Orders</th>
                    <th className="px-3 py-3 font-medium w-[12%]">Revenue</th>
                    <th className="px-3 py-3 font-medium w-[12%]">Last visit</th>
                    <th className="px-3 py-3 font-medium w-[10%]">Status</th>
                    <th className="px-3 py-3 font-medium w-[6%] text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((c) => {
                    const credit = Number(c.creditOutstanding ?? 0);
                    return (
                      <tr
                        key={c.id}
                        onClick={() =>
                          router.push(adminHref(`/customers/${c.id}`))
                        }
                        className="border-b border-[var(--border-default)] last:border-0 cursor-pointer hover:bg-[var(--bg-surface)] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-[var(--text-primary)] truncate">
                            {c.name}
                          </p>
                          {credit > 0 ? (
                            <p className="text-[11px] text-[var(--warning)] flex items-center gap-1 mt-0.5">
                              <Wallet className="w-3 h-3" />
                              {formatInr(credit)} due
                            </p>
                          ) : c.email ? (
                            <p className="text-xs text-[var(--text-muted)] truncate">
                              {c.email}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-[var(--text-secondary)] tabular-nums">
                          {c.phone || "—"}
                        </td>
                        <td className="px-3 py-3">
                          {c.gstin ? (
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--brand-muted)] text-[var(--brand)]">
                              {c.gstin}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-[var(--text-secondary)]">
                          {c.saleCount ?? 0}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-[var(--text-secondary)]">
                          <span className="inline-flex items-center gap-0.5">
                            <IndianRupee className="w-3 h-3 opacity-50" />
                            {formatInr(c.totalRevenue).replace("₹", "")}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[var(--text-secondary)]">
                          {formatRelativeDate(c.lastSaleAt ?? c.updatedAt)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${
                              c.isActive
                                ? "bg-[var(--success-muted)] text-[var(--success)]"
                                : "bg-[var(--bg-surface)] text-[var(--text-muted)]"
                            }`}
                          >
                            {c.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => openEdit(c, e)}
                              className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--brand)] px-2 py-1"
                            >
                              Edit
                            </button>
                            <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {isFetching && !isLoading ? (
              <p className="px-4 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-default)]">
                Updating…
              </p>
            ) : null}
            <div className="px-4 py-3 border-t border-[var(--border-default)]">
              <Pagination
                page={meta?.page ?? page}
                pageSize={meta?.pageSize ?? pageSize}
                total={total}
                onPageChange={setPage}
              />
            </div>
          </div>
        )}
      </div>

      <CustomerFormModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        customer={editing}
      />
    </PageTransition>
  );
}
