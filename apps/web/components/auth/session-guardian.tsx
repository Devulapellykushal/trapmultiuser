"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { authService } from "@/lib/auth/auth.service";
import { useAuthStore } from "@/lib/auth/auth.store";
import { usePlatformAuthStore } from "@/lib/auth/platform-auth.store";
import {
  getLocalSessionVerdict,
  isAccessTokenFresh,
  msUntilProactiveRefresh,
  touchSessionActivity,
  endSession,
} from "@/lib/auth/session-lifecycle";
import { getAuthScopeFromPath, type AuthScope } from "@/lib/auth/session-scope";
import { withAuthScope } from "@/lib/api/client";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "touchstart",
  "scroll",
] as const;

/**
 * Keeps the active route-scope session healthy:
 * - bumps idle clock on user activity
 * - ends session on idle / absolute refresh expiry
 * - proactively refreshes access before JWT exp
 */
export function SessionGuardian() {
  const pathname = usePathname();
  const scope = getAuthScopeFromPath(pathname);
  const tenantAuthed = useAuthStore((s) => s.isAuthenticated);
  const platformAuthed = usePlatformAuthStore((s) => s.isAuthenticated);
  const isAuthed = scope === "platform" ? platformAuthed : tenantAuthed;

  useEffect(() => {
    if (!isAuthed) return;

    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let activityThrottle: ReturnType<typeof setTimeout> | null = null;

    const clearRefreshTimer = () => {
      if (refreshTimer != null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    };

    const enforceLocalRules = (): boolean => {
      const verdict = getLocalSessionVerdict(scope);
      if (!verdict.ok) {
        wipeStore(scope);
        endSession(scope, verdict.reason);
        return false;
      }
      return true;
    };

    const scheduleProactiveRefresh = () => {
      clearRefreshTimer();
      if (!enforceLocalRules()) return;

      if (isAccessTokenFresh(scope)) {
        const wait = msUntilProactiveRefresh(scope);
        if (wait == null) return;
        refreshTimer = setTimeout(() => {
          void runProactiveRefresh();
        }, wait);
        return;
      }

      void runProactiveRefresh();
    };

    const runProactiveRefresh = async () => {
      if (disposed) return;
      if (!enforceLocalRules()) return;
      try {
        await withAuthScope(scope, () => authService.refresh(scope));
        touchSessionActivity(scope);
        if (!disposed) scheduleProactiveRefresh();
      } catch {
        if (disposed) return;
        wipeStore(scope);
        endSession(scope, "session_expired");
      }
    };

    const onActivity = () => {
      if (activityThrottle) return;
      activityThrottle = setTimeout(() => {
        activityThrottle = null;
      }, 15_000);
      touchSessionActivity(scope);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!enforceLocalRules()) return;
      scheduleProactiveRefresh();
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);

    const tick = window.setInterval(() => {
      enforceLocalRules();
    }, 60_000);

    scheduleProactiveRefresh();

    return () => {
      disposed = true;
      clearRefreshTimer();
      if (activityThrottle) clearTimeout(activityThrottle);
      window.clearInterval(tick);
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname, scope, isAuthed]);

  return null;
}

function wipeStore(scope: AuthScope): void {
  if (scope === "platform") {
    usePlatformAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      hasBootstrapped: true,
    });
  } else {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      hasBootstrapped: true,
    });
  }
}
