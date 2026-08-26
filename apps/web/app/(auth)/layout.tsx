import type { ReactNode } from "react";

/** Shared chrome for login, signup, forgot/reset password */
export default function AuthRouteLayout({ children }: { children: ReactNode }) {
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
