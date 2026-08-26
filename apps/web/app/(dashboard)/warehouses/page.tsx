"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  MapPin,
  AlertTriangle,
  Check,
  X,
  Loader2,
  RefreshCcw,
  Edit,
  Trash2,
  MoreVertical,
  Building2,
  ImagePlus,
} from "lucide-react";
import {
  inventoryService,
  Warehouse as WarehouseType,
  WarehouseWritePayload,
  WarehouseCreatePayload,
  WarehouseUpdatePayload,
} from "@/services";
import { inventoryKeys, useLocationLabels } from "@/hooks";
import { toast } from "sonner";
import { WarehouseSellerImageAdjustModal } from "@/components/warehouses/warehouse-seller-image-adjust-modal";
import { API_BASE_URL } from "@/lib/api";

// =============================================================================
// CREATE WAREHOUSE MODAL
// =============================================================================

interface CreateWarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const WAREHOUSE_ADDRESS_MIN = 10;

const SELLER_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

function getApiOrigin(): string {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return "";
  }
}

/** Browser-loadable URL for API media paths (e.g. /media/… from Django). */
function resolveWarehouseMediaUrl(url: string | undefined | null): string {
  const t = (url ?? "").trim();
  if (!t) return "";
  if (/^(https?:|blob:|data:)/i.test(t)) return t;
  const origin = getApiOrigin();
  if (!origin) return t;
  return t.startsWith("/") ? `${origin}${t}` : `${origin}/${t}`;
}

function validateSellerImageFile(f: File): string | null {
  if (!f.type.startsWith("image/")) return "Please choose an image file";
  if (f.size > SELLER_IMAGE_MAX_BYTES) return "Image must be 8MB or smaller";
  return null;
}

interface WarehouseFormData {
  name: string;
  code: string;
  address: string;
  email: string;
  phone: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
}

function warehousePayloadFromForm(
  data: WarehouseFormData,
  mode: "create" | "patch",
): WarehouseWritePayload | Partial<WarehouseWritePayload> {
  const address = data.address.trim();
  const bank_name = data.bankName.trim();
  const bank_account_number = data.bankAccount.trim();
  const bank_ifsc = data.bankIfsc.trim();
  const email = data.email.trim();
  const phone = data.phone.trim();
  const code = data.code.trim().toUpperCase();

  const base: Partial<WarehouseWritePayload> = {
    name: data.name.trim(),
    address,
    email,
    phone,
  };
  if (bank_name || bank_account_number || bank_ifsc) {
    base.bank_name = bank_name;
    base.bank_account_number = bank_account_number;
    base.bank_ifsc = bank_ifsc;
  }
  if (mode === "create") {
    const out: WarehouseWritePayload = {
      ...base,
      name: data.name.trim(),
      address,
      email,
      phone,
      is_active: true,
      ...(bank_name || bank_account_number || bank_ifsc
        ? {
            bank_name,
            bank_account_number,
            bank_ifsc,
          }
        : {}),
    } as WarehouseWritePayload;
    if (code) out.code = code;
    return out;
  }
  return base;
}

function CreateWarehouseModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateWarehouseModalProps) {
  const { labels, isSingleShop } = useLocationLabels();
  const noun = labels.warehouseSingularTitle;
  const nounLower = labels.warehouseSingular;
  const [formData, setFormData] = React.useState<WarehouseFormData>({
    name: "",
    code: "",
    address: "",
    email: "",
    phone: "",
    bankName: "",
    bankAccount: "",
    bankIfsc: "",
  });
  const [sellerImageBlob, setSellerImageBlob] = React.useState<Blob | null>(null);
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const sellerPreviewUrl = React.useMemo(() => {
    if (!sellerImageBlob) return null;
    return URL.createObjectURL(sellerImageBlob);
  }, [sellerImageBlob]);

  React.useEffect(() => {
    return () => {
      if (sellerPreviewUrl) URL.revokeObjectURL(sellerPreviewUrl);
    };
  }, [sellerPreviewUrl]);

  const createMutation = useMutation({
    mutationFn: inventoryService.createWarehouse,
    onSuccess: () => {
      toast.success(
        isSingleShop ? "Shop added" : `${noun} created`,
      );
      onSuccess();
      onClose();
      setFormData({
        name: "",
        code: "",
        address: "",
        email: "",
        phone: "",
        bankName: "",
        bankAccount: "",
        bankIfsc: "",
      });
      setSellerImageBlob(null);
      setAdjustOpen(false);
      setPendingFile(null);
    },
    onError: (error: Error) => {
      toast.error(
        error.message ||
          (isSingleShop ? "Could not add shop" : `Could not create ${nounLower}`),
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error(
        isSingleShop ? "Shop name is required" : `${noun} name is required`,
      );
      return;
    }
    const addr = formData.address.trim();
    if (addr.length < WAREHOUSE_ADDRESS_MIN) {
      toast.error(
        `Address is required and must be at least ${WAREHOUSE_ADDRESS_MIN} characters.`,
      );
      return;
    }
    const base = warehousePayloadFromForm(
      formData,
      "create",
    ) as WarehouseWritePayload;
    const payload: WarehouseCreatePayload = {
      ...base,
      ...(sellerImageBlob ? { sellerImage: sellerImageBlob } : {}),
    };
    createMutation.mutate(payload);
  };

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 modal-scrim"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative z-10 my-auto flex w-full max-w-lg flex-col max-h-[min(92dvh,56rem)] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111318] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#c4a574]/20 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[#c4a574]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#f3eee4]">
                {isSingleShop ? "Add my shop" : `Create ${noun}`}
              </h2>
              <p className="text-sm text-[#8a867c]">
                {isSingleShop
                  ? "Name and address for bills and stock"
                  : `Add a new ${nounLower} location`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/[0.05] text-[#8a867c] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
              {isSingleShop ? "Shop name" : `${noun} name`}{" "}
              <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder={
                isSingleShop
                  ? "e.g., Front counter / Main shop"
                  : `e.g., Main ${noun}`
              }
              className="w-full px-4 py-3 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors"
            />
          </div>

          {/* Code (optional — server generates if empty) */}
          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
              Short code{" "}
              <span className="text-[#8a867c] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) =>
                setFormData({ ...formData, code: e.target.value.toUpperCase() })
              }
              placeholder="Leave blank to auto-generate"
              className="w-full px-4 py-3 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors uppercase"
              maxLength={20}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="shop@gmail.com"
                className="w-full px-4 py-3 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                Mobile number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="+91 …"
                className="w-full px-4 py-3 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors"
              />
            </div>
          </div>

          {/* Seller banner — 16:9 (crop in editor) */}
          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
              Company / seller image{" "}
              <span className="text-[#8a867c] font-normal">(optional, 16:9)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const err = validateSellerImageFile(f);
                if (err) {
                  toast.error(err);
                  return;
                }
                setPendingFile(f);
                setAdjustOpen(true);
              }}
            />
            {sellerPreviewUrl ? (
              <div className="space-y-2">
                <div className="relative w-full max-w-md rounded-xl overflow-hidden border border-white/[0.08] bg-black aspect-video">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sellerPreviewUrl}
                    alt="Seller preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSellerImageBlob(null)}
                  className="text-xs text-[#c4a574] hover:underline"
                >
                  Remove image
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/[0.15] text-[#c5c0b5] hover:border-[#c4a574]/50 hover:text-[#f3eee4] transition-colors w-full max-w-md justify-center"
              >
                <ImagePlus className="w-5 h-5 text-[#c4a574]" />
                Upload &amp; adjust 16:9 banner
              </button>
            )}
            {sellerPreviewUrl ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 text-xs text-[#8a867c] hover:text-[#c5c0b5]"
              >
                Replace image…
              </button>
            ) : null}
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
              Address <span className="text-red-400">*</span>
            </label>
            <textarea
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              placeholder="Full shop / godown address…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors resize-none"
            />
            <p className="text-xs text-[#8a867c] mt-1">
              Minimum {WAREHOUSE_ADDRESS_MIN} characters (required for invoices)
              {formData.address.trim().length > 0 &&
                formData.address.trim().length < WAREHOUSE_ADDRESS_MIN && (
                  <span className="text-amber-400/90">
                    {" "}
                    · {WAREHOUSE_ADDRESS_MIN - formData.address.trim().length}{" "}
                    more needed
                  </span>
                )}
            </p>
          </div>

          <div className="pt-1 border-t border-white/[0.06]">
            <p className="text-sm font-medium text-[#c5c0b5] mb-3">
              Bank details{" "}
              <span className="text-[#8a867c] font-normal">(optional)</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#8a867c] mb-1.5">
                  Bank name
                </label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={(e) =>
                    setFormData({ ...formData, bankName: e.target.value })
                  }
                  placeholder="e.g. ICICI Bank"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8a867c] mb-1.5">
                  Account number
                </label>
                <input
                  type="text"
                  value={formData.bankAccount}
                  onChange={(e) =>
                    setFormData({ ...formData, bankAccount: e.target.value })
                  }
                  placeholder="Account number"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8a867c] mb-1.5">
                  IFSC
                </label>
                <input
                  type="text"
                  value={formData.bankIfsc}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bankIfsc: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="e.g. ICIC0000410"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors text-sm uppercase"
                />
              </div>
            </div>
          </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/[0.08] bg-[#111318] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-[#c5c0b5] hover:bg-white/[0.05] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#c4a574] text-[#0c0d10] font-medium hover:bg-[#d4b88a] transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {isSingleShop ? "Save shop" : `Create ${noun}`}
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
    <WarehouseSellerImageAdjustModal
      open={adjustOpen}
      file={pendingFile}
      onClose={() => {
        setAdjustOpen(false);
        setPendingFile(null);
      }}
      onApply={(blob) => {
        setSellerImageBlob(blob);
        setAdjustOpen(false);
        setPendingFile(null);
      }}
    />
    </>
  );
}

// =============================================================================
// EDIT WAREHOUSE MODAL
// =============================================================================

interface EditWarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  warehouse: WarehouseType | null;
}

function EditWarehouseModal({
  isOpen,
  onClose,
  onSuccess,
  warehouse,
}: EditWarehouseModalProps) {
  const { labels, isSingleShop } = useLocationLabels();
  const noun = labels.warehouseSingularTitle;
  const [formData, setFormData] = React.useState<WarehouseFormData>({
    name: "",
    code: "",
    address: "",
    email: "",
    phone: "",
    bankName: "",
    bankAccount: "",
    bankIfsc: "",
  });

  const [sellerImageBlob, setSellerImageBlob] = React.useState<Blob | null>(null);
  const [removeSellerImageAtSave, setRemoveSellerImageAtSave] =
    React.useState(false);
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const sellerBlobPreviewUrl = React.useMemo(() => {
    if (!sellerImageBlob) return null;
    return URL.createObjectURL(sellerImageBlob);
  }, [sellerImageBlob]);

  React.useEffect(() => {
    return () => {
      if (sellerBlobPreviewUrl) URL.revokeObjectURL(sellerBlobPreviewUrl);
    };
  }, [sellerBlobPreviewUrl]);

  React.useEffect(() => {
    if (warehouse) {
      setFormData({
        name: warehouse.name,
        code: warehouse.code || "",
        address: warehouse.address || "",
        email: warehouse.email || "",
        phone: warehouse.phone || "",
        bankName: warehouse.bankName || "",
        bankAccount: warehouse.bankAccountNumber || "",
        bankIfsc: warehouse.bankIfsc || "",
      });
      setSellerImageBlob(null);
      setRemoveSellerImageAtSave(false);
      setAdjustOpen(false);
      setPendingFile(null);
    }
  }, [warehouse]);

  const resolvedExistingSellerUrl = React.useMemo(
    () => resolveWarehouseMediaUrl(warehouse?.sellerImageUrl),
    [warehouse?.sellerImageUrl],
  );

  const [sellerImgLoadFailed, setSellerImgLoadFailed] = React.useState(false);
  React.useEffect(() => {
    setSellerImgLoadFailed(false);
  }, [warehouse?.id, sellerBlobPreviewUrl, removeSellerImageAtSave]);

  const updateMutation = useMutation({
    mutationFn: ({
      form,
      sellerImage,
      clearSellerImage,
    }: {
      form: WarehouseFormData;
      sellerImage: Blob | null;
      clearSellerImage: boolean;
    }) => {
      const patch = warehousePayloadFromForm(
        form,
        "patch",
      ) as Partial<WarehouseWritePayload>;
      const payload: WarehouseUpdatePayload = {
        ...patch,
        ...(sellerImage ? { sellerImage } : {}),
        ...(clearSellerImage && !sellerImage ? { clearSellerImage: true } : {}),
      };
      return inventoryService.updateWarehouse(warehouse!.id, payload);
    },
    onSuccess: () => {
      toast.success(
        isSingleShop ? "Shop updated" : `${noun} updated`,
      );
      onSuccess();
      onClose();
      setSellerImageBlob(null);
      setRemoveSellerImageAtSave(false);
      setAdjustOpen(false);
      setPendingFile(null);
    },
    onError: (error: Error) => {
      toast.error(
        error.message ||
          (isSingleShop ? "Could not update shop" : `Could not update ${labels.warehouseSingular}`),
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error(
        isSingleShop ? "Shop name is required" : `${noun} name is required`,
      );
      return;
    }
    const addr = formData.address.trim();
    if (addr.length < WAREHOUSE_ADDRESS_MIN) {
      toast.error(
        `Address is required and must be at least ${WAREHOUSE_ADDRESS_MIN} characters.`,
      );
      return;
    }
    updateMutation.mutate({
      form: formData,
      sellerImage: sellerImageBlob,
      clearSellerImage: removeSellerImageAtSave && !sellerImageBlob,
    });
  };

  if (!isOpen || !warehouse) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 modal-scrim"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative z-10 my-auto flex w-full max-w-lg flex-col max-h-[min(92dvh,56rem)] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111318] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20">
                <Edit className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#f3eee4]">
                  Edit {labels.warehouseSingularTitle}
                </h2>
                <p className="text-sm text-[#8a867c]">
                  Update {labels.warehouseSingular} details
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[#8a867c] transition-colors hover:bg-white/[0.05]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            noValidate
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
              {isSingleShop ? "Shop name" : `${noun} name`}{" "}
              <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., Front counter / Main shop"
              className="w-full px-4 py-3 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors"
            />
          </div>

          {/* Code - Read only */}
          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
              Short code
            </label>
            <input
              type="text"
              value={formData.code}
              className="w-full px-4 py-3 rounded-xl bg-[#0c0d10]/50 border border-white/[0.08] text-[#8a867c] cursor-not-allowed"
              disabled
            />
            <p className="text-xs text-[#8a867c] mt-1">
              Code cannot be changed after creation
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="shop@gmail.com"
                className="w-full px-4 py-3 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
                Mobile number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="+91 …"
                className="w-full px-4 py-3 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors"
              />
            </div>
          </div>

          {/* Seller banner — same as create; PATCH multipart when replaced */}
          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
              Company / seller image{" "}
              <span className="text-[#8a867c] font-normal">(optional, 16:9)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const err = validateSellerImageFile(f);
                if (err) {
                  toast.error(err);
                  return;
                }
                setPendingFile(f);
                setAdjustOpen(true);
              }}
            />
            {sellerBlobPreviewUrl ||
            (!removeSellerImageAtSave &&
              resolvedExistingSellerUrl &&
              !sellerImgLoadFailed) ? (
              <div className="space-y-2">
                <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-xl border border-white/[0.08] bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      sellerBlobPreviewUrl ?? resolvedExistingSellerUrl
                    }
                    alt="Seller banner"
                    className="h-full w-full object-cover"
                    onError={() => setSellerImgLoadFailed(true)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {sellerImageBlob ? (
                    <button
                      type="button"
                      onClick={() => setSellerImageBlob(null)}
                      className="text-xs text-[#c4a574] hover:underline"
                    >
                      Discard new image
                    </button>
                  ) : resolvedExistingSellerUrl ? (
                    <button
                      type="button"
                      onClick={() => setRemoveSellerImageAtSave(true)}
                      className="text-xs text-[#c4a574] hover:underline"
                    >
                      Remove image
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {sellerImgLoadFailed &&
                !removeSellerImageAtSave &&
                resolvedExistingSellerUrl ? (
                  <p className="text-xs text-amber-400/90">
                    Could not load the saved banner. Upload a replacement if
                    needed.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full max-w-md items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.15] px-4 py-3 text-[#c5c0b5] transition-colors hover:border-[#c4a574]/50 hover:text-[#f3eee4]"
                >
                  <ImagePlus className="h-5 w-5 text-[#c4a574]" />
                  Upload &amp; adjust 16:9 banner
                </button>
                {removeSellerImageAtSave ? (
                  <div className="space-y-1">
                    <p className="text-xs text-amber-400/90">
                      Current banner will be removed when you save.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRemoveSellerImageAtSave(false)}
                      className="text-xs text-[#8a867c] hover:text-[#c5c0b5]"
                    >
                      Keep existing image
                    </button>
                  </div>
                ) : null}
              </div>
            )}
            {sellerBlobPreviewUrl ||
            (!removeSellerImageAtSave && resolvedExistingSellerUrl) ||
            sellerImgLoadFailed ? (
              <button
                type="button"
                onClick={() => {
                  setRemoveSellerImageAtSave(false);
                  setSellerImgLoadFailed(false);
                  fileInputRef.current?.click();
                }}
                className="mt-2 text-xs text-[#8a867c] hover:text-[#c5c0b5]"
              >
                Replace image…
              </button>
            ) : null}
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-[#c5c0b5] mb-2">
              Address <span className="text-red-400">*</span>
            </label>
            <textarea
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              placeholder="Full shop / godown address…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors resize-none"
            />
            <p className="text-xs text-[#8a867c] mt-1">
              Minimum {WAREHOUSE_ADDRESS_MIN} characters (required for invoices)
              {formData.address.trim().length > 0 &&
                formData.address.trim().length < WAREHOUSE_ADDRESS_MIN && (
                  <span className="text-amber-400/90">
                    {" "}
                    · {WAREHOUSE_ADDRESS_MIN - formData.address.trim().length}{" "}
                    more needed
                  </span>
                )}
            </p>
          </div>

          <div className="pt-1 border-t border-white/[0.06]">
            <p className="text-sm font-medium text-[#c5c0b5] mb-3">
              Bank details{" "}
              <span className="text-[#8a867c] font-normal">(optional)</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#8a867c] mb-1.5">
                  Bank name
                </label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={(e) =>
                    setFormData({ ...formData, bankName: e.target.value })
                  }
                  placeholder="e.g. ICICI Bank"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8a867c] mb-1.5">
                  Account number
                </label>
                <input
                  type="text"
                  value={formData.bankAccount}
                  onChange={(e) =>
                    setFormData({ ...formData, bankAccount: e.target.value })
                  }
                  placeholder="Account number"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#8a867c] mb-1.5">
                  IFSC
                </label>
                <input
                  type="text"
                  value={formData.bankIfsc}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bankIfsc: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="e.g. ICIC0000410"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0c0d10] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors text-sm uppercase"
                />
              </div>
            </div>
          </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/[0.08] bg-[#111318] px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-5 py-2.5 text-[#c5c0b5] transition-colors hover:bg-white/[0.05]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    <WarehouseSellerImageAdjustModal
      open={adjustOpen}
      file={pendingFile}
      onClose={() => {
        setAdjustOpen(false);
        setPendingFile(null);
      }}
      onApply={(blob) => {
        setSellerImageBlob(blob);
        setRemoveSellerImageAtSave(false);
        setAdjustOpen(false);
        setPendingFile(null);
      }}
    />
    </>
  );
}

// =============================================================================
// WAREHOUSE CARD
// =============================================================================

interface WarehouseCardProps {
  warehouse: WarehouseType;
  onEdit: () => void;
  onDelete: () => void;
  onReactivate: () => void;
  reactivatePending?: boolean;
}

function WarehouseCard({
  warehouse,
  onEdit,
  onDelete,
  onReactivate,
  reactivatePending,
}: WarehouseCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);
  const [sellerThumbFailed, setSellerThumbFailed] = React.useState(false);
  const rawSeller = warehouse.sellerImageUrl?.trim();
  const sellerUrl = rawSeller
    ? resolveWarehouseMediaUrl(rawSeller) ?? rawSeller
    : "";

  React.useEffect(() => {
    setSellerThumbFailed(false);
  }, [warehouse.id, sellerUrl]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative bg-[#111318] rounded-2xl border border-white/[0.08] overflow-hidden hover:border-[#c4a574]/30 transition-colors group"
    >
      {/* Header */}
      <div className="p-5 border-b border-white/[0.08]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              title={sellerUrl && !sellerThumbFailed ? "Invoice seller banner" : "Warehouse"}
              className="relative w-12 h-12 shrink-0 overflow-hidden rounded-xl border border-[#c4a574]/55 bg-black/40 ring-1 ring-white/[0.08] shadow-inner flex items-center justify-center"
            >
              {sellerUrl && !sellerThumbFailed ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={sellerUrl}
                  alt={`${warehouse.name} — seller banner`}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => setSellerThumbFailed(true)}
                />
              ) : (
                <Building2
                  className="relative z-[1] w-6 h-6 text-[#e0cba0]"
                  strokeWidth={2}
                  aria-hidden
                />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-[#f3eee4]">{warehouse.name}</h3>
              {warehouse.code?.trim() ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md mt-1 border border-[#c4a574]/50 bg-black/35 text-[#e0cba0] text-xs font-semibold tracking-wide">
                  Code:{" "}
                  <span className="ml-1 font-mono text-[#e0cba0]">
                    {warehouse.code.trim()}
                  </span>
                </span>
              ) : (
                <span className="mt-1 inline-block text-[11px] text-[#8a867c]">
                  Code not set · edit warehouse to add
                </span>
              )}
            </div>
          </div>

          {/* Actions Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-lg hover:bg-white/[0.05] text-[#8a867c] transition-colors"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            <AnimatePresence>
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-0 top-full mt-1 z-[80] w-40 popover-panel rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onEdit();
                      }}
                      className="flex items-center gap-2 w-full px-4 py-3 text-sm text-[#f3eee4] hover:bg-white/[0.05] transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                    {warehouse.isActive ? (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          onDelete();
                        }}
                        className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={reactivatePending}
                        onClick={() => {
                          setShowMenu(false);
                          onReactivate();
                        }}
                        className="flex items-center gap-2 w-full px-4 py-3 text-sm text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                      >
                        {reactivatePending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        Reactivate
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="p-5">
        {warehouse.address ? (
          <div className="flex items-start gap-2 text-sm text-[#c5c0b5]">
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{warehouse.address}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-[#8a867c]">
            <MapPin className="w-4 h-4" />
            <span>No address provided</span>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="px-5 pb-5">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              warehouse.isActive ? "bg-green-400" : "bg-red-400"
            }`}
          />
          <span className="text-xs text-[#8a867c]">
            {warehouse.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function WarehousesPage() {
  const queryClient = useQueryClient();
  const { labels, isSingleShop } = useLocationLabels();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showRemoved, setShowRemoved] = React.useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [editingWarehouse, setEditingWarehouse] =
    React.useState<WarehouseType | null>(null);

  // Active-only by default so removed demo shops stay out of the way
  const {
    data: warehouses = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      ...inventoryKeys.warehouses(showRemoved ? "with-inactive" : "active"),
      "admin-list",
      showRemoved ? "with-removed" : "active-only",
    ] as const,
    queryFn: () =>
      inventoryService.getWarehouses({ includeInactive: showRemoved }),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => inventoryService.deleteWarehouse(id),
    onSuccess: () => {
      toast.success(
        isSingleShop ? "Shop removed from active list" : "Location deactivated",
      );
      queryClient.invalidateQueries({
        queryKey: [...inventoryKeys.all, "warehouses"],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to deactivate warehouse");
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) =>
      inventoryService.updateWarehouse(id, { is_active: true }),
    onSuccess: () => {
      toast.success(isSingleShop ? "Shop restored" : "Location reactivated");
      queryClient.invalidateQueries({
        queryKey: [...inventoryKeys.all, "warehouses"],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reactivate warehouse");
    },
  });

  // Filter warehouses (when showing removed, still search; hide inactive unless toggled)
  const filteredWarehouses = React.useMemo(() => {
    let list = warehouses;
    if (!showRemoved) {
      list = list.filter((w) => w.isActive !== false);
    }
    if (!searchQuery) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(
      (w) =>
        w.name.toLowerCase().includes(query) ||
        (w.code && w.code.toLowerCase().includes(query)) ||
        (w.address && w.address.toLowerCase().includes(query)),
    );
  }, [warehouses, searchQuery, showRemoved]);

  const handleDelete = (warehouse: WarehouseType) => {
    if (
      confirm(
        `Remove "${warehouse.name}" from your active list? You can restore it later from “Show removed”.`,
      )
    ) {
      deleteMutation.mutate(warehouse.id);
    }
  };

  const handleSuccess = () => {
    queryClient.invalidateQueries({
      queryKey: [...inventoryKeys.all, "warehouses"],
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#f3eee4] flex items-center gap-2">
            <Building2 className="w-6 h-6 text-[#c4a574]" />
            {labels.warehousePluralTitle}
          </h1>
          <p className="text-[#8a867c] mt-1">
            {isSingleShop
              ? "Your shop details for stock and printed invoices."
              : labels.warehousePageSubtitle}
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#c4a574] text-[#0c0d10] font-semibold hover:bg-[#d4b88a] transition-colors"
        >
          <Plus className="w-5 h-5" />
          {isSingleShop ? "Add shop" : `Add ${labels.warehouseSingularTitle}`}
        </button>
      </div>

      {/* Search and Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#8a867c]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${labels.warehousePlural}…`}
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-[#111318] border border-white/[0.08] text-[#f3eee4] placeholder-[#8a867c] focus:outline-none focus:border-[#c4a574] transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRemoved((v) => !v)}
            className={`px-4 py-3 rounded-xl border text-sm transition-colors ${
              showRemoved
                ? "bg-white/[0.08] border-white/[0.14] text-[#f3eee4]"
                : "bg-[#111318] border-white/[0.08] text-[#c5c0b5] hover:text-[#f3eee4]"
            }`}
          >
            {showRemoved ? "Hide removed" : "Show removed"}
          </button>
          <button
            onClick={() => refetch()}
            className="p-3 rounded-xl bg-[#111318] border border-white/[0.08] text-[#c5c0b5] hover:text-[#f3eee4] hover:border-[#c4a574]/30 transition-colors"
          >
            <RefreshCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#c4a574]" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
          <h3 className="text-lg font-semibold text-[#f3eee4] mb-2">
            Failed to load warehouses
          </h3>
          <p className="text-[#8a867c] mb-4">
            {error instanceof Error ? error.message : "An error occurred"}
          </p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#111318] border border-white/[0.08] text-[#c5c0b5] hover:text-[#f3eee4] transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredWarehouses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#c4a574]/10 flex items-center justify-center mb-6">
            <Building2 className="w-10 h-10 text-[#c4a574]" />
          </div>
          <h3 className="text-lg font-semibold text-[#f3eee4] mb-2">
            {searchQuery
              ? `No ${labels.warehousePlural} found`
              : isSingleShop
                ? "No shop set up yet"
                : `No ${labels.warehousePlural} yet`}
          </h3>
          <p className="text-[#8a867c] mb-6 max-w-md">
            {searchQuery
              ? "Try adjusting your search query"
              : isSingleShop
                ? "Add your shop once. Then add products and start selling."
                : `Create your first ${labels.warehouseSingular} before adding stock.`}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#c4a574] text-[#0c0d10] font-semibold hover:bg-[#d4b88a] transition-colors"
            >
              <Plus className="w-5 h-5" />
              {isSingleShop
                ? "Add my shop"
                : `Create first ${labels.warehouseSingularTitle}`}
            </button>
          )}
        </div>
      )}

      {/* Warehouse Grid */}
      {!isLoading && !error && filteredWarehouses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredWarehouses.map((warehouse) => (
            <WarehouseCard
              key={warehouse.id}
              warehouse={warehouse}
              onEdit={() => setEditingWarehouse(warehouse)}
              onDelete={() => handleDelete(warehouse)}
              onReactivate={() => reactivateMutation.mutate(warehouse.id)}
              reactivatePending={
                reactivateMutation.isPending &&
                reactivateMutation.variables === warehouse.id
              }
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <CreateWarehouseModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSuccess={handleSuccess}
          />
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingWarehouse && (
          <EditWarehouseModal
            isOpen={!!editingWarehouse}
            onClose={() => setEditingWarehouse(null)}
            onSuccess={handleSuccess}
            warehouse={editingWarehouse}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
