"use client";

import { useState } from "react";
import {
  Search,
  Pencil,
  Trash2,
  UserPlus,
  Shield,
  User as UserIcon,
  UserCircle2,
  Copy,
  Check,
} from "lucide-react";
import { PageTransition } from "@/components/layout";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "@/hooks/use-users";
import {
  User,
  CreateUserPayload,
  UpdateUserPayload,
} from "@/services/users.service";
import { useAuthStore } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ADMIN_BASE } from "@/lib/admin-routes";

export default function UsersPage() {
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const { data: users, isLoading, error } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);

  // Redirect non-admins
  if (currentUser?.role !== "ADMIN") {
    router.push(ADMIN_BASE);
    return null;
  }

  const filteredUsers =
    users?.filter((user) => {
      const query = searchQuery.toLowerCase();
      return (
        user.name?.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query)
      );
    }) || [];

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#F5F6FA] flex items-center gap-2">
              <UserIcon className="w-6 h-6 text-[#6366F1]" />
              User Management
            </h1>
            <p className="text-sm text-[#6F7285] mt-1">
              Manage staff and admin accounts
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C6A15B] text-[#0E0F13] text-sm font-medium hover:bg-[#D4B06A] transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6F7285]" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
          />
        </div>

        {/* Users Table */}
        <div className="rounded-xl bg-[#1A1B23]/60 backdrop-blur-xl border border-white/[0.08] overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="inline-block w-8 h-8 border-2 border-[#C6A15B] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[#6F7285] mt-4">Loading users...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <p className="text-sm text-red-400">Failed to load users</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center">
              <UserIcon className="w-12 h-12 text-[#6F7285] mx-auto mb-4" />
              <p className="text-sm text-[#A1A4B3]">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Last Login
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-[#6F7285] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {filteredUsers.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      isCurrentUser={user.id === currentUser?.id}
                      onEdit={() => setEditingUser(user)}
                      onDelete={() => setDeleteConfirm(user)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <UserFormModal
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={async (data) => {
            await createUser.mutateAsync(data as CreateUserPayload);
            setIsAddModalOpen(false);
          }}
          isLoading={createUser.isPending}
        />
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <UserFormModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSubmit={async (data) => {
            await updateUser.mutateAsync({ id: editingUser.id, data });
            setEditingUser(null);
          }}
          isLoading={updateUser.isPending}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <DeleteConfirmModal
          user={deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={async () => {
            await deleteUser.mutateAsync(deleteConfirm.id);
            setDeleteConfirm(null);
          }}
          isLoading={deleteUser.isPending}
        />
      )}
    </PageTransition>
  );
}

function UserRow({
  user,
  isCurrentUser,
  onEdit,
  onDelete,
}: {
  user: User;
  isCurrentUser: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="hover:bg-white/[0.02] transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366F1]/20 via-[#A855F7]/20 to-[#EC4899]/20 ring-1 ring-[#6366F1]/30 flex items-center justify-center">
            <UserCircle2 className="w-5 h-5 text-[#6366F1]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#F5F6FA]">
              {user.name || user.username}
              {isCurrentUser && (
                <span className="ml-2 text-xs text-[#6F7285]">(You)</span>
              )}
            </p>
            <p className="text-xs text-[#6F7285]">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${
            user.role === "ADMIN"
              ? "bg-amber-100 text-amber-900 ring-amber-300/90"
              : "bg-sky-100 text-sky-900 ring-sky-300/90"
          }`}
        >
          {user.role === "ADMIN" ? (
            <Shield className="w-3 h-3" />
          ) : (
            <UserIcon className="w-3 h-3" />
          )}
          {user.role}
        </span>
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
            user.isActive
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-red-500/20 text-red-400"
          }`}
        >
          {user.isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-6 py-4 text-sm text-[#A1A4B3]">
        {user.lastLogin
          ? formatDistanceToNow(new Date(user.lastLogin), { addSuffix: true })
          : "Never"}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg hover:bg-white/[0.05] text-[#A1A4B3] hover:text-[#F5F6FA] transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          {!isCurrentUser && (
            <button
              onClick={onDelete}
              className="p-2 rounded-lg hover:bg-red-500/10 text-[#A1A4B3] hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function UserFormModal({
  user,
  onClose,
  onSubmit,
  isLoading,
}: {
  user?: User;
  onClose: () => void;
  onSubmit: (data: CreateUserPayload | UpdateUserPayload) => Promise<void>;
  isLoading: boolean;
}) {
  const isEditing = !!user;
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    password: "",
    role: user?.role || ("STAFF" as "ADMIN" | "STAFF"),
    is_active: user?.isActive ?? true, // Read camelCase from API, store as snake_case for submit
  });
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const generatePassword = () => {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, password });
    setShowPassword(true);
  };

  const copyCredentials = () => {
    const text = `Email: ${formData.email}\nPassword: ${formData.password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: CreateUserPayload | UpdateUserPayload = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
    };
    if (!isEditing) {
      (data as CreateUserPayload).password = formData.password;
    } else {
      (data as UpdateUserPayload).is_active = formData.is_active;
      if (formData.password) {
        data.password = formData.password;
      }
    }
    await onSubmit(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-[#1A1B23] border border-white/[0.08] shadow-2xl">
        <div className="px-6 py-5 border-b border-white/[0.08]">
          <h2 className="text-lg font-semibold text-[#F5F6FA]">
            {isEditing ? "Edit User" : "Add New User"}
          </h2>
          <p className="text-sm text-[#6F7285] mt-1">
            {isEditing
              ? "Update user details"
              : "Create a new staff or admin account"}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#A1A4B3]">
              Full Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="John Doe"
              className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#A1A4B3]">
              Email *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="john@example.com"
              className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#A1A4B3]">
              {isEditing
                ? "New Password (leave blank to keep current)"
                : "Password *"}
            </label>
            <div className="flex gap-2">
              <input
                type={showPassword ? "text" : "password"}
                required={!isEditing}
                minLength={8}
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder={isEditing ? "••••••••" : "Min. 8 characters"}
                className="flex-1 px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#F5F6FA] placeholder:text-[#6F7285] focus:outline-none focus:ring-2 focus:ring-[#C6A15B] focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={generatePassword}
                className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs text-[#A1A4B3] hover:bg-white/[0.08] transition-colors"
              >
                Generate
              </button>
            </div>
            {formData.password && !isEditing && (
              <button
                type="button"
                onClick={copyCredentials}
                className="inline-flex items-center gap-1.5 text-xs text-[#C6A15B] hover:underline"
              >
                {copied ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                {copied ? "Copied!" : "Copy credentials"}
              </button>
            )}
          </div>

          {/* Role */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#A1A4B3]">Role *</label>
            <div className="flex gap-3">
              {(["STAFF", "ADMIN"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setFormData({ ...formData, role })}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    formData.role === role
                      ? "bg-[#C6A15B]/20 border-[#C6A15B] text-[#C6A15B]"
                      : "bg-white/[0.05] border-white/[0.08] text-[#A1A4B3] hover:bg-white/[0.08]"
                  }`}
                >
                  {role === "ADMIN" ? (
                    <Shield className="w-4 h-4" />
                  ) : (
                    <UserIcon className="w-4 h-4" />
                  )}
                  {role}
                </button>
              ))}
            </div>
          </div>

          {/* Active Status (only for editing) */}
          {isEditing && (
            <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/[0.02] border border-white/[0.05]">
              <div>
                <p className="text-sm font-medium text-[#F5F6FA]">
                  Account Active
                </p>
                <p className="text-xs text-[#6F7285]">
                  Inactive users cannot log in
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setFormData({ ...formData, is_active: !formData.is_active })
                }
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  formData.is_active ? "bg-[#C6A15B]" : "bg-white/[0.1]"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    formData.is_active ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm font-medium text-[#A1A4B3] hover:bg-white/[0.08] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#C6A15B] text-[#0E0F13] text-sm font-medium hover:bg-[#D4B06A] transition-colors disabled:opacity-50"
            >
              {isLoading
                ? "Saving..."
                : isEditing
                  ? "Update User"
                  : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  user,
  onClose,
  onConfirm,
  isLoading,
}: {
  user: User;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl bg-[#1A1B23] border border-white/[0.08] shadow-2xl">
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-6 h-6 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-[#F5F6FA]">Delete User</h3>
          <p className="text-sm text-[#6F7285] mt-2">
            Are you sure you want to delete{" "}
            <span className="text-[#F5F6FA]">{user.name || user.email}</span>?
            This action cannot be undone.
          </p>
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm font-medium text-[#A1A4B3] hover:bg-white/[0.08] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
