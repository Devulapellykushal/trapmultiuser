"use client";

import { AuthShell } from "@/components/auth";
import { usePlatformAuthStore } from "@/lib/auth/platform-auth.store";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

export default function SuperadminLoginPage() {
  const router = useRouter();
  const login = usePlatformAuthStore((s) => s.login);
  const isAuthenticated = usePlatformAuthStore((s) => s.isAuthenticated);
  const hasHydrated = usePlatformAuthStore((s) => s.hasHydrated);
  const hasBootstrapped = usePlatformAuthStore((s) => s.hasBootstrapped);
  const isLoading = usePlatformAuthStore((s) => s.isLoading);
  const user = usePlatformAuthStore((s) => s.user);

  const [email, setEmail] = React.useState("superadmin@tracquake.com");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!hasHydrated || !hasBootstrapped || isLoading) return;
    if (isAuthenticated && user?.isSuperuser) {
      router.replace("/superadmin");
    }
  }, [
    hasHydrated,
    hasBootstrapped,
    isLoading,
    isAuthenticated,
    user?.isSuperuser,
    router,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({
        email: email.trim().toLowerCase(),
        password,
      });
      router.replace("/superadmin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasHydrated || !hasBootstrapped || isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--bg-primary)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  if (isAuthenticated && user?.isSuperuser) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--bg-primary)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  return (
    <div className="quake-login-outer">
      <div className="quake-login-inner">
        <div className="quake-login-glow" aria-hidden />
        <div className="quake-login-grid" aria-hidden />
        <div className="relative z-10 min-h-dvh flex flex-col">
          <AuthShell
            title="Platform"
            subtitle="Owner console — sign in, manage orgs, sign out back here. Separate from shop /login."
            footer={undefined}
          >
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              {error ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  Email
                </span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] py-2.5 pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/50"
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  Password
                </span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] py-2.5 pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/50"
                  />
                </div>
              </label>

              <motion.button
                type="submit"
                disabled={isSubmitting}
                whileTap={{ scale: 0.98 }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Enter console"
                )}
              </motion.button>
            </form>
          </AuthShell>
        </div>
      </div>
    </div>
  );
}
