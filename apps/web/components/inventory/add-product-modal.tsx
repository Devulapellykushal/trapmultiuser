"use client";

import { inventoryKeys, useCategories } from "@/hooks/use-inventory";
import { api } from "@/lib/api";
import {
    Category as CategoryType,
    inventoryService,
    Warehouse as WarehouseType,
} from "@/services";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
    Barcode,
    Check,
    ChevronLeft,
    ChevronRight,
    DollarSign,
    Gauge,
    Loader2,
    Package,
    Warehouse,
    X,
} from "lucide-react";
import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ProductFormData {
  // Step 1: Basic Info
  name: string;
  productCode: string;
  brand: string;
  category: string;
  description: string;
  brandCode: string;
  alias: string;
  // Step 2: Attributes (tyre shop / wheel shop — sidewall ISO, rim inch, or custom)
  sizeFormat: "TYRE_SIDWALL" | "RIM_SIZE" | "CUSTOM_MARKING";
  sizes: string[];
  // Step 3: Pricing
  costPrice: string;
  mrp: string;
  sellingPrice: string;
  // Step 4: Stock
  warehouseId: string;
  initialStock: string;
  reorderThreshold: string;
  gstPercentage: string;
}

interface CreatedProduct {
  id: string;
  sku: string;
  barcodeValue: string;
  barcodeImageUrl?: string;
}

/** Step titles tuned for non-technical staff (short labels + plain meaning). */
const STEPS = [
  { id: 1, title: "Details", hint: "Tyre, wheel, or shop item name & brand", icon: Package },
  {
    id: 2,
    title: "Tyre / rim",
    hint: "Sidewall marking, rim inch, or custom code",
    icon: Gauge,
  },
  {
    id: 3,
    title: "Prices",
    hint: "What you paid, tag price, and sale price",
    icon: DollarSign,
  },
  {
    id: 4,
    title: "Stock",
    hint: "How many you have now (you can skip)",
    icon: Warehouse,
  },
  { id: 5, title: "Check", hint: "Read once, then save", icon: Check },
];

const INITIAL_FORM_DATA: ProductFormData = {
  name: "",
  productCode: "",
  brand: "",
  category: "",
  description: "",
  brandCode: "",
  alias: "",
  sizeFormat: "TYRE_SIDWALL",
  sizes: [],
  costPrice: "",
  mrp: "",
  sellingPrice: "",
  gstPercentage: "18",
  warehouseId: "",
  initialStock: "",
  reorderThreshold: "0",
};

const parseNonNegativeInt = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

/**
 * Tyre & wheel shop presets (India-focused).
 * Tyre: ISO metric sidewall e.g. 205/55 R16 = section width / aspect ratio R rim-diameter.
 * Rim: inch sizes and common J-width patterns used for alloys / steel wheels.
 */
const SIZE_FORMATS = {
  /** Common passenger, SUV, and two-wheeler sidewall strings (MRF, CEAT, Apollo, JK, Michelin, etc.). */
  TYRE_SIDWALL: [
    "145/80 R12",
    "155/65 R13",
    "155/70 R13",
    "155/80 R13",
    "165/70 R14",
    "165/80 R14",
    "175/65 R14",
    "175/65 R15",
    "175/70 R13",
    "185/65 R15",
    "185/70 R14",
    "185/70 R15",
    "195/55 R16",
    "195/60 R15",
    "195/65 R15",
    "205/55 R16",
    "205/60 R16",
    "205/65 R16",
    "215/55 R17",
    "215/60 R16",
    "215/65 R16",
    "225/45 R17",
    "225/50 R17",
    "225/55 R17",
    "225/60 R17",
    "235/55 R18",
    "235/60 R18",
    "255/55 R18",
    "265/65 R17",
    "265/70 R16",
    "90/90 R17",
    "90/100 R10",
    "100/80 R17",
    "100/90 R17",
    "110/70 R17",
    "110/80 R17",
    "120/70 R17",
    "120/80 R17",
    "130/70 R17",
    "140/70 R17",
  ],
  /** Rim diameter (inches) and typical J-width labels for wheel retail. */
  RIM_SIZE: [
    '13"',
    '14"',
    '15"',
    '16"',
    '17"',
    '18"',
    '19"',
    '20"',
    '21"',
    '22"',
    "14×5.5J",
    "15×6J",
    "16×6.5J",
    "17×7J",
    "18×8J",
    "18×8.5J",
    "19×8.5J",
  ],
  /** Custom: user-typed markings only (no preset list). */
  CUSTOM_MARKING: [] as string[],
};

// =============================================================================
// COMPONENT
// =============================================================================

export function AddProductModal({
  isOpen,
  onClose,
  onSuccess,
}: AddProductModalProps) {
  const [currentStep, setCurrentStep] = React.useState(1);
  const [formData, setFormData] =
    React.useState<ProductFormData>(INITIAL_FORM_DATA);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [createdProduct, setCreatedProduct] =
    React.useState<CreatedProduct | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );
  const [warehouses, setWarehouses] = React.useState<WarehouseType[]>([]);
  const [warehousesLoading, setWarehousesLoading] = React.useState(false);

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

  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Fetch warehouses when modal opens
  React.useEffect(() => {
    if (isOpen && warehouses.length === 0) {
      setWarehousesLoading(true);
      inventoryService
        .getWarehouses()
        .then((data) => setWarehouses(data))
        .catch((err) => console.error("Failed to fetch warehouses:", err))
        .finally(() => setWarehousesLoading(false));
    }
  }, [isOpen, warehouses.length]);

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

  // Reset on close
  React.useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setCurrentStep(1);
        setFormData(INITIAL_FORM_DATA);
        setError(null);
        setCreatedProduct(null);
        setFieldErrors({});
      }, 300);
    }
  }, [isOpen]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === "sizeFormat" && value !== prev.sizeFormat) {
        return {
          ...prev,
          sizeFormat: value as ProductFormData["sizeFormat"],
          sizes: [],
        };
      }
      return { ...prev, [name]: value };
    });
    setError(null);
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const toggleArrayValue = (field: "sizes", value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
  };

  const appendCustomSize = (marking: string) => {
    const t = marking.trim();
    if (!t) return;
    setFormData((prev) => ({
      ...prev,
      sizes: prev.sizes.includes(t) ? prev.sizes : [...prev.sizes, t],
    }));
  };

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.name.trim()) {
        errors.name = "Please enter the product name.";
      }
      if (!formData.brand.trim()) {
        errors.brand = "Please enter the brand name.";
      }
      if (!formData.category.trim()) {
        errors.category = "Please choose or enter a category.";
      }
    }

    if (step === 3) {
      if (!formData.costPrice || parseFloat(formData.costPrice) <= 0) {
        errors.costPrice =
          "Enter what one unit cost you (must be more than zero).";
      }
      if (!formData.sellingPrice || parseFloat(formData.sellingPrice) <= 0) {
        errors.sellingPrice =
          "Enter the price customers pay (must be more than zero).";
      }
      if (!formData.mrp || parseFloat(formData.mrp) <= 0) {
        errors.mrp =
          "Enter the maximum price on the price tag (must be more than zero).";
      }
      if (parseFloat(formData.sellingPrice) > parseFloat(formData.mrp)) {
        errors.sellingPrice =
          "Sale price cannot be higher than the maximum tag price (MRP). Lower the sale price or raise the MRP.";
      }
    }

    // Step 4: Stock validation
    if (step === 4) {
      const stock = parseNonNegativeInt(formData.initialStock);
      if (stock > 0 && !formData.warehouseId) {
        errors.warehouseId =
          "You entered a quantity — please pick where those units are stored.";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) {
      setCurrentStep(3);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const initialStockQty = parseNonNegativeInt(formData.initialStock);
      const reorderThreshold = parseNonNegativeInt(formData.reorderThreshold);

      // Build attributes object
      const attributes: Record<string, string | string[]> = {};
      if (formData.sizes.length > 0) {
        attributes.sizes = formData.sizes;
        attributes.sizeFormat = formData.sizeFormat;
      }

      const productData = {
        name: formData.name,
        brand: formData.brand,
        category: formData.category,
        description: formData.description || "",
        product_code: formData.productCode || null,
        brand_code: formData.brandCode || null,
        alias: formData.alias || null,
        attributes,
        is_active: true,
        // Pricing - will be handled by backend ProductPricing model
        pricing: {
          cost_price: formData.costPrice,
          mrp: formData.mrp,
          selling_price: formData.sellingPrice,
          gst_percentage: formData.gstPercentage || "0",
        },
        // Always include variants with reorder_threshold
        variants: [
          {
            size: formData.sizes[0] || null,
            color: null,
            cost_price: formData.costPrice,
            selling_price: formData.sellingPrice,
            reorder_threshold: reorderThreshold,
            initial_stock:
              formData.warehouseId && initialStockQty > 0 ? initialStockQty : 0,
          },
        ],
        // Warehouse for initial stock (if provided)
        ...(formData.warehouseId &&
          initialStockQty > 0 && {
            warehouse_id: formData.warehouseId,
          }),
      };

      const response = await api.post("/inventory/products/", productData);

      if (response && typeof response === "object") {
        const product = response as CreatedProduct;
        setCreatedProduct({
          id: product.id,
          sku: product.sku,
          barcodeValue: product.barcodeValue,
          barcodeImageUrl: product.barcodeImageUrl,
        });
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });

      onSuccess?.();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Could not save this product. Please try again.";
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

  const handleClose = () => {
    if (createdProduct) {
      onClose();
    } else {
      onClose();
    }
  };

  // -------------------------------------------------------------------------
  // RENDER STEPS
  // -------------------------------------------------------------------------

  const renderStepContent = () => {
    // Show success view after creation
    if (createdProduct) {
      return (
        <div className="flex flex-col items-center justify-center py-8 space-y-6">
          <div className="w-16 h-16 rounded-full bg-[#2ECC71]/20 flex items-center justify-center">
            <Check className="w-8 h-8 text-[#2ECC71]" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-semibold text-[#F5F6FA] mb-2">
              Saved — this product is on your list
            </h3>
            <p className="text-[#A1A4B3] max-w-md mx-auto">
              You can find it in Inventory, sell it at the till, and print its
              label when you need it.
            </p>
          </div>

          {/* SKU and Barcode Display */}
          <div className="w-full max-w-sm space-y-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
            <div>
              <p className="text-xs text-[#6F7285] uppercase tracking-wide mb-1">
                Store code (SKU)
              </p>
              <p className="text-lg font-mono font-semibold text-[#C6A15B]">
                {createdProduct.sku}
              </p>
              <p className="text-xs text-[#6F7285] mt-1">
                The system uses this code so nothing gets mixed up at billing.
              </p>
            </div>
            <div>
              <p className="text-xs text-[#6F7285] uppercase tracking-wide mb-1">
                Barcode (for scanning)
              </p>
              <p className="text-sm font-mono text-[#F5F6FA] mb-2">
                {createdProduct.barcodeValue}
              </p>
              {createdProduct.barcodeImageUrl && (
                <div className="p-3 bg-white rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element -- API SVG; avoids next/image host config */}
                  <img
                    src={createdProduct.barcodeImageUrl}
                    alt="Barcode"
                    width={300}
                    height={100}
                    className="w-full h-auto"
                  />
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleClose}
            className="px-6 py-2.5 rounded-lg bg-[#C6A15B] text-[#0E0F13] font-medium hover:bg-[#D4B06A] transition-colors"
          >
            Done
          </button>
        </div>
      );
    }

    switch (currentStep) {
      case 1:
        return (
          <StepBasicInfo
            formData={formData}
            onChange={handleInputChange}
            errors={fieldErrors}
            categories={categories}
          />
        );
      case 2:
        return (
          <StepAttributes
            formData={formData}
            onChange={handleInputChange}
            onToggleSize={(size) => toggleArrayValue("sizes", size)}
            onAppendCustomSize={appendCustomSize}
          />
        );
      case 3:
        return (
          <StepPricing
            formData={formData}
            onChange={handleInputChange}
            marginPercentage={marginPercentage}
            errors={fieldErrors}
          />
        );
      case 4:
        return (
          <StepStock
            formData={formData}
            onChange={handleInputChange}
            warehouses={warehouses}
            warehousesLoading={warehousesLoading}
            errors={fieldErrors}
          />
        );
      case 5:
        return (
          <StepReview
            formData={formData}
            marginPercentage={marginPercentage}
            warehouses={warehouses}
          />
        );
      default:
        return null;
    }
  };

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
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <div className="w-full max-w-2xl bg-[#1A1B23] rounded-2xl border border-white/[0.08] shadow-2xl flex flex-col max-h-[90vh] my-4">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#C6A15B]/10">
                    <Package className="w-5 h-5 text-[#C6A15B]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#F5F6FA]">
                      {createdProduct ? "All set" : "Add a product"}
                    </h2>
                    {!createdProduct && (
                      <p className="text-xs text-[#6F7285]">
                        Step {currentStep} of {STEPS.length}
                        {STEPS[currentStep - 1]?.hint
                          ? ` — ${STEPS[currentStep - 1].hint}`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-[#A1A4B3]" />
                </button>
              </div>

              {/* Step Indicators */}
              {!createdProduct && (
                <div className="px-5 pt-4 pb-2">
                  <div className="flex items-center justify-between">
                    {STEPS.map((step, index) => (
                      <React.Fragment key={step.id}>
                        <div
                          className={`flex items-center gap-2 ${
                            currentStep >= step.id
                              ? "text-[#C6A15B]"
                              : "text-[#6F7285]"
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                              currentStep > step.id
                                ? "bg-[#C6A15B] text-[#0E0F13]"
                                : currentStep === step.id
                                  ? "bg-[#C6A15B]/20 text-[#C6A15B] border border-[#C6A15B]"
                                  : "bg-white/[0.05] text-[#6F7285]"
                            }`}
                          >
                            {currentStep > step.id ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              step.id
                            )}
                          </div>
                          <span className="hidden sm:block text-sm font-medium">
                            {step.title}
                          </span>
                        </div>
                        {index < STEPS.length - 1 && (
                          <div
                            className={`flex-1 h-px mx-2 ${
                              currentStep > step.id
                                ? "bg-[#C6A15B]"
                                : "bg-white/[0.08]"
                            }`}
                          />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5">
                {error && (
                  <div className="mb-4 p-3 rounded-lg bg-[#E74C3C]/10 border border-[#E74C3C]/30 text-sm text-[#E74C3C]">
                    {error}
                  </div>
                )}
                {renderStepContent()}
              </div>

              {/* Footer Actions */}
              {!createdProduct && (
                <div className="flex items-center justify-between p-5 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={currentStep === 1 ? handleClose : handleBack}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] font-medium hover:bg-white/[0.08] transition-colors"
                  >
                    {currentStep === 1 ? (
                      "Cancel"
                    ) : (
                      <>
                        <ChevronLeft className="w-4 h-4" />
                        Back
                      </>
                    )}
                  </button>
                  {currentStep < STEPS.length ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#C6A15B] text-[#0E0F13] font-medium hover:bg-[#D4B06A] transition-colors"
                    >
                      Continue
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#C6A15B] text-[#0E0F13] font-medium hover:bg-[#D4B06A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Save product
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// STEP COMPONENTS
// =============================================================================

function StepBasicInfo({
  formData,
  onChange,
  errors,
  categories,
}: {
  formData: ProductFormData;
  onChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => void;
  errors: Record<string, string>;
  categories: CategoryType[];
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6F7285] leading-relaxed">
        Add a tyre, wheel, tube, valve, or other shop SKU. Fields with a red star
        are required; the rest can wait until you have the sidewall or catalog in
        front of you.
      </p>
      {/* Product Name */}
      <div>
        <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
          Name of the product <span className="text-[#E74C3C]">*</span>
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={onChange}
          placeholder="e.g. MRF Wanderer 205/55 R16 91V tubeless"
          className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent ${
            errors.name ? "border-[#E74C3C]" : "border-white/[0.08]"
          }`}
        />
        {errors.name && (
          <p className="text-xs text-[#E74C3C] mt-1">{errors.name}</p>
        )}
      </div>

      {/* Product Code */}
      <div>
        <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
          Your own item code{" "}
          <span className="text-[#6F7285] font-normal">(optional)</span>
        </label>
        <input
          type="text"
          name="productCode"
          value={formData.productCode}
          onChange={onChange}
          placeholder="Bay code, job card ref, or your own stock label"
          className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent"
        />
      </div>

      {/* Brand & Category */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
            Brand / maker <span className="text-[#E74C3C]">*</span>
          </label>
          <input
            type="text"
            name="brand"
            value={formData.brand}
            onChange={onChange}
            placeholder="e.g. MRF, CEAT, Apollo, JK Tyre, Michelin, Bridgestone"
            className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent ${
              errors.brand ? "border-[#E74C3C]" : "border-white/[0.08]"
            }`}
          />
          {errors.brand && (
            <p className="text-xs text-[#E74C3C] mt-1">{errors.brand}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
            Type of product (category) <span className="text-[#E74C3C]">*</span>
          </label>
          {categories.length > 0 ? (
            <select
              name="category"
              value={formData.category}
              onChange={onChange}
              className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#F5F6FA] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent cursor-pointer ${
                errors.category ? "border-[#E74C3C]" : "border-white/[0.08]"
              }`}
            >
              <option value="">Choose a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              name="category"
              value={formData.category}
              onChange={onChange}
              placeholder="e.g. Car radial, 2W, SUV, Alloy wheel, Steel rim, Tube"
              className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent ${
                errors.category ? "border-[#E74C3C]" : "border-white/[0.08]"
              }`}
            />
          )}
          {errors.category && (
            <p className="text-xs text-[#E74C3C] mt-1">{errors.category}</p>
          )}
          {categories.length === 0 && (
            <p className="text-xs text-[#6F7285] mt-1">
              Tip: an admin can add saved categories under Settings so this
              becomes a simple drop-down list.
            </p>
          )}
        </div>
      </div>

      {/* Brand Code & Alias */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
            Brand code{" "}
            <span className="text-[#6F7285] font-normal">(optional)</span>
          </label>
          <input
            type="text"
            name="brandCode"
            value={formData.brandCode}
            onChange={onChange}
            placeholder="Pattern / article from sidewall or supplier catalog"
            className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
            Nickname / short name{" "}
            <span className="text-[#6F7285] font-normal">(optional)</span>
          </label>
          <input
            type="text"
            name="alias"
            value={formData.alias}
            onChange={onChange}
            placeholder="Short POS name (e.g. “OE Swift spare”)"
            className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
          Extra notes (optional)
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={onChange}
          placeholder="Load & speed index, tubeless/tube, DOT/week, PCD, offset, warranty…"
          rows={3}
          className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent resize-none"
        />
      </div>
    </div>
  );
}

function StepAttributes({
  formData,
  onChange,
  onToggleSize,
  onAppendCustomSize,
}: {
  formData: ProductFormData;
  onChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => void;
  onToggleSize: (size: string) => void;
  onAppendCustomSize: (marking: string) => void;
}) {
  const [customDraft, setCustomDraft] = React.useState("");
  const currentSizeOptions = SIZE_FORMATS[formData.sizeFormat];

  const formatLabels: Record<ProductFormData["sizeFormat"], string> = {
    TYRE_SIDWALL: "Tyre — sidewall marking (ISO)",
    RIM_SIZE: "Rim / wheel (inch or J size)",
    CUSTOM_MARKING: "Other — type your own",
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#6F7285] leading-relaxed">
        Same model line often comes in several{" "}
        <span className="text-[#A1A4B3]">tyre markings</span> (e.g.{" "}
        <span className="text-[#A1A4B3]">205/55 R16</span>: width / profile R rim
        diameter) or <span className="text-[#A1A4B3]">rim sizes</span>. Pick a
        list style, then tap each size you stock. Single-size SKUs can leave this
        empty and tap <span className="text-[#A1A4B3]">Continue</span>.
      </p>

      <div>
        <label className="block text-sm font-medium text-[#A1A4B3] mb-2">
          What kind of size list?
        </label>
        <div className="flex gap-2 flex-wrap">
          {(["TYRE_SIDWALL", "RIM_SIZE", "CUSTOM_MARKING"] as const).map(
            (format) => (
              <button
                key={format}
                type="button"
                onClick={() => {
                  const syntheticEvent = {
                    target: { name: "sizeFormat", value: format },
                  } as React.ChangeEvent<HTMLSelectElement>;
                  onChange(syntheticEvent);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  formData.sizeFormat === format
                    ? "bg-[#C6A15B] text-[#0E0F13]"
                    : "bg-white/[0.05] border border-white/[0.08] text-[#A1A4B3] hover:bg-white/[0.08]"
                }`}
              >
                {formatLabels[format]}
              </button>
            ),
          )}
        </div>
      </div>

      {formData.sizeFormat === "CUSTOM_MARKING" && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#A1A4B3]">
            Add marking, PCD, offset, tube size, etc.
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAppendCustomSize(customDraft);
                  setCustomDraft("");
                }
              }}
              placeholder='e.g. 100 PCD, ET45, 275/40 R20, "TR413" valve'
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => {
                onAppendCustomSize(customDraft);
                setCustomDraft("");
              }}
              className="px-4 py-2.5 rounded-lg bg-[#C6A15B] text-[#0E0F13] text-sm font-medium hover:bg-[#D4B06A] transition-colors shrink-0"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {formData.sizeFormat !== "CUSTOM_MARKING" &&
        currentSizeOptions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-[#A1A4B3] mb-2">
              {formData.sizeFormat === "TYRE_SIDWALL"
                ? "Tap each sidewall size you sell for this line"
                : "Tap each rim size you sell for this line"}
            </label>
            <div className="flex flex-wrap gap-2">
              {currentSizeOptions.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => onToggleSize(size)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.sizes.includes(size)
                      ? "bg-[#C6A15B] text-[#0E0F13]"
                      : "bg-white/[0.05] border border-white/[0.08] text-[#A1A4B3] hover:bg-white/[0.08]"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

      {formData.sizes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[#A1A4B3] mb-2">
            Selected ({formData.sizes.length}) — tap to remove
          </p>
          <div className="flex flex-wrap gap-2">
            {formData.sizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onToggleSize(size)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#C6A15B]/20 text-[#C6A15B] border border-[#C6A15B]/40 hover:bg-[#C6A15B]/30"
              >
                {size} ×
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepPricing({
  formData,
  onChange,
  marginPercentage,
  errors,
}: {
  formData: ProductFormData;
  onChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => void;
  marginPercentage: number;
  errors: Record<string, string>;
}) {
  const cost = parseFloat(formData.costPrice) || 0;
  const selling = parseFloat(formData.sellingPrice) || 0;
  const profitPerUnit = selling - cost;

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#6F7285] leading-relaxed">
        Enter amounts in <span className="text-[#A1A4B3]">rupees (₹)</span> for{" "}
        <strong className="text-[#A1A4B3] font-medium">one unit</strong> (one
        tyre, one rim, or one line item) of this product. The box at the bottom
        shows roughly how much you keep after paying your supplier — it updates
        as you type.
      </p>

      {/* Cost & MRP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
            Your cost (what you paid) <span className="text-[#E74C3C]">*</span>
          </label>
          <input
            type="number"
            name="costPrice"
            value={formData.costPrice}
            onChange={onChange}
            min="0"
            step="0.01"
            placeholder="0.00"
            aria-describedby="hint-cost"
            className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent ${
              errors.costPrice ? "border-[#E74C3C]" : "border-white/[0.08]"
            }`}
          />
          <p id="hint-cost" className="text-xs text-[#6F7285] mt-1.5 leading-snug">
            The price <em>you</em> paid to buy or make one unit — before any
            tax you charge the customer.
          </p>
          {errors.costPrice && (
            <p className="text-xs text-[#E74C3C] mt-1">{errors.costPrice}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
            Maximum tag price (MRP) <span className="text-[#E74C3C]">*</span>
          </label>
          <input
            type="number"
            name="mrp"
            value={formData.mrp}
            onChange={onChange}
            min="0"
            step="0.01"
            placeholder="0.00"
            aria-describedby="hint-mrp"
            className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent ${
              errors.mrp ? "border-[#E74C3C]" : "border-white/[0.08]"
            }`}
          />
          <p id="hint-mrp" className="text-xs text-[#6F7285] mt-1.5 leading-snug">
            The highest price printed on the pack or tag by law. Your everyday
            selling price must stay at or below this number.
          </p>
          {errors.mrp && (
            <p className="text-xs text-[#E74C3C] mt-1">{errors.mrp}</p>
          )}
        </div>
      </div>

      {/* Selling Price & GST */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
            Price you charge today <span className="text-[#E74C3C]">*</span>
          </label>
          <input
            type="number"
            name="sellingPrice"
            value={formData.sellingPrice}
            onChange={onChange}
            min="0"
            step="0.01"
            placeholder="0.00"
            aria-describedby="hint-selling"
            className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent ${
              errors.sellingPrice ? "border-[#E74C3C]" : "border-white/[0.08]"
            }`}
          />
          <p
            id="hint-selling"
            className="text-xs text-[#6F7285] mt-1.5 leading-snug"
          >
            What appears at the till when someone buys one unit. Offers and
            discounts apply on top of this in the POS screen.
          </p>
          {errors.sellingPrice && (
            <p className="text-xs text-[#E74C3C] mt-1">{errors.sellingPrice}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
            GST rate (tax %)
          </label>
          <select
            name="gstPercentage"
            value={formData.gstPercentage}
            onChange={onChange}
            aria-describedby="hint-gst"
            className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent"
          >
            <option value="0" className="bg-[#1A1B23]">
              No tax (0%)
            </option>
            <option value="5" className="bg-[#1A1B23]">
              5%
            </option>
            <option value="12" className="bg-[#1A1B23]">
              12%
            </option>
            <option value="18" className="bg-[#1A1B23]">
              18%
            </option>
            <option value="28" className="bg-[#1A1B23]">
              28%
            </option>
          </select>
          <p id="hint-gst" className="text-xs text-[#6F7285] mt-1.5 leading-snug">
            Pick the government tax slab that matches this product. Ask your
            accountant if you are unsure.
          </p>
        </div>
      </div>

      {/* Margin Preview */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <span className="text-sm font-medium text-[#A1A4B3]">
              Rough profit on one sale
            </span>
            <p className="text-xs text-[#6F7285] mt-1">
              Sale price minus your cost (tax is handled separately on the
              bill).
            </p>
          </div>
          <span
            className={`text-xl font-bold tabular-nums ${
              marginPercentage >= 30
                ? "text-[#2ECC71]"
                : marginPercentage >= 15
                  ? "text-[#F5A623]"
                  : marginPercentage > 0
                    ? "text-[#E74C3C]"
                    : "text-[#6F7285]"
            }`}
          >
            ₹{profitPerUnit.toFixed(2)}
          </span>
        </div>
        <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center justify-between">
          <span className="text-xs text-[#6F7285]">
            Compared to your cost, that is about:
          </span>
          <span
            className={`text-sm font-semibold tabular-nums ${
              marginPercentage >= 30
                ? "text-[#2ECC71]"
                : marginPercentage >= 15
                  ? "text-[#F5A623]"
                  : marginPercentage > 0
                    ? "text-[#E74C3C]"
                    : "text-[#6F7285]"
            }`}
          >
            {marginPercentage.toFixed(1)}% extra
          </span>
        </div>
      </div>
    </div>
  );
}

function StepStock({
  formData,
  onChange,
  warehouses,
  warehousesLoading,
  errors,
}: {
  formData: ProductFormData;
  onChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => void;
  warehouses: WarehouseType[];
  warehousesLoading: boolean;
  errors: Record<string, string>;
}) {
  const initialStockQty = parseNonNegativeInt(formData.initialStock);
  const thresholdQty = parseNonNegativeInt(formData.reorderThreshold);

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#6F7285] leading-relaxed">
        If you already have units in the shop or godown, say how many and where
        they sit. If you are not ready yet, leave quantity at{" "}
        <span className="text-[#A1A4B3]">0</span> and continue — you can add
        stock later from Inventory.
      </p>

      {/* Warehouse Selection */}
      <div>
        <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
          Storage place (warehouse / shop section)
        </label>
        {warehousesLoading ? (
          <div className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#6F7285]">
            Loading your storage list…
          </div>
        ) : (
          <select
            name="warehouseId"
            value={formData.warehouseId}
            onChange={onChange}
            className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#F5F6FA] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent ${
              errors.warehouseId ? "border-[#E74C3C]" : "border-white/[0.08]"
            }`}
          >
            <option value="" className="bg-[#1A1B23]">
              Not chosen yet (pick when you add quantity)
            </option>
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id} className="bg-[#1A1B23]">
                {wh.name} ({wh.code})
              </option>
            ))}
          </select>
        )}
        {errors.warehouseId && (
          <p className="text-xs text-[#E74C3C] mt-1">{errors.warehouseId}</p>
        )}
      </div>

      {/* Initial Stock */}
      <div>
        <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
          How many units do you have right now?
        </label>
        <input
          type="number"
          name="initialStock"
          value={formData.initialStock}
          onChange={onChange}
          min="0"
          placeholder="0"
          className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent"
        />
        <p className="text-xs text-[#6F7285] mt-1.5 leading-snug">
          We record this as opening stock. Use <span className="text-[#A1A4B3]">0</span> if you
          are only creating the product card for now.
        </p>
      </div>

      {/* Reorder Threshold */}
      <div>
        <label className="block text-sm font-medium text-[#A1A4B3] mb-1.5">
          When should we warn you stock is low?
        </label>
        <input
          type="number"
          name="reorderThreshold"
          value={formData.reorderThreshold}
          onChange={onChange}
          min="0"
          placeholder="0"
          className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent"
        />
        <p className="text-xs text-[#6F7285] mt-1.5 leading-snug">
          When counted stock goes <em>below</em> this number, the system can
          remind you to reorder. Use <span className="text-[#A1A4B3]">0</span> to
          turn that reminder off for now.
        </p>
      </div>

      {/* Stock Preview */}
      {initialStockQty > 0 && formData.warehouseId && (
        <div className="p-4 rounded-xl bg-[#2ECC71]/10 border border-[#2ECC71]/30">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#2ECC71]">✓</span>
            <span className="text-sm text-[#2ECC71]">
              {initialStockQty} units will be added to{" "}
              {warehouses.find((w) => w.id === formData.warehouseId)?.name ||
                "warehouse"}
            </span>
          </div>
          {thresholdQty > 0 ? (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-[#F59E0B]">⚠</span>
              <span className="text-sm text-[#F59E0B]">
                We will nudge you when stock falls under {thresholdQty} units
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-[#6F7285]">•</span>
              <span className="text-sm text-[#6F7285]">
                Low-stock reminder is off (you can turn it on later)
              </span>
            </div>
          )}
        </div>
      )}

      {/* No Stock Note */}
      {(!formData.initialStock || initialStockQty === 0) && (
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
          <p className="text-sm text-[#6F7285] leading-relaxed">
            No problem — you can add how many you have, and where they are kept,
            any time from the Inventory screen.
          </p>
        </div>
      )}
    </div>
  );
}

function StepReview({
  formData,
  marginPercentage,
  warehouses,
}: {
  formData: ProductFormData;
  marginPercentage: number;
  warehouses?: WarehouseType[];
}) {
  const initialStockQty = parseNonNegativeInt(formData.initialStock);
  const thresholdQty = parseNonNegativeInt(formData.reorderThreshold);
  const selectedWarehouse = warehouses?.find(
    (w) => w.id === formData.warehouseId,
  );
  const hasStock = initialStockQty > 0 && selectedWarehouse;

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#6F7285] leading-relaxed">
        Please read this summary once. If something looks wrong, use{" "}
        <span className="text-[#A1A4B3]">Back</span> to fix it. When everything
        looks right, tap <span className="text-[#A1A4B3]">Save product</span>.
      </p>

      {/* Basic Info */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        <h4 className="text-sm font-medium text-[#C6A15B] mb-3">
          What you are adding
        </h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[#6F7285]">Name</p>
            <p className="text-[#F5F6FA] font-medium">{formData.name || "—"}</p>
          </div>
          <div>
            <p className="text-[#6F7285]">Brand</p>
            <p className="text-[#F5F6FA] font-medium">
              {formData.brand || "—"}
            </p>
          </div>
          <div>
            <p className="text-[#6F7285]">Category</p>
            <p className="text-[#F5F6FA] font-medium">
              {formData.category || "—"}
            </p>
          </div>
          {formData.description && (
            <div className="col-span-2">
              <p className="text-[#6F7285]">Description</p>
              <p className="text-[#F5F6FA] font-medium">
                {formData.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Attributes */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        <h4 className="text-sm font-medium text-[#C6A15B] mb-3">
          Tyre &amp; rim markings
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-[#6F7285]">Size list style:</span>
            <span className="text-[#F5F6FA]">
              {formData.sizeFormat === "TYRE_SIDWALL"
                ? "Tyre — sidewall marking (ISO)"
                : formData.sizeFormat === "RIM_SIZE"
                  ? "Rim / wheel (inch or J size)"
                  : "Other — custom markings"}
            </span>
          </div>
          {formData.sizes.length > 0 && (
            <div className="flex gap-2">
              <span className="text-[#6F7285]">Markings / sizes:</span>
              <span className="text-[#F5F6FA]">
                {formData.sizes.join(", ")}
              </span>
            </div>
          )}
          {formData.sizes.length === 0 && (
            <p className="text-[#6F7285]">
              No extra markings — treated as one SKU (single size line)
            </p>
          )}
        </div>
      </div>

      {/* Pricing */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        <h4 className="text-sm font-medium text-[#C6A15B] mb-3">Money</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[#6F7285]">Your cost (per unit)</p>
            <p className="text-[#F5F6FA] font-medium">
              ₹{formData.costPrice || "0"}
            </p>
          </div>
          <div>
            <p className="text-[#6F7285]">Maximum tag price (MRP)</p>
            <p className="text-[#F5F6FA] font-medium">₹{formData.mrp || "0"}</p>
          </div>
          <div>
            <p className="text-[#6F7285]">Price at till today</p>
            <p className="text-[#F5F6FA] font-medium">
              ₹{formData.sellingPrice || "0"}
            </p>
          </div>
          <div>
            <p className="text-[#6F7285]">GST rate</p>
            <p className="text-[#F5F6FA] font-medium">
              {formData.gstPercentage || "0"}%
            </p>
          </div>
          <div>
            <p className="text-[#6F7285]">Rough profit vs cost</p>
            <p
              className={`font-bold ${
                marginPercentage >= 30
                  ? "text-[#2ECC71]"
                  : marginPercentage >= 15
                    ? "text-[#F5A623]"
                    : "text-[#E74C3C]"
              }`}
            >
              {marginPercentage.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Stock Info */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        <h4 className="text-sm font-medium text-[#C6A15B] mb-3">
          Stock you are starting with
        </h4>
        {hasStock ? (
          <div className="text-sm">
            <div className="flex gap-2">
              <span className="text-[#6F7285]">How many:</span>
              <span className="text-[#2ECC71] font-medium">
                {initialStockQty} units
              </span>
            </div>
            <div className="flex gap-2 mt-1">
              <span className="text-[#6F7285]">Stored at:</span>
              <span className="text-[#F5F6FA]">{selectedWarehouse.name}</span>
            </div>
            <div className="flex gap-2 mt-1">
              <span className="text-[#6F7285]">Low-stock reminder:</span>
              {thresholdQty > 0 ? (
                <span className="text-[#F59E0B] font-medium">
                  when below {thresholdQty} units
                </span>
              ) : (
                <span className="text-[#6F7285] font-medium">off</span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm space-y-1">
            <p className="text-[#6F7285]">
              Starting with no counted stock (you can add it later)
            </p>
            <div className="flex gap-2">
              <span className="text-[#6F7285]">Low-stock reminder:</span>
              {thresholdQty > 0 ? (
                <span className="text-[#F59E0B] font-medium">
                  when below {thresholdQty} units
                </span>
              ) : (
                <span className="text-[#6F7285] font-medium">off</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SKU Note — solid panel + high-contrast text (no “empty tinted box” on some displays) */}
      <div className="p-4 rounded-xl bg-[#0E0F13] border border-[#C6A15B]/50 ring-1 ring-[#C6A15B]/20">
        <p className="text-sm text-[#F7EED6] leading-relaxed flex items-start gap-2">
          <Barcode
            className="w-4 h-4 mt-0.5 shrink-0 text-[#E8D4A8]"
            strokeWidth={2}
            aria-hidden
          />
          <span>
            <span className="font-semibold text-[#FFF5E6]">
              Store code &amp; barcode
            </span>{" "}
            are created for you automatically when you save — nothing to type
            here.
          </span>
        </p>
      </div>
    </div>
  );
}
