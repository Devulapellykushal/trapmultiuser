"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  X,
  FileText,
  Calendar,
  Truck,
  Building,
  Hash,
  CheckCircle,
  Clock,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  Package,
  Loader2,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  debitCreditNotesService,
  DebitNote,
} from "@/services/debit-credit-notes.service";
import { cn } from "@/lib/utils";

interface ViewDebitNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  debitNote: DebitNote;
}

export function ViewDebitNoteModal({
  isOpen,
  onClose,
  debitNote,
}: ViewDebitNoteModalProps) {
  const queryClient = useQueryClient();
  const [showSettleForm, setShowSettleForm] = React.useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = React.useState(
    debitNote.totalAmount,
  );
  const [rejectNotes, setRejectNotes] = React.useState("");
  const [showRejectForm, setShowRejectForm] = React.useState(false);

  // Mutations
  const issueMutation = useMutation({
    mutationFn: () => debitCreditNotesService.issueDebitNote(debitNote.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debit-notes"] });
      onClose();
    },
  });

  const acceptMutation = useMutation({
    mutationFn: () => debitCreditNotesService.acceptDebitNote(debitNote.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debit-notes"] });
      onClose();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      debitCreditNotesService.rejectDebitNote(debitNote.id, rejectNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debit-notes"] });
      onClose();
    },
  });

  const settleMutation = useMutation({
    mutationFn: () =>
      debitCreditNotesService.settleDebitNote(
        debitNote.id,
        parseFloat(adjustmentAmount),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debit-notes"] });
      onClose();
    },
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      DRAFT: {
        color: "bg-zinc-500/20 text-zinc-400",
        icon: Clock,
        label: "Draft",
      },
      ISSUED: {
        color: "bg-blue-500/20 text-blue-400",
        icon: FileText,
        label: "Issued",
      },
      ACCEPTED: {
        color: "bg-emerald-500/20 text-emerald-400",
        icon: ThumbsUp,
        label: "Accepted",
      },
      SETTLED: {
        color: "bg-green-500/20 text-green-400",
        icon: CheckCircle,
        label: "Settled",
      },
      REJECTED: {
        color: "bg-red-500/20 text-red-400",
        icon: XCircle,
        label: "Rejected",
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      color: "bg-zinc-500/20 text-zinc-400",
      icon: Clock,
      label: status,
    };

    const Icon = config.icon;

    return (
      <span
        className={cn(
          "px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 w-fit",
          config.color,
        )}
      >
        <Icon className="w-4 h-4" />
        {config.label}
      </span>
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 modal-scrim"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-4xl mx-4 bg-gradient-to-br from-zinc-900/95 to-zinc-800/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-3">
              <FileText className="w-6 h-6 text-orange-400" />
              Debit Note Details
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {debitNote.debitNoteNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="space-y-6">
            {/* Header Info */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Debit Note Number
                  </label>
                  <div className="flex items-center gap-2 text-white">
                    <Hash className="w-4 h-4 text-zinc-400" />
                    <span className="font-mono text-orange-400">
                      {debitNote.debitNoteNumber}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Original PO
                  </label>
                  <div className="flex items-center gap-2 text-white">
                    <FileText className="w-4 h-4 text-zinc-400" />
                    <span>{debitNote.originalPoNumber}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Supplier
                  </label>
                  <div className="flex items-center gap-2 text-white">
                    <Truck className="w-4 h-4 text-zinc-400" />
                    <span>{debitNote.supplierName}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Warehouse
                  </label>
                  <div className="flex items-center gap-2 text-white">
                    <Building className="w-4 h-4 text-zinc-400" />
                    <span>{debitNote.warehouseName}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Status
                  </label>
                  {getStatusBadge(debitNote.status)}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Return Reason
                  </label>
                  <span className="text-white">
                    {debitNote.returnReason.replace(/_/g, " ")}
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Return Date
                  </label>
                  <div className="flex items-center gap-2 text-white">
                    <Calendar className="w-4 h-4 text-zinc-400" />
                    <span>{formatDate(debitNote.returnDate)}</span>
                  </div>
                </div>

                {debitNote.issueDate && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
                      Issue Date
                    </label>
                    <div className="flex items-center gap-2 text-white">
                      <Calendar className="w-4 h-4 text-zinc-400" />
                      <span>{formatDate(debitNote.issueDate)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {debitNote.notes && (
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Notes
                </label>
                <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 text-zinc-300 text-sm">
                  {debitNote.notes}
                </div>
              </div>
            )}

            {/* Items */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-3">
                Items Being Returned ({debitNote.items?.length || 0})
              </label>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th className="text-left py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="text-center py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="text-center py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Condition
                      </th>
                      <th className="text-right py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Unit Price
                      </th>
                      <th className="text-right py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Line Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700">
                    {debitNote.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="py-4">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-zinc-400" />
                            <div>
                              <span className="text-sm text-white font-medium">
                                {item.productName}
                              </span>
                              <span className="block text-xs text-zinc-400 mt-0.5">
                                SKU: {item.productSku}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          <span className="text-sm text-zinc-300">
                            {item.quantityReturned}
                          </span>
                        </td>
                        <td className="py-4 text-center">
                          <span
                            className={cn(
                              "px-2 py-1 rounded-full text-xs",
                              item.condition === "GOOD"
                                ? "bg-green-500/20 text-green-400"
                                : item.condition === "DAMAGED"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-yellow-500/20 text-yellow-400",
                            )}
                          >
                            {item.condition}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-sm text-zinc-300">
                            {debitCreditNotesService.formatCurrency(
                              item.unitPrice,
                            )}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-sm text-white font-medium">
                            {debitCreditNotesService.formatCurrency(
                              item.lineTotal,
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="border-t border-zinc-700 pt-4">
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Total Amount:</span>
                    <span className="text-white">
                      {debitCreditNotesService.formatCurrency(
                        debitNote.totalAmount,
                      )}
                    </span>
                  </div>
                  {debitNote.status === "SETTLED" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Adjustment:</span>
                      <span className="text-orange-400 font-medium">
                        {debitCreditNotesService.formatCurrency(
                          debitNote.adjustmentAmount,
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Settle Form */}
            {showSettleForm && debitNote.status === "ACCEPTED" && (
              <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Adjustment Amount (Credit from Supplier)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                  <button
                    onClick={() => settleMutation.mutate()}
                    disabled={settleMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {settleMutation.isPending && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    Confirm Settlement
                  </button>
                </div>
              </div>
            )}

            {/* Reject Form */}
            {showRejectForm && debitNote.status === "ISSUED" && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Rejection Notes
                </label>
                <div className="space-y-4">
                  <textarea
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    placeholder="Reason for rejection..."
                    className="w-full px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                    rows={2}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowRejectForm(false)}
                      className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate()}
                      disabled={rejectMutation.isPending}
                      className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {rejectMutation.isPending && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-zinc-700">
          <div className="text-sm text-zinc-400">
            Created by {debitNote.createdByName} on{" "}
            {formatDate(debitNote.createdAt)}
          </div>
          <div className="flex items-center gap-3">
            {debitNote.status === "DRAFT" && (
              <button
                onClick={() => issueMutation.mutate()}
                disabled={issueMutation.isPending}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {issueMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Issue to Supplier
              </button>
            )}
            {debitNote.status === "ISSUED" && !showRejectForm && (
              <>
                <button
                  onClick={() => acceptMutation.mutate()}
                  disabled={acceptMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {acceptMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  <ThumbsUp className="w-4 h-4" />
                  Accept
                </button>
                <button
                  onClick={() => setShowRejectForm(true)}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 transition-colors flex items-center gap-2"
                >
                  <ThumbsDown className="w-4 h-4" />
                  Reject
                </button>
              </>
            )}
            {debitNote.status === "ACCEPTED" && !showSettleForm && (
              <button
                onClick={() => setShowSettleForm(true)}
                className="px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-500 transition-colors"
              >
                Process Settlement
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
