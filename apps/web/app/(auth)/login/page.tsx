"use client";

import { AuthShell } from "@/components/auth";
import { ADMIN_BASE } from "@/lib/admin-routes";
import { authService, useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Suspense } from "react";

function getSafePostLoginPath(nextParam: string | null): string {
  if (nextParam == null || nextParam === "") return ADMIN_BASE;
  let decoded: string;
  try {
    decoded = decodeURIComponent(nextParam.trim());
  } catch {
    return ADMIN_BASE;
  }
  const pathOnly = decoded.split("?")[0].split("#")[0];
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//")) return ADMIN_BASE;
  // Platform console has its own login — never send shop sessions there
  if (pathOnly === "/superadmin" || pathOnly.startsWith("/superadmin/")) {
    return ADMIN_BASE;
  }
  if (pathOnly === "/admin" || pathOnly.startsWith("/admin/")) return decoded;
  if (pathOnly === "/pos" || pathOnly.startsWith("/pos/")) return decoded;
  return ADMIN_BASE;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, hasHydrated, hasBootstrapped, isLoading } =
    useAuth();

  const safeNext = React.useMemo(
    () => getSafePostLoginPath(searchParams.get("next")),
    [searchParams],
  );

  const justRegistered = searchParams.get("registered") === "1";
  const emailFromQuery = searchParams.get("email")?.trim().toLowerCase() ?? "";

  const [email, setEmail] = React.useState(emailFromQuery);
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [caps, setCaps] = React.useState<{
    publicSignupEnabled: boolean;
    passwordResetEnabled: boolean;
  } | null>(null);

  React.useEffect(() => {
    if (emailFromQuery) {
      setEmail(emailFromQuery);
    }
  }, [emailFromQuery]);

  React.useEffect(() => {
    authService
      .getCapabilities()
      .then((c) =>
        setCaps({
          publicSignupEnabled: c.publicSignupEnabled,
          passwordResetEnabled: c.passwordResetEnabled,
        }),
      )
      .catch(() =>
        setCaps({ publicSignupEnabled: true, passwordResetEnabled: true }),
      );
  }, []);

  React.useEffect(() => {
    if (!hasHydrated || !hasBootstrapped || isLoading) return;
    if (isAuthenticated) {
      router.replace(safeNext);
    }
  }, [
    hasHydrated,
    hasBootstrapped,
    isLoading,
    isAuthenticated,
    router,
    safeNext,
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
      router.replace(safeNext);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasHydrated || !hasBootstrapped || isLoading || isAuthenticated) {
    return (
      <div className="flex flex-1 min-h-dvh items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Shop accounts only. Sign in, use the portal, then sign out to return here."
      footer={
        caps?.publicSignupEnabled ? (
          <>
            New here?{" "}
            <Link
              href="/signup"
              className="text-[var(--brand)] hover:underline font-medium"
            >
              Create an account
            </Link>
          </>
        ) : undefined
      }
    >
      {justRegistered ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-[var(--success-muted)] border border-[var(--success)]/35"
        >
          <CheckCircle2 className="w-5 h-5 text-[var(--success)] flex-shrink-0" />
          <p className="text-sm text-[var(--text-secondary)]">
            Account created. Sign in with your email and password.
          </p>
        </motion.div>
      ) : null}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-[var(--danger-muted)] border border-[var(--danger)]/35"
        >
          <AlertCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0" />
          <p className="text-sm text-[var(--text-secondary)]">
            {error}
            {error.includes("/superadmin/login") ? (
              <>
                {" "}
                <Link
                  href="/superadmin/login"
                  className="text-[var(--brand)] underline font-medium"
                >
                  Open platform login
                </Link>
              </>
            ) : null}
          </p>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 p-6 pt-2">
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

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-[var(--text-muted)] hover:text-[var(--brand)]"
          >
            Forgot password?
          </Link>
        </div>

        <motion.button
          type="submit"
          disabled={isSubmitting}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-primary)] disabled:opacity-60"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Sign in"
          )}
        </motion.button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 min-h-dvh items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
