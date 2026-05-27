"use client";

import * as React from "react";
import { Suspense } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  ClipboardList,
  Package,
  Send,
  CheckCircle,
  XCircle,
  Eye,
} from "lucide-react";
import { PageTransition } from "@/components/layout";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Pagination } from "@/components/ui/pagination";
import { CreatePurchaseOrderModal } from "@/components/purchase-orders/create-purchase-order-modal";
import { ReceiveItemsModal } from "@/components/purchase-orders/receive-items-modal";
import { ViewPurchaseOrderModal } from "@/components/purchase-orders/view-purchase-order-modal";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  purchaseOrdersService,
  PurchaseOrderListItem,
  PurchaseOrder,
} from "@/services";
import { cn } from "@/lib/utils";

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={<PurchaseOrdersPageSkeleton />}>
      <PurchaseOrdersPageContent />
    </Suspense>
  );
}

function PurchaseOrdersPageSkeleton() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-[#6366F1]" />
              Purchase Orders
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">Loading...</p>
          </div>
        </div>
        <SkeletonTable rows={6} />
      </div>
    </PageTransition>
  );
}

function PurchaseOrdersPageContent() {
  // Pagination state
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  // Filter state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [showReceiveModal, setShowReceiveModal] = React.useState(false);
  const [showViewModal, setShowViewModal] = React.useState(false);
  const [selectedOrderForReceive, setSelectedOrderForReceive] =
    React.useState<PurchaseOrder | null>(null);
  const [selectedOrderForView, setSelectedOrderForView] =
    React.useState<PurchaseOrder | null>(null);

  const queryClient = useQueryClient();

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  // Mutations for status changes
  const submitOrderMutation = useMutation({
    mutationFn: purchaseOrdersService.submitPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: purchaseOrdersService.deletePurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });

  const openReceiveModal = async (order: PurchaseOrderListItem) => {
    try {
      // Fetch full order details with items
      const fullOrder = await purchaseOrdersService.getPurchaseOrder(order.id);
      setSelectedOrderForReceive(fullOrder);
      setShowReceiveModal(true);
    } catch (error) {
      console.error("Failed to fetch order details:", error);
    }
  };

  const openViewModal = async (order: PurchaseOrderListItem) => {
    try {
      // Fetch full order details with items
      const fullOrder = await purchaseOrdersService.getPurchaseOrder(order.id);
      setSelectedOrderForView(fullOrder);
      setShowViewModal(true);
    } catch (error) {
      console.error("Failed to fetch order details:", error);
    }
  };

  // Fetch purchase orders
  const {
    data: ordersResponse,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["purchase-orders", statusFilter, searchQuery, page, pageSize],
    queryFn: () =>
      purchaseOrdersService.getPurchaseOrders({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        page,
        pageSize,
      }),
  });

  const orders = React.useMemo(() => {
    if (!ordersResponse?.results) return [];
    return ordersResponse.results;
  }, [ordersResponse]);

  // Status counts
  const statusCounts = React.useMemo(() => {
    if (!ordersResponse?.results)
      return { draft: 0, submitted: 0, partial: 0, received: 0, cancelled: 0 };

    return ordersResponse.results.reduce(
      (acc, order) => {
        const key = order.status.toLowerCase() as keyof typeof acc;
        if (key in acc) acc[key]++;
        return acc;
      },
      { draft: 0, submitted: 0, partial: 0, received: 0, cancelled: 0 },
    );
  }, [ordersResponse]);

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
  };

  if (isLoading) {
    return <PurchaseOrdersPageSkeleton />;
  }

  if (isError) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-[#6366F1]" />
            Purchase Orders
          </h1>
          <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
            <ErrorState
              message="Could not load purchase orders. Check if backend is running."
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
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-[#6366F1]" />
              Purchase Orders
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {orders.length} purchase orders
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#6366F1] text-white text-sm font-medium hover:bg-[#7376FF] transition-colors"
          >
            <Plus className="w-4 h-4 stroke-[2]" />
            New Purchase Order
          </button>
        </div>

        {/* Create Purchase Order Modal */}
        <CreatePurchaseOrderModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />

        {/* Receive Items Modal */}
        {selectedOrderForReceive && (
          <ReceiveItemsModal
            isOpen={showReceiveModal}
            onClose={() => {
              setShowReceiveModal(false);
              setSelectedOrderForReceive(null);
            }}
            purchaseOrder={selectedOrderForReceive}
          />
        )}

        {/* View Purchase Order Modal */}
        {selectedOrderForView && (
          <ViewPurchaseOrderModal
            isOpen={showViewModal}
            onClose={() => {
              setShowViewModal(false);
              setSelectedOrderForView(null);
            }}
            purchaseOrder={selectedOrderForView}
          />
        )}

        {/* Status Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatusCard
            label="Draft"
            value={statusCounts.draft}
            icon={ClipboardList}
            color="#6F7285"
            active={statusFilter === "DRAFT"}
            onClick={() =>
              setStatusFilter(statusFilter === "DRAFT" ? "" : "DRAFT")
            }
          />
          <StatusCard
            label="Submitted"
            value={statusCounts.submitted}
            icon={Send}
            color="#3498DB"
            active={statusFilter === "SUBMITTED"}
            onClick={() =>
              setStatusFilter(statusFilter === "SUBMITTED" ? "" : "SUBMITTED")
            }
          />
          <StatusCard
            label="Partial"
            value={statusCounts.partial}
            icon={Package}
            color="#F5A623"
            active={statusFilter === "PARTIAL"}
            onClick={() =>
              setStatusFilter(statusFilter === "PARTIAL" ? "" : "PARTIAL")
            }
          />
          <StatusCard
            label="Received"
            value={statusCounts.received}
            icon={CheckCircle}
            color="#2ECC71"
            active={statusFilter === "RECEIVED"}
            onClick={() =>
              setStatusFilter(statusFilter === "RECEIVED" ? "" : "RECEIVED")
            }
          />
          <StatusCard
            label="Cancelled"
            value={statusCounts.cancelled}
            icon={XCircle}
            color="#E74C3C"
            active={statusFilter === "CANCELLED"}
            onClick={() =>
              setStatusFilter(statusFilter === "CANCELLED" ? "" : "CANCELLED")
            }
          />
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by PO number or supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50"
            />
          </div>
          {statusFilter && (
            <button
              onClick={() => setStatusFilter("")}
              className="text-sm text-[#6366F1] hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>

        {/* Orders Table or Empty State */}
        {orders.length === 0 ? (
          <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
            <EmptyState
              icon={ClipboardList}
              title="No purchase orders found"
              description={
                statusFilter
                  ? `No ${statusFilter.toLowerCase()} orders found`
                  : "Create your first purchase order to get started"
              }
              actions={[
                {
                  label: "New Purchase Order",
                  onClick: () => setShowCreateModal(true),
                  variant: "primary",
                },
              ]}
            />
          </div>
        ) : (
          <>
            <PurchaseOrdersTable
              orders={orders}
              onSubmitOrder={(orderId) => submitOrderMutation.mutate(orderId)}
              onCancelOrder={(orderId) => cancelOrderMutation.mutate(orderId)}
              onReceiveOrder={openReceiveModal}
              onViewOrder={openViewModal}
              isSubmitting={submitOrderMutation.isPending}
              isCancelling={cancelOrderMutation.isPending}
            />
            {/* Pagination */}
            {ordersResponse?.meta && (
              <Pagination
                page={ordersResponse.meta.page}
                pageSize={ordersResponse.meta.pageSize}
                total={ordersResponse.meta.total}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}

function StatusCard({
  label,
  value,
  icon: Icon,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-4 rounded-xl backdrop-blur-xl border transition-all duration-200 text-left",
        active
          ? "bg-[#6366F1]/20 border-[#6366F1] ring-2 ring-[#6366F1]/30"
          : "bg-[var(--bg-surface)] border-[var(--border-default)] hover:bg-white/[0.03]",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p
        className="text-2xl font-bold tabular-nums"
        style={{ color: active ? "#6366F1" : "var(--text-primary)" }}
      >
        {value}
      </p>
    </button>
  );
}

function PurchaseOrdersTable({
  orders,
  onSubmitOrder,
  onCancelOrder,
  onReceiveOrder,
  onViewOrder,
  isSubmitting,
  isCancelling,
}: {
  orders: PurchaseOrderListItem[];
  onSubmitOrder: (orderId: string) => void;
  onCancelOrder: (orderId: string) => void;
  onReceiveOrder: (order: PurchaseOrderListItem) => void;
  onViewOrder: (order: PurchaseOrderListItem) => void;
  isSubmitting: boolean;
  isCancelling: boolean;
}) {
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      DRAFT: {
        color: "bg-[#6F7285]/20 text-[#A1A4B3]",
        label: "Draft",
      },
      SUBMITTED: {
        color: "bg-[#3498DB]/20 text-[#3498DB]",
        label: "Submitted",
      },
      PARTIAL: {
        color: "bg-[#F5A623]/20 text-[#F5A623]",
        label: "Partial",
      },
      RECEIVED: {
        color: "bg-[#2ECC71]/20 text-[#2ECC71]",
        label: "Received",
      },
      CANCELLED: {
        color: "bg-[#E74C3C]/20 text-[#E74C3C]",
        label: "Cancelled",
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      color: "bg-white/10 text-white",
      label: status,
    };

    return (
      <span
        className={cn(
          "px-2.5 py-1 rounded-full text-xs font-medium",
          config.color,
        )}
      >
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

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <div className="rounded-xl bg-[var(--bg-surface)] backdrop-blur-xl border border-[var(--border-default)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                PO Number
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Supplier
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Warehouse
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Order Date
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Items
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Total
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {orders.map((order) => (
              <motion.tr
                key={order.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="hover:bg-white/[0.02] cursor-pointer transition-colors"
              >
                <td className="px-4 py-4">
                  <span className="font-mono text-sm text-[#6366F1]">
                    {order.poNumber || "N/A"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[var(--text-primary)]">
                    {order.supplierName || "N/A"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[#A1A4B3]">
                    {order.warehouseName || "N/A"}
                  </span>
                </td>
                <td className="px-4 py-4">{getStatusBadge(order.status)}</td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[#A1A4B3]">
                    {order.orderDate ? formatDate(order.orderDate) : "N/A"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm text-[#A1A4B3]">
                    {order.itemCount || 0} items
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {formatCurrency(order.total)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {order.status === "DRAFT" && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSubmitOrder(order.id);
                          }}
                          disabled={isSubmitting}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded-lg border border-blue-400/20 hover:border-blue-400/30 transition-colors disabled:opacity-50"
                          title="Submit Order"
                        >
                          <Send className="w-3 h-3" />
                          Submit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Cancel this purchase order?")) {
                              onCancelOrder(order.id);
                            }
                          }}
                          disabled={isCancelling}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg border border-red-400/20 hover:border-red-400/30 transition-colors disabled:opacity-50"
                          title="Cancel Order"
                        >
                          <XCircle className="w-3 h-3" />
                          Cancel
                        </button>
                      </>
                    )}

                    {order.status === "SUBMITTED" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReceiveOrder(order);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-400 hover:text-green-300 hover:bg-green-400/10 rounded-lg border border-green-400/20 hover:border-green-400/30 transition-colors"
                        title="Receive Items"
                      >
                        <Package className="w-3 h-3" />
                        Receive
                      </button>
                    )}

                    {order.status === "PARTIAL" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReceiveOrder(order);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-400 hover:text-green-300 hover:bg-green-400/10 rounded-lg border border-green-400/20 hover:border-green-400/30 transition-colors"
                        title="Receive More Items"
                      >
                        <Package className="w-3 h-3" />
                        Receive
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewOrder(order);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-300 hover:bg-gray-400/10 rounded-lg border border-gray-400/20 hover:border-gray-400/30 transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-3 h-3" />
                      View
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
