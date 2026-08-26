/**
 * Dual auth sessions: tenant (shops) vs platform (product owner /superadmin).
 * Tokens and Zustand stores stay fully isolated — flows never merge.
 *
 * Tenant:   /login → /admin|/pos → logout → /login
 * Platform: /superadmin/login → /superadmin → logout → /superadmin/login
 */

export type AuthScope = "tenant" | "platform";

export const TENANT_ACCESS_TOKEN_KEY = "Quake_access_token";
export const TENANT_REFRESH_TOKEN_KEY = "Quake_refresh_token";
export const PLATFORM_ACCESS_TOKEN_KEY = "Quake_platform_access_token";
export const PLATFORM_REFRESH_TOKEN_KEY = "Quake_platform_refresh_token";

export const TENANT_AUTH_PERSIST_KEY = "Quake-auth";
export const PLATFORM_AUTH_PERSIST_KEY = "Quake-platform-auth";

export function getAuthScopeFromPath(pathname?: string): AuthScope {
  const path =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");
  return path.startsWith("/superadmin") ? "platform" : "tenant";
}

export function accessTokenKey(scope: AuthScope): string {
  return scope === "platform"
    ? PLATFORM_ACCESS_TOKEN_KEY
    : TENANT_ACCESS_TOKEN_KEY;
}

export function refreshTokenKey(scope: AuthScope): string {
  return scope === "platform"
    ? PLATFORM_REFRESH_TOKEN_KEY
    : TENANT_REFRESH_TOKEN_KEY;
}

export function persistKey(scope: AuthScope): string {
  return scope === "platform"
    ? PLATFORM_AUTH_PERSIST_KEY
    : TENANT_AUTH_PERSIST_KEY;
}

export function readAccessToken(scope: AuthScope): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(accessTokenKey(scope));
}

export function readRefreshToken(scope: AuthScope): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(refreshTokenKey(scope));
}

export function storeSessionTokens(
  scope: AuthScope,
  access: string,
  refresh: string,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(accessTokenKey(scope), access);
  localStorage.setItem(refreshTokenKey(scope), refresh);
}

export function clearSessionTokens(scope: AuthScope): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(accessTokenKey(scope));
  localStorage.removeItem(refreshTokenKey(scope));
}

export function clearPersistedAuth(scope: AuthScope): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(persistKey(scope));
}

export function loginPathForScope(scope: AuthScope): string {
  return scope === "platform" ? "/superadmin/login" : "/login";
}

export function portalPathForScope(scope: AuthScope): string {
  return scope === "platform" ? "/superadmin" : "/admin";
}

/** Hard navigate to the login page for this scope only. */
export function redirectToLogin(scope: AuthScope): void {
  if (typeof window === "undefined") return;
  window.location.assign(loginPathForScope(scope));
}
