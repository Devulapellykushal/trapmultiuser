/**
 * Customers — Phase 1 (prompt.md / detailedroadmap).
 * Placeholder route so sidebar “Customers” does not 404; extend with list + API later.
 */
"use client";

import { PageTransition } from "@/components/layout";
import { UserRound } from "lucide-react";

export default function CustomersPage() {
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <UserRound className="w-8 h-8 text-[var(--accent-primary)]" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              Customers
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Customer directory and history will appear here (Phase 1 scope).
            </p>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
