"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  X,
  Search,
  Package,
  Receipt,
  Plus,
  Minus,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { salesService, Sale } from "@/services/sales.service";
import {
  debitCreditNotesService,
  CreateCreditNoteData,
} from "@/services/debit-credit-notes.service";
import { inventoryService } from "@/services/inventory.service";
import { inventoryKeys } from "@/hooks";
import { cn } from "@/lib/utils";

interface CreateCreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface SaleItem {
  id: string;
  product: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: string;
  total: string;
}

interface SaleDetails extends Sale {
  items: SaleItem[];
}

interface ReturnItem {
  originalSaleItem: string;
  productName: string;
  productSku: string;
  maxQuantity: number;
  quantityReturned: number;
  unitPrice: string;
  condition: string;
}

export function CreateCreditNoteModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateCreditNoteModalProps) {
  const queryClient = useQueryClient();

  // Form state
  const [step, setStep] = React.useState<"select-sale" | "select-items">(
    "select-sale",
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedSale, setSelectedSale] = React.useState<SaleDetails | null>(
    null,
  );
  const [selectedWarehouse, setSelectedWarehouse] = React.useState("");
  const [returnReason, setReturnReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [returnDate, setReturnDate] = React.useState(
    new Date().toISOString().split("T")[0],
  );
  const [returnItems, setReturnItems] = React.useState<ReturnItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch completed sales
  const { data: salesResponse, isLoading: salesLoading } = useQuery({
    queryKey: ["sales-for-return", searchQuery],
    queryFn: () =>
      salesService.getSales({
        status: "COMPLETED",
        page_size: 20,
      }),
    enabled: isOpen && step === "select-sale",
  });

  // Fetch warehouses
  const { data: warehousesResponse } = useQuery({
    queryKey: inventoryKeys.warehouses(),
    queryFn: () => inventoryService.getWarehouses(),
    enabled: isOpen,
  });

  const warehouses = warehousesResponse || [];

  // Filter sales by search
  const filteredSales = React.useMemo(() => {
    const sales = salesResponse?.results || [];
    if (!searchQuery) return sales;
    const query = searchQuery.toLowerCase();
    return sales.filter(
      (sale) =>
        sale.invoice_number.toLowerCase().includes(query) ||
        (sale.cashier && sale.cashier.toLowerCase().includes(query)),
    );
  }, [salesResponse?.results, searchQuery]);

  // Return reason options
  const returnReasonOptions =
    debitCreditNotesService.getReturnReasonOptions("credit");
  const conditionOptions = debitCreditNotesService.getConditionOptions();

  // Create credit note mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateCreditNoteData) =>
      debitCreditNotesService.createCreditNote(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      onSuccess?.();
      handleClose();
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to create credit note");
    },
  });

  const handleClose = () => {
    setStep("select-sale");
    setSearchQuery("");
    setSelectedSale(null);
    setSelectedWarehouse("");
    setReturnReason("");
    setNotes("");
    setReturnDate(new Date().toISOString().split("T")[0]);
    setReturnItems([]);
    setError(null);
    onClose();
  };

  const handleSelectSale = async (sale: Sale) => {
    try {
      // Fetch sale details with items
      const saleDetails = (await salesService.getSale(sale.id)) as SaleDetails;
      setSelectedSale(saleDetails);

      // Initialize return items from sale items
      if (saleDetails.items) {
        setReturnItems(
          saleDetails.items.map((item) => ({
            originalSaleItem: item.id,
            productName: item.productName,
            productSku: item.productSku,
            maxQuantity: item.quantity,
            quantityReturned: 0,
            unitPrice: item.unitPrice,
            condition: "GOOD",
          })),
        );
      }

      setStep("select-items");
    } catch {
      setError("Failed to load sale details");
    }
  };

  const handleQuantityChange = (index: number, delta: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const newQuantity = Math.max(
          0,
          Math.min(item.maxQuantity, item.quantityReturned + delta),
        );
        return { ...item, quantityReturned: newQuantity };
      }),
    );
  };

  const handleConditionChange = (index: number, condition: string) => {
    setReturnItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, condition } : item)),
    );
  };

  const handleSubmit = () => {
    setError(null);

    // Validation
    if (!selectedSale) {
      setError("Please select a sale");
      return;
    }

    if (!selectedWarehouse) {
      setError("Please select a warehouse");
      return;
    }

    if (!returnReason) {
      setError("Please select a return reason");
      return;
    }

    const itemsToReturn = returnItems.filter(
      (item) => item.quantityReturned > 0,
    );
    if (itemsToReturn.length === 0) {
      setError("Please select at least one item to return");
      return;
    }

    const data: CreateCreditNoteData = {
      originalSale: String(selectedSale.id),
      warehouse: selectedWarehouse,
      returnReason,
      notes,
      returnDate,
      items: itemsToReturn.map((item) => ({
        originalSaleItem: item.originalSaleItem,
        quantityReturned: item.quantityReturned,
        condition: item.condition,
      })),
    };

    createMutation.mutate(data);
  };

  const totalReturnAmount = React.useMemo(() => {
    return returnItems.reduce((sum, item) => {
      return sum + item.quantityReturned * parseFloat(item.unitPrice || "0");
    }, 0);
  }, [returnItems]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
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
              <Receipt className="w-6 h-6 text-green-400" />
              Create Credit Note
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {step === "select-sale"
                ? "Step 1: Select the original sale"
                : "Step 2: Select items to return"}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {step === "select-sale" ? (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search by invoice number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </div>

              {/* Sales List */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {salesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-green-400 animate-spin" />
                  </div>
                ) : filteredSales.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400">
                    No completed sales found
                  </div>
                ) : (
                  filteredSales.map((sale) => (
                    <button
                      key={sale.id}
                      onClick={() => handleSelectSale(sale)}
                      className="w-full p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 hover:border-green-500/50 hover:bg-zinc-800 transition-all text-left group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-green-400 font-mono font-medium">
                            {sale.invoice_number}
                          </span>
                          <div className="text-sm text-zinc-400 mt-1">
                            {new Date(sale.date).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                            {" • "}
                            {sale.items_count} items
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-white font-medium">
                            {debitCreditNotesService.formatCurrency(sale.total)}
                          </span>
                          <div className="text-xs text-zinc-500 mt-1">
                            {sale.payment_method}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selected Sale Info */}
              {selectedSale && (
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-green-400 font-mono font-medium">
                        {selectedSale.invoice_number}
                      </span>
                      <div className="text-sm text-zinc-400 mt-1">
                        {new Date(selectedSale.date).toLocaleDateString(
                          "en-IN",
                        )}{" "}
                        • {selectedSale.items_count} items
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setStep("select-sale");
                        setSelectedSale(null);
                        setReturnItems([]);
                      }}
                      className="text-sm text-green-400 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                </div>
              )}

              {/* Return Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Return to Warehouse *
                  </label>
                  <select
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                  >
                    <option value="">Select warehouse...</option>
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Return Reason *
                  </label>
                  <select
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                  >
                    <option value="">Select reason...</option>
                    {returnReasonOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Return Date *
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Additional notes about the return..."
                  className="w-full px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 resize-none"
                />
              </div>

              {/* Items to Return */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-3">
                  Items to Return
                </label>
                <div className="space-y-3">
                  {returnItems.map((item, index) => (
                    <div
                      key={item.originalSaleItem}
                      className={cn(
                        "p-4 rounded-xl border transition-all",
                        item.quantityReturned > 0
                          ? "bg-green-500/10 border-green-500/30"
                          : "bg-zinc-800/50 border-zinc-700",
                      )}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-zinc-400" />
                            <span className="text-white font-medium">
                              {item.productName}
                            </span>
                          </div>
                          <div className="text-sm text-zinc-400 mt-1">
                            SKU: {item.productSku} •{" "}
                            {debitCreditNotesService.formatCurrency(
                              item.unitPrice,
                            )}{" "}
                            each
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <select
                            value={item.condition}
                            onChange={(e) =>
                              handleConditionChange(index, e.target.value)
                            }
                            disabled={item.quantityReturned === 0}
                            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none disabled:opacity-50"
                          >
                            {conditionOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleQuantityChange(index, -1)}
                              disabled={item.quantityReturned === 0}
                              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                            >
                              <Minus className="w-4 h-4 text-white" />
                            </button>
                            <div className="w-16 text-center">
                              <span className="text-white font-medium">
                                {item.quantityReturned}
                              </span>
                              <span className="text-zinc-500">
                                /{item.maxQuantity}
                              </span>
                            </div>
                            <button
                              onClick={() => handleQuantityChange(index, 1)}
                              disabled={
                                item.quantityReturned >= item.maxQuantity
                              }
                              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                            >
                              <Plus className="w-4 h-4 text-white" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Total Return Amount:</span>
                  <span className="text-2xl font-bold text-green-400">
                    {debitCreditNotesService.formatCurrency(totalReturnAmount)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-zinc-700">
          {step === "select-items" ? (
            <>
              <button
                onClick={() => {
                  setStep("select-sale");
                  setSelectedSale(null);
                  setReturnItems([]);
                }}
                className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending}
                className="px-6 py-2.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-500 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {createMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Create Credit Note
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <div className="text-sm text-zinc-400">
                Select a sale to continue
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
