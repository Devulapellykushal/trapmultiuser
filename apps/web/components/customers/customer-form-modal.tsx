"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, UserRound, X } from "lucide-react";
import type { Customer, CustomerWritePayload } from "@/services/customers.service";
import {
  useCreateCustomer,
  useUpdateCustomer,
} from "@/hooks/use-customers";

export interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null;
}

type FormState = {
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  notes: string;
  isActive: boolean;
};

function emptyForm(): FormState {
  return {
    name: "",
    phone: "",
    email: "",
    address: "",
    gstin: "",
    notes: "",
    isActive: true,
  };
}

function fromCustomer(c: Customer): FormState {
  return {
    name: c.name ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    gstin: c.gstin ?? "",
    notes: c.notes ?? "",
    isActive: c.isActive !== false,
  };
}

function toPayload(form: FormState): CustomerWritePayload {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    address: form.address.trim(),
    gstin: form.gstin.trim().toUpperCase(),
    notes: form.notes.trim(),
    is_active: form.isActive,
  };
}

export function CustomerFormModal({
  isOpen,
  onClose,
  customer,
}: CustomerFormModalProps) {
  const isEdit = !!customer;
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const [form, setForm] = React.useState<FormState>(emptyForm());

  React.useEffect(() => {
    if (!isOpen) return;
    setForm(customer ? fromCustomer(customer) : emptyForm());
  }, [isOpen, customer]);

  const pending = createMutation.isPending || updateMutation.isPending;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = toPayload(form);
    if (isEdit && customer) {
      updateMutation.mutate(
        { id: customer.id, data: payload },
        { onSuccess: () => onClose() },
      );
    } else {
      createMutation.mutate(payload, { onSuccess: () => onClose() });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 modal-scrim"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="customer-form-title"
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto modal-panel rounded-2xl shadow-2xl"
            >
              <div className="flex items-center justify-between p-5 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[var(--brand-muted)]">
                    <UserRound className="w-5 h-5 text-[var(--brand)]" />
                  </div>
                  <div>
                    <h2
                      id="customer-form-title"
                      className="text-lg font-semibold text-[var(--text-primary)]"
                    >
                      {isEdit ? "Edit customer" : "Add customer"}
                    </h2>
                    <p className="text-xs text-[var(--text-muted)]">
                      Walk-in, fleet, or GST buyer
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-[var(--text-secondary)]" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <Field
                  label="Name"
                  required
                  value={form.name}
                  onChange={(v) => setField("name", v)}
                  placeholder="Customer or fleet name"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Phone"
                    value={form.phone}
                    onChange={(v) => setField("phone", v)}
                    placeholder="WhatsApp / mobile"
                    inputMode="tel"
                  />
                  <Field
                    label="GSTIN"
                    value={form.gstin}
                    onChange={(v) => setField("gstin", v)}
                    placeholder="Optional"
                  />
                </div>
                <Field
                  label="Email"
                  value={form.email}
                  onChange={(v) => setField("email", v)}
                  placeholder="Optional"
                  type="email"
                />
                <Field
                  label="Address"
                  value={form.address}
                  onChange={(v) => setField("address", v)}
                  placeholder="Billing / delivery"
                  multiline
                />
                <Field
                  label="Notes"
                  value={form.notes}
                  onChange={(v) => setField("notes", v)}
                  placeholder="Preferred sizes, fleet account, etc."
                  multiline
                />

                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setField("isActive", e.target.checked)}
                    className="rounded border-[var(--border-default)] text-[var(--brand)] focus:ring-[var(--brand)]"
                  />
                  Active in directory
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                    disabled={pending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pending || !form.name.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-[var(--brand)] text-[var(--brand-contrast,#0c0d10)] hover:opacity-90 disabled:opacity-50"
                  >
                    {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isEdit ? "Save changes" : "Add customer"}
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  multiline,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const className =
    "w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40";

  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[var(--text-secondary)]">
        {label}
        {required ? " *" : ""}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={className}
        />
      ) : (
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={className}
        />
      )}
    </label>
  );
}
