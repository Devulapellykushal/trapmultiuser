/** Demo / default API when `VITE_API_BASE_URL` is missing in production (Vite only inlines env at build time). */
const DEMO_API_BASE = 'https://trapmultiuser.onrender.com';

/**
 * Backend origin for API routes (no trailing slash).
 * - Dev: empty → same-origin `/api/*` via Vite proxy to FastAPI on :8000.
 * - Prod: `VITE_API_BASE_URL` if set; otherwise `DEMO_API_BASE` so Vercel demos work without env.
 */
export function getApiBase() {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw && typeof raw === 'string') {
    let base = raw.trim();
    if (base) {
      while (base.endsWith('/')) {
        base = base.slice(0, -1);
      }
      return base;
    }
  }
  if (import.meta.env.PROD) {
    return DEMO_API_BASE;
  }
  return '';
}

/** Absolute URL for an API path (path must start with `/`). */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBase();
  return base ? `${base}${p}` : p;
}
