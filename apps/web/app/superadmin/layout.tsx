import type { ReactNode } from "react";

export default function SuperadminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {children}
    </div>
  );
}
