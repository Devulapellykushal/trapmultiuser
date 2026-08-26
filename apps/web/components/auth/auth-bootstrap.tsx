"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth.store";
import { usePlatformAuthStore } from "@/lib/auth/platform-auth.store";
import { getAuthScopeFromPath } from "@/lib/auth/session-scope";
import { SessionGuardian } from "./session-guardian";

/**
 * Validate only the session for the current route family.
 * Never runs platform checkAuth on shop pages (and vice versa).
 */
export function AuthBootstrap() {
  const pathname = usePathname();

  useEffect(() => {
    const scope = getAuthScopeFromPath(pathname);
    if (scope === "platform") {
      void usePlatformAuthStore.getState().checkAuth();
    } else {
      void useAuthStore.getState().checkAuth();
    }
  }, [pathname]);

  return <SessionGuardian />;
}
