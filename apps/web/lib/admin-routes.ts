/** Base path for the authenticated inventory / POS admin UI. */
export const ADMIN_BASE = "/admin";

/** Build an admin URL from a path segment (e.g. "/inventory" -> "/admin/inventory"). */
export function adminHref(path: string): string {
  if (!path || path === "/") return ADMIN_BASE;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${ADMIN_BASE}${p}`;
}
