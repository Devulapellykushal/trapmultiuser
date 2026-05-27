"use client";

import { ArrowLeft, Building2, User } from "lucide-react";
import Link from "next/link";
import { ADMIN_BASE } from "@/lib/admin-routes";

export default function POSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-primary)]">
      {/* POS Header - Minimal */}
      <header className="flex items-center justify-between h-14 px-4 bg-[var(--bg-surface)] backdrop-blur-xl border-b border-[var(--border-default)]">
        {/* Left - Back & Brand */}
        <div className="flex items-center gap-4">
          <Link
            href={ADMIN_BASE}
            className="flex items-center gap-2 px-3 py-2 -ml-2 rounded-lg text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 stroke-[1.5]" />
            <span className="text-sm hidden sm:inline">Exit POS</span>
          </Link>
          
          <div className="h-6 w-px bg-[var(--border-default)]" />
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg [background:var(--grad-brand-diagonal)] flex items-center justify-center">
              <span className="text-white font-bold text-sm">T</span>
            </div>
            <span className="font-semibold text-[var(--text-primary)]">Quake POS</span>
          </div>
        </div>

        {/* Center - Warehouse */}
        <div className="flex items-center gap-2 text-sm">
          <Building2 className="w-4 h-4 text-[var(--text-muted)] stroke-[1.5]" />
          <span className="text-[var(--text-secondary)]">Main Warehouse</span>
        </div>

        {/* Right - User */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#6366F1]/20 flex items-center justify-center ring-2 ring-[#6366F1]/30">
            <User className="w-4 h-4 text-[#6366F1] stroke-[1.5]" />
          </div>
        </div>
      </header>

      {/* POS Content - Full Width */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
