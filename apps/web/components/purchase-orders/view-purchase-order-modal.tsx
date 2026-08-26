"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  X,
  Package,
  Calendar,
  User,
  Building,
  Hash,
  FileText,
} from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { type PurchaseOrder } from "@/services/purchase-orders.service";

interface ViewPurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrder;
}

export function ViewPurchaseOrderModal({
  isOpen,
  onClose,
  purchaseOrder,
}: ViewPurchaseOrderModalProps) {
  if (!isOpen) return null;

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      DRAFT: { color: "bg-gray-100 text-gray-800", label: "Draft" },
      SUBMITTED: { color: "bg-blue-100 text-blue-800", label: "Submitted" },
      PARTIAL: { color: "bg-yellow-100 text-yellow-800", label: "Partial" },
      RECEIVED: { color: "bg-green-100 text-green-800", label: "Received" },
      CANCELLED: { color: "bg-red-100 text-red-800", label: "Cancelled" },
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.DRAFT;

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

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
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-3">
              <Package className="w-6 h-6 text-blue-400" />
              Purchase Order Details
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {purchaseOrder.poNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* Order Header */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    PO Number
                  </label>
                  <div className="flex items-center gap-2 text-white">
                    <Hash className="w-4 h-4 text-zinc-400" />
                    <span className="font-mono text-blue-400">
                      {purchaseOrder.poNumber}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Supplier
                  </label>
                  <div className="flex items-center gap-2 text-white">
                    <User className="w-4 h-4 text-zinc-400" />
                    <span>{purchaseOrder.supplierName}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Warehouse
                  </label>
                  <div className="flex items-center gap-2 text-white">
                    <Building className="w-4 h-4 text-zinc-400" />
                    <span>{purchaseOrder.warehouseName}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Status
                  </label>
                  {getStatusBadge(purchaseOrder.status)}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Order Date
                  </label>
                  <div className="flex items-center gap-2 text-white">
                    <Calendar className="w-4 h-4 text-zinc-400" />
                    <span>{formatDate(purchaseOrder.orderDate)}</span>
                  </div>
                </div>

                {purchaseOrder.expectedDate && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
                      Expected Date
                    </label>
                    <div className="flex items-center gap-2 text-white">
                      <Calendar className="w-4 h-4 text-zinc-400" />
                      <span>{formatDate(purchaseOrder.expectedDate)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {purchaseOrder.notes && (
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Notes
                </label>
                <div className="flex items-start gap-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  <FileText className="w-4 h-4 text-zinc-400 mt-0.5" />
                  <span className="text-zinc-300 text-sm">
                    {purchaseOrder.notes}
                  </span>
                </div>
              </div>
            )}

            {/* Items */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-3">
                Items ({purchaseOrder.items?.length || 0})
              </label>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th className="text-left py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="text-center py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Ordered
                      </th>
                      <th className="text-center py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Received
                      </th>
                      <th className="text-center py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Pending
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
                    {purchaseOrder.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="py-4">
                          <div>
                            <span className="text-sm text-white font-medium">
                              {item.productName}
                            </span>
                            {item.productSku && (
                              <span className="block text-xs text-zinc-400 mt-1">
                                SKU: {item.productSku}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          <span className="text-sm text-zinc-300">
                            {item.quantity}
                          </span>
                        </td>
                        <td className="py-4 text-center">
                          <span className="text-sm text-green-400">
                            {item.receivedQuantity}
                          </span>
                        </td>
                        <td className="py-4 text-center">
                          <span className="text-sm text-yellow-400">
                            {item.pendingQuantity}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-sm text-zinc-300">
                            {formatCurrency(item.unitPrice)}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-sm text-white font-medium">
                            {formatCurrency(item.lineTotal)}
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
                    <span className="text-zinc-400">Subtotal:</span>
                    <span className="text-white">
                      {formatCurrency(purchaseOrder.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Tax:</span>
                    <span className="text-white">
                      {formatCurrency(purchaseOrder.taxAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-semibold border-t border-zinc-700 pt-2">
                    <span className="text-zinc-300">Total:</span>
                    <span className="text-white">
                      {formatCurrency(purchaseOrder.total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end p-6 border-t border-zinc-700">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
