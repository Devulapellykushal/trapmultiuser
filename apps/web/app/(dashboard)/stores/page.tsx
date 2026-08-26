"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Store,
  Plus,
  Search,
  MapPin,
  User,
  AlertTriangle,
  Check,
  X,
  Loader2,
  RefreshCcw,
  ChevronRight,
  Edit,
  Trash2,
  MoreVertical,
  Package,
  DollarSign,
  ShoppingCart,
  Tag,
  Bell,
} from "lucide-react";
import {
  storesService,
  CreateStoreData,
  UpdateStoreData,
  StoreListItem,
  Store as StoreType,
} from "@/services";
import { usersService, User as UserType } from "@/services/users.service";
import { useLocationLabels } from "@/hooks/use-business-setup";
import { adminHref } from "@/lib/admin-routes";

// =============================================================================
// CREATE STORE MODAL
// =============================================================================

interface CreateStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateStoreModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateStoreModalProps) {
  const [formData, setFormData] = React.useState<CreateStoreData>({
    name: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
    email: "",
    operator: undefined,
    operatorPhone: "",
    lowStockThreshold: 10,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersService.getUsers(),
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: storesService.createStore,
    onSuccess: () => {
      onSuccess();
      onClose();
      setFormData({
        name: "",
        address: "",
        city: "",
        state: "",
        pincode: "",
        phone: "",
        email: "",
        operator: undefined,
        operatorPhone: "",
        lowStockThreshold: 10,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
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
        className="relative z-10 w-full max-w-2xl bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
                <Store className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">
                Create New Store
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Store Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Store Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., Downtown Branch"
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Address *
            </label>
            <textarea
              required
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              placeholder="Full street address"
              rows={2}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
            />
          </div>

          {/* City, State, Pincode */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                City *
              </label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                placeholder="City"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                State *
              </label>
              <input
                type="text"
                required
                value={formData.state}
                onChange={(e) =>
                  setFormData({ ...formData, state: e.target.value })
                }
                placeholder="State"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Pincode *
              </label>
              <input
                type="text"
                required
                value={formData.pincode}
                onChange={(e) =>
                  setFormData({ ...formData, pincode: e.target.value })
                }
                placeholder="560001"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {/* Phone & Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Phone *
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="+91 9876543210"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="store@example.com"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {/* Operator Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Store Operator
              </label>
              <select
                value={formData.operator || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    operator: e.target.value || undefined,
                  })
                }
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="">Select operator...</option>
                {users.map((user: UserType) => (
                  <option key={user.id} value={user.id}>
                    {user.username} ({user.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Operator Phone
              </label>
              <input
                type="tel"
                value={formData.operatorPhone}
                onChange={(e) =>
                  setFormData({ ...formData, operatorPhone: e.target.value })
                }
                placeholder="Personal phone"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {/* Low Stock Threshold */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Low Stock Threshold
            </label>
            <input
              type="number"
              min={1}
              value={formData.lowStockThreshold}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  lowStockThreshold: parseInt(e.target.value) || 10,
                })
              }
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Alert when product stock falls below this level
            </p>
          </div>

          {/* Error Message */}
          {createMutation.isError && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-400 text-sm">
                Failed to create store. Please try again.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Create Store
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// =============================================================================
// EDIT STORE MODAL
// =============================================================================

interface EditStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  store: StoreType;
}

function EditStoreModal({
  isOpen,
  onClose,
  onSuccess,
  store,
}: EditStoreModalProps) {
  const [formData, setFormData] = React.useState<UpdateStoreData>({
    name: store.name,
    address: store.address,
    city: store.city,
    state: store.state,
    pincode: store.pincode,
    phone: store.phone,
    email: store.email || "",
    operator: store.operator || undefined,
    operatorPhone: store.operatorPhone || "",
    lowStockThreshold: store.lowStockThreshold,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersService.getUsers(),
    enabled: isOpen,
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateStoreData) =>
      storesService.updateStore(store.id, data),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
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
        className="relative z-10 w-full max-w-2xl bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20">
                <Edit className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Edit Store</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Store Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Store Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., Downtown Branch"
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Address *
            </label>
            <textarea
              required
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              placeholder="Full street address"
              rows={2}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            />
          </div>

          {/* City, State, Pincode */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                City *
              </label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                placeholder="City"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                State *
              </label>
              <input
                type="text"
                required
                value={formData.state}
                onChange={(e) =>
                  setFormData({ ...formData, state: e.target.value })
                }
                placeholder="State"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Pincode *
              </label>
              <input
                type="text"
                required
                value={formData.pincode}
                onChange={(e) =>
                  setFormData({ ...formData, pincode: e.target.value })
                }
                placeholder="560001"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>

          {/* Phone & Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Phone *
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="+91 9876543210"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="store@example.com"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>

          {/* Operator Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Store Operator
              </label>
              <select
                value={formData.operator || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    operator: e.target.value || undefined,
                  })
                }
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="">Select operator...</option>
                {users.map((user: UserType) => (
                  <option key={user.id} value={user.id}>
                    {user.username} ({user.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Operator Phone
              </label>
              <input
                type="tel"
                value={formData.operatorPhone}
                onChange={(e) =>
                  setFormData({ ...formData, operatorPhone: e.target.value })
                }
                placeholder="Personal phone"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>

          {/* Low Stock Threshold */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Low Stock Threshold
            </label>
            <input
              type="number"
              min={1}
              value={formData.lowStockThreshold}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  lowStockThreshold: parseInt(e.target.value) || 10,
                })
              }
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Alert when product stock falls below this level
            </p>
          </div>

          {/* Error Message */}
          {updateMutation.isError && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-400 text-sm">
                Failed to update store. Please try again.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Update Store
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// =============================================================================
// DELETE CONFIRM MODAL
// =============================================================================

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  storeName: string;
  isLoading: boolean;
}

function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  storeName,
  isLoading,
}: DeleteConfirmModalProps) {
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
        className="relative z-10 w-full max-w-md bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-full bg-red-500/20">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Delete Store</h3>
              <p className="text-sm text-zinc-400">
                This action cannot be undone
              </p>
            </div>
          </div>

          <p className="text-zinc-300 mb-6">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-white">{storeName}</span>? The
            store will be marked as inactive and its data will be preserved.
          </p>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="px-5 py-2.5 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete Store
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// STORE CARD
// =============================================================================

interface StoreCardProps {
  store: StoreListItem;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function StoreCard({ store, onClick, onEdit, onDelete }: StoreCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);

  // Fetch analytics per card (cached by React Query)
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["store-analytics", store.id],
    queryFn: () => storesService.getStoreAnalytics(store.id),
    staleTime: 60_000,
    enabled: store.isActive,
  });

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onEdit();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onDelete();
  };

  const hasBrandAlerts = (analytics?.lowBrandAlerts?.length ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      className="group p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl hover:border-[var(--accent-primary)]/40 shadow-sm hover:shadow-md transition-all cursor-pointer relative backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--accent-primary)_28%,transparent)] transition-colors">
            <Store className="w-5 h-5 text-[var(--accent-primary)]" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors">
              {store.name}
            </h3>
            {store.code?.trim() ? (
              <p className="text-xs text-[var(--text-muted)] font-mono">{store.code.trim()}</p>
            ) : (
              <p className="text-[11px] text-[var(--text-muted)]">
                Code not set · edit store to add
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasBrandAlerts && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400">
              <Bell className="w-3 h-3" />
              {analytics!.lowBrandAlerts.length} brand alert
              {analytics!.lowBrandAlerts.length > 1 ? "s" : ""}
            </span>
          )}
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              store.isActive
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            {store.isActive ? "Active" : "Inactive"}
          </span>
          {/* Actions Menu */}
          <div className="relative">
            <button
              onClick={handleMenuClick}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 z-20 w-36 popover-panel rounded-lg overflow-hidden">
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-[var(--bg-primary)] transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Basic Info */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <MapPin className="w-3.5 h-3.5" />
          <span>{store.city}</span>
        </div>
        {store.operatorName && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <User className="w-3.5 h-3.5" />
            <span>{store.operatorName}</span>
          </div>
        )}
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {/* Total Products */}
        <div className="p-3 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] border-opacity-60">
          <div className="flex items-center gap-1.5 mb-1">
            <Package className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs text-[var(--text-muted)]">Products</span>
          </div>
          {analyticsLoading ? (
            <div className="h-5 w-10 bg-[var(--border-default)] rounded animate-pulse" />
          ) : (
            <p className="text-[var(--text-primary)] font-semibold text-sm">
              {analytics?.totalProducts ?? 0}
              <span className="text-[var(--text-muted)] font-normal text-xs ml-1">
                ({analytics?.totalStockQuantity ?? 0} units)
              </span>
            </p>
          )}
        </div>

        {/* Purchase Value */}
        <div className="p-3 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] border-opacity-60">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs text-[var(--text-muted)]">Purchase Value</span>
          </div>
          {analyticsLoading ? (
            <div className="h-5 w-16 bg-[var(--border-default)] rounded animate-pulse" />
          ) : (
            <p className="text-emerald-700 font-semibold text-sm">
              ₹{((analytics?.totalPurchaseValue ?? 0) / 1000).toFixed(1)}K
            </p>
          )}
        </div>

        {/* Sales */}
        <div className="p-3 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] border-opacity-60">
          <div className="flex items-center gap-1.5 mb-1">
            <ShoppingCart className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span className="text-xs text-[var(--text-muted)]">Sales</span>
          </div>
          {analyticsLoading ? (
            <div className="h-5 w-12 bg-[var(--border-default)] rounded animate-pulse" />
          ) : (
            <p className="text-[var(--text-primary)] font-semibold text-sm">
              {analytics?.sales.totalTransactions ?? 0}
              <span className="text-[var(--text-muted)] font-normal text-xs ml-1">
                txns
              </span>
            </p>
          )}
        </div>

        {/* Revenue */}
        <div className="p-3 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] border-opacity-60">
          <div className="flex items-center gap-1.5 mb-1">
            <Tag className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs text-[var(--text-muted)]">Revenue</span>
          </div>
          {analyticsLoading ? (
            <div className="h-5 w-16 bg-[var(--border-default)] rounded animate-pulse" />
          ) : (
            <p className="text-amber-700 font-semibold text-sm">
              ₹{((analytics?.sales.totalRevenue ?? 0) / 1000).toFixed(1)}K
            </p>
          )}
        </div>
      </div>

      {/* Brand Summary */}
      {!analyticsLoading && analytics && analytics.brands.length > 0 && (
        <div className="mb-4 p-3 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] border-opacity-50">
          <p className="text-xs text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
            <Tag className="w-3 h-3" />
            Brands ({analytics.brands.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {analytics.brands.slice(0, 5).map((b) => (
              <span
                key={b.brand}
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  b.isLowBrandStock
                    ? "bg-orange-500/20 text-orange-700 border border-orange-500/35"
                    : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-default)]"
                }`}
              >
                {b.brand}
                <span className="ml-1 opacity-60">{b.totalStock}</span>
              </span>
            ))}
            {analytics.brands.length > 5 && (
              <span className="px-2 py-0.5 rounded-full text-xs text-[var(--text-muted)] bg-[var(--bg-primary)] border border-[var(--border-default)]">
                +{analytics.brands.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      <div className="pt-3 border-t border-[var(--border-default)] flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">View Full Analytics</span>
        <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] transition-colors" />
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function StoresPage() {
  const router = useRouter();
  const { isSingleShop, isSharedGodown, isLoading: setupLoading } =
    useLocationLabels();
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [editingStore, setEditingStore] = React.useState<StoreType | null>(
    null,
  );
  const [deletingStore, setDeletingStore] =
    React.useState<StoreListItem | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const queryClient = useQueryClient();

  // One-shop businesses should not land on Shops (godown+shops feature)
  React.useEffect(() => {
    if (!setupLoading && isSingleShop) {
      router.replace(adminHref("/settings"));
    }
  }, [setupLoading, isSingleShop, router]);

  const {
    data: stores = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["stores", searchQuery],
    queryFn: () =>
      storesService.getStores({ search: searchQuery || undefined }),
  });

  const { data: alerts } = useQuery({
    queryKey: ["low-stock-alerts"],
    queryFn: () => storesService.getLowStockAlerts(),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (storeId: string) => storesService.deleteStore(storeId),
    onSuccess: () => {
      handleRefresh();
      setDeletingStore(null);
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["stores"] });
    queryClient.invalidateQueries({ queryKey: ["low-stock-alerts"] });
  };

  const handleEditStore = async (store: StoreListItem) => {
    // Fetch full store details for editing
    const fullStore = await storesService.getStore(store.id);
    setEditingStore(fullStore);
  };

  const handleDeleteStore = (store: StoreListItem) => {
    setDeletingStore(store);
  };

  const activeStores = stores.filter((s) => s.isActive).length;
  const inactiveStores = stores.filter((s) => !s.isActive).length;

  if (setupLoading || isSingleShop) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#c4a574]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
        {/* Header — uses layout padding; inherits --bg-primary from dashboard shell */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <Store className="w-7 h-7 text-[var(--accent-primary)]" aria-hidden />
              Shops
            </h1>
            <p className="text-[var(--text-muted)]">
              Retail counters and stock sent from the godown
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors"
              aria-label="Refresh stores"
            >
              <RefreshCcw className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--accent-primary)] text-white font-medium hover:bg-[var(--accent-primary-hover)] transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/35"
            >
              <Plus className="w-5 h-5" />
              Add Store
            </button>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-blue-500/15">
                <Store className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-sm text-[var(--text-muted)]">Total Stores</span>
            </div>
            <p className="text-3xl font-bold text-[var(--text-primary)] tabular-nums">
              {stores.length}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-emerald-500/15">
                <Check className="w-4 h-4 text-emerald-600" />
              </div>
              <span className="text-sm text-[var(--text-muted)]">Active</span>
            </div>
            <p className="text-3xl font-bold text-emerald-700 tabular-nums">
              {activeStores}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-red-500/15">
                <X className="w-4 h-4 text-red-600" />
              </div>
              <span className="text-sm text-[var(--text-muted)]">Inactive</span>
            </div>
            <p className="text-3xl font-bold text-red-600 tabular-nums">{inactiveStores}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-amber-500/15">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-sm text-[var(--text-muted)]">Low Stock Alerts</span>
            </div>
            <p className="text-3xl font-bold text-amber-700 tabular-nums">
              {alerts?.totalAlerts || 0}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-orange-500/15">
                <Bell className="w-4 h-4 text-orange-600" />
              </div>
              <span className="text-sm text-[var(--text-muted)]">Brand Alerts</span>
            </div>
            <p className="text-3xl font-bold text-orange-700 tabular-nums">
              {alerts?.totalBrandAlerts || 0}
            </p>
          </motion.div>
        </div>

        {/* Low Stock Alert Banner */}
        {alerts && alerts.totalAlerts > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl flex items-center gap-4 border border-amber-500/35 bg-[color-mix(in_srgb,var(--bg-surface)_96%,rgba(245,158,11,0.12))]"
          >
            <AlertTriangle className="w-6 h-6 shrink-0 text-amber-600" />
            <div className="flex-1 min-w-0">
              <p className="text-[var(--text-primary)] font-medium">
                {alerts.totalAlerts} store(s) have products below stock
                threshold
              </p>
              <p className="text-[var(--text-muted)] text-sm">
                {isSharedGodown
                  ? "Add stock in Godown — all shops share the same pool"
                  : "Send stock from the godown to replenish shops"}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-800 hover:bg-amber-500/18 transition-colors text-sm font-medium"
            >
              View Details
            </button>
          </motion.div>
        )}

        {/* Brand Alert Banner */}
        {alerts && alerts.totalBrandAlerts > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border border-orange-500/35 bg-[color-mix(in_srgb,var(--bg-surface)_96%,rgba(234,88,12,0.1))]"
          >
            <div className="flex items-start gap-4">
              <Bell className="w-6 h-6 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[var(--text-primary)] font-medium mb-2">
                  {alerts.totalBrandAlerts} brand(s) have less than 50 units
                  across stores
                </p>
                <div className="flex flex-wrap gap-2">
                  {alerts.brandAlerts.slice(0, 8).map((ba, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-orange-500/12 border border-orange-500/30 text-xs text-[var(--text-primary)]"
                    >
                      <Tag className="w-3 h-3 shrink-0 text-orange-600" />
                      <span className="font-medium">{ba.brand}</span>
                      <span className="text-[var(--text-muted)]">
                        — {ba.totalStock} units @ {ba.storeName}
                      </span>
                    </span>
                  ))}
                  {alerts.brandAlerts.length > 8 && (
                    <span className="px-3 py-1 rounded-lg bg-orange-500/10 border border-orange-500/25 text-xs text-[var(--text-muted)]">
                      +{alerts.brandAlerts.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            placeholder="Search stores by name, code, or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/35"
          />
        </div>

        {/* Store Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin mx-auto mb-4" />
              <p className="text-[var(--text-muted)]">Loading stores...</p>
            </div>
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-4" />
              <p className="text-red-600 mb-4">Failed to load stores</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="px-4 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : stores.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center max-w-md">
              <div className="p-6 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-default)] mx-auto mb-4 w-fit">
                <Store className="w-12 h-12 text-[var(--accent-primary)]" />
              </div>
              <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                No stores found
              </h3>
              <p className="text-[var(--text-muted)] mb-6">
                {searchQuery
                  ? "Try adjusting your search"
                  : "Get started by adding your first store"}
              </p>
              {!searchQuery && (
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--accent-primary)] text-white font-medium hover:bg-[var(--accent-primary-hover)] transition-colors mx-auto focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/35"
                >
                  <Plus className="w-5 h-5" />
                  Add Your First Store
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                onClick={() => router.push(`/stores/${store.id}`)}
                onEdit={() => handleEditStore(store)}
                onDelete={() => handleDeleteStore(store)}
              />
            ))}
          </div>
        )}

      {/* Create Store Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <CreateStoreModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSuccess={handleRefresh}
          />
        )}
      </AnimatePresence>

      {/* Edit Store Modal */}
      <AnimatePresence>
        {editingStore && (
          <EditStoreModal
            isOpen={!!editingStore}
            onClose={() => setEditingStore(null)}
            onSuccess={handleRefresh}
            store={editingStore}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {deletingStore && (
          <DeleteConfirmModal
            isOpen={!!deletingStore}
            onClose={() => setDeletingStore(null)}
            onConfirm={() => deleteMutation.mutate(deletingStore.id)}
            storeName={deletingStore.name}
            isLoading={deleteMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
