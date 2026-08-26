"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Minus, PackagePlus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { useAdjustStock } from "@/hooks/use-inventory";
import { useLocationLabels } from "@/hooks/use-business-setup";

export interface PosStockTarget {
  productId: string;
  productName: string;
  brand: string;
  currentStock: number;
}

interface PosReceiveStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  target: PosStockTarget | null;
  warehouseId: string | null;
  warehouseName?: string;
}

type Mode = "add" | "remove";

function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as
      | { error?: string; detail?: string; reason?: string[] }
      | undefined;
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
    if (typeof data?.detail === "string" && data.detail.trim())
      return data.detail;
    if (Array.isArray(data?.reason) && data.reason[0]) return data.reason[0];
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not update stock. Please try again.";
}

/**
 * Compact POS modal: receive (or remove) stock for the selected tyre
 * without leaving the counter. Sale flow unchanged — this only updates ledger.
 */
export function PosReceiveStockModal({
  isOpen,
  onClose,
  onSuccess,
  target,
  warehouseId,
  warehouseName,
}: PosReceiveStockModalProps) {
  const { labels } = useLocationLabels();
  const adjustMutation = useAdjustStock();
  const [mode, setMode] = React.useState<Mode>("add");
  /** Empty by default so typing 7 becomes 7, not 17 */
  const [qtyInput, setQtyInput] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const qtyInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setMode("add");
    setQtyInput("");
    setReason("");
    setFieldError(null);
    // Focus qty so staff can type immediately
    const t = window.setTimeout(() => {
      qtyInputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [isOpen, target?.productId]);

  const quantityAbs = Math.max(0, Math.floor(Number(qtyInput) || 0));
  const hasValidQty = quantityAbs >= 1;
  const currentStock = target?.currentStock ?? 0;
  const resulting = !hasValidQty
    ? currentStock
    : mode === "add"
      ? currentStock + quantityAbs
      : currentStock - quantityAbs;
  const wouldGoNegative =
    hasValidQty && mode === "remove" && quantityAbs > currentStock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    if (!target?.productId) {
      setFieldError("No product selected.");
      return;
    }
    if (!warehouseId) {
      setFieldError(`Select a ${labels.warehouseSingular} first.`);
      return;
    }
    if (!hasValidQty) {
      setFieldError("Enter how many units (at least 1).");
      qtyInputRef.current?.focus();
      return;
    }
    if (wouldGoNegative) {
      setFieldError(
        `Cannot remove ${quantityAbs}. Only ${currentStock} on hand.`,
      );
      return;
    }

    const reasonText = (
      reason.trim() ||
      (mode === "add" ? "Stock received at counter" : "Stock removed at counter")
    ).trim();
    if (reasonText.length < 5) {
      setFieldError("Reason must be at least 5 characters.");
      return;
    }

    try {
      const result = await adjustMutation.mutateAsync({
        product_id: target.productId,
        warehouse_id: warehouseId,
        quantity: mode === "add" ? quantityAbs : -quantityAbs,
        reason: reasonText,
      });
      const newStock = Number(
        result.newStock ?? result.new_stock ?? resulting,
      );
      toast.success(
        mode === "add"
          ? `Added ${quantityAbs} to ${target.productName}. Now ${newStock} left.`
          : `Removed ${quantityAbs} from ${target.productName}. Now ${newStock} left.`,
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      const message = extractErrorMessage(err);
      setFieldError(message);
      toast.error(message);
    }
  };

  if (!isOpen || !target) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] modal-scrim"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-receive-stock-title"
          className="pointer-events-auto w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl modal-panel shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-[var(--border-default)] sticky top-0 bg-[var(--bg-elevated)] z-10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-[var(--brand-muted)] shrink-0">
                <PackagePlus className="w-5 h-5 text-[var(--brand)]" />
              </div>
              <div className="min-w-0">
                <h2
                  id="pos-receive-stock-title"
                  className="text-lg font-semibold text-[var(--text-primary)]"
                >
                  Update stock
                </h2>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {target.brand} · {target.productName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--bg-surface)] transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
              <div>
                <p className="text-xs text-[var(--text-muted)]">On hand now</p>
                <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {currentStock}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--text-muted)]">
                  {warehouseName || labels.warehouseSingular}
                </p>
                <p className="text-sm font-medium text-[var(--brand)]">
                  After:{" "}
                  <span className="tabular-nums">
                    {wouldGoNegative ? "—" : resulting}
                  </span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--bg-card-fill)] border border-[var(--border-default)]">
              <button
                type="button"
                onClick={() => setMode("add")}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mode === "add"
                    ? "bg-[var(--brand)] text-[var(--brand-contrast)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Plus className="w-4 h-4" />
                Stock in
              </button>
              <button
                type="button"
                onClick={() => setMode("remove")}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mode === "remove"
                    ? "bg-[var(--danger)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Minus className="w-4 h-4" />
                Stock out
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                Quantity
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setQtyInput(String(Math.max(0, quantityAbs - 1) || ""))
                  }
                  className="p-3 rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-surface)]"
                  aria-label="Decrease"
                >
                  <Minus className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>
                <input
                  ref={qtyInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={qtyInput}
                  placeholder="0"
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setQtyInput(digits);
                  }}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 text-center text-xl font-semibold tabular-nums py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                />
                <button
                  type="button"
                  onClick={() => setQtyInput(String(quantityAbs + 1))}
                  className="p-3 rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-surface)]"
                  aria-label="Increase"
                >
                  <Plus className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                Note{" "}
                <span className="text-[var(--text-muted)] font-normal">
                  (optional)
                </span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  mode === "add"
                    ? "e.g. Delivery arrived"
                    : "e.g. Damaged / returned to godown"
                }
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
              />
            </div>

            {fieldError && (
              <p className="text-sm text-[var(--danger)] bg-[var(--danger-muted)] border border-[var(--danger)]/30 rounded-lg px-3 py-2">
                {fieldError}
              </p>
            )}

            <button
              type="submit"
              disabled={
                adjustMutation.isPending ||
                wouldGoNegative ||
                !warehouseId ||
                !hasValidQty
              }
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[var(--brand-contrast)] [background:var(--grad-brand-diagonal)] hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {adjustMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving…
                </>
              ) : !hasValidQty ? (
                <>
                  <Plus className="w-5 h-5" />
                  Enter quantity
                </>
              ) : mode === "add" ? (
                <>
                  <Plus className="w-5 h-5" />
                  Add {quantityAbs} to stock
                </>
              ) : (
                <>
                  <Minus className="w-5 h-5" />
                  Remove {quantityAbs} from stock
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
