"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { X, Package, Plus, Minus, CheckCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import purchaseOrdersService, {
  type PurchaseOrder,
  type ReceiveItemData,
} from "@/services/purchase-orders.service";

interface ReceiveItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrder;
}

interface ReceiveItemForm {
  itemId: string;
  productName: string;
  orderedQuantity: number;
  pendingQuantity: number;
  receiveQuantity: number;
}

export function ReceiveItemsModal({
  isOpen,
  onClose,
  purchaseOrder,
}: ReceiveItemsModalProps) {
  const [receiveItems, setReceiveItems] = React.useState<ReceiveItemForm[]>([]);

  const queryClient = useQueryClient();

  // Initialize receive items from purchase order items
  React.useEffect(() => {
    if (isOpen && purchaseOrder.items) {
      const items = purchaseOrder.items
        .filter((item) => item.pendingQuantity > 0)
        .map((item) => ({
          itemId: item.id,
          productName: item.productName || "Unknown Product",
          orderedQuantity: item.quantity,
          pendingQuantity: item.pendingQuantity,
          receiveQuantity: 0,
        }));
      setReceiveItems(items);
    }
  }, [isOpen, purchaseOrder.items]);

  const receiveMutation = useMutation({
    mutationFn: (data: ReceiveItemData[]) =>
      purchaseOrdersService.receivePurchaseOrder(purchaseOrder.id, data),
    onSuccess: () => {
      toast.success("Items received successfully!");
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error?.message || "Failed to receive items");
    },
  });

  const updateReceiveQuantity = (itemId: string, quantity: number) => {
    setReceiveItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId
          ? {
              ...item,
              receiveQuantity: Math.max(
                0,
                Math.min(quantity, item.pendingQuantity),
              ),
            }
          : item,
      ),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const itemsToReceive = receiveItems
      .filter((item) => item.receiveQuantity > 0)
      .map((item) => ({
        item_id: item.itemId,
        quantity: item.receiveQuantity,
      }));

    if (itemsToReceive.length === 0) {
      toast.error("Please select quantities to receive");
      return;
    }

    receiveMutation.mutate(itemsToReceive);
  };

  if (!isOpen) return null;

  const totalReceiving = receiveItems.reduce(
    (sum, item) => sum + item.receiveQuantity,
    0,
  );

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
              <Package className="w-6 h-6 text-green-400" />
              Receive Items
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              PO: {purchaseOrder.poNumber} • {purchaseOrder.supplierName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
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
                      Pending
                    </th>
                    <th className="text-center py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      Receive Now
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700">
                  {receiveItems.map((item) => (
                    <tr key={item.itemId}>
                      <td className="py-4">
                        <span className="text-sm text-white font-medium">
                          {item.productName}
                        </span>
                      </td>
                      <td className="py-4 text-center">
                        <span className="text-sm text-zinc-300">
                          {item.orderedQuantity}
                        </span>
                      </td>
                      <td className="py-4 text-center">
                        <span className="text-sm text-yellow-400 font-medium">
                          {item.pendingQuantity}
                        </span>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateReceiveQuantity(
                                item.itemId,
                                item.receiveQuantity - 1,
                              )
                            }
                            className="p-1 rounded bg-zinc-700 hover:bg-zinc-600 transition-colors"
                          >
                            <Minus className="w-4 h-4 text-zinc-300" />
                          </button>
                          <input
                            type="number"
                            value={item.receiveQuantity}
                            onChange={(e) =>
                              updateReceiveQuantity(
                                item.itemId,
                                parseInt(e.target.value) || 0,
                              )
                            }
                            min="0"
                            max={item.pendingQuantity}
                            className="w-20 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-center text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateReceiveQuantity(
                                item.itemId,
                                item.receiveQuantity + 1,
                              )
                            }
                            className="p-1 rounded bg-zinc-700 hover:bg-zinc-600 transition-colors"
                          >
                            <Plus className="w-4 h-4 text-zinc-300" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateReceiveQuantity(
                                item.itemId,
                                item.pendingQuantity,
                              )
                            }
                            className="ml-2 px-2 py-1 text-xs bg-green-600/20 text-green-400 rounded border border-green-500/30 hover:bg-green-600/30 transition-colors"
                          >
                            All
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {receiveItems.length === 0 && (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-zinc-400">All items have been received</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-zinc-700">
            <div className="text-sm text-zinc-400">
              Total receiving:{" "}
              <span className="text-green-400 font-medium">
                {totalReceiving}
              </span>{" "}
              items
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={receiveMutation.isPending || totalReceiving === 0}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {receiveMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Receiving...
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    Receive Items
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
