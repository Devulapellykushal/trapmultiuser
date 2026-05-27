"use client";

import * as React from "react";
import { X, Upload, FileText, AlertCircle, Download, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { inventoryService, type BulkImportResult, type Warehouse } from "@/services";

export interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When rows omit warehouse_code but have initial_stock, this warehouse is used. */
  warehouses?: Warehouse[];
  onImported?: (result: BulkImportResult) => void;
}

export function ImportModal({
  isOpen,
  onClose,
  warehouses = [],
  onImported,
}: ImportModalProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [defaultWarehouseId, setDefaultWarehouseId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BulkImportResult | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const resetState = React.useCallback(() => {
    setSelectedFile(null);
    setDefaultWarehouseId("");
    setBusy(false);
    setError(null);
    setResult(null);
  }, []);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !busy) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose, busy]);

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      resetState();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, resetState]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv") || lower.endsWith(".xlsx")) {
      setSelectedFile(file);
      setError(null);
      setResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFile(e.dataTransfer.files[0]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
  };

  const handleClose = () => {
    if (busy) return;
    resetState();
    onClose();
  };

  const downloadTemplate = async (format: "csv" | "xlsx") => {
    try {
      setError(null);
      await inventoryService.downloadProductImportTemplate(format);
    } catch {
      setError("Could not download template. Check you are signed in.");
    }
  };

  const runImport = async () => {
    if (!selectedFile) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await inventoryService.bulkImportProducts(
        selectedFile,
        defaultWarehouseId || undefined,
      );
      setResult(res);
      if (res.created > 0) {
        onImported?.(res);
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: unknown } } };
      const detail = ax.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Import failed. Check the file format and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#1A1B23] rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#C6A15B]/10">
                    <Upload className="w-5 h-5 text-[#C6A15B]" />
                  </div>
                  <h2 className="text-lg font-semibold text-[#F5F6FA]">Import products</h2>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={busy}
                  className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-[#A1A4B3]" />
                </button>
              </div>

              <div className="p-5 space-y-5">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadTemplate("csv")}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-sm text-[#F5F6FA] hover:bg-white/[0.1]"
                  >
                    <Download className="w-4 h-4 text-[#C6A15B]" />
                    CSV template
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadTemplate("xlsx")}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-sm text-[#F5F6FA] hover:bg-white/[0.1]"
                  >
                    <Download className="w-4 h-4 text-[#C6A15B]" />
                    XLSX template
                  </button>
                </div>
                <p className="text-xs text-[#6F7285]">
                  Templates include every column with example rows (up to 200 products per upload).
                  Example rows leave warehouse_code blank so your default warehouse applies to opening
                  stock; or set warehouse_code per row to a real active code.
                </p>

                {warehouses.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-[#A1A4B3] mb-1.5">
                      Default warehouse (optional)
                    </label>
                    <select
                      value={defaultWarehouseId}
                      onChange={(e) => setDefaultWarehouseId(e.target.value)}
                      disabled={busy}
                      className="w-full rounded-lg bg-[#0E0F13] border border-white/[0.1] px-3 py-2 text-sm text-[#F5F6FA] focus:outline-none focus:ring-1 focus:ring-[#C6A15B]"
                    >
                      <option value="">— None —</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                          {w.code ? ` (${w.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !busy && fileInputRef.current?.click()}
                  className={`
                    relative p-8 rounded-xl border-2 border-dashed transition-all
                    ${busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
                    ${isDragging
                      ? "border-[#C6A15B] bg-[#C6A15B]/5"
                      : "border-white/[0.15] hover:border-white/[0.25] hover:bg-white/[0.02]"
                    }
                    ${selectedFile ? "border-[#2ECC71] bg-[#2ECC71]/5" : ""}
                  `}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleFileSelect}
                    disabled={busy}
                    className="hidden"
                  />

                  <div className="flex flex-col items-center text-center">
                    {selectedFile ? (
                      <>
                        <div className="w-12 h-12 rounded-xl bg-[#2ECC71]/10 flex items-center justify-center mb-3">
                          <FileText className="w-6 h-6 text-[#2ECC71]" />
                        </div>
                        <p className="text-sm font-medium text-[#F5F6FA]">{selectedFile.name}</p>
                        <p className="text-xs text-[#6F7285] mt-1">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-xl bg-white/[0.05] flex items-center justify-center mb-3">
                          <Upload className="w-6 h-6 text-[#A1A4B3]" />
                        </div>
                        <p className="text-sm text-[#F5F6FA]">
                          Drag & drop here, or <span className="text-[#C6A15B]">browse</span>
                        </p>
                        <p className="text-xs text-[#6F7285] mt-1">CSV or XLSX</p>
                      </>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/25">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                )}

                {result && (
                  <div
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      result.created > 0
                        ? "bg-[#2ECC71]/10 border-[#2ECC71]/25"
                        : "bg-[#F5A623]/10 border-[#F5A623]/20"
                    }`}
                  >
                    <AlertCircle
                      className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        result.created > 0 ? "text-[#2ECC71]" : "text-[#F5A623]"
                      }`}
                    />
                    <div className="text-sm space-y-1">
                      <p className={result.created > 0 ? "text-[#2ECC71]" : "text-[#F5A623]"}>
                        Created {result.created}, failed {result.failed}
                      </p>
                      {result.errors?.length > 0 && (
                        <ul className="text-xs text-[#A1A4B3] max-h-32 overflow-y-auto list-disc pl-4 space-y-0.5">
                          {result.errors.slice(0, 12).map((err, i) => (
                            <li key={`${err.row}-${i}`}>
                              Row {err.row}: {err.message}
                            </li>
                          ))}
                          {result.errors.length > 12 && (
                            <li>…and {result.errors.length - 12} more</li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={busy}
                    className="flex-1 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] font-medium hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                  >
                    {result?.created ? "Done" : "Cancel"}
                  </button>
                  <button
                    type="button"
                    onClick={runImport}
                    disabled={!selectedFile || busy}
                    className="flex-1 py-2.5 rounded-lg bg-[#C6A15B] text-[#0E0F13] font-medium hover:bg-[#D4B06A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importing…
                      </>
                    ) : (
                      "Import"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
