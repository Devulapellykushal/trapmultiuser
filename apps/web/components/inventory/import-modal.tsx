"use client";

import * as React from "react";
import {
  X,
  Upload,
  FileText,
  AlertCircle,
  Download,
  Loader2,
  Table2,
  ListChecks,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  inventoryService,
  type BulkImportResult,
  type Warehouse,
} from "@/services";
import { useIndustryProfile } from "@/lib/industry";
import {
  EXAMPLE_TABLE_KEYS,
  getImportExamples,
  IMPORT_COLUMN_DEFS,
} from "./import-columns";

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
  const industry = useIndustryProfile();
  const examples = React.useMemo(
    () => getImportExamples(industry.id),
    [industry.id],
  );

  const [isDragging, setIsDragging] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [defaultWarehouseId, setDefaultWarehouseId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BulkImportResult | null>(null);
  const [showAllColumns, setShowAllColumns] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const resetState = React.useCallback(() => {
    setSelectedFile(null);
    setDefaultWarehouseId("");
    setBusy(false);
    setError(null);
    setResult(null);
    setShowAllColumns(false);
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

  const requiredCols = IMPORT_COLUMN_DEFS.filter((c) => c.required);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 modal-scrim"
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
            <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-[#111318] rounded-2xl border border-white/[0.08] shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-white/[0.08] bg-[#111318]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#c4a574]/10">
                    <Upload className="w-5 h-5 text-[#c4a574]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#f3eee4]">
                      Import products
                    </h2>
                    <p className="text-xs text-[#8a867c] mt-0.5">
                      {industry.label} — match these column names in your
                      spreadsheet
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={busy}
                  className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-[#c5c0b5]" />
                </button>
              </div>

              <div className="p-5 space-y-5">
                {/* How to build the file */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#f3eee4]">
                    <ListChecks className="w-4 h-4 text-[#c4a574]" />
                    How to create your file
                  </div>
                  <ol className="text-xs text-[#c5c0b5] space-y-1.5 list-decimal pl-4 leading-relaxed">
                    <li>
                      Download the CSV or XLSX template (headers already set),
                      or create a sheet with the same column names below.
                    </li>
                    <li>
                      Fill <strong className="text-[#f3eee4]">one row per product</strong>{" "}
                      (each row = one product + one size/variant).
                    </li>
                    <li>
                      Required columns:{" "}
                      {requiredCols.map((c) => (
                        <code
                          key={c.key}
                          className="mx-0.5 px-1 py-0.5 rounded bg-white/[0.06] text-[#c4a574] font-mono text-[11px]"
                        >
                          {c.key}
                        </code>
                      ))}
                      . Leave SKU/barcode blank to auto-generate.
                    </li>
                    <li>
                      For opening stock, set{" "}
                      <code className="px-1 py-0.5 rounded bg-white/[0.06] text-[#c4a574] font-mono text-[11px]">
                        initial_stock
                      </code>{" "}
                      and either{" "}
                      <code className="px-1 py-0.5 rounded bg-white/[0.06] text-[#c4a574] font-mono text-[11px]">
                        warehouse_code
                      </code>{" "}
                      or pick Default warehouse below. Max 200 rows per upload.
                    </li>
                  </ol>
                </div>

                {/* Example rows for this industry */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
                    <Table2 className="w-4 h-4 text-[#c4a574]" />
                    <div>
                      <p className="text-sm font-medium text-[#f3eee4]">
                        Example rows ({industry.label})
                      </p>
                      <p className="text-[11px] text-[#8a867c]">
                        Copy this shape into Excel/Sheets — first row must be
                        the headers
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] min-w-[640px]">
                      <thead>
                        <tr className="bg-white/[0.04]">
                          {EXAMPLE_TABLE_KEYS.map((key) => (
                            <th
                              key={key}
                              className="px-3 py-2 font-mono font-medium text-[#c4a574] whitespace-nowrap border-b border-white/[0.06]"
                            >
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {examples.map((ex, i) => (
                          <tr
                            key={i}
                            className="border-b border-white/[0.04] last:border-0"
                          >
                            {EXAMPLE_TABLE_KEYS.map((key) => (
                              <td
                                key={key}
                                className="px-3 py-2 text-[#c5c0b5] whitespace-nowrap max-w-[140px] truncate"
                                title={ex[key] || "—"}
                              >
                                {ex[key] || (
                                  <span className="text-[#5c5a54]">(blank)</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-4 py-2 text-[11px] text-[#8a867c] border-t border-white/[0.06]">
                    Tip: leave{" "}
                    <span className="font-mono text-[#c4a574]">
                      warehouse_code
                    </span>{" "}
                    blank and choose Default warehouse if all rows use the same
                    godown.
                  </p>
                </div>

                {/* Full column reference */}
                <div className="rounded-xl border border-white/[0.08] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowAllColumns((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="text-sm font-medium text-[#f3eee4]">
                      All columns ({IMPORT_COLUMN_DEFS.length}) — names must
                      match exactly
                    </span>
                    <span className="text-xs text-[#c4a574]">
                      {showAllColumns ? "Hide" : "Show"}
                    </span>
                  </button>
                  {showAllColumns ? (
                    <div className="max-h-56 overflow-y-auto border-t border-white/[0.06]">
                      <table className="w-full text-left text-[11px]">
                        <thead className="sticky top-0 bg-[#15171c]">
                          <tr>
                            <th className="px-3 py-2 text-[#c4a574] font-medium">
                              Column
                            </th>
                            <th className="px-3 py-2 text-[#c4a574] font-medium">
                              Need?
                            </th>
                            <th className="px-3 py-2 text-[#c4a574] font-medium">
                              Meaning
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {IMPORT_COLUMN_DEFS.map((col) => (
                            <tr
                              key={col.key}
                              className="border-t border-white/[0.04]"
                            >
                              <td className="px-3 py-1.5 font-mono text-[#f3eee4] whitespace-nowrap">
                                {col.key}
                              </td>
                              <td className="px-3 py-1.5 whitespace-nowrap">
                                {col.required ? (
                                  <span className="text-[#c45c5c]">
                                    Required
                                  </span>
                                ) : (
                                  <span className="text-[#8a867c]">
                                    Optional
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-[#c5c0b5]">
                                {col.meaning}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadTemplate("csv")}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-sm text-[#f3eee4] hover:bg-white/[0.1]"
                  >
                    <Download className="w-4 h-4 text-[#c4a574]" />
                    CSV template
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadTemplate("xlsx")}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-sm text-[#f3eee4] hover:bg-white/[0.1]"
                  >
                    <Download className="w-4 h-4 text-[#c4a574]" />
                    XLSX template
                  </button>
                </div>

                {warehouses.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-[#c5c0b5] mb-1.5">
                      Default warehouse (optional)
                    </label>
                    <select
                      value={defaultWarehouseId}
                      onChange={(e) => setDefaultWarehouseId(e.target.value)}
                      disabled={busy}
                      className="w-full rounded-lg bg-[#0c0d10] border border-white/[0.1] px-3 py-2 text-sm text-[#f3eee4] focus:outline-none focus:ring-1 focus:ring-[#c4a574]"
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
                    ${
                      isDragging
                        ? "border-[#c4a574] bg-[#c4a574]/5"
                        : "border-white/[0.15] hover:border-white/[0.25] hover:bg-white/[0.02]"
                    }
                    ${selectedFile ? "border-[#3f9d7a] bg-[#3f9d7a]/5" : ""}
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
                        <div className="w-12 h-12 rounded-xl bg-[#3f9d7a]/10 flex items-center justify-center mb-3">
                          <FileText className="w-6 h-6 text-[#3f9d7a]" />
                        </div>
                        <p className="text-sm font-medium text-[#f3eee4]">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-[#8a867c] mt-1">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-xl bg-white/[0.05] flex items-center justify-center mb-3">
                          <Upload className="w-6 h-6 text-[#c5c0b5]" />
                        </div>
                        <p className="text-sm text-[#f3eee4]">
                          Drag & drop here, or{" "}
                          <span className="text-[#c4a574]">browse</span>
                        </p>
                        <p className="text-xs text-[#8a867c] mt-1">
                          CSV or XLSX
                        </p>
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
                        ? "bg-[#3f9d7a]/10 border-[#3f9d7a]/25"
                        : "bg-[#d4a054]/10 border-[#d4a054]/20"
                    }`}
                  >
                    <AlertCircle
                      className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        result.created > 0 ? "text-[#3f9d7a]" : "text-[#d4a054]"
                      }`}
                    />
                    <div className="text-sm space-y-1">
                      <p
                        className={
                          result.created > 0
                            ? "text-[#3f9d7a]"
                            : "text-[#d4a054]"
                        }
                      >
                        Created {result.created}, failed {result.failed}
                      </p>
                      {result.errors?.length > 0 && (
                        <ul className="text-xs text-[#c5c0b5] max-h-32 overflow-y-auto list-disc pl-4 space-y-0.5">
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
                    className="flex-1 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] font-medium hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                  >
                    {result?.created ? "Done" : "Cancel"}
                  </button>
                  <button
                    type="button"
                    onClick={runImport}
                    disabled={!selectedFile || busy}
                    className="flex-1 py-2.5 rounded-lg bg-[#c4a574] text-[#0c0d10] font-medium hover:bg-[#d4b88a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
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
