"use client";

import { inventoryKeys, useCategories } from "@/hooks/use-inventory";
import { useLocationLabels } from "@/hooks/use-business-setup";
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
import { useIndustryProfile } from "@/lib/industry";
import type { IndustryAddProductProfile, IndustryProfile } from "@/lib/industry/profiles";
import { adminHref } from "@/lib/admin-routes";
import Link from "next/link";

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
  // Step 2: Variants / options (industry profile presets)
  sizeFormat: string;
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
  barcodeValue?: string | null;
  barcodeImageUrl?: string;
}

function buildSteps(addProduct: IndustryAddProductProfile) {
  return [
    { id: 1, title: "Details", hint: addProduct.step1Hint, icon: Package },
    {
      id: 2,
      title: addProduct.step2Title,
      hint: addProduct.step2Hint,
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
}

function initialFormData(addProduct: IndustryAddProductProfile): ProductFormData {
  return {
    name: "",
    productCode: "",
    brand: "",
    category: "",
    description: "",
    brandCode: "",
    alias: "",
    sizeFormat: addProduct.defaultSizeFormat,
    sizes: [],
    costPrice: "",
    mrp: "",
    sellingPrice: "",
    gstPercentage: "18",
    warehouseId: "",
    initialStock: "",
    reorderThreshold: "0",
  };
}

const parseNonNegativeInt = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function AddProductModal({
  isOpen,
  onClose,
  onSuccess,
}: AddProductModalProps) {
  const industry = useIndustryProfile();
  const STEPS = React.useMemo(
    () => buildSteps(industry.addProduct),
    [industry.addProduct],
  );
  const [currentStep, setCurrentStep] = React.useState(1);
  const [formData, setFormData] = React.useState<ProductFormData>(() =>
    initialFormData(industry.addProduct),
  );
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
  const { barcodeEnabled, gstEnabled, labels, isSingleShop } = useLocationLabels();
  const storageNoun = isSingleShop ? "shop" : "shop / godown";

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

  // Fetch warehouses whenever the modal opens (fresh after Settings / Warehouses)
  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setWarehousesLoading(true);
    inventoryService
      .getWarehouses()
      .then((data) => {
        if (cancelled) return;
        setWarehouses(data);
        if (data.length === 1) {
          setFormData((prev) =>
            prev.warehouseId
              ? prev
              : { ...prev, warehouseId: String(data[0].id) },
          );
        }
      })
      .catch((err) => console.error("Failed to fetch warehouses:", err))
      .finally(() => {
        if (!cancelled) setWarehousesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

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
        setFormData(initialFormData(industry.addProduct));
        setError(null);
        setCreatedProduct(null);
        setFieldErrors({});
      }, 300);
    }
  }, [isOpen, industry.addProduct]);

  // Keep form defaults aligned when industry profile changes while closed
  React.useEffect(() => {
    if (!isOpen) {
      setFormData(initialFormData(industry.addProduct));
    }
  }, [industry.id, industry.addProduct, isOpen]);

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
          sizeFormat: value,
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
      if (industry.addProduct.brandRequired && !formData.brand.trim()) {
        errors.brand = "Please enter the brand name.";
      }
      if (!formData.category.trim()) {
        errors.category = "Tap a type below, or type your own.";
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

      const brand =
        formData.brand.trim() ||
        industry.addProduct.defaultBrand ||
        "Generic";

      const productData = {
        name: formData.name,
        brand,
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
          gst_percentage: gstEnabled ? formData.gstPercentage || "0" : "0",
        },
        // Always include variants with reorder_threshold
        variants: [
          {
            size: formData.sizes[0] || industry.addProduct.singleSkuValue || null,
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
        const product = response as CreatedProduct & {
          barcode_value?: string | null;
          barcode_image_url?: string;
        };
        setCreatedProduct({
          id: product.id,
          sku: product.sku,
          barcodeValue:
            product.barcodeValue ?? product.barcode_value ?? null,
          barcodeImageUrl:
            product.barcodeImageUrl ?? product.barcode_image_url,
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
          <div className="w-16 h-16 rounded-full bg-[#3f9d7a]/20 flex items-center justify-center">
            <Check className="w-8 h-8 text-[#3f9d7a]" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-semibold text-[#f3eee4] mb-2">
              Saved — this product is on your list
            </h3>
            <p className="text-[#c5c0b5] max-w-md mx-auto">
              You can find it in Inventory, sell it at the till, and print its
              label when you need it.
            </p>
          </div>

          {/* SKU and Barcode Display */}
          <div className="w-full max-w-sm space-y-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
            <div>
              <p className="text-xs text-[#8a867c] uppercase tracking-wide mb-1">
                Item code
              </p>
              <p className="text-lg font-mono font-semibold text-[#c4a574]">
                {createdProduct.sku}
              </p>
              <p className="text-xs text-[#8a867c] mt-1">
                The system uses this code so nothing gets mixed up at billing.
              </p>
            </div>
            {createdProduct.barcodeValue ? (
              <div>
                <p className="text-xs text-[#8a867c] uppercase tracking-wide mb-1">
                  Barcode (for scanning)
                </p>
                <p className="text-sm font-mono text-[#f3eee4] mb-2">
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
            ) : (
              <p className="text-xs text-[#8a867c]">
                No barcode — barcodes are off in Settings. Sell by search or
                tap.
              </p>
            )}
          </div>

          <button
            onClick={handleClose}
            className="px-6 py-2.5 rounded-lg bg-[#c4a574] text-[#0c0d10] font-medium hover:bg-[#d4b88a] transition-colors"
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
            profile={industry}
          />
        );
      case 2:
        return (
          <StepAttributes
            formData={formData}
            onChange={handleInputChange}
            onToggleSize={(size) => toggleArrayValue("sizes", size)}
            onAppendCustomSize={appendCustomSize}
            onSkipSingleSku={() => {
              setFormData((prev) => ({
                ...prev,
                sizes: [industry.addProduct.singleSkuValue],
              }));
              setCurrentStep(3);
            }}
            profile={industry}
          />
        );
      case 3:
        return (
          <StepPricing
            formData={formData}
            onChange={handleInputChange}
            marginPercentage={marginPercentage}
            errors={fieldErrors}
            gstEnabled={gstEnabled}
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
            storageNoun={storageNoun}
            storageLabel={
              isSingleShop
                ? "Your shop (storage place)"
                : `Storage place (${labels.warehouseSingular} / shop)`
            }
          />
        );
      case 5:
        return (
          <StepReview
            formData={formData}
            marginPercentage={marginPercentage}
            warehouses={warehouses}
            barcodeEnabled={barcodeEnabled}
            gstEnabled={gstEnabled}
            profile={industry}
          />
        );
      default:
        return null;
    }
  };

  const needsStorageSetup =
    !createdProduct && !warehousesLoading && warehouses.length === 0;

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
            className="fixed inset-0 z-40 modal-scrim"
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
            <div className="w-full max-w-2xl bg-[#111318] rounded-2xl border border-white/[0.08] shadow-2xl flex flex-col max-h-[90vh] my-4">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#c4a574]/10">
                    <Package className="w-5 h-5 text-[#c4a574]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#f3eee4]">
                      {createdProduct
                        ? "All set"
                        : needsStorageSetup
                          ? "Set up storage first"
                          : "Add a product"}
                    </h2>
                    {!createdProduct && !needsStorageSetup && (
                      <p className="text-xs text-[#8a867c]">
                        Step {currentStep} of {STEPS.length}
                        {STEPS[currentStep - 1]?.hint
                          ? ` — ${STEPS[currentStep - 1].hint}`
                          : ""}
                      </p>
                    )}
                    {needsStorageSetup && (
                      <p className="text-xs text-[#8a867c]">
                        No {storageNoun} chosen yet for this business
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-[#c5c0b5]" />
                </button>
              </div>

              {/* Step Indicators */}
              {!createdProduct && !needsStorageSetup && (
                <div className="px-5 pt-4 pb-2">
                  <div className="flex items-center justify-between">
                    {STEPS.map((step, index) => (
                      <React.Fragment key={step.id}>
                        <div
                          className={`flex items-center gap-2 ${
                            currentStep >= step.id
                              ? "text-[#c4a574]"
                              : "text-[#8a867c]"
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                              currentStep > step.id
                                ? "bg-[#c4a574] text-[#0c0d10]"
                                : currentStep === step.id
                                  ? "bg-[#c4a574]/20 text-[#c4a574] border border-[#c4a574]"
                                  : "bg-white/[0.05] text-[#8a867c]"
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
                                ? "bg-[#c4a574]"
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
                  <div className="mb-4 p-3 rounded-lg bg-[#c45c5c]/10 border border-[#c45c5c]/30 text-sm text-[#c45c5c]">
                    {error}
                  </div>
                )}
                {needsStorageSetup ? (
                  <StorageSetupGate
                    storageNoun={storageNoun}
                    onClose={handleClose}
                  />
                ) : (
                  renderStepContent()
                )}
              </div>

              {/* Footer Actions */}
              {!createdProduct && !needsStorageSetup && (
                <div className="flex items-center justify-between p-5 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={currentStep === 1 ? handleClose : handleBack}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] font-medium hover:bg-white/[0.08] transition-colors"
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
                      className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#c4a574] text-[#0c0d10] font-medium hover:bg-[#d4b88a] transition-colors"
                    >
                      Continue
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#c4a574] text-[#0c0d10] font-medium hover:bg-[#d4b88a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

function StorageSetupGate({
  storageNoun,
  onClose,
}: {
  storageNoun: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-2 space-y-5">
      <div className="w-14 h-14 rounded-full bg-[#c4a574]/15 flex items-center justify-center">
        <Warehouse className="w-7 h-7 text-[#c4a574]" />
      </div>
      <div className="space-y-2 max-w-md">
        <h3 className="text-lg font-semibold text-[#f3eee4]">
          No {storageNoun} set up yet
        </h3>
        <p className="text-sm text-[#8a867c] leading-relaxed">
          Before you add products, create where stock lives — your{" "}
          <span className="text-[#c5c0b5]">{storageNoun}</span>. Takes about a
          minute. Then come back and tap Add a product.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
        <Link
          href={adminHref("/warehouses")}
          onClick={onClose}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#c4a574] text-[#0c0d10] text-sm font-medium hover:bg-[#d4b88a] transition-colors"
        >
          Create {storageNoun}
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] text-sm font-medium hover:bg-white/[0.08] transition-colors"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-[#8a867c]">
        Tip: after signup, set stock layout in Settings, then add your{" "}
        <span className="text-[#c5c0b5]">{storageNoun}</span>.
      </p>
    </div>
  );
}

function StepBasicInfo({
  formData,
  onChange,
  errors,
  categories,
  profile,
}: {
  formData: ProductFormData;
  onChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => void;
  errors: Record<string, string>;
  categories: CategoryType[];
  profile: IndustryProfile;
}) {
  const ap = profile.addProduct;
  const [showMore, setShowMore] = React.useState(false);

  const chipNames = React.useMemo(() => {
    const fromApi = categories.map((c) => c.name).filter(Boolean);
    const merged = [...fromApi];
    for (const tip of ap.categorySuggestions) {
      if (!merged.some((n) => n.toLowerCase() === tip.toLowerCase())) {
        merged.push(tip);
      }
    }
    return merged;
  }, [categories, ap.categorySuggestions]);

  const setCategory = (value: string) => {
    const syntheticEvent = {
      target: { name: "category", value },
    } as React.ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  const hasOptionalExtras =
    Boolean(formData.productCode) ||
    Boolean(formData.brandCode) ||
    Boolean(formData.alias) ||
    Boolean(formData.description);

  React.useEffect(() => {
    if (hasOptionalExtras) setShowMore(true);
  }, [hasOptionalExtras]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#8a867c] leading-relaxed">{ap.intro}</p>

      <div>
        <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
          {ap.nameLabel} <span className="text-[#c45c5c]">*</span>
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={onChange}
          autoFocus
          placeholder={ap.namePlaceholder}
          className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent ${
            errors.name ? "border-[#c45c5c]" : "border-white/[0.08]"
          }`}
        />
        {errors.name && (
          <p className="text-xs text-[#c45c5c] mt-1">{errors.name}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
          {ap.categoryLabel} <span className="text-[#c45c5c]">*</span>
        </label>
        {chipNames.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {chipNames.map((name) => {
              const selected =
                formData.category.trim().toLowerCase() === name.toLowerCase();
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCategory(name)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    selected
                      ? "bg-[#c4a574] text-[#0c0d10] font-medium"
                      : "bg-white/[0.05] border border-white/[0.08] text-[#c5c0b5] hover:bg-white/[0.08]"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}
        <input
          type="text"
          name="category"
          value={formData.category}
          onChange={onChange}
          placeholder={ap.categoryPlaceholder}
          className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent ${
            errors.category ? "border-[#c45c5c]" : "border-white/[0.08]"
          }`}
        />
        {errors.category && (
          <p className="text-xs text-[#c45c5c] mt-1">{errors.category}</p>
        )}
        <p className="text-xs text-[#8a867c] mt-1.5">
          Tap a chip or type your own — no Settings setup needed.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
          {ap.brandLabel}
          {ap.brandRequired ? (
            <span className="text-[#c45c5c]"> *</span>
          ) : (
            <span className="text-[#8a867c] font-normal">
              {" "}
              (optional
              {ap.defaultBrand ? ` — blank saves as “${ap.defaultBrand}”` : ""})
            </span>
          )}
        </label>
        <input
          type="text"
          name="brand"
          value={formData.brand}
          onChange={onChange}
          placeholder={ap.brandPlaceholder}
          className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent ${
            errors.brand ? "border-[#c45c5c]" : "border-white/[0.08]"
          }`}
        />
        {errors.brand && (
          <p className="text-xs text-[#c45c5c] mt-1">{errors.brand}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="text-sm text-[#c4a574] hover:text-[#d4b88a] transition-colors"
      >
        {showMore ? "Hide optional details" : "Add codes / notes (optional)"}
      </button>

      {showMore && (
        <div className="space-y-4 pt-1 border-t border-white/[0.06]">
          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
              {ap.productCodeLabel}{" "}
              <span className="text-[#8a867c] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              name="productCode"
              value={formData.productCode}
              onChange={onChange}
              placeholder={ap.productCodePlaceholder}
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
                {ap.brandCodeLabel}{" "}
                <span className="text-[#8a867c] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                name="brandCode"
                value={formData.brandCode}
                onChange={onChange}
                placeholder={ap.brandCodePlaceholder}
                className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
                {ap.aliasLabel}{" "}
                <span className="text-[#8a867c] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                name="alias"
                value={formData.alias}
                onChange={onChange}
                placeholder={ap.aliasPlaceholder}
                className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
              {ap.notesLabel}{" "}
              <span className="text-[#8a867c] font-normal">(optional)</span>
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={onChange}
              placeholder={ap.notesPlaceholder}
              rows={2}
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StepAttributes({
  formData,
  onChange,
  onToggleSize,
  onAppendCustomSize,
  onSkipSingleSku,
  profile,
}: {
  formData: ProductFormData;
  onChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => void;
  onToggleSize: (size: string) => void;
  onAppendCustomSize: (marking: string) => void;
  onSkipSingleSku: () => void;
  profile: IndustryProfile;
}) {
  const [customDraft, setCustomDraft] = React.useState("");
  const formats = profile.addProduct.sizeFormats;
  const active =
    formats.find((f) => f.id === formData.sizeFormat) ?? formats[0];
  const currentSizeOptions = active?.presets ?? [];
  const isCustom =
    !active || active.presets.length === 0 || active.id === "CUSTOM_MARKING";

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onSkipSingleSku}
        className="w-full px-4 py-3 rounded-lg border border-[#c4a574]/40 bg-[#c4a574]/10 text-[#f3eee4] text-sm font-medium hover:bg-[#c4a574]/20 transition-colors text-left"
      >
        {profile.addProduct.singleSkuLabel}
        <span className="block text-xs text-[#8a867c] font-normal mt-0.5">
          Saves as “{profile.addProduct.singleSkuValue}” and jumps to prices
        </span>
      </button>

      <p className="text-sm text-[#8a867c] leading-relaxed">
        Or pick several{" "}
        <span className="text-[#c5c0b5]">
          {profile.variantOptionLabel.toLowerCase()}
        </span>{" "}
        options you stock. You can also leave this empty and tap Continue.
      </p>

      <div>
        <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
          What kind of option list?
        </label>
        <div className="flex gap-2 flex-wrap">
          {formats.map((format) => (
            <button
              key={format.id}
              type="button"
              onClick={() => {
                const syntheticEvent = {
                  target: { name: "sizeFormat", value: format.id },
                } as React.ChangeEvent<HTMLSelectElement>;
                onChange(syntheticEvent);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                formData.sizeFormat === format.id
                  ? "bg-[#c4a574] text-[#0c0d10]"
                  : "bg-white/[0.05] border border-white/[0.08] text-[#c5c0b5] hover:bg-white/[0.08]"
              }`}
            >
              {format.label}
            </button>
          ))}
        </div>
      </div>

      {isCustom && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#c5c0b5]">
            Add {profile.variantOptionLabel.toLowerCase()}
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
              placeholder="Type an option and press Add"
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => {
                onAppendCustomSize(customDraft);
                setCustomDraft("");
              }}
              className="px-4 py-2.5 rounded-lg bg-[#c4a574] text-[#0c0d10] text-sm font-medium hover:bg-[#d4b88a] transition-colors shrink-0"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {!isCustom && currentSizeOptions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
              Tap each {profile.variantOptionLabel.toLowerCase()} you sell for
              this line
            </label>
            <div className="flex flex-wrap gap-2">
              {currentSizeOptions.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => onToggleSize(size)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.sizes.includes(size)
                      ? "bg-[#c4a574] text-[#0c0d10]"
                      : "bg-white/[0.05] border border-white/[0.08] text-[#c5c0b5] hover:bg-white/[0.08]"
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
          <p className="text-xs font-medium text-[#c5c0b5] mb-2">
            Selected ({formData.sizes.length}) — tap to remove
          </p>
          <div className="flex flex-wrap gap-2">
            {formData.sizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onToggleSize(size)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#c4a574]/20 text-[#c4a574] border border-[#c4a574]/40 hover:bg-[#c4a574]/30"
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
  gstEnabled,
}: {
  formData: ProductFormData;
  onChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => void;
  marginPercentage: number;
  errors: Record<string, string>;
  gstEnabled: boolean;
}) {
  const cost = parseFloat(formData.costPrice) || 0;
  const selling = parseFloat(formData.sellingPrice) || 0;
  const profitPerUnit = selling - cost;

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#8a867c] leading-relaxed">
        Enter amounts in <span className="text-[#c5c0b5]">rupees (₹)</span> for{" "}
        <strong className="text-[#c5c0b5] font-medium">one unit</strong> of this
        product. The box at the bottom shows roughly how much you keep after
        paying your supplier — it updates as you type.
      </p>

      {/* Cost & MRP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
            Your cost (what you paid) <span className="text-[#c45c5c]">*</span>
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
            className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent ${
              errors.costPrice ? "border-[#c45c5c]" : "border-white/[0.08]"
            }`}
          />
          <p id="hint-cost" className="text-xs text-[#8a867c] mt-1.5 leading-snug">
            The price <em>you</em> paid to buy or make one unit — before any
            tax you charge the customer.
          </p>
          {errors.costPrice && (
            <p className="text-xs text-[#c45c5c] mt-1">{errors.costPrice}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
            Maximum tag price (MRP) <span className="text-[#c45c5c]">*</span>
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
            className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent ${
              errors.mrp ? "border-[#c45c5c]" : "border-white/[0.08]"
            }`}
          />
          <p id="hint-mrp" className="text-xs text-[#8a867c] mt-1.5 leading-snug">
            The highest price printed on the pack or tag by law. Your everyday
            selling price must stay at or below this number.
          </p>
          {errors.mrp && (
            <p className="text-xs text-[#c45c5c] mt-1">{errors.mrp}</p>
          )}
        </div>
      </div>

      {/* Selling Price & GST */}
      <div
        className={`grid gap-4 ${gstEnabled ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
      >
        <div>
          <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
            Price you charge today <span className="text-[#c45c5c]">*</span>
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
            className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent ${
              errors.sellingPrice ? "border-[#c45c5c]" : "border-white/[0.08]"
            }`}
          />
          <p
            id="hint-selling"
            className="text-xs text-[#8a867c] mt-1.5 leading-snug"
          >
            What appears at the till when someone buys one unit. Offers and
            discounts apply on top of this in the POS screen.
          </p>
          {errors.sellingPrice && (
            <p className="text-xs text-[#c45c5c] mt-1">{errors.sellingPrice}</p>
          )}
        </div>
        {gstEnabled && (
          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
              GST rate (tax %)
            </label>
            <select
              name="gstPercentage"
              value={formData.gstPercentage}
              onChange={onChange}
              aria-describedby="hint-gst"
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent"
            >
              <option value="0" className="bg-[#111318]">
                No tax (0%)
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
            <p
              id="hint-gst"
              className="text-xs text-[#8a867c] mt-1.5 leading-snug"
            >
              Pick the government tax slab that matches this product. Turn GST
              off in Settings if you never need tax.
            </p>
          </div>
        )}
      </div>

      {/* Margin Preview */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <span className="text-sm font-medium text-[#c5c0b5]">
              Rough profit on one sale
            </span>
            <p className="text-xs text-[#8a867c] mt-1">
              Sale price minus your cost (tax is handled separately on the
              bill).
            </p>
          </div>
          <span
            className={`text-xl font-bold tabular-nums ${
              marginPercentage >= 30
                ? "text-[#3f9d7a]"
                : marginPercentage >= 15
                  ? "text-[#d4a054]"
                  : marginPercentage > 0
                    ? "text-[#c45c5c]"
                    : "text-[#8a867c]"
            }`}
          >
            ₹{profitPerUnit.toFixed(2)}
          </span>
        </div>
        <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center justify-between">
          <span className="text-xs text-[#8a867c]">
            Compared to your cost, that is about:
          </span>
          <span
            className={`text-sm font-semibold tabular-nums ${
              marginPercentage >= 30
                ? "text-[#3f9d7a]"
                : marginPercentage >= 15
                  ? "text-[#d4a054]"
                  : marginPercentage > 0
                    ? "text-[#c45c5c]"
                    : "text-[#8a867c]"
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
  storageNoun,
  storageLabel,
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
  storageNoun: string;
  storageLabel: string;
}) {
  const initialStockQty = parseNonNegativeInt(formData.initialStock);
  const thresholdQty = parseNonNegativeInt(formData.reorderThreshold);

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#8a867c] leading-relaxed">
        If you already have units in the {storageNoun}, say how many and where
        they sit. If you are not ready yet, leave quantity at{" "}
        <span className="text-[#c5c0b5]">0</span> and continue — you can add
        stock later from Inventory.
      </p>

      {/* Warehouse Selection */}
      <div>
        <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
          {storageLabel}
        </label>
        {warehousesLoading ? (
          <div className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#8a867c]">
            Loading your storage list…
          </div>
        ) : warehouses.length === 0 ? (
          <div className="p-4 rounded-lg border border-[#d4a054]/40 bg-[#d4a054]/10 space-y-2">
            <p className="text-sm text-[#f3eee4] font-medium">
              No {storageNoun} chosen yet
            </p>
            <p className="text-xs text-[#8a867c] leading-relaxed">
              Create one under {storageLabel}, then reopen Add a product. You can
              still save this item with 0 stock and add quantity later.
            </p>
            <Link
              href={adminHref("/warehouses")}
              className="inline-flex text-sm text-[#c4a574] hover:text-[#d4b88a]"
            >
              Go to {storageLabel} →
            </Link>
          </div>
        ) : (
          <select
            name="warehouseId"
            value={formData.warehouseId}
            onChange={onChange}
            className={`w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border text-[#f3eee4] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent ${
              errors.warehouseId ? "border-[#c45c5c]" : "border-white/[0.08]"
            }`}
          >
            {warehouses.length > 1 && (
              <option value="" className="bg-[#111318]">
                Choose where stock sits…
              </option>
            )}
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id} className="bg-[#111318]">
                {wh.name} ({wh.code})
              </option>
            ))}
          </select>
        )}
        {errors.warehouseId && (
          <p className="text-xs text-[#c45c5c] mt-1">{errors.warehouseId}</p>
        )}
      </div>

      {/* Initial Stock */}
      <div>
        <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
          How many units do you have right now?
        </label>
        <input
          type="number"
          name="initialStock"
          value={formData.initialStock}
          onChange={onChange}
          min="0"
          placeholder="0"
          className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent"
        />
        <p className="text-xs text-[#8a867c] mt-1.5 leading-snug">
          We record this as opening stock. Use <span className="text-[#c5c0b5]">0</span> if you
          are only creating the product card for now.
        </p>
      </div>

      {/* Reorder Threshold */}
      <div>
        <label className="block text-sm font-medium text-[#c5c0b5] mb-1.5">
          When should we warn you stock is low?
        </label>
        <input
          type="number"
          name="reorderThreshold"
          value={formData.reorderThreshold}
          onChange={onChange}
          min="0"
          placeholder="0"
          className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent"
        />
        <p className="text-xs text-[#8a867c] mt-1.5 leading-snug">
          When counted stock goes <em>below</em> this number, the system can
          remind you to reorder. Use <span className="text-[#c5c0b5]">0</span> to
          turn that reminder off for now.
        </p>
      </div>

      {/* Stock Preview */}
      {initialStockQty > 0 && formData.warehouseId && (
        <div className="p-4 rounded-xl bg-[#3f9d7a]/10 border border-[#3f9d7a]/30">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#3f9d7a]">✓</span>
            <span className="text-sm text-[#3f9d7a]">
              {initialStockQty} units will be added to{" "}
              {warehouses.find((w) => w.id === formData.warehouseId)?.name ||
                "warehouse"}
            </span>
          </div>
          {thresholdQty > 0 ? (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-[#d4a054]">⚠</span>
              <span className="text-sm text-[#d4a054]">
                We will nudge you when stock falls under {thresholdQty} units
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-[#8a867c]">•</span>
              <span className="text-sm text-[#8a867c]">
                Low-stock reminder is off (you can turn it on later)
              </span>
            </div>
          )}
        </div>
      )}

      {/* No Stock Note */}
      {(!formData.initialStock || initialStockQty === 0) && (
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
          <p className="text-sm text-[#8a867c] leading-relaxed">
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
  barcodeEnabled,
  gstEnabled,
  profile,
}: {
  formData: ProductFormData;
  marginPercentage: number;
  warehouses?: WarehouseType[];
  barcodeEnabled: boolean;
  gstEnabled: boolean;
  profile: IndustryProfile;
}) {
  const initialStockQty = parseNonNegativeInt(formData.initialStock);
  const thresholdQty = parseNonNegativeInt(formData.reorderThreshold);
  const selectedWarehouse = warehouses?.find(
    (w) => w.id === formData.warehouseId,
  );
  const hasStock = initialStockQty > 0 && selectedWarehouse;
  const formatLabel =
    profile.addProduct.sizeFormats.find((f) => f.id === formData.sizeFormat)
      ?.label ?? formData.sizeFormat;

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#8a867c] leading-relaxed">
        Please read this summary once. If something looks wrong, use{" "}
        <span className="text-[#c5c0b5]">Back</span> to fix it. When everything
        looks right, tap <span className="text-[#c5c0b5]">Save product</span>.
      </p>

      {/* Basic Info */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        <h4 className="text-sm font-medium text-[#c4a574] mb-3">
          What you are adding
        </h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[#8a867c]">Name</p>
            <p className="text-[#f3eee4] font-medium">{formData.name || "—"}</p>
          </div>
          <div>
            <p className="text-[#8a867c]">Brand</p>
            <p className="text-[#f3eee4] font-medium">
              {formData.brand.trim() ||
                profile.addProduct.defaultBrand ||
                "—"}
            </p>
          </div>
          <div>
            <p className="text-[#8a867c]">Type</p>
            <p className="text-[#f3eee4] font-medium">
              {formData.category || "—"}
            </p>
          </div>
          {formData.description && (
            <div className="col-span-2">
              <p className="text-[#8a867c]">Description</p>
              <p className="text-[#f3eee4] font-medium">
                {formData.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Attributes */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        <h4 className="text-sm font-medium text-[#c4a574] mb-3">
          {profile.variantOptionLabel}
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-[#8a867c]">Option list style:</span>
            <span className="text-[#f3eee4]">{formatLabel}</span>
          </div>
          {formData.sizes.length > 0 && (
            <div className="flex gap-2">
              <span className="text-[#8a867c]">Selected:</span>
              <span className="text-[#f3eee4]">
                {formData.sizes.join(", ")}
              </span>
            </div>
          )}
          {formData.sizes.length === 0 && (
            <p className="text-[#8a867c]">
              No extra options — treated as one SKU
            </p>
          )}
        </div>
      </div>

      {/* Pricing */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        <h4 className="text-sm font-medium text-[#c4a574] mb-3">Money</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[#8a867c]">Your cost (per unit)</p>
            <p className="text-[#f3eee4] font-medium">
              ₹{formData.costPrice || "0"}
            </p>
          </div>
          <div>
            <p className="text-[#8a867c]">Maximum tag price (MRP)</p>
            <p className="text-[#f3eee4] font-medium">₹{formData.mrp || "0"}</p>
          </div>
          <div>
            <p className="text-[#8a867c]">Price at till today</p>
            <p className="text-[#f3eee4] font-medium">
              ₹{formData.sellingPrice || "0"}
            </p>
          </div>
          {gstEnabled && (
            <div>
              <p className="text-[#8a867c]">GST rate</p>
              <p className="text-[#f3eee4] font-medium">
                {formData.gstPercentage || "0"}%
              </p>
            </div>
          )}
          <div>
            <p className="text-[#8a867c]">Rough profit vs cost</p>
            <p
              className={`font-bold ${
                marginPercentage >= 30
                  ? "text-[#3f9d7a]"
                  : marginPercentage >= 15
                    ? "text-[#d4a054]"
                    : "text-[#c45c5c]"
              }`}
            >
              {marginPercentage.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Stock Info */}
      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        <h4 className="text-sm font-medium text-[#c4a574] mb-3">
          Stock you are starting with
        </h4>
        {hasStock ? (
          <div className="text-sm">
            <div className="flex gap-2">
              <span className="text-[#8a867c]">How many:</span>
              <span className="text-[#3f9d7a] font-medium">
                {initialStockQty} units
              </span>
            </div>
            <div className="flex gap-2 mt-1">
              <span className="text-[#8a867c]">Stored at:</span>
              <span className="text-[#f3eee4]">{selectedWarehouse.name}</span>
            </div>
            <div className="flex gap-2 mt-1">
              <span className="text-[#8a867c]">Low-stock reminder:</span>
              {thresholdQty > 0 ? (
                <span className="text-[#d4a054] font-medium">
                  when below {thresholdQty} units
                </span>
              ) : (
                <span className="text-[#8a867c] font-medium">off</span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm space-y-1">
            <p className="text-[#8a867c]">
              Starting with no counted stock (you can add it later)
            </p>
            <div className="flex gap-2">
              <span className="text-[#8a867c]">Low-stock reminder:</span>
              {thresholdQty > 0 ? (
                <span className="text-[#d4a054] font-medium">
                  when below {thresholdQty} units
                </span>
              ) : (
                <span className="text-[#8a867c] font-medium">off</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SKU Note — solid panel + high-contrast text (no “empty tinted box” on some displays) */}
      <div className="p-4 rounded-xl bg-[#0c0d10] border border-[#c4a574]/50 ring-1 ring-[#c4a574]/20">
        <p className="text-sm text-[#e0cba0] leading-relaxed flex items-start gap-2">
          <Barcode
            className="w-4 h-4 mt-0.5 shrink-0 text-[#d4b88a]"
            strokeWidth={2}
            aria-hidden
          />
          <span>
            {barcodeEnabled ? (
              <>
                <span className="font-semibold text-[#e0cba0]">
                  Store code &amp; barcode
                </span>{" "}
                are created for you automatically when you save — nothing to
                type here.
              </>
            ) : (
              <>
                <span className="font-semibold text-[#e0cba0]">
                  Item code
                </span>{" "}
                is created when you save. Barcodes are off in Settings — sell
                by search or tap at POS.
              </>
            )}
          </span>
        </p>
      </div>
    </div>
  );
}
