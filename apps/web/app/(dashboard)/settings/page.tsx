"use client";

import { PageTransition } from "@/components/layout";
import {
    useCategories,
    useCreateCategory,
    useDeleteCategory,
    useWarehouses,
} from "@/hooks/use-inventory";
import { useProfile, useUpdateProfile } from "@/hooks/use-users";
import { useAuthStore } from "@/lib/auth";
import { Category, Warehouse } from "@/services";
import { adminHref } from "@/lib/admin-routes";
import { UpdateProfilePayload } from "@/services/users.service";
import {
    Building2,
    Check,
    Loader2,
    Monitor,
    Moon,
    Palette,
    Plus,
    Sun,
    Tag,
    Trash2,
    User,
    X,
} from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

type Theme = "dark" | "light" | "system";

export default function SettingsPage() {
  const { user: authUser } = useAuthStore();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const updateProfile = useUpdateProfile();

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
          <h1 className="text-2xl font-semibold text-[#F5F6FA] flex items-center gap-2">
            <Palette className="w-6 h-6 text-[#6366F1]" />
            Settings
          </h1>
          <p className="text-sm text-[#6F7285] mt-1">
            Manage your account and preferences
          </p>
        </div>

        {/* Profile Settings */}
        <div className="rounded-xl bg-[#1A1B23]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
          <div className="px-6 py-5 border-b border-white/[0.08] flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#6366F1] shadow-sm">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#F5F6FA]">Profile</h2>
              <p className="text-sm text-[#6F7285]">
                Update your personal information
              </p>
            </div>
          </div>
          <form onSubmit={handleProfileSubmit} className="p-6">
            {profileLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-[#C6A15B] animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Name */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#A1A4B3]">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profileForm.name}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, name: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#A1A4B3]">
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
                      className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
                    />
                  </div>

                  {/* Role (read-only) */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#A1A4B3]">
                      Role
                    </label>
                    <input
                      type="text"
                      value={authUser?.role || ""}
                      disabled
                      className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#6F7285] cursor-not-allowed"
                    />
                  </div>

                  {/* Username (read-only) */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#A1A4B3]">
                      Username
                    </label>
                    <input
                      type="text"
                      value={profile?.username || ""}
                      disabled
                      className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#6F7285] cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Password Change Section */}
                <div className="mt-6 pt-6 border-t border-white/[0.08]">
                  <h3 className="text-sm font-semibold text-[#F5F6FA] mb-4">
                    Change Password
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#A1A4B3]">
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
                        className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#A1A4B3]">
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
                        className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#A1A4B3]">
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
                        className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="mt-6 pt-6 border-t border-white/[0.08]">
                  <button
                    type="submit"
                    disabled={updateProfile.isPending}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#C6A15B] text-[#0E0F13] text-sm font-medium hover:bg-[#D4B06A] transition-colors disabled:opacity-50"
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
        <div className="rounded-xl bg-[#1A1B23]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
          <div className="px-6 py-5 border-b border-white/[0.08] flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#A855F7] shadow-sm">
              <Palette className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#F5F6FA]">
                Appearance
              </h2>
              <p className="text-sm text-[#6F7285]">Customize how Quake looks</p>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#A1A4B3]">
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
                        ? "bg-[#6366F1]/15 border-[#6366F1] text-[#F5F6FA] shadow-[0_0_0_1px_rgba(99,102,241,0.35)]"
                        : "bg-white/[0.05] border-white/[0.08] text-[#A1A4B3] hover:bg-white/[0.08] hover:text-[#F5F6FA]"
                    }`}
                  >
                    <option.icon
                      className={`w-4 h-4 shrink-0 ${
                        theme === option.value
                          ? "text-[#C7D2FE]"
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

        {/* Warehouses (Admin only) */}
        {authUser?.role === "ADMIN" && (
          <div className="rounded-xl bg-[#1A1B23]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
            <div className="px-6 py-5 border-b border-white/[0.08] flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#6366F1] shadow-sm">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#F5F6FA]">
                  Warehouses
                </h2>
                <p className="text-sm text-[#6F7285]">
                  Manage warehouse locations
                </p>
              </div>
            </div>
            <div className="p-6">
              {warehousesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-[#C6A15B] animate-spin" />
                </div>
              ) : warehouses && warehouses.length > 0 ? (
                <div className="space-y-3">
                  {warehouses.map((warehouse: Warehouse) => (
                    <div
                      key={warehouse.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-white/[0.02] border border-white/[0.05]"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#F5F6FA]">
                          {warehouse.name}
                        </p>
                        <p className="text-xs text-[#6F7285]">
                          Code: {warehouse.code}
                        </p>
                      </div>
                      <span className="text-xs text-[#6F7285]">
                        {warehouse.address || "No address"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Building2 className="w-12 h-12 text-[#6F7285] mx-auto mb-4" />
                  <p className="text-sm text-[#A1A4B3]">
                    No warehouses configured
                  </p>
                  <p className="text-xs text-[#6F7285] mt-1">
                    Admins can add storage places from{" "}
                    <Link
                      href={adminHref("/warehouses")}
                      className="text-[#C6A15B] hover:underline"
                    >
                      Warehouses
                    </Link>{" "}
                    in the sidebar.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Categories (Admin only) */}
        {authUser?.role === "ADMIN" && (
          <div className="rounded-xl bg-[#1A1B23]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
            <div className="px-6 py-5 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#EC4899] shadow-sm">
                  <Tag className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[#F5F6FA]">
                    Categories
                  </h2>
                  <p className="text-sm text-[#6F7285]">
                    Manage product categories for inventory
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddingCategory(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#C6A15B] text-[#0E0F13] text-sm font-medium hover:bg-[#D4B06A] transition-colors"
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
                    <h3 className="text-sm font-medium text-[#F5F6FA]">
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
                      <X className="w-4 h-4 text-[#6F7285]" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Category name (e.g., Groceries, Industrial, Home)"
                      className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={newCategoryDescription}
                      onChange={(e) =>
                        setNewCategoryDescription(e.target.value)
                      }
                      placeholder="Description (optional)"
                      className="w-full px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setIsAddingCategory(false);
                          setNewCategoryName("");
                          setNewCategoryDescription("");
                        }}
                        className="px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#A1A4B3] hover:bg-white/[0.08] transition-colors"
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
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C6A15B] text-[#0E0F13] text-sm font-medium hover:bg-[#D4B06A] transition-colors disabled:opacity-50"
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
                  <Loader2 className="w-6 h-6 text-[#C6A15B] animate-spin" />
                </div>
              ) : categories && categories.length > 0 ? (
                <div className="space-y-3">
                  {categories.map((category: Category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-white/[0.02] border border-white/[0.05]"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#F5F6FA]">
                          {category.name}
                        </p>
                        {category.description && (
                          <p className="text-xs text-[#6F7285]">
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
                        className="p-2 rounded-lg text-[#6F7285] hover:text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Tag className="w-12 h-12 text-[#6F7285] mx-auto mb-4" />
                  <p className="text-sm text-[#A1A4B3]">
                    No categories configured
                  </p>
                  <p className="text-xs text-[#6F7285] mt-1">
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
