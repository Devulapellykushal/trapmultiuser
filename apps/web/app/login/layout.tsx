import type { ReactNode } from "react";

/** Login uses Indigo Bloom spec colors regardless of global light/dash theme */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="quake-login-outer">
      <div className="quake-login-inner">
        <div className="quake-login-glow" aria-hidden />
        <div className="quake-login-grid" aria-hidden />
        <div className="relative z-10 min-h-dvh flex flex-col">{children}</div>
      </div>
    </div>
  );
}
