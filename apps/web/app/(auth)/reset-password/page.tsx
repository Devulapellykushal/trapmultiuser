"use client";

import { AuthShell } from "@/components/auth";
import { ADMIN_BASE } from "@/lib/admin-routes";
import { authService, useAuthStore } from "@/lib/auth";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Suspense } from "react";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Missing reset token. Use the link from your email.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await authService.resetPassword(token, password);
      useAuthStore.getState().establishSession(response);
      router.replace(ADMIN_BASE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthShell
        title="Invalid link"
        subtitle="This reset link is missing a token."
        footer={
          <Link href="/forgot-password" className="text-[var(--brand)] hover:underline font-medium">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Open the full link from your email, or request a new reset.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set new password"
      subtitle="Choose a strong password for your account."
      footer={
        <Link href="/login" className="text-[var(--brand)] hover:underline font-medium">
          Back to sign in
        </Link>
      }
    >
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
            New password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
            Confirm password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
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
              Saving…
            </>
          ) : (
            "Update password & sign in"
          )}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 min-h-dvh items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
