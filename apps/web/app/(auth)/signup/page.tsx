"use client";

import { AuthShell } from "@/components/auth";
import { ADMIN_BASE } from "@/lib/admin-routes";
import { authService, useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

export default function SignupPage() {
  const router = useRouter();
  const { register, isAuthenticated } = useAuth();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [signupEnabled, setSignupEnabled] = React.useState<boolean | null>(null);
  const [createdName, setCreatedName] = React.useState<string | null>(null);

  React.useEffect(() => {
    authService
      .getCapabilities()
      .then((c) => setSignupEnabled(c.publicSignupEnabled))
      .catch(() => setSignupEnabled(true));
  }, []);

  React.useEffect(() => {
    if (isAuthenticated && createdName) {
      router.replace(ADMIN_BASE);
    }
  }, [isAuthenticated, createdName, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Email is required");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        email: normalizedEmail,
        password,
        name: name.trim() || undefined,
      });
      setCreatedName(name.trim() || normalizedEmail.split("@")[0]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign up failed";
      if (message.toLowerCase().includes("already exists")) {
        setError(`${message} Sign in instead.`);
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (signupEnabled === null) {
    return (
      <div className="flex flex-1 min-h-dvh items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  if (!signupEnabled) {
    return (
      <AuthShell
        title="Sign up unavailable"
        subtitle="Public registration is disabled. Ask your administrator for an account."
        footer={
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--brand)] hover:underline font-medium">
              Sign in
            </Link>
          </>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Contact your shop admin to get access.
        </p>
      </AuthShell>
    );
  }

  if (createdName && isAuthenticated) {
    return (
      <AuthShell
        title="Account ready"
        subtitle={`Welcome, ${createdName}. Opening your dashboard…`}
      >
        <div className="flex flex-col items-center gap-4 py-4">
          <CheckCircle2 className="w-12 h-12 text-[var(--success)]" />
          <Loader2 className="w-6 h-6 animate-spin text-[var(--brand)]" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Sign up with your email. You'll be signed in automatically."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--brand)] hover:underline font-medium">
            Sign in
          </Link>
        </>
      }
    >
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-3 mb-4 rounded-lg bg-[var(--danger-muted)] border border-[var(--danger)]/35"
        >
          <AlertCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--danger)]">
            <p>{error}</p>
            {error.toLowerCase().includes("sign in") ? (
              <Link href="/login" className="underline font-medium mt-1 inline-block">
                Go to sign in
              </Link>
            ) : null}
          </div>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
            Name <span className="text-[var(--text-muted)] font-normal">(optional)</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Your name"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
          </div>
        </div>

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
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
            Password
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
              placeholder="At least 8 characters"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
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
              placeholder="Repeat password"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
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
              Creating account…
            </>
          ) : (
            "Create account & continue"
          )}
        </button>
      </form>
    </AuthShell>
  );
}
