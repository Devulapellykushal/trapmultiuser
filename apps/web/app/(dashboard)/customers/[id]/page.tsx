"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Car,
  FileText,
  Link2,
  Loader2,
  MessageCircle,
  Pencil,
  Phone,
  UserRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageTransition } from "@/components/layout";
import { CustomerFormModal } from "@/components/customers/customer-form-modal";
import { ErrorState } from "@/components/ui/error-state";
import {
  useActivateCustomer,
  useCustomer,
  useCustomerSales,
  useDeactivateCustomer,
  useLinkCustomerSales,
} from "@/hooks/use-customers";
import { adminHref } from "@/lib/admin-routes";
import { sendWhatsAppMessage } from "@/services/notifications.service";

function formatCurrency(amount: string | number | undefined): string {
  const n = typeof amount === "string" ? Number(amount) : amount ?? 0;
  if (!Number.isFinite(n) || n === 0) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const WA_TEMPLATES = [
  {
    id: "thanks",
    label: "Thanks for visiting",
    body: (name: string) =>
      `Hi ${name}, thanks for visiting us. Drive safe — we’re here for your next tyre or alignment.`,
  },
  {
    id: "fit",
    label: "Tyre fit reminder",
    body: (name: string) =>
      `Hi ${name}, a quick reminder to check tyre pressure and tread. Book a fitment slot with us anytime.`,
  },
  {
    id: "credit",
    label: "Credit reminder",
    body: (name: string) =>
      `Hi ${name}, a gentle reminder on your open balance with us. Happy to help settle anytime at the counter.`,
  },
] as const;

export default function CustomerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const { data: customer, isLoading, isError, refetch } = useCustomer(id);
  const { data: sales = [], isLoading: salesLoading } = useCustomerSales(id);
  const deactivate = useDeactivateCustomer();
  const activate = useActivateCustomer();
  const linkSales = useLinkCustomerSales();
  const [editOpen, setEditOpen] = React.useState(false);
  const [waSending, setWaSending] = React.useState(false);
  const [waTemplate, setWaTemplate] =
    React.useState<(typeof WA_TEMPLATES)[number]["id"]>("thanks");

  const phone = customer?.phone?.trim() ?? "";
  const canWhatsApp = phone.length >= 8;
  const credit = Number(customer?.creditOutstanding ?? 0);

  const handleWhatsApp = async () => {
    if (!customer || !canWhatsApp) return;
    const tmpl =
      WA_TEMPLATES.find((t) => t.id === waTemplate) ?? WA_TEMPLATES[0];
    setWaSending(true);
    try {
      await sendWhatsAppMessage({
        phone_number: phone,
        message: tmpl.body(customer.name),
      });
      toast.success("WhatsApp message sent");
    } catch (err: unknown) {
      let msg = "WhatsApp send failed. Check Meta Cloud setup in Settings.";
      if (err && typeof err === "object" && "response" in err) {
        const data = (
          err as {
            response?: {
              data?: { message?: string; detail?: string; error?: string };
            };
          }
        ).response?.data;
        msg = data?.message || data?.detail || data?.error || msg;
      }
      toast.error(msg);
    } finally {
      setWaSending(false);
    }
  };

  if (isLoading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center py-24 text-[var(--text-muted)]">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PageTransition>
    );
  }

  if (isError || !customer) {
    return (
      <PageTransition>
        <ErrorState
          message="Customer not found or failed to load."
          onRetry={() => refetch()}
        />
        <div className="text-center mt-4">
          <Link
            href={adminHref("/customers")}
            className="text-sm text-[var(--brand)] hover:underline"
          >
            Back to directory
          </Link>
        </div>
      </PageTransition>
    );
  }

  const saleCount = customer.saleCount ?? 0;
  const hasPurchaseStats = saleCount > 0 || !!customer.lastSaleAt;

  return (
    <PageTransition>
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push(adminHref("/customers"))}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="w-4 h-4" />
          Directory
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-2xl bg-[var(--brand-muted)] shadow-[var(--shadow-glow-rest)]">
              <UserRound className="w-6 h-6 text-[var(--brand)]" />
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-display,Cormorant_Garamond),Georgia,serif] text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
                {customer.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-[var(--text-secondary)]">
                {phone ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {phone}
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)]">No phone</span>
                )}
                {customer.gstin ? (
                  <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-[var(--brand-muted)] text-[var(--brand)]">
                    {customer.gstin}
                  </span>
                ) : null}
                <span
                  className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                    customer.isActive
                      ? "bg-[var(--success-muted)] text-[var(--success)]"
                      : "bg-[var(--bg-surface)] text-[var(--text-muted)]"
                  }`}
                >
                  {customer.isActive ? "Active" : "Inactive"}
                </span>
                {credit > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-[var(--warning-muted)] text-[var(--warning)]">
                    <Wallet className="w-3 h-3" />
                    {formatCurrency(credit)} due
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            <button
              type="button"
              disabled={linkSales.isPending}
              onClick={() => linkSales.mutate(customer.id)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
              title="Attach past invoices with the same phone"
            >
              {linkSales.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              Link invoices
            </button>
            {customer.isActive ? (
              <button
                type="button"
                disabled={deactivate.isPending}
                onClick={() => deactivate.mutate(customer.id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-[var(--danger)] border border-[var(--border-default)] hover:bg-[var(--danger-muted)] disabled:opacity-50"
              >
                Deactivate
              </button>
            ) : (
              <button
                type="button"
                disabled={activate.isPending}
                onClick={() => activate.mutate(customer.id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-[var(--success)] border border-[var(--border-default)] hover:bg-[var(--success-muted)] disabled:opacity-50"
              >
                Reactivate
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Contact
            </h2>
            <dl className="space-y-2 text-sm">
              <Row label="Email" value={customer.email || "—"} />
              <Row label="Address" value={customer.address || "—"} />
              <Row label="Added" value={formatDate(customer.createdAt)} />
            </dl>
          </section>

          <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Notes
            </h2>
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap min-h-[4rem]">
              {customer.notes?.trim() || "No notes yet."}
            </p>
          </section>

          <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Purchase snapshot
            </h2>
            {hasPurchaseStats ? (
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Orders" value={String(saleCount)} />
                <Stat
                  label="Revenue"
                  value={formatCurrency(customer.totalRevenue)}
                />
                <Stat
                  label="Credit due"
                  value={credit > 0 ? formatCurrency(credit) : "—"}
                />
                <Stat
                  label="Last sale"
                  value={formatDate(customer.lastSaleAt)}
                />
              </dl>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No linked invoices yet. Complete a POS sale with this phone, or
                tap <strong className="text-[var(--text-secondary)]">Link invoices</strong>{" "}
                to pull matching bills.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Channels
            </h2>
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-[var(--brand)]" />
                    WhatsApp
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {canWhatsApp
                      ? "Meta Cloud API when configured"
                      : "Add a phone number to send"}
                  </p>
                </div>
                {canWhatsApp ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={waTemplate}
                      onChange={(e) =>
                        setWaTemplate(
                          e.target.value as (typeof WA_TEMPLATES)[number]["id"],
                        )
                      }
                      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                    >
                      {WA_TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={waSending}
                      onClick={() => void handleWhatsApp()}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--brand)] text-[var(--brand-contrast)] disabled:opacity-50"
                    >
                      {waSending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : null}
                      Send
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="pt-2 border-t border-[var(--border-default)]">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Meta / Instagram
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Audience sync lands with Segments export — connect Ads later.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Invoice timeline */}
        <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-default)] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Invoice history
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Linked sales + phone matches from the counter
              </p>
            </div>
            <FileText className="w-4 h-4 text-[var(--brand)]" />
          </div>
          {salesLoading ? (
            <div className="flex justify-center py-10 text-[var(--text-muted)]">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : sales.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--text-muted)] text-center">
              No invoices yet for this customer.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-default)]">
              {sales.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`${adminHref("/invoices")}?sale_id=${s.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-[var(--bg-surface)] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {s.invoiceNumber}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {formatDateTime(s.createdAt)}
                        {s.storeName
                          ? ` · ${s.storeName}`
                          : s.warehouseName
                            ? ` · ${s.warehouseName}`
                            : ""}
                        {s.linked === false ? " · phone match" : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">
                        {formatCurrency(s.total)}
                      </p>
                      {Number(s.creditBalance) > 0 ? (
                        <p className="text-[11px] text-[var(--warning)]">
                          {formatCurrency(s.creditBalance)} due
                        </p>
                      ) : (
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {s.totalItems} items
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-elevated)]/50 p-5 opacity-90">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[var(--bg-surface)]">
              <Car className="w-5 h-5 text-[var(--text-muted)]" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Vehicles
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">
                Fleet plates and preferred tyre sizes — next for multi-vehicle
                accounts.
              </p>
              <button
                type="button"
                disabled
                className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border-default)] text-[var(--text-muted)] cursor-not-allowed"
              >
                Add vehicle
              </button>
            </div>
          </div>
        </section>
      </div>

      <CustomerFormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        customer={customer}
      />
    </PageTransition>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-[var(--text-muted)]">{label}</dt>
      <dd className="text-[var(--text-secondary)] break-words">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="text-base font-semibold text-[var(--text-primary)] tabular-nums mt-0.5">
        {value}
      </dd>
    </div>
  );
}
