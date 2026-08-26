/**
 * Universal session lifecycle for tenant + platform scopes.
 *
 * WHEN THE SESSION STAYS ALIVE
 * - Access JWT is valid (or quietly refreshed with refresh JWT)
 * - User is active within idle window
 * - Refresh JWT has not hit its absolute expiry
 *
 * WHEN THE SESSION ENDS
 * - logout:          user clicked Sign out → blacklist refresh, clear local, go to login
 * - session_expired: refresh JWT invalid/expired (absolute ceiling) → clear, go to login
 * - idle:            no activity for idle timeout → clear, go to login
 * - invalid:         tokens missing/corrupt after checkAuth → clear, go to login
 *
 * Access expiry alone does NOT end the session — the client refreshes first.
 */

import {
  AuthScope,
  clearPersistedAuth,
  clearSessionTokens,
  getAuthScopeFromPath,
  loginPathForScope,
  readAccessToken,
  readRefreshToken,
  storeSessionTokens,
} from "./session-scope";

export type SessionEndReason =
  | "logout"
  | "session_expired"
  | "idle"
  | "invalid";

/** Idle timeout: no clicks/keys/API for this long → end session. */
export const IDLE_TIMEOUT_MS: Record<AuthScope, number> = {
  tenant: 8 * 60 * 60 * 1000, // shop day — 8 hours
  platform: 4 * 60 * 60 * 1000, // owner console — 4 hours
};

/** Refresh access a bit before JWT exp to avoid mid-click 401s. */
const ACCESS_REFRESH_SKEW_MS = 90 * 1000;

const META_KEY: Record<AuthScope, string> = {
  tenant: "Quake_tenant_session_meta",
  platform: "Quake_platform_session_meta",
};

type SessionMeta = {
  loginAt: number;
  lastActivityAt: number;
};

function readMeta(scope: AuthScope): SessionMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(META_KEY[scope]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionMeta;
    if (
      typeof parsed.loginAt !== "number" ||
      typeof parsed.lastActivityAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeMeta(scope: AuthScope, meta: SessionMeta): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(META_KEY[scope], JSON.stringify(meta));
}

export function clearSessionMeta(scope: AuthScope): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(META_KEY[scope]);
}

/** Call after a successful login for this scope. */
export function markSessionStarted(scope: AuthScope): void {
  const now = Date.now();
  writeMeta(scope, { loginAt: now, lastActivityAt: now });
}

/** Bump activity (user input or successful authenticated API). */
export function touchSessionActivity(scope: AuthScope): void {
  const existing = readMeta(scope);
  const now = Date.now();
  writeMeta(scope, {
    loginAt: existing?.loginAt ?? now,
    lastActivityAt: now,
  });
}

export function decodeJwtExpiryMs(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isAccessTokenFresh(
  scope: AuthScope,
  skewMs = ACCESS_REFRESH_SKEW_MS,
): boolean {
  const access = readAccessToken(scope);
  if (!access) return false;
  const exp = decodeJwtExpiryMs(access);
  if (exp == null) return false;
  return exp - Date.now() > skewMs;
}

export function isRefreshTokenAlive(scope: AuthScope): boolean {
  const refresh = readRefreshToken(scope);
  if (!refresh) return false;
  const exp = decodeJwtExpiryMs(refresh);
  if (exp == null) return Boolean(refresh);
  return exp > Date.now();
}

export function isIdleTimedOut(scope: AuthScope): boolean {
  const meta = readMeta(scope);
  if (!meta) return false;
  return Date.now() - meta.lastActivityAt > IDLE_TIMEOUT_MS[scope];
}

/**
 * Decide if this scope's session is still usable without hitting the API.
 * Returns a reason when it should end.
 */
export function getLocalSessionVerdict(
  scope: AuthScope,
): { ok: true } | { ok: false; reason: SessionEndReason } {
  if (!readRefreshToken(scope) && !readAccessToken(scope)) {
    return { ok: false, reason: "invalid" };
  }
  if (!isRefreshTokenAlive(scope)) {
    return { ok: false, reason: "session_expired" };
  }
  if (isIdleTimedOut(scope)) {
    return { ok: false, reason: "idle" };
  }
  return { ok: true };
}

export function applyRotatedTokens(
  scope: AuthScope,
  access: string,
  refresh?: string | null,
): void {
  const prevRefresh = readRefreshToken(scope);
  storeSessionTokens(scope, access, refresh || prevRefresh || "");
  touchSessionActivity(scope);
}

/**
 * End one session cleanly. Redirects only when the user is on that scope's routes.
 */
export function endSession(
  scope: AuthScope,
  reason: SessionEndReason,
  options?: { redirect?: boolean },
): void {
  if (typeof window === "undefined") return;

  clearSessionTokens(scope);
  clearSessionMeta(scope);
  clearPersistedAuth(scope);
  if (scope === "tenant") {
    localStorage.removeItem("quake-pos-v1");
  }

  const shouldRedirect =
    options?.redirect !== false && getAuthScopeFromPath() === scope;
  if (!shouldRedirect) return;

  const login = loginPathForScope(scope);
  const q =
    reason === "logout"
      ? ""
      : `?reason=${encodeURIComponent(reason)}`;
  window.location.assign(`${login}${q}`);
}

export function sessionReasonMessage(reason: string | null): string | null {
  switch (reason) {
    case "session_expired":
      return "Your session expired. Please sign in again.";
    case "idle":
      return "You were signed out after a period of inactivity.";
    case "invalid":
      return "Please sign in to continue.";
    case "logout":
      return null;
    default:
      return null;
  }
}

/** ms until we should proactively refresh access (null = no access / already stale). */
export function msUntilProactiveRefresh(scope: AuthScope): number | null {
  const access = readAccessToken(scope);
  if (!access) return null;
  const exp = decodeJwtExpiryMs(access);
  if (exp == null) return null;
  return Math.max(5_000, exp - Date.now() - ACCESS_REFRESH_SKEW_MS);
}
