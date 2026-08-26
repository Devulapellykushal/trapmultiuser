"use client";

import { PageTransition } from "@/components/layout";
import { BusinessMembershipManager } from "@/components/layout/business-membership-manager";
import {
    useCategories,
    useCreateCategory,
    useDeleteCategory,
    useWarehouses,
} from "@/hooks/use-inventory";
import {
    useLocationLabels,
    useUpdateBusinessSetup,
} from "@/hooks/use-business-setup";
import { useProfile, useUpdateProfile } from "@/hooks/use-users";
import { useAuthStore } from "@/lib/auth";
import {
  INDUSTRY_OPTIONS,
  useIndustryProfile,
} from "@/lib/industry";
import { Category, Warehouse } from "@/services";
import { adminHref } from "@/lib/admin-routes";
import type {
  InventoryLocationMode,
  ShopStockMode,
} from "@/lib/business-location";
import { UpdateProfilePayload } from "@/services/users.service";
import {
    Barcode,
    Building2,
    Check,
    Loader2,
    Monitor,
    Moon,
    Palette,
    Percent,
    Plus,
    Store,
    Sun,
    Tag,
    Trash2,
    Truck,
    User,
    X,
} from "lucide-react";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

type Theme = "dark" | "light" | "system";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setupMode = searchParams.get("setup");
  const isSetupFlow = setupMode === "new" || setupMode === "signup";
  const { user: authUser } = useAuthStore();
  const industryProfile = useIndustryProfile();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const updateProfile = useUpdateProfile();
  const { mode, shopStockMode, barcodeEnabled, gstEnabled, labels, isSingleShop, isGodownAndShops } =
    useLocationLabels();
  const updateSetup = useUpdateBusinessSetup();
  const [pendingLocationMode, setPendingLocationMode] =
    useState<InventoryLocationMode | null>(null);

  // Category form state
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  // Theme state
  const [theme, setTheme] = useState<Theme>("dark");
  const [showSetupBanner, setShowSetupBanner] = useState(false);

  useEffect(() => {
    if (!isSetupFlow) return;
    setShowSetupBanner(true);
    const t = window.setTimeout(() => {
      document
        .getElementById("settings-stock-layout")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [isSetupFlow, setupMode]);

  const dismissSetupBanner = () => {
    setShowSetupBanner(false);
    router.replace(adminHref("/settings"), { scroll: false });
  };

  // Initialize form when profile loads
  useEffect(() => {
    if (profile) {
      setProfileForm((prev) => ({
        ...prev,
        name: profile.name || "",
        email: profile.email || "",
      }));
    }
  }, [profile]);

  // Load theme from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("Quake-theme");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      const savedTheme = parsed?.state?.theme as Theme | undefined;
      if (savedTheme) {
        setTheme(savedTheme);
        applyTheme(savedTheme);
      }
    } catch {
      const fallbackTheme = stored as Theme;
      if (fallbackTheme === "dark" || fallbackTheme === "light") {
        setTheme(fallbackTheme);
        applyTheme(fallbackTheme);
      }
    }
  }, []);

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;

    if (newTheme === "system") {
      const systemDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      root.setAttribute("data-theme", systemDark ? "dark" : "light");
    } else {
      root.setAttribute("data-theme", newTheme);
    }
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("Quake-theme", JSON.stringify({ state: { theme: newTheme } }));
    applyTheme(newTheme);
    toast.success(`Theme changed to ${newTheme}`);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password confirmation
    if (
      profileForm.new_password &&
      profileForm.new_password !== profileForm.confirm_password
    ) {
      toast.error("New passwords do not match");
      return;
    }

    const updateData: Partial<UpdateProfilePayload> = {};

    // Only include changed fields
    if (profileForm.name !== profile?.name) {
      updateData.name = profileForm.name;
    }
    if (profileForm.email !== profile?.email) {
      updateData.email = profileForm.email;
    }
    if (profileForm.new_password) {
      updateData.current_password = profileForm.current_password;
      updateData.new_password = profileForm.new_password;
    }

    if (Object.keys(updateData).length === 0) {
      toast.info("No changes to save");
      return;
    }

    try {
      await updateProfile.mutateAsync(updateData);
      // Clear password fields on success
      setProfileForm((prev) => ({
        ...prev,
        current_password: "",
        new_password: "",
        confirm_password: "",
      }));
    } catch {
      // Error handling is done in the hook
    }
  };

  return (
    <PageTransition>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-[#f3eee4] flex items-center gap-2">
            <Palette className="w-6 h-6 text-[#c4a574]" />
            Settings
          </h1>
          <p className="text-sm text-[#8a867c] mt-1">
            Manage your account and preferences
          </p>
        </div>

        {showSetupBanner && (
          <div
            role="status"
            className="rounded-xl border border-[#c4a574]/40 bg-[#c4a574]/10 px-5 py-4 flex gap-3 items-start"
          >
            <Store className="w-5 h-5 text-[#c4a574] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-[#f3eee4] font-medium">
                {setupMode === "signup"
                  ? `Set up ${authUser?.organizationName || "your business"}`
                  : `Finish setup for ${authUser?.organizationName || "this business"}`}
              </p>
              <p className="text-sm text-[#c4a574]/90">
                {setupMode === "signup"
                  ? "Your account is ready. Finish these steps so stock and billing match your shop."
                  : "This is a new shop. Finish these steps so the app matches how you keep stock."}
              </p>
              <ol className="text-sm text-[#f3eee4]/90 list-decimal list-inside space-y-1">
                <li>
                  Choose <span className="text-[#c4a574]">one shop</span> or{" "}
                  <span className="text-[#c4a574]">godown + shops</span> below
                </li>
                <li>Turn barcodes on or off if you use scanners</li>
                <li>Confirm your profile name, then add stock when ready</li>
              </ol>
            </div>
            <button
              type="button"
              onClick={dismissSetupBanner}
              className="p-1 rounded-md text-[#8a867c] hover:text-[#f3eee4] hover:bg-white/[0.06]"
              aria-label="Dismiss setup tip"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Active business — industry is fixed; switch/add via top-bar switcher */}
        {authUser && (
          <div className="rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
            <div className="px-6 py-5 border-b border-white/[0.08]">
              <h2 className="text-lg font-semibold text-[#f3eee4]">
                Active business
              </h2>
              <p className="text-sm text-[#8a867c] mt-1">
                Industry is locked to this business. To use another industry,
                switch or add a business from the top bar — catalogs stay
                separate.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <p className="text-[#f3eee4] font-medium">
                  {authUser.organizationName || "Untitled business"}
                </p>
                <p className="text-sm text-[#8a867c]">
                  {industryProfile.label}:{" "}
                  {
                    INDUSTRY_OPTIONS.find((o) => o.id === industryProfile.id)
                      ?.description
                  }
                </p>
              </div>
              <BusinessMembershipManager />
            </div>
          </div>
        )}

        {/* Stock layout — admin only, plain language */}
        {authUser?.role === "ADMIN" && (
          <div
            id="settings-stock-layout"
            className={
              showSetupBanner
                ? "rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-[#c4a574]/35 overflow-hidden scroll-mt-24 ring-1 ring-[#c4a574]/20"
                : "rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden scroll-mt-24"
            }
          >
            <div className="px-6 py-5 border-b border-white/[0.08]">
              <h2 className="text-lg font-semibold text-[#f3eee4]">
                How do you keep stock?
              </h2>
              <p className="text-sm text-[#8a867c] mt-1">
                Pick once. The app hides extra screens so staff stay focused.
              </p>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  {
                    value: "SINGLE_SHOP" as InventoryLocationMode,
                    title: "One shop only",
                    body: "You sell from one place. No godown, no transfers. Easiest.",
                    icon: Store,
                  },
                  {
                    value: "GODOWN_AND_SHOPS" as InventoryLocationMode,
                    title: "Godown + shops",
                    body: "One godown, many shop counters. Choose how shops take stock below.",
                    icon: Building2,
                  },
                ] as const
              ).map((option) => {
                const selected = mode === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={updateSetup.isPending}
                    onClick={() => {
                      if (selected) return;
                      // Confirm when leaving Godown + shops → One shop only
                      if (
                        option.value === "SINGLE_SHOP" &&
                        mode === "GODOWN_AND_SHOPS"
                      ) {
                        setPendingLocationMode("SINGLE_SHOP");
                        return;
                      }
                      updateSetup.mutate({
                        inventory_location_mode: option.value,
                        ...(option.value === "SINGLE_SHOP"
                          ? { shop_stock_mode: "TRANSFER" as ShopStockMode }
                          : {}),
                      });
                    }}
                    className={`text-left p-5 rounded-xl border-2 transition-all ${
                      selected
                        ? "border-[#c4a574] bg-[#c4a574]/10"
                        : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]"
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            selected ? "bg-[#c4a574]" : "bg-white/[0.06]"
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 ${
                              selected ? "text-white" : "text-[#c5c0b5]"
                            }`}
                          />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-[#f3eee4]">
                            {option.title}
                          </p>
                          <p className="text-sm text-[#8a867c] mt-1 leading-snug">
                            {option.body}
                          </p>
                        </div>
                      </div>
                      {selected && (
                        <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-[#d4b88a]">
                          <Check className="w-4 h-4" />
                          Active
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Toggle: transfer vs shared godown — only when Godown + shops */}
            {isGodownAndShops && (
              <div className="px-6 pb-6 space-y-3">
                <div className="border-t border-white/[0.06] pt-5">
                  <h3 className="text-sm font-semibold text-[#f3eee4]">
                    How do shops use godown stock?
                  </h3>
                  <p className="text-xs text-[#8a867c] mt-1">
                    Current way sends stock to each shop. Or every shop sells
                    from the same godown (sale +/− on godown).
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(
                    [
                      {
                        value: "TRANSFER" as ShopStockMode,
                        title: labels.shopStockTransferTitle,
                        body: labels.shopStockTransferBody,
                      },
                      {
                        value: "SHARED_GODOWN" as ShopStockMode,
                        title: labels.shopStockSharedTitle,
                        body: labels.shopStockSharedBody,
                      },
                    ] as const
                  ).map((option) => {
                    const selected = shopStockMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={updateSetup.isPending}
                        onClick={() => {
                          if (selected) return;
                          updateSetup.mutate({
                            shop_stock_mode: option.value,
                          });
                        }}
                        className={`text-left p-4 rounded-xl border-2 transition-all ${
                          selected
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14]"
                        } disabled:opacity-60`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-[#f3eee4]">
                              {option.title}
                            </p>
                            <p className="text-xs text-[#8a867c] mt-1 leading-snug">
                              {option.body}
                            </p>
                          </div>
                          {selected && (
                            <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                              <Check className="w-3.5 h-3.5" />
                              On
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="px-6 pb-5 text-xs text-[#8a867c]">
              Now using:{" "}
              <span className="text-[#c5c0b5]">{labels.setupTitle}</span>
              {" — "}
              {labels.setupHint}
            </div>
          </div>
        )}

        {/* Confirm: Godown + shops → One shop only */}
        {pendingLocationMode === "SINGLE_SHOP" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-scrim">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="single-shop-confirm-title"
              className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#111318] p-6 shadow-xl"
            >
              <h3
                id="single-shop-confirm-title"
                className="text-lg font-semibold text-[#f3eee4]"
              >
                Switch to one shop only?
              </h3>
              <div className="mt-3 space-y-2 text-sm text-[#c5c0b5] leading-relaxed">
                <p>
                  Stock is <span className="text-[#f3eee4]">not split</span>{" "}
                  across shops.
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    Your main godown becomes <strong className="text-[#f3eee4]">My shop</strong>{" "}
                    — godown stock stays there.
                  </li>
                  <li>
                    Any stock sitting in shop counters is{" "}
                    <strong className="text-[#f3eee4]">pulled back</strong> into
                    that one place.
                  </li>
                  <li>
                    With 2+ shops: nothing is shared out — everything gathers
                    into the main stock location.
                  </li>
                  <li>Shop screens are hidden; history stays in the database.</li>
                </ul>
              </div>
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm text-[#c5c0b5] hover:bg-white/[0.06]"
                  onClick={() => setPendingLocationMode(null)}
                  disabled={updateSetup.isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-[#c4a574] text-white hover:bg-[#d4b88a] disabled:opacity-60"
                  disabled={updateSetup.isPending}
                  onClick={() => {
                    updateSetup.mutate(
                      {
                        inventory_location_mode: "SINGLE_SHOP",
                        shop_stock_mode: "TRANSFER" as ShopStockMode,
                      },
                      {
                        onSettled: () => setPendingLocationMode(null),
                      },
                    );
                  }}
                >
                  {updateSetup.isPending ? "Switching…" : "Switch to one shop"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Barcodes — admin only */}
        {authUser?.role === "ADMIN" && (
          <div className="rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
            <div className="px-6 py-5 border-b border-white/[0.08]">
              <h2 className="text-lg font-semibold text-[#f3eee4]">
                Do you use barcodes?
              </h2>
              <p className="text-sm text-[#8a867c] mt-1">
                Turn off if you sell by search or tap only. You can turn on later.
              </p>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  {
                    value: true,
                    title: "Use barcodes",
                    body: industryProfile.labels.barcodeHelpOn,
                  },
                  {
                    value: false,
                    title: "No barcodes needed",
                    body: industryProfile.labels.barcodeHelpOff,
                  },
                ] as const
              ).map((option) => {
                const selected = barcodeEnabled === option.value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    disabled={updateSetup.isPending}
                    onClick={() => {
                      if (selected) return;
                      updateSetup.mutate({ barcode_enabled: option.value });
                    }}
                    className={`text-left p-5 rounded-xl border-2 transition-all ${
                      selected
                        ? "border-[#c4a574] bg-[#c4a574]/10"
                        : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]"
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            selected ? "bg-[#c4a574]" : "bg-white/[0.06]"
                          }`}
                        >
                          <Barcode
                            className={`w-5 h-5 ${
                              selected ? "text-white" : "text-[#c5c0b5]"
                            }`}
                          />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-[#f3eee4]">
                            {option.title}
                          </p>
                          <p className="text-sm text-[#8a867c] mt-1 leading-snug">
                            {option.body}
                          </p>
                        </div>
                      </div>
                      {selected && (
                        <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-[#d4b88a]">
                          <Check className="w-4 h-4" />
                          Active
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="px-6 pb-5 text-xs text-[#8a867c]">
              Now using:{" "}
              <span className="text-[#c5c0b5]">
                {barcodeEnabled ? "Use barcodes" : "No barcodes needed"}
              </span>
            </div>
          </div>
        )}

        {/* GST — admin only */}
        {authUser?.role === "ADMIN" && (
          <div className="rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
            <div className="px-6 py-5 border-b border-white/[0.08]">
              <h2 className="text-lg font-semibold text-[#f3eee4]">
                Do you charge GST?
              </h2>
              <p className="text-sm text-[#8a867c] mt-1">
                Turn off if you don’t need tax on products or bills. You can
                turn it on later.
              </p>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  {
                    value: true,
                    title: "GST on",
                    body: "Pick a tax slab when adding products. POS can show GST on the bill.",
                  },
                  {
                    value: false,
                    title: "GST off",
                    body: "No tax field in inventory. No GST ask at billing. Prices stay as entered.",
                  },
                ] as const
              ).map((option) => {
                const selected = gstEnabled === option.value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    disabled={updateSetup.isPending}
                    onClick={() => {
                      if (selected) return;
                      updateSetup.mutate({ gst_enabled: option.value });
                    }}
                    className={`text-left p-5 rounded-xl border-2 transition-all ${
                      selected
                        ? "border-[#c4a574] bg-[#c4a574]/10"
                        : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]"
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            selected ? "bg-[#c4a574]" : "bg-white/[0.06]"
                          }`}
                        >
                          <Percent
                            className={`w-5 h-5 ${
                              selected ? "text-white" : "text-[#c5c0b5]"
                            }`}
                          />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-[#f3eee4]">
                            {option.title}
                          </p>
                          <p className="text-sm text-[#8a867c] mt-1 leading-snug">
                            {option.body}
                          </p>
                        </div>
                      </div>
                      {selected && (
                        <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-[#d4b88a]">
                          <Check className="w-4 h-4" />
                          Active
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="px-6 pb-5 text-xs text-[#8a867c]">
              Now using:{" "}
              <span className="text-[#c5c0b5]">
                {gstEnabled ? "GST on" : "GST off"}
              </span>
            </div>
          </div>
        )}

        {/* Profile Settings */}
        <div className="rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
          <div className="px-6 py-5 border-b border-white/[0.08] flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#c4a574] shadow-sm">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#f3eee4]">Profile</h2>
              <p className="text-sm text-[#8a867c]">
                Update your personal information
              </p>
            </div>
          </div>
          <form onSubmit={handleProfileSubmit} className="p-6">
            {profileLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-[#c4a574] animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Name */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#c5c0b5]">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profileForm.name}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, name: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent transition-all"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#c5c0b5]">
                      Email
                    </label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          email: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent transition-all"
                    />
                  </div>

                  {/* Role (read-only) */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#c5c0b5]">
                      Role
                    </label>
                    <input
                      type="text"
                      value={authUser?.role || ""}
                      disabled
                      className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#8a867c] cursor-not-allowed"
                    />
                  </div>

                  {/* Username (read-only) */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#c5c0b5]">
                      Username
                    </label>
                    <input
                      type="text"
                      value={profile?.username || ""}
                      disabled
                      className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#8a867c] cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Password Change Section */}
                <div className="mt-6 pt-6 border-t border-white/[0.08]">
                  <h3 className="text-sm font-semibold text-[#f3eee4] mb-4">
                    Change Password
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#c5c0b5]">
                        Current Password
                      </label>
                      <input
                        type="password"
                        value={profileForm.current_password}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            current_password: e.target.value,
                          })
                        }
                        placeholder="••••••••"
                        className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#c5c0b5]">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={profileForm.new_password}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            new_password: e.target.value,
                          })
                        }
                        placeholder="Min. 8 characters"
                        className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#c5c0b5]">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        value={profileForm.confirm_password}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            confirm_password: e.target.value,
                          })
                        }
                        placeholder="••••••••"
                        className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="mt-6 pt-6 border-t border-white/[0.08]">
                  <button
                    type="submit"
                    disabled={updateProfile.isPending}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#c4a574] text-[#0c0d10] text-sm font-medium hover:bg-[#d4b88a] transition-colors disabled:opacity-50"
                  >
                    {updateProfile.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>

        {/* Appearance Settings */}
        <div className="rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
          <div className="px-6 py-5 border-b border-white/[0.08] flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#d4b88a] shadow-sm">
              <Palette className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#f3eee4]">
                Appearance
              </h2>
              <p className="text-sm text-[#8a867c]">Customize how Quake looks</p>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#c5c0b5]">
                Theme
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    { value: "dark", label: "Dark", icon: Moon },
                    { value: "light", label: "Light", icon: Sun },
                    { value: "system", label: "System", icon: Monitor },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleThemeChange(option.value)}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                      theme === option.value
                        ? "bg-[#c4a574]/15 border-[#c4a574] text-[#f3eee4] shadow-[0_0_0_1px_rgba(99,102,241,0.35)]"
                        : "bg-white/[0.05] border-white/[0.08] text-[#c5c0b5] hover:bg-white/[0.08] hover:text-[#f3eee4]"
                    }`}
                  >
                    <option.icon
                      className={`w-4 h-4 shrink-0 ${
                        theme === option.value
                          ? "text-[#d4b88a]"
                          : "text-current opacity-75"
                      }`}
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Warehouses / My shop (Admin only) */}
        {authUser?.role === "ADMIN" && (
          <div className="rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
            <div className="px-6 py-5 border-b border-white/[0.08] flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#c4a574] shadow-sm">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#f3eee4]">
                  {labels.warehousePluralTitle}
                </h2>
                <p className="text-sm text-[#8a867c]">
                  {labels.warehousePageSubtitle}
                </p>
              </div>
            </div>
            <div className="p-6">
              {warehousesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-[#c4a574] animate-spin" />
                </div>
              ) : warehouses && warehouses.length > 0 ? (
                <div className="space-y-3">
                  {warehouses.map((warehouse: Warehouse) => (
                    <div
                      key={warehouse.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-white/[0.02] border border-white/[0.05]"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#f3eee4]">
                          {warehouse.name}
                        </p>
                        <p className="text-xs text-[#8a867c]">
                          Code: {warehouse.code}
                        </p>
                      </div>
                      <span className="text-xs text-[#8a867c]">
                        {warehouse.address || "No address"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Building2 className="w-12 h-12 text-[#8a867c] mx-auto mb-4" />
                  <p className="text-sm text-[#c5c0b5]">
                    No {labels.warehouseSingular} set up yet
                  </p>
                  <p className="text-xs text-[#8a867c] mt-1">
                    Add it from{" "}
                    <Link
                      href={adminHref("/warehouses")}
                      className="text-[#c4a574] hover:underline"
                    >
                      {labels.warehouseNav}
                    </Link>{" "}
                    in the menu.
                  </p>
                </div>
              )}
              {isSingleShop && warehouses && warehouses.length > 1 && (
                <p className="text-xs text-amber-200/80 mt-4 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Tip: You chose “One shop only” but have more than one location
                  listed. Keep one active shop, or switch to “Godown + shops”.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Categories (Admin only) */}
        {authUser?.role === "ADMIN" && (
          <div className="rounded-xl bg-[#111318]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
            <div className="px-6 py-5 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#c45c5c] shadow-sm">
                  <Tag className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[#f3eee4]">
                    Categories
                  </h2>
                  <p className="text-sm text-[#8a867c]">
                    Manage product categories for inventory
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddingCategory(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#c4a574] text-[#0c0d10] text-sm font-medium hover:bg-[#d4b88a] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Category
              </button>
            </div>
            <div className="p-6">
              {/* Add Category Form */}
              {isAddingCategory && (
                <div className="mb-4 p-4 rounded-lg bg-white/[0.02] border border-white/[0.08]">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-[#f3eee4]">
                      Add New Category
                    </h3>
                    <button
                      onClick={() => {
                        setIsAddingCategory(false);
                        setNewCategoryName("");
                        setNewCategoryDescription("");
                      }}
                      className="p-1 rounded hover:bg-white/[0.05]"
                    >
                      <X className="w-4 h-4 text-[#8a867c]" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Category name (e.g., Groceries, Industrial, Home)"
                      className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={newCategoryDescription}
                      onChange={(e) =>
                        setNewCategoryDescription(e.target.value)
                      }
                      placeholder="Description (optional)"
                      className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#f3eee4] placeholder:text-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#c4a574] focus:border-transparent"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setIsAddingCategory(false);
                          setNewCategoryName("");
                          setNewCategoryDescription("");
                        }}
                        className="px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#c5c0b5] hover:bg-white/[0.08] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          if (!newCategoryName.trim()) {
                            toast.error("Please enter a category name");
                            return;
                          }
                          try {
                            await createCategory.mutateAsync({
                              name: newCategoryName.trim(),
                              description:
                                newCategoryDescription.trim() || undefined,
                            });
                            toast.success("Category created successfully");
                            setIsAddingCategory(false);
                            setNewCategoryName("");
                            setNewCategoryDescription("");
                          } catch {
                            toast.error("Failed to create category");
                          }
                        }}
                        disabled={
                          createCategory.isPending || !newCategoryName.trim()
                        }
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#c4a574] text-[#0c0d10] text-sm font-medium hover:bg-[#d4b88a] transition-colors disabled:opacity-50"
                      >
                        {createCategory.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            Create
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Categories List */}
              {categoriesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-[#c4a574] animate-spin" />
                </div>
              ) : categories && categories.length > 0 ? (
                <div className="space-y-3">
                  {categories.map((category: Category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-white/[0.02] border border-white/[0.05]"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#f3eee4]">
                          {category.name}
                        </p>
                        {category.description && (
                          <p className="text-xs text-[#8a867c]">
                            {category.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          if (
                            confirm(
                              `Are you sure you want to delete "${category.name}"?`,
                            )
                          ) {
                            try {
                              await deleteCategory.mutateAsync(category.id);
                              toast.success("Category deleted");
                            } catch {
                              toast.error("Failed to delete category");
                            }
                          }
                        }}
                        className="p-2 rounded-lg text-[#8a867c] hover:text-[#c45c5c] hover:bg-[#c45c5c]/10 transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Tag className="w-12 h-12 text-[#8a867c] mx-auto mb-4" />
                  <p className="text-sm text-[#c5c0b5]">
                    No categories configured
                  </p>
                  <p className="text-xs text-[#8a867c] mt-1">
                    Use categories that match how you assort — e.g. grocery,
                    hardware, pharmacy, cosmetics, electronics.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
