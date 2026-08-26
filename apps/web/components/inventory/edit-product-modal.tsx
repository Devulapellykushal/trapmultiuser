"use client";

import * as React from "react";
import { X, Package, Loader2, Save, DollarSign, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { inventoryKeys, useCategories } from "@/hooks/use-inventory";

// =============================================================================
// TYPES
// =============================================================================

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  product: {
    id: string;
    name: string;
    brand: string;
    category: string;
    description?: string;
    costPrice?: number;
    mrp?: number;
    sellingPrice?: number;
    gstPercentage?: number;
  } | null;
}

interface ProductFormData {
  name: string;
  brand: string;
  category: string;
  description: string;
  costPrice: string;
  mrp: string;
  sellingPrice: string;
  gstPercentage: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EditProductModal({
  isOpen,
  onClose,
  onSuccess,
  product,
}: EditProductModalProps) {
  const [formData, setFormData] = React.useState<ProductFormData>({
    name: "",
    brand: "",
    category: "",
    description: "",
    costPrice: "",
    mrp: "",
    sellingPrice: "",
    gstPercentage: "18",
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null,
  );

  const queryClient = useQueryClient();

  // Fetch categories from API
  const { data: categoriesData } = useCategories();
  const categories = categoriesData || [];

  // Computed margin
  const marginPercentage = React.useMemo(() => {
    const cost = parseFloat(formData.costPrice) || 0;
    const selling = parseFloat(formData.sellingPrice) || 0;
    if (cost <= 0) return 0;
    return ((selling - cost) / cost) * 100;
  }, [formData.costPrice, formData.sellingPrice]);

  // Computed profit
  const profitAmount = React.useMemo(() => {
    const cost = parseFloat(formData.costPrice) || 0;
    const selling = parseFloat(formData.sellingPrice) || 0;
    return selling - cost;
  }, [formData.costPrice, formData.sellingPrice]);

  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Initialize form data when product changes
  React.useEffect(() => {
    if (product && isOpen) {
      setFormData({
        name: product.name || "",
        brand: product.brand || "",
        category: product.category || "",
        description: product.description || "",
        costPrice: product.costPrice?.toString() || "",
        mrp: product.mrp?.toString() || "",
        sellingPrice: product.sellingPrice?.toString() || "",
        gstPercentage: product.gstPercentage?.toString() || "18",
      });
      setError(null);
      setFieldErrors({});
      setSuccessMessage(null);
    }
  }, [product, isOpen]);

  // Reset on close
  React.useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setError(null);
        setFieldErrors({});
        setSuccessMessage(null);
      }, 300);
    }
  }, [isOpen]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccessMessage(null);
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) errors.name = "Product name is required";
    if (!formData.brand.trim()) errors.brand = "Brand is required";
    if (!formData.category.trim()) errors.category = "Category is required";

    // Pricing validation
    if (formData.costPrice && parseFloat(formData.costPrice) < 0) {
      errors.costPrice = "Cost price cannot be negative";
    }
    if (formData.sellingPrice && parseFloat(formData.sellingPrice) < 0) {
      errors.sellingPrice = "Selling price cannot be negative";
    }
    if (formData.mrp && parseFloat(formData.mrp) < 0) {
      errors.mrp = "MRP cannot be negative";
    }
    if (
      formData.sellingPrice &&
      formData.mrp &&
      parseFloat(formData.sellingPrice) > parseFloat(formData.mrp)
    ) {
      errors.sellingPrice = "Selling price cannot exceed MRP";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !product) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updateData: Record<string, unknown> = {
        name: formData.name,
        brand: formData.brand,
        category: formData.category,
        description: formData.description || "",
      };

      // Include pricing if any pricing field has a value
      if (formData.costPrice || formData.mrp || formData.sellingPrice) {
        updateData.pricing = {
          cost_price: formData.costPrice || "0",
          mrp: formData.mrp || "0",
          selling_price: formData.sellingPrice || "0",
          gst_percentage: formData.gstPercentage || "0",
        };
      }

      await api.patch(`/inventory/products/${product.id}/`, updateData);

      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });

      setSuccessMessage("Product updated successfully!");
      onSuccess?.();

      // Close after a short delay to show success message
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update product";
      if (err && typeof err === "object" && "response" in err) {
        const axiosError = err as {
          response?: {
            data?: {
              error?: { message?: string };
              detail?: string;
              [key: string]: unknown;
            };
          };
        };
        const data = axiosError.response?.data;
        if (data) {
          // Handle field-level errors
          const fieldErrs: Record<string, string> = {};
          Object.entries(data).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              fieldErrs[key] = value.join(", ");
            }
          });
          if (Object.keys(fieldErrs).length > 0) {
            setFieldErrors(fieldErrs);
          }
          setError(data.error?.message || data.detail || errorMessage);
        }
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!product) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 modal-scrim"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="relative w-full max-w-2xl max-h-[90vh] bg-[#111318] rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#c4a574]/20 flex items-center justify-center">
                    <Package className="w-5 h-5 text-[#c4a574]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#f3eee4]">
                      Edit Product
                    </h2>
                    <p className="text-sm text-[#8a867c]">
                      Update product details and pricing
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
                >
                  <X className="w-5 h-5 text-[#8a867c]" />
                </button>
              </div>

              {/* Form */}
              <form
                onSubmit={handleSubmit}
                className="overflow-y-auto max-h-[calc(90vh-140px)]"
              >
                <div className="p-6 space-y-6">
                  {/* Success Message */}
                  {successMessage && (
                    <div className="p-4 rounded-lg bg-[#3f9d7a]/10 border border-[#3f9d7a]/20 text-[#3f9d7a] text-sm">
                      {successMessage}
                    </div>
                  )}

                  {/* Error Message */}
                  {error && (
                    <div className="p-4 rounded-lg bg-[#c45c5c]/10 border border-[#c45c5c]/20 text-[#c45c5c] text-sm">
                      {error}
                    </div>
                  )}

                  {/* Basic Info Section */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-[#c5c0b5] uppercase tracking-wide flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      Basic Information
                    </h3>

                    {/* Product Name */}
                    <div>
                      <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                        Product Name *
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 rounded-lg bg-white/[0.03] border ${
                          fieldErrors.name
                            ? "border-[#c45c5c]"
                            : "border-white/[0.08]"
                        } text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors`}
                        placeholder="Enter product name"
                      />
                      {fieldErrors.name && (
                        <p className="mt-1 text-xs text-[#c45c5c]">
                          {fieldErrors.name}
                        </p>
                      )}
                    </div>

                    {/* Brand & Category */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                          Brand *
                        </label>
                        <input
                          type="text"
                          name="brand"
                          value={formData.brand}
                          onChange={handleInputChange}
                          className={`w-full px-4 py-3 rounded-lg bg-white/[0.03] border ${
                            fieldErrors.brand
                              ? "border-[#c45c5c]"
                              : "border-white/[0.08]"
                          } text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors`}
                          placeholder="Brand name"
                        />
                        {fieldErrors.brand && (
                          <p className="mt-1 text-xs text-[#c45c5c]">
                            {fieldErrors.brand}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                          Category *
                        </label>
                        <select
                          name="category"
                          value={formData.category}
                          onChange={handleInputChange}
                          className={`w-full px-4 py-3 rounded-lg bg-white/[0.03] border ${
                            fieldErrors.category
                              ? "border-[#c45c5c]"
                              : "border-white/[0.08]"
                          } text-[#f3eee4] focus:outline-none focus:border-[#c4a574] transition-colors`}
                        >
                          <option value="" className="bg-[#111318]">
                            Select category
                          </option>
                          {categories.map((cat) => (
                            <option
                              key={cat.id}
                              value={cat.name}
                              className="bg-[#111318]"
                            >
                              {cat.name}
                            </option>
                          ))}
                          {/* Allow custom category if not in list */}
                          {formData.category &&
                            !categories.find(
                              (c) => c.name === formData.category,
                            ) && (
                              <option
                                value={formData.category}
                                className="bg-[#111318]"
                              >
                                {formData.category}
                              </option>
                            )}
                        </select>
                        {fieldErrors.category && (
                          <p className="mt-1 text-xs text-[#c45c5c]">
                            {fieldErrors.category}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                        Description
                      </label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        rows={3}
                        className="w-full px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors resize-none"
                        placeholder="Optional product description"
                      />
                    </div>
                  </div>

                  {/* Pricing Section */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-[#c5c0b5] uppercase tracking-wide flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Pricing
                    </h3>

                    {/* Price Inputs */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                          Cost Price
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a867c]">
                            ₹
                          </span>
                          <input
                            type="number"
                            name="costPrice"
                            value={formData.costPrice}
                            onChange={handleInputChange}
                            min="0"
                            step="0.01"
                            className={`w-full pl-8 pr-4 py-3 rounded-lg bg-white/[0.03] border ${
                              fieldErrors.costPrice
                                ? "border-[#c45c5c]"
                                : "border-white/[0.08]"
                            } text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors`}
                            placeholder="0"
                          />
                        </div>
                        {fieldErrors.costPrice && (
                          <p className="mt-1 text-xs text-[#c45c5c]">
                            {fieldErrors.costPrice}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                          MRP
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a867c]">
                            ₹
                          </span>
                          <input
                            type="number"
                            name="mrp"
                            value={formData.mrp}
                            onChange={handleInputChange}
                            min="0"
                            step="0.01"
                            className={`w-full pl-8 pr-4 py-3 rounded-lg bg-white/[0.03] border ${
                              fieldErrors.mrp
                                ? "border-[#c45c5c]"
                                : "border-white/[0.08]"
                            } text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors`}
                            placeholder="0"
                          />
                        </div>
                        {fieldErrors.mrp && (
                          <p className="mt-1 text-xs text-[#c45c5c]">
                            {fieldErrors.mrp}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                          Selling Price
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a867c]">
                            ₹
                          </span>
                          <input
                            type="number"
                            name="sellingPrice"
                            value={formData.sellingPrice}
                            onChange={handleInputChange}
                            min="0"
                            step="0.01"
                            className={`w-full pl-8 pr-4 py-3 rounded-lg bg-white/[0.03] border ${
                              fieldErrors.sellingPrice
                                ? "border-[#c45c5c]"
                                : "border-white/[0.08]"
                            } text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors`}
                            placeholder="0"
                          />
                        </div>
                        {fieldErrors.sellingPrice && (
                          <p className="mt-1 text-xs text-[#c45c5c]">
                            {fieldErrors.sellingPrice}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* GST */}
                    <div className="w-1/3">
                      <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                        GST Percentage
                      </label>
                      <select
                        name="gstPercentage"
                        value={formData.gstPercentage}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[#f3eee4] focus:outline-none focus:border-[#c4a574] transition-colors"
                      >
                        <option value="0" className="bg-[#111318]">
                          0%
                        </option>
                        <option value="5" className="bg-[#111318]">
                          5%
                        </option>
                        <option value="12" className="bg-[#111318]">
                          12%
                        </option>
                        <option value="18" className="bg-[#111318]">
                          18%
                        </option>
                        <option value="28" className="bg-[#111318]">
                          28%
                        </option>
                      </select>
                    </div>

                    {/* Margin Preview */}
                    {(formData.costPrice || formData.sellingPrice) && (
                      <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                        <div>
                          <p className="text-xs text-[#8a867c] mb-1">
                            Profit Amount
                          </p>
                          <p
                            className={`text-lg font-semibold ${
                              profitAmount >= 0
                                ? "text-[#3f9d7a]"
                                : "text-[#c45c5c]"
                            }`}
                          >
                            {formatCurrency(profitAmount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#8a867c] mb-1">
                            Margin Percentage
                          </p>
                          <p
                            className={`text-lg font-semibold ${
                              marginPercentage >= 0
                                ? "text-[#3f9d7a]"
                                : "text-[#c45c5c]"
                            }`}
                          >
                            {marginPercentage.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.08] bg-[#111318]">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#c5c0b5] font-medium hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#c4a574] text-[#111318] font-semibold hover:bg-[#d4b88a] transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
