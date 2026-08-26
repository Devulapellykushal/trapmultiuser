"use client";

import * as React from "react";
import {
  Check,
  Eye,
  EyeOff,
  Instagram,
  Loader2,
  MessageCircle,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageTransition } from "@/components/layout";
import {
  getNotificationSettings,
  updateNotificationSettings,
} from "@/services/notifications.service";

const channels = [
  {
    id: "whatsapp",
    title: "WhatsApp",
    status: "Live",
    description:
      "Meta Cloud — configure below, then send from any customer profile.",
    icon: MessageCircle,
    live: true,
  },
  {
    id: "meta",
    title: "Meta Ads / Instagram",
    status: "Coming",
    description:
      "Push Segments as custom audiences. Export stubs are ready on each segment card.",
    icon: Instagram,
    live: false,
  },
  {
    id: "sms",
    title: "SMS",
    status: "Coming",
    description:
      "Transactional reminders for shops without WhatsApp coverage.",
    icon: MessageSquare,
    live: false,
  },
] as const;

const templates = [
  {
    id: "thanks",
    title: "Invoice thank-you",
    body: "Thanks for your purchase — drive safe. We’re here for fitment & alignment.",
  },
  {
    id: "monsoon",
    title: "Monsoon tyre check",
    body: "Rain season tip: check tread depth and pressure before the next long drive.",
  },
  {
    id: "alignment",
    title: "Alignment reminder",
    body: "Uneven wear? Book a wheel alignment when you’re next in.",
  },
  {
    id: "festival",
    title: "Festival offer",
    body: "Seasonal offer — wire campaign scheduling when blasts go live.",
  },
] as const;

const SETTINGS_KEY = ["notifications", "settings"] as const;

export default function CustomerOutreachPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getNotificationSettings,
    staleTime: 30_000,
  });

  const phoneNumberId =
    settings?.whatsappPhoneNumberId ??
    settings?.whatsapp_phone_number_id ??
    "";
  const businessAccountId =
    settings?.whatsappBusinessAccountId ??
    settings?.whatsapp_business_account_id ??
    "";
  const invoiceEnabled = Boolean(
    settings?.whatsappInvoiceEnabled ??
      settings?.whatsapp_invoice_enabled ??
      false,
  );
  const tokenConfigured = Boolean(
    settings?.whatsappTokenConfigured ??
      settings?.whatsapp_token_configured ??
      false,
  );

  const [phoneId, setPhoneId] = React.useState("");
  const [businessId, setBusinessId] = React.useState("");
  const [accessToken, setAccessToken] = React.useState("");
  const [showToken, setShowToken] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    if (!settings || hydrated) return;
    setPhoneId(phoneNumberId);
    setBusinessId(businessAccountId);
    setEnabled(invoiceEnabled);
    setHydrated(true);
  }, [
    settings,
    hydrated,
    phoneNumberId,
    businessAccountId,
    invoiceEnabled,
  ]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: {
        whatsapp_invoice_enabled: boolean;
        whatsapp_phone_number_id: string;
        whatsapp_business_account_id: string;
        whatsapp_access_token?: string;
      } = {
        whatsapp_invoice_enabled: enabled,
        whatsapp_phone_number_id: phoneId.trim(),
        whatsapp_business_account_id: businessId.trim(),
      };
      if (accessToken.trim()) {
        payload.whatsapp_access_token = accessToken.trim();
      }
      return updateNotificationSettings(payload);
    },
    onSuccess: () => {
      setAccessToken("");
      setHydrated(false);
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      toast.success("WhatsApp Meta Cloud settings saved");
    },
    onError: (err: unknown) => {
      let msg = "Could not save WhatsApp settings";
      if (err && typeof err === "object" && "response" in err) {
        const data = (
          err as { response?: { data?: { detail?: string; error?: string } } }
        ).response?.data;
        msg = data?.detail || data?.error || msg;
      }
      toast.error(msg);
    },
  });

  const configured =
    Boolean(phoneNumberId.trim()) && tokenConfigured;

  return (
    <PageTransition>
      <div className="space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
            Outreach
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Channels, Meta Cloud WhatsApp, and templates — all in Customers
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--brand)]" />
            Channels
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {channels.map((ch) => {
              const Icon = ch.icon;
              const statusLabel =
                ch.id === "whatsapp"
                  ? configured
                    ? "Connected"
                    : "Setup needed"
                  : ch.status;
              const live =
                ch.id === "whatsapp" ? configured : ch.live;
              return (
                <div
                  key={ch.id}
                  className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-xl bg-[var(--brand-muted)]">
                      <Icon className="w-4 h-4 text-[var(--brand)]" />
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                        live
                          ? "bg-[var(--success-muted)] text-[var(--success)]"
                          : "bg-[var(--bg-surface)] text-[var(--text-muted)]"
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      {ch.title}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                      {ch.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* WhatsApp Meta Cloud — stays inside Customers */}
        <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-default)] flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[var(--brand-muted)]">
                <MessageCircle className="w-4 h-4 text-[var(--brand)]" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Configure WhatsApp
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Meta Cloud API credentials for this shop. Send from any
                  customer profile once saved.
                </p>
              </div>
            </div>
            {configured ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-[var(--success-muted)] text-[var(--success)] shrink-0">
                <Check className="w-3 h-3" />
                Ready
              </span>
            ) : null}
          </div>

          <div className="p-5 space-y-4">
            {settingsLoading && !hydrated ? (
              <div className="flex justify-center py-8 text-[var(--text-muted)]">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="rounded border-[var(--border-default)] text-[var(--brand)] focus:ring-[var(--brand)]"
                  />
                  Enable WhatsApp invoice / outreach sends
                </label>

                <Field
                  label="Phone number ID"
                  hint="From Meta Developer → WhatsApp → API setup"
                  value={phoneId}
                  onChange={setPhoneId}
                  placeholder="e.g. 109876543210987"
                />
                <Field
                  label="Business account ID"
                  hint="Optional — WhatsApp Business Account ID"
                  value={businessId}
                  onChange={setBusinessId}
                  placeholder="Optional"
                />

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    Access token
                    {tokenConfigured ? (
                      <span className="ml-2 text-[var(--success)] font-normal">
                        (token on file — paste only to replace)
                      </span>
                    ) : (
                      <span className="ml-1 text-[var(--danger)]">*</span>
                    )}
                  </span>
                  <div className="relative">
                    <input
                      type={showToken ? "text" : "password"}
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder={
                        tokenConfigured
                          ? "••••••••  leave blank to keep current"
                          : "Permanent or temporary Meta access token"
                      }
                      className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] px-3 py-2.5 pr-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      aria-label={showToken ? "Hide token" : "Show token"}
                    >
                      {showToken ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <p className="text-[11px] text-[var(--text-muted)] max-w-md">
                    Never shared outside this shop. Required for profile →
                    WhatsApp send.
                  </p>
                  <button
                    type="button"
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    Save WhatsApp
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Template library
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4"
              >
                <h3 className="text-sm font-medium text-[var(--text-primary)]">
                  {t.title}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                  {t.body}
                </p>
                <p className="mt-3 text-[11px] text-[var(--brand)]">
                  Available on profile → WhatsApp send
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageTransition>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      {hint ? (
        <span className="block text-[11px] text-[var(--text-muted)] -mt-0.5">
          {hint}
        </span>
      ) : null}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40"
      />
    </label>
  );
}
