"use client";

import {
  InvoiceFilters,
  InvoicePreview,
  InvoiceTable,
  PaymentFilter,
  StatusFilter,
} from "@/components/invoices";
import { PageTransition } from "@/components/layout";
import { EmptyState, emptyStates } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Pagination } from "@/components/ui/pagination";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useInvoices } from "@/hooks";
import { api } from "@/lib/api";
import {
  type ApiInvoice,
  type Invoice,
  transformInvoiceDetail,
  transformInvoiceList,
} from "@/lib/invoices/transform-api-invoice";
import { DollarSign, FileText, Receipt } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { adminHref } from "@/lib/admin-routes";

// Format currency helper
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function InvoicesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const handledSaleIdFromUrlRef = React.useRef<string | null>(null);

  // Pagination state
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  // Filter state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [paymentFilter, setPaymentFilter] =
    React.useState<PaymentFilter>("all");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [dateRange, setDateRange] = React.useState("all");

  // Preview state
  const [selectedInvoice, setSelectedInvoice] = React.useState<Invoice | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [, setLoadingDetail] = React.useState(false);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, paymentFilter, statusFilter, dateRange]);

  // API hook
  const {
    data: invoicesResponse,
    isLoading,
    isError,
    refetch,
  } = useInvoices({
    search: searchQuery || undefined,
    payment_method: paymentFilter !== "all" ? paymentFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    page_size: pageSize,
  });

  // Transform invoices for list display
  const invoices: Invoice[] = React.useMemo(() => {
    if (!invoicesResponse?.results) return [];
    return (invoicesResponse.results as unknown as ApiInvoice[]).map(
      transformInvoiceList,
    );
  }, [invoicesResponse]);

  // Filter check
  const hasActiveFilters =
    searchQuery !== "" ||
    paymentFilter !== "all" ||
    statusFilter !== "all" ||
    dateRange !== "all";

  // Reset filters
  const resetFilters = () => {
    setSearchQuery("");
    setPaymentFilter("all");
    setStatusFilter("all");
    setDateRange("all");
  };

  // Summary stats
  const summary = React.useMemo(() => {
    const paidInvoices = invoices.filter((inv) => inv.status === "paid");
    const totalRevenue = paidInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const avgValue =
      paidInvoices.length > 0
        ? Math.round(totalRevenue / paidInvoices.length)
        : 0;
    return {
      totalInvoices: invoices.length,
      totalRevenue,
      avgValue,
    };
  }, [invoices]);

  // Handlers — open immediately with list row, then hydrate full detail
  const handleInvoiceClick = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPreviewOpen(true);
    setLoadingDetail(true);
    try {
      const fullInvoice = await api.get<ApiInvoice>(`/invoices/${invoice.id}/`);
      setSelectedInvoice(transformInvoiceDetail(fullInvoice));
    } catch (error) {
      console.error("Failed to fetch invoice details:", error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
    setTimeout(() => setSelectedInvoice(null), 300);
  };

  // Open invoice preview when POS navigates here with `?sale_id=` (View Invoice).
  React.useEffect(() => {
    const raw = searchParams.get("sale_id");
    if (!raw) {
      handledSaleIdFromUrlRef.current = null;
      return;
    }
    if (handledSaleIdFromUrlRef.current === raw) return;
    handledSaleIdFromUrlRef.current = raw;

    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{ results: ApiInvoice[] }>("/invoices/", {
          sale_id: raw,
          page_size: 5,
        });
        const first = data.results?.[0];
        router.replace(adminHref("/invoices"), { scroll: false });
        if (cancelled || !first) {
          return;
        }
        setLoadingDetail(true);
        try {
          const fullInvoice = await api.get<ApiInvoice>(
            `/invoices/${first.id}/`,
          );
          if (!cancelled) {
            setSelectedInvoice(transformInvoiceDetail(fullInvoice));
            setPreviewOpen(true);
          }
        } catch (error) {
          console.error("Failed to fetch invoice details:", error);
          if (!cancelled) {
            setSelectedInvoice(transformInvoiceList(first));
            setPreviewOpen(true);
          }
        } finally {
          if (!cancelled) {
            setLoadingDetail(false);
          }
        }
      } catch {
        router.replace(adminHref("/invoices"), { scroll: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  // Loading state
  if (isLoading) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[#f3eee4] flex items-center gap-2">
              <FileText className="w-6 h-6 text-[#c4a574]" />
              Invoices
            </h1>
            <p className="text-sm text-[#8a867c] mt-1">Loading invoices...</p>
          </div>
          <SkeletonTable rows={6} />
        </div>
      </PageTransition>
    );
  }

  // Error state
  if (isError) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-[#f3eee4] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#c4a574]" />
            Invoices
          </h1>
          <div className="rounded-xl bg-[#111318]/60 border border-white/[0.08]">
            <ErrorState
              message="Could not load invoices. Check if backend is running."
              onRetry={() => refetch()}
            />
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#f3eee4] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#c4a574]" />
            Invoices
          </h1>
          <p className="text-sm text-[#8a867c] mt-1">Sales & billing history</p>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard
            icon={<Receipt className="w-4 h-4 text-[#c4a574]" />}
            label="Total Invoices"
            value={summary.totalInvoices.toString()}
          />
          <SummaryCard
            icon={<DollarSign className="w-4 h-4 text-[#c4a574]" />}
            label="Total Revenue"
            value={formatCurrency(summary.totalRevenue)}
          />
          <SummaryCard
            icon={<FileText className="w-4 h-4 text-[#c4a574]" />}
            label="Avg Invoice"
            value={formatCurrency(summary.avgValue)}
          />
        </div>

        {/* Filters */}
        <InvoiceFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          paymentFilter={paymentFilter}
          onPaymentChange={setPaymentFilter}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Invoice Table or Empty State */}
        {invoices.length === 0 ? (
          <div className="rounded-xl bg-[#111318]/60 border border-white/[0.08]">
            <EmptyState
              icon={Receipt}
              title={emptyStates.invoices.title}
              description={emptyStates.invoices.description}
              actions={[
                { label: "Open POS", href: "/pos", variant: "primary" },
              ]}
            />
          </div>
        ) : (
          <>
            <InvoiceTable
              invoices={invoices}
              onInvoiceClick={handleInvoiceClick}
            />
            {/* Pagination */}
            {invoicesResponse?.meta && (
              <Pagination
                page={invoicesResponse.meta.page}
                pageSize={invoicesResponse.meta.pageSize}
                total={invoicesResponse.meta.total}
                onPageChange={setPage}
              />
            )}
          </>
        )}

        {/* Invoice Preview Modal */}
        <InvoicePreview
          invoice={selectedInvoice}
          isOpen={previewOpen}
          onClose={handleClosePreview}
        />
      </div>
    </PageTransition>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-[#111318]/40 border border-white/[0.06]">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-[#8a867c] uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold text-[#f3eee4] tabular-nums">{value}</p>
    </div>
  );
}
