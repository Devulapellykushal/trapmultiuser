"use client";

import * as React from "react";
import { Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Eye,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ThumbsUp,
  Loader2,
} from "lucide-react";
import { PageTransition } from "@/components/layout";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Pagination } from "@/components/ui/pagination";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { debitCreditNotesService, CreditNote, DebitNote } from "@/services";
import {
  CreateCreditNoteModal,
  CreateDebitNoteModal,
  ViewCreditNoteModal,
  ViewDebitNoteModal,
} from "@/components/debit-credit-notes";
import { cn } from "@/lib/utils";

type TabType = "credit-notes" | "debit-notes";

export default function DebitCreditNotesPage() {
  return (
    <Suspense fallback={<DebitCreditNotesPageSkeleton />}>
      <DebitCreditNotesPageContent />
    </Suspense>
  );
}

function DebitCreditNotesPageSkeleton() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F6FA] flex items-center gap-2">
              <Receipt className="w-6 h-6 text-[#6366F1]" />
              Debit/Credit Notes
            </h1>
            <p className="text-sm text-[#6F7285] mt-1">Loading...</p>
          </div>
        </div>
        <SkeletonTable rows={6} />
      </div>
    </PageTransition>
  );
}

function DebitCreditNotesPageContent() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<TabType>("credit-notes");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");

  // Pagination state
  const [creditNotesPage, setCreditNotesPage] = React.useState(1);
  const [debitNotesPage, setDebitNotesPage] = React.useState(1);
  const pageSize = 20;

  // Modal states
  const [showCreateCreditModal, setShowCreateCreditModal] =
    React.useState(false);
  const [showCreateDebitModal, setShowCreateDebitModal] = React.useState(false);
  const [selectedCreditNote, setSelectedCreditNote] =
    React.useState<CreditNote | null>(null);
  const [selectedDebitNote, setSelectedDebitNote] =
    React.useState<DebitNote | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = React.useState(false);

  // Reset page when filters change
  React.useEffect(() => {
    setCreditNotesPage(1);
    setDebitNotesPage(1);
  }, [searchQuery, statusFilter]);

  // Reset page when tab changes
  React.useEffect(() => {
    if (activeTab === "credit-notes") {
      setCreditNotesPage(1);
    } else {
      setDebitNotesPage(1);
    }
  }, [activeTab]);

  // Fetch credit notes
  const {
    data: creditNotesResponse,
    isLoading: creditNotesLoading,
    isError: creditNotesError,
    refetch: refetchCreditNotes,
  } = useQuery({
    queryKey: [
      "credit-notes",
      statusFilter,
      searchQuery,
      creditNotesPage,
      pageSize,
    ],
    queryFn: () =>
      debitCreditNotesService.getCreditNotes({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        page: creditNotesPage,
        pageSize,
      }),
  });

  // Fetch debit notes
  const {
    data: debitNotesResponse,
    isLoading: debitNotesLoading,
    isError: debitNotesError,
    refetch: refetchDebitNotes,
  } = useQuery({
    queryKey: [
      "debit-notes",
      statusFilter,
      searchQuery,
      debitNotesPage,
      pageSize,
    ],
    queryFn: () =>
      debitCreditNotesService.getDebitNotes({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        page: debitNotesPage,
        pageSize,
      }),
  });

  const creditNotes = creditNotesResponse?.results || [];
  const debitNotes = debitNotesResponse?.results || [];

  const isLoading =
    activeTab === "credit-notes" ? creditNotesLoading : debitNotesLoading;
  const isError =
    activeTab === "credit-notes" ? creditNotesError : debitNotesError;
  const refetch =
    activeTab === "credit-notes" ? refetchCreditNotes : refetchDebitNotes;

  // Handle viewing credit note
  const handleViewCreditNote = async (noteId: string) => {
    setIsLoadingDetails(true);
    try {
      const note = await debitCreditNotesService.getCreditNote(noteId);
      setSelectedCreditNote(note);
    } catch (error) {
      console.error("Failed to fetch credit note:", error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Handle viewing debit note
  const handleViewDebitNote = async (noteId: string) => {
    setIsLoadingDetails(true);
    try {
      const note = await debitCreditNotesService.getDebitNote(noteId);
      setSelectedDebitNote(note);
    } catch (error) {
      console.error("Failed to fetch debit note:", error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Handle new return button
  const handleNewReturn = () => {
    if (activeTab === "credit-notes") {
      setShowCreateCreditModal(true);
    } else {
      setShowCreateDebitModal(true);
    }
  };

  // Handle success callbacks
  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
    queryClient.invalidateQueries({ queryKey: ["debit-notes"] });
  };

  if (isLoading) {
    return <DebitCreditNotesPageSkeleton />;
  }

  if (isError) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-[#F5F6FA] flex items-center gap-2">
            <Receipt className="w-6 h-6 text-[#6366F1]" />
            Debit/Credit Notes
          </h1>
          <div className="rounded-xl bg-[#1A1B23]/60 border border-white/[0.08]">
            <ErrorState
              message={`Could not load ${activeTab.replace("-", " ")}. Check if backend is running.`}
              onRetry={refetch}
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
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#F5F6FA] flex items-center gap-2">
              <Receipt className="w-6 h-6 text-[#6366F1]" />
              Debit/Credit Notes
            </h1>
            <p className="text-sm text-[#6F7285] mt-1">
              Manage customer returns and supplier returns
            </p>
          </div>
          <button
            onClick={handleNewReturn}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C6A15B] text-[#0E0F13] text-sm font-medium hover:bg-[#D4B06A] transition-colors"
          >
            <Plus className="w-4 h-4 stroke-[2]" />
            {activeTab === "credit-notes"
              ? "New Customer Return"
              : "New Supplier Return"}
          </button>
        </div>

        {/* Loading indicator for details */}
        {isLoadingDetails && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
            <Loader2 className="w-8 h-8 text-[#C6A15B] animate-spin" />
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-white/[0.08]">
          <div className="flex space-x-8">
            <button
              onClick={() => {
                setActiveTab("credit-notes");
                setStatusFilter("");
              }}
              className={cn(
                "py-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "credit-notes"
                  ? "text-[#C6A15B] border-[#C6A15B]"
                  : "text-[#6F7285] border-transparent hover:text-[#A1A4B3] hover:border-white/[0.2]",
              )}
            >
              Credit Notes ({creditNotes.length})
            </button>
            <button
              onClick={() => {
                setActiveTab("debit-notes");
                setStatusFilter("");
              }}
              className={cn(
                "py-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "debit-notes"
                  ? "text-[#C6A15B] border-[#C6A15B]"
                  : "text-[#6F7285] border-transparent hover:text-[#A1A4B3] hover:border-white/[0.2]",
              )}
            >
              Debit Notes ({debitNotes.length})
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6F7285]" />
            <input
              type="text"
              placeholder={`Search ${activeTab === "credit-notes" ? "credit notes" : "debit notes"}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#1A1B23]/60 border border-white/[0.08] text-[#F5F6FA] text-sm placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B]/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#6F7285]" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#1A1B23]/60 border border-white/[0.08] rounded-lg px-3 py-2.5 text-[#F5F6FA] text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A15B]/50"
            >
              <option value="">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="ISSUED">Issued</option>
              {activeTab === "credit-notes" ? (
                <>
                  <option value="SETTLED">Settled</option>
                  <option value="CANCELLED">Cancelled</option>
                </>
              ) : (
                <>
                  <option value="ACCEPTED">Accepted</option>
                  <option value="SETTLED">Settled</option>
                  <option value="REJECTED">Rejected</option>
                </>
              )}
            </select>
          </div>

          {statusFilter && (
            <button
              onClick={() => setStatusFilter("")}
              className="text-sm text-[#C6A15B] hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "credit-notes" ? (
              <>
                <CreditNotesTable
                  notes={creditNotes}
                  onView={handleViewCreditNote}
                  onCreateNew={() => setShowCreateCreditModal(true)}
                />
                {/* Credit Notes Pagination */}
                {creditNotesResponse?.meta &&
                  creditNotesResponse.meta.total > pageSize && (
                    <Pagination
                      page={creditNotesPage}
                      pageSize={pageSize}
                      total={creditNotesResponse.meta.total}
                      onPageChange={setCreditNotesPage}
                    />
                  )}
              </>
            ) : (
              <>
                <DebitNotesTable
                  notes={debitNotes}
                  onView={handleViewDebitNote}
                  onCreateNew={() => setShowCreateDebitModal(true)}
                />
                {/* Debit Notes Pagination */}
                {debitNotesResponse?.meta &&
                  debitNotesResponse.meta.total > pageSize && (
                    <Pagination
                      page={debitNotesPage}
                      pageSize={pageSize}
                      total={debitNotesResponse.meta.total}
                      onPageChange={setDebitNotesPage}
                    />
                  )}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Modals */}
        <CreateCreditNoteModal
          isOpen={showCreateCreditModal}
          onClose={() => setShowCreateCreditModal(false)}
          onSuccess={handleCreateSuccess}
        />

        <CreateDebitNoteModal
          isOpen={showCreateDebitModal}
          onClose={() => setShowCreateDebitModal(false)}
          onSuccess={handleCreateSuccess}
        />

        {selectedCreditNote && (
          <ViewCreditNoteModal
            isOpen={!!selectedCreditNote}
            onClose={() => setSelectedCreditNote(null)}
            creditNote={selectedCreditNote}
          />
        )}

        {selectedDebitNote && (
          <ViewDebitNoteModal
            isOpen={!!selectedDebitNote}
            onClose={() => setSelectedDebitNote(null)}
            debitNote={selectedDebitNote}
          />
        )}
      </div>
    </PageTransition>
  );
}

function CreditNotesTable({
  notes,
  onView,
  onCreateNew,
}: {
  notes: CreditNote[];
  onView: (id: string) => void;
  onCreateNew: () => void;
}) {
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      DRAFT: {
        color: "bg-[#6F7285]/20 text-[#A1A4B3]",
        icon: Clock,
        label: "Draft",
      },
      ISSUED: {
        color: "bg-[#3498DB]/20 text-[#3498DB]",
        icon: FileText,
        label: "Issued",
      },
      SETTLED: {
        color: "bg-[#2ECC71]/20 text-[#2ECC71]",
        icon: CheckCircle,
        label: "Settled",
      },
      CANCELLED: {
        color: "bg-[#E74C3C]/20 text-[#E74C3C]",
        icon: XCircle,
        label: "Cancelled",
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      color: "bg-white/10 text-white",
      icon: AlertTriangle,
      label: status,
    };

    const Icon = config.icon;

    return (
      <span
        className={cn(
          "px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
          config.color,
        )}
      >
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (notes.length === 0) {
    return (
      <div className="rounded-xl bg-[#1A1B23]/60 border border-white/[0.08]">
        <EmptyState
          icon={Receipt}
          title="No credit notes found"
          description="Credit notes will appear here when customers return products"
          actions={[
            {
              label: "Create Credit Note",
              onClick: onCreateNew,
              variant: "primary",
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#1A1B23]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Credit Note
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Original Invoice
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Customer
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Return Date
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Reason
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Amount
              </th>
              <th className="text-center px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {notes.map((note) => (
              <motion.tr
                key={note.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => onView(note.id)}
                className="hover:bg-white/[0.02] cursor-pointer transition-colors"
              >
                <td className="px-4 py-4">
                  <span className="font-mono text-sm text-[#2ECC71]">
                    {note.creditNoteNumber}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[#F5F6FA]">
                    {note.originalInvoiceNumber}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[#A1A4B3]">
                    {note.customerName || "Walk-in Customer"}
                  </span>
                </td>
                <td className="px-4 py-4">{getStatusBadge(note.status)}</td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[#A1A4B3]">
                    {formatDate(note.returnDate)}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[#A1A4B3]">
                    {note.returnReason.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-sm font-medium text-[#F5F6FA]">
                    {debitCreditNotesService.formatCurrency(note.totalAmount)}
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onView(note.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/[0.1] transition-colors"
                  >
                    <Eye className="w-4 h-4 text-[#6F7285]" />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DebitNotesTable({
  notes,
  onView,
  onCreateNew,
}: {
  notes: DebitNote[];
  onView: (id: string) => void;
  onCreateNew: () => void;
}) {
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      DRAFT: {
        color: "bg-[#6F7285]/20 text-[#A1A4B3]",
        icon: Clock,
        label: "Draft",
      },
      ISSUED: {
        color: "bg-[#3498DB]/20 text-[#3498DB]",
        icon: FileText,
        label: "Issued",
      },
      ACCEPTED: {
        color: "bg-[#2ECC71]/20 text-[#2ECC71]",
        icon: ThumbsUp,
        label: "Accepted",
      },
      SETTLED: {
        color: "bg-[#27AE60]/20 text-[#27AE60]",
        icon: CheckCircle,
        label: "Settled",
      },
      REJECTED: {
        color: "bg-[#E74C3C]/20 text-[#E74C3C]",
        icon: XCircle,
        label: "Rejected",
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      color: "bg-white/10 text-white",
      icon: AlertTriangle,
      label: status,
    };

    const Icon = config.icon;

    return (
      <span
        className={cn(
          "px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
          config.color,
        )}
      >
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (notes.length === 0) {
    return (
      <div className="rounded-xl bg-[#1A1B23]/60 border border-white/[0.08]">
        <EmptyState
          icon={Receipt}
          title="No debit notes found"
          description="Debit notes will appear here when returning items to suppliers"
          actions={[
            {
              label: "Create Debit Note",
              onClick: onCreateNew,
              variant: "primary",
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#1A1B23]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Debit Note
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Original PO
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Supplier
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Return Date
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Reason
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Amount
              </th>
              <th className="text-center px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {notes.map((note) => (
              <motion.tr
                key={note.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => onView(note.id)}
                className="hover:bg-white/[0.02] cursor-pointer transition-colors"
              >
                <td className="px-4 py-4">
                  <span className="font-mono text-sm text-[#E67E22]">
                    {note.debitNoteNumber}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[#F5F6FA]">
                    {note.originalPoNumber}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[#A1A4B3]">
                    {note.supplierName}
                  </span>
                </td>
                <td className="px-4 py-4">{getStatusBadge(note.status)}</td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[#A1A4B3]">
                    {formatDate(note.returnDate)}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[#A1A4B3]">
                    {note.returnReason.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-sm font-medium text-[#F5F6FA]">
                    {debitCreditNotesService.formatCurrency(note.totalAmount)}
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onView(note.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/[0.1] transition-colors"
                  >
                    <Eye className="w-4 h-4 text-[#6F7285]" />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
