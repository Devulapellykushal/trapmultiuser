"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Package,
  Plus,
  Trash2,
  Loader2,
  User,
  ShoppingCart,
} from "lucide-react";
import { purchaseOrdersService, inventoryService } from "@/services";
import { inventoryKeys } from "@/hooks";

// =============================================================================
// TYPES
// =============================================================================

interface CreatePurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface OrderItem {
  id: string;
  product: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  taxPercentage: number;
  lineTotal: number;
}

interface OrderFormData {
  supplier: string;
  warehouse: string;
  orderDate: string;
  expectedDate: string;
  notes: string;
  items: OrderItem[];
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CreatePurchaseOrderModal({
  isOpen,
  onClose,
  onSuccess,
}: CreatePurchaseOrderModalProps) {
  const [currentStep, setCurrentStep] = React.useState(1);
  const [isCreatingSupplier, setIsCreatingSupplier] = React.useState(false);
  const [formData, setFormData] = React.useState<OrderFormData>({
    supplier: "",
    warehouse: "",
    orderDate: new Date().toISOString().split("T")[0],
    expectedDate: "",
    notes: "",
    items: [],
  });

  const [newSupplierData, setNewSupplierData] = React.useState({
    name: "",
    code: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  const queryClient = useQueryClient();

  // Fetch data
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => purchaseOrdersService.getSuppliers({ minimal: true }),
    enabled: isOpen,
  });

  const { data: warehouses = [], isLoading: warehousesLoading } = useQuery({
    queryKey: inventoryKeys.warehouses(),
    queryFn: () => inventoryService.getWarehouses(),
    enabled: isOpen,
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products-for-po"],
    queryFn: async () => {
      const response = await inventoryService.getProducts({ page_size: 1000 });
      return response.results || [];
    },
    enabled: isOpen,
  });

  // Mutations
  const createSupplierMutation = useMutation({
    mutationFn: purchaseOrdersService.createSupplier,
    onSuccess: (newSupplier) => {
      setFormData((prev) => ({ ...prev, supplier: newSupplier.id }));
      setIsCreatingSupplier(false);
      setNewSupplierData({
        name: "",
        code: "",
        contactPerson: "",
        phone: "",
        email: "",
        address: "",
        notes: "",
      });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: purchaseOrdersService.createPurchaseOrder,
    onSuccess: () => {
      onSuccess();
      onClose();
      setFormData({
        supplier: "",
        warehouse: "",
        orderDate: new Date().toISOString().split("T")[0],
        expectedDate: "",
        notes: "",
        items: [],
      });
      setCurrentStep(1);
    },
  });

  // Computed values
  const subtotal = formData.items.reduce(
    (sum, item) => sum + item.lineTotal,
    0,
  );
  const totalTax = formData.items.reduce(
    (sum, item) => sum + (item.lineTotal * item.taxPercentage) / 100,
    0,
  );
  const total = subtotal + totalTax;

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNewSupplierChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setNewSupplierData((prev) => ({ ...prev, [name]: value }));
  };

  const addItem = () => {
    const newItem: OrderItem = {
      id: Math.random().toString(36).substr(2, 9),
      product: "",
      productName: "",
      productSku: "",
      quantity: 1,
      unitPrice: 0,
      taxPercentage: 18,
      lineTotal: 0,
    };
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  };

  const updateItem = (
    id: string,
    field: keyof OrderItem,
    value: string | number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };

        // If product changed, update name and SKU
        if (field === "product" && typeof value === "string") {
          const product = products.find((p) => p.id === value);
          updated.productName = product?.name || "";
          updated.productSku = product?.sku || "";
        }

        // Recalculate line total
        if (field === "quantity" || field === "unitPrice") {
          updated.lineTotal = updated.quantity * updated.unitPrice;
        }

        return updated;
      }),
    }));
  };

  const removeItem = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep === 1) {
      setCurrentStep(2);
    } else {
      // Submit order
      // Validate required fields
      if (!formData.supplier) {
        console.error("Supplier is required");
        return;
      }
      if (!formData.warehouse) {
        console.error("Warehouse is required");
        return;
      }
      if (!formData.orderDate) {
        console.error("Order date is required");
        return;
      }
      if (formData.items.length === 0) {
        console.error("At least one item is required");
        return;
      }

      const orderData = {
        supplier: formData.supplier,
        warehouse: formData.warehouse,
        order_date: formData.orderDate,
        expected_date: formData.expectedDate || undefined,
        notes: formData.notes || undefined,
        items: formData.items.map((item) => ({
          product: item.product,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          tax_percentage: item.taxPercentage,
        })),
      };

      // Remove undefined fields
      if (orderData.expected_date === undefined) {
        delete orderData.expected_date;
      }
      if (orderData.notes === undefined || orderData.notes === "") {
        delete orderData.notes;
      }

      createOrderMutation.mutate(orderData);
    }
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    // Transform camelCase to snake_case for API
    const supplierData = {
      name: newSupplierData.name,
      code: newSupplierData.code,
      contact_person: newSupplierData.contactPerson,
      phone: newSupplierData.phone,
      email: newSupplierData.email,
      address: newSupplierData.address,
      notes: newSupplierData.notes,
    };
    createSupplierMutation.mutate(supplierData);
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
        className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20">
                <ShoppingCart className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {isCreatingSupplier
                    ? "New Supplier"
                    : "Create Purchase Order"}
                </h2>
                <p className="text-sm text-zinc-400">
                  {isCreatingSupplier
                    ? "Add a new supplier"
                    : currentStep === 1
                      ? "Step 1: Order Details"
                      : "Step 2: Add Items"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {isCreatingSupplier ? (
            /* Supplier Creation Form */
            <form onSubmit={handleCreateSupplier} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Supplier Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={newSupplierData.name}
                    onChange={handleNewSupplierChange}
                    required
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Supplier Code
                  </label>
                  <input
                    type="text"
                    name="code"
                    value={newSupplierData.code}
                    onChange={handleNewSupplierChange}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    name="contactPerson"
                    value={newSupplierData.contactPerson}
                    onChange={handleNewSupplierChange}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={newSupplierData.phone}
                    onChange={handleNewSupplierChange}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={newSupplierData.email}
                  onChange={handleNewSupplierChange}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Address
                </label>
                <textarea
                  name="address"
                  value={newSupplierData.address}
                  onChange={handleNewSupplierChange}
                  rows={3}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreatingSupplier(false)}
                  className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSupplierMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {createSupplierMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <User className="w-4 h-4" />
                      Create Supplier
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : currentStep === 1 ? (
            /* Step 1: Order Details */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Supplier *
                  </label>
                  <div className="flex gap-2">
                    <select
                      name="supplier"
                      value={formData.supplier}
                      onChange={handleInputChange}
                      required
                      disabled={suppliersLoading}
                      className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="">Select supplier...</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}{" "}
                          {supplier.code && `(${supplier.code})`}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsCreatingSupplier(true)}
                      className="px-4 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Warehouse *
                  </label>
                  <select
                    name="warehouse"
                    value={formData.warehouse}
                    onChange={handleInputChange}
                    required
                    disabled={warehousesLoading}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="">Select warehouse...</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} ({warehouse.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Order Date *
                  </label>
                  <input
                    type="date"
                    name="orderDate"
                    value={formData.orderDate}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Expected Date
                  </label>
                  <input
                    type="date"
                    name="expectedDate"
                    value={formData.expectedDate}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium hover:from-blue-600 hover:to-indigo-700 transition-all"
                >
                  Next: Add Items
                </button>
              </div>
            </form>
          ) : (
            /* Step 2: Items */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Order Items</h3>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>

              <div className="space-y-4 max-h-96 overflow-y-auto">
                {formData.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-700"
                  >
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                          Product *
                        </label>
                        <select
                          value={item.product}
                          onChange={(e) =>
                            updateItem(item.id, "product", e.target.value)
                          }
                          required
                          disabled={productsLoading}
                          className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                          <option value="">Select product...</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} ({product.sku})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                          Quantity *
                        </label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(
                              item.id,
                              "quantity",
                              parseInt(e.target.value) || 0,
                            )
                          }
                          min={1}
                          required
                          className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                          Unit Price (₹) *
                        </label>
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(
                              item.id,
                              "unitPrice",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          min={0}
                          step="0.01"
                          required
                          className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                          Tax %
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={item.taxPercentage}
                            onChange={(e) =>
                              updateItem(
                                item.id,
                                "taxPercentage",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            min={0}
                            step="0.01"
                            className="flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="p-2 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-right">
                      <span className="text-sm text-zinc-400">
                        Line Total: ₹{item.lineTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}

                {formData.items.length === 0 && (
                  <div className="text-center py-8 text-zinc-400">
                    No items added. Click &ldquo;Add Item&rdquo; to start.
                  </div>
                )}
              </div>

              {/* Order Summary */}
              <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700">
                <h4 className="font-medium text-white mb-3">Order Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Subtotal:</span>
                    <span className="text-white">₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Total Tax:</span>
                    <span className="text-white">₹{totalTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-semibold pt-2 border-t border-zinc-700">
                    <span className="text-white">Total:</span>
                    <span className="text-emerald-400">
                      ₹{total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Back
                </button>
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
                    disabled={
                      createOrderMutation.isPending ||
                      formData.items.length === 0
                    }
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-medium hover:from-emerald-600 hover:to-green-700 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {createOrderMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Package className="w-4 h-4" />
                        Create Purchase Order
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
