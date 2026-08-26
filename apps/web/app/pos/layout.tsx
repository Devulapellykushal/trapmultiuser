"use client";

import { ArrowLeft, Building2, Loader2, Store, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ADMIN_BASE } from "@/lib/admin-routes";
import { QUAKE_LOGO_SRC } from "@/lib/brand-colors";
import { usePosStore } from "@/features/pos/store/usePosStore";
import { useAuth } from "@/lib/auth";
import { isServiceEnabled } from "@/lib/enabled-services";

export default function POSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const headerLocation = usePosStore((s) => s.headerLocation);
  const { user, isAuthenticated, isLoading, hasHydrated, hasBootstrapped } =
    useAuth();

  React.useEffect(() => {
    if (!hasHydrated || !hasBootstrapped || isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login?next=/pos");
      return;
    }
    if (!isServiceEnabled(user?.enabledServices, "pos")) {
      router.replace(ADMIN_BASE);
    }
  }, [
    hasHydrated,
    hasBootstrapped,
    isLoading,
    isAuthenticated,
    user?.enabledServices,
    router,
  ]);

  if (
    !hasHydrated ||
    !hasBootstrapped ||
    isLoading ||
    !isAuthenticated ||
    !isServiceEnabled(user?.enabledServices, "pos")
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-primary)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-primary)]">
      <header className="flex items-center justify-between h-14 px-4 bg-[var(--bg-surface)] backdrop-blur-xl border-b border-[var(--border-default)]">
        <div className="flex items-center gap-4">
          <Link
            href={ADMIN_BASE}
            className="flex items-center gap-2 px-3 py-2 -ml-2 rounded-lg text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 stroke-[1.5]" />
            <span className="text-sm hidden sm:inline">Exit POS</span>
          </Link>

          <div className="h-6 w-px bg-[var(--border-default)]" />

          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={QUAKE_LOGO_SRC}
              alt=""
              className="h-8 w-[2.9rem] object-contain shrink-0"
            />
            <span className="font-display font-semibold text-lg tracking-wide text-[var(--text-primary)] truncate">
              Quake POS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm min-w-0">
          {headerLocation ? (
            <>
              <Store className="w-4 h-4 shrink-0 text-[var(--text-muted)] stroke-[1.5]" />
              <span className="text-[var(--text-secondary)] truncate">
                {headerLocation}
              </span>
            </>
          ) : (
            <>
              <Building2 className="w-4 h-4 shrink-0 text-[var(--text-muted)] stroke-[1.5]" />
              <span className="text-[var(--text-muted)]">Select shop</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[var(--brand-muted)] flex items-center justify-center ring-2 ring-[var(--brand)]/30">
            <User className="w-4 h-4 text-[var(--brand)] stroke-[1.5]" />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
