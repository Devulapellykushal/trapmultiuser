"use client";

import { ADMIN_BASE } from "@/lib/admin-routes";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Lock,
  Mail,
  Shield,
  UserCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Suspense } from "react";

const DEMO_ADMIN_EMAIL = "admin@thirumalawheels.com";
const DEMO_STAFF_EMAIL = "staff@thirumalawheels.com";

type LoginRole = "ADMIN" | "STAFF";

/** Only same-origin app paths; blocks open redirects. */
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
  if (pathOnly === "/admin" || pathOnly.startsWith("/admin/")) return decoded;
  return ADMIN_BASE;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const safeNext = React.useMemo(
    () => getSafePostLoginPath(searchParams.get("next")),
    [searchParams]
  );

  const [loginRole, setLoginRole] = React.useState<LoginRole>("ADMIN");
  const [email, setEmail] = React.useState(DEMO_ADMIN_EMAIL);
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const setRoleAndMaybeEmail = React.useCallback((role: LoginRole) => {
    setLoginRole(role);
    setEmail((prev) => {
      const trimmed = prev.trim().toLowerCase();
      if (
        trimmed === "" ||
        trimmed === DEMO_ADMIN_EMAIL.toLowerCase() ||
        trimmed === DEMO_STAFF_EMAIL.toLowerCase()
      ) {
        return role === "ADMIN" ? DEMO_ADMIN_EMAIL : DEMO_STAFF_EMAIL;
      }
      return prev;
    });
  }, []);

  React.useEffect(() => {
    if (isAuthenticated && !authLoading) {
      router.push(safeNext);
    }
  }, [isAuthenticated, authLoading, router, safeNext]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ email, password, role: loginRole });
      router.push(safeNext);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex flex-1 min-h-dvh items-center justify-center bg-[#111111]">
        <Loader2 className="w-8 h-8 animate-spin text-[#6366F1]" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 min-h-dvh items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="fixed left-4 top-4 z-20 inline-flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.35)] px-3 py-2 text-sm text-[rgba(255,255,255,0.65)] backdrop-blur-md transition-colors hover:border-[rgba(255,255,255,0.18)] hover:text-[#F5F0E8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]/60"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Back to home
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border border-[rgba(99,102,241,0.15)] bg-[rgba(0,0,0,0.2)] p-2 sm:h-[5.25rem] sm:w-[5.25rem]">
            <Image
              src="/assets/2d/aio.png"
              alt="Quake"
              width={168}
              height={168}
              className="h-full w-full object-contain drop-shadow-md"
              priority
            />
          </div>
          <h1 className="text-3xl font-bold text-[#F5F0E8]">Quake</h1>
          <p className="text-sm mt-1 text-[rgba(255,255,255,0.35)]">
            Inventory Management System
          </p>
        </div>

        <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.015)] backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-[rgba(255,255,255,0.85)] mb-6">
              Sign in to your account
            </h2>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-[rgba(236,72,153,0.15)] border border-[rgba(236,72,153,0.3)]"
              >
                <AlertCircle className="w-5 h-5 text-[#EC4899] flex-shrink-0" />
                <p className="text-sm text-[#EC4899]">{error}</p>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <span className="block text-sm font-medium text-[rgba(255,255,255,0.5)] mb-2">
                  Sign in as
                </span>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
                  <button
                    type="button"
                    onClick={() => setRoleAndMaybeEmail("ADMIN")}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg text-sm font-medium transition-all ${
                      loginRole === "ADMIN"
                        ? "bg-[#6366F1] text-white shadow-lg shadow-[#6366F1]/25"
                        : "text-[rgba(255,255,255,0.55)] hover:text-[rgba(255,255,255,0.85)]"
                    }`}
                  >
                    <Shield className="w-5 h-5" strokeWidth={1.75} />
                    Administrator
                    <span className="text-[10px] font-normal opacity-80 leading-tight text-center">
                      Full catalog &amp; settings
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleAndMaybeEmail("STAFF")}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg text-sm font-medium transition-all ${
                      loginRole === "STAFF"
                        ? "bg-[#6366F1] text-white shadow-lg shadow-[#6366F1]/25"
                        : "text-[rgba(255,255,255,0.55)] hover:text-[rgba(255,255,255,0.85)]"
                    }`}
                  >
                    <UserCircle className="w-5 h-5" strokeWidth={1.75} />
                    Staff
                    <span className="text-[10px] font-normal opacity-80 leading-tight text-center">
                      POS &amp; day-to-day
                    </span>
                  </button>
                </div>
                <p className="text-xs text-[rgba(255,255,255,0.35)] mt-2">
                  Must match the role on your account — the app then shows the right actions.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[rgba(255,255,255,0.5)] mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[rgba(255,255,255,0.35)]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="admin@thirumalawheels.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[#F5F0E8] placeholder:text-[rgba(255,255,255,0.35)] focus:outline-none focus:ring-2 focus:ring-[#6366F1] focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[rgba(255,255,255,0.5)] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[rgba(255,255,255,0.35)]" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[#F5F0E8] placeholder:text-[rgba(255,255,255,0.35)] focus:outline-none focus:ring-2 focus:ring-[#6366F1] focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-[#FFFFFF] font-semibold transition-opacity hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed [background:linear-gradient(135deg,#6366F1,#A855F7,#EC4899)]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          </div>

          {/* <div className="px-6 py-4 bg-[rgba(255,255,255,0.04)] border-t border-[rgba(255,255,255,0.06)]">
            <p className="text-xs text-center text-[rgba(255,255,255,0.35)]">
              Test accounts (seeded on migrate):{" "}
              <span className="text-[rgba(255,255,255,0.5)]">admin@thirumalawheels.com</span> /{" "}
              <span className="text-[rgba(255,255,255,0.5)]">staff@thirumalawheels.com</span> — password{" "}
              <span className="text-[rgba(255,255,255,0.5)]">Kushal@12</span> for both
            </p>
          </div> */}
        </div>
      </motion.div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="flex flex-1 min-h-dvh items-center justify-center bg-[#111111]">
      <Loader2 className="w-8 h-8 animate-spin text-[#6366F1]" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
