"use client";

import { AuthShell } from "@/components/auth";
import { authService } from "@/lib/auth";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import * as React from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [devLink, setDevLink] = React.useState<string | null>(null);
  const [resetEnabled, setResetEnabled] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    authService
      .getCapabilities()
      .then((c) => setResetEnabled(c.passwordResetEnabled))
      .catch(() => setResetEnabled(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await authService.forgotPassword(email);
      setSent(true);
      if (res.devResetUrl) {
        setDevLink(res.devResetUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (resetEnabled === null) {
    return (
      <div className="flex flex-1 min-h-dvh items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  if (!resetEnabled) {
    return (
      <AuthShell
        title="Reset unavailable"
        subtitle="Email reset is not configured. Contact your administrator."
        footer={
          <Link href="/login" className="text-[var(--brand)] hover:underline font-medium">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Ask an admin to reset your password from the Users screen.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your email — we'll send a link to reset your password."
      footer={
        <Link href="/login" className="text-[var(--brand)] hover:underline font-medium">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--success-muted)] border border-[var(--success)]/30">
            <CheckCircle2 className="w-5 h-5 text-[var(--success)] shrink-0 mt-0.5" />
            <div className="text-sm text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)] mb-1">Check your inbox</p>
              <p>
                If an account exists for <strong>{email}</strong>, we sent a reset link.
                It expires in about an hour.
              </p>
            </div>
          </div>
          {devLink ? (
            <div className="p-3 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-muted)] text-xs text-[var(--warning)] break-all">
              <p className="font-medium mb-1">Dev mode — reset link:</p>
              <a href={devLink} className="underline">
                {devLink}
              </a>
            </div>
          ) : null}
        </motion.div>
      ) : (
        <>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-[var(--danger-muted)] border border-[var(--danger)]/35"
            >
              <AlertCircle className="w-5 h-5 text-[var(--danger)]" />
              <p className="text-sm text-[var(--danger)]">{error}</p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-[var(--brand-contrast)] font-semibold disabled:opacity-50 [background:var(--grad-brand-diagonal)]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send reset link"
              )}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
