/**
 * Organization module entitlements (superadmin toggles).
 * Keys align with Organization.enabled_services / sidebar ids.
 */

export const SERVICE_KEYS = [
  "pos",
  "warehouses",
  "stores",
  "inventory",
  "customers",
  "sales",
  "reports",
  "analytics",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export type EnabledServices = Partial<Record<ServiceKey, boolean>>;

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  pos: "POS",
  warehouses: "Warehouses / Godown",
  stores: "Stores",
  inventory: "Inventory",
  customers: "Customers (CRM)",
  sales: "Sales",
  reports: "Reports",
  analytics: "Analytics",
};

/** Default: all on (matches backend). */
export const DEFAULT_ENABLED_SERVICES: Record<ServiceKey, boolean> =
  Object.fromEntries(SERVICE_KEYS.map((k) => [k, true])) as Record<
    ServiceKey,
    boolean
  >;

export function mergeEnabledServices(
  raw?: EnabledServices | null,
): Record<ServiceKey, boolean> {
  const merged = { ...DEFAULT_ENABLED_SERVICES };
  if (raw && typeof raw === "object") {
    for (const key of SERVICE_KEYS) {
      if (key in raw) merged[key] = Boolean(raw[key]);
    }
  }
  return merged;
}

export function isServiceEnabled(
  services: EnabledServices | null | undefined,
  key: ServiceKey,
): boolean {
  return mergeEnabledServices(services)[key] !== false;
}

/**
 * Map dashboard / POS pathnames to a service key.
 * Returns null for always-on routes (dashboard, settings, users).
 */
export function serviceKeyForPath(pathname: string): ServiceKey | null {
  if (pathname.startsWith("/pos")) return "pos";
  if (pathname.startsWith("/admin/customers")) return "customers";
  if (pathname.startsWith("/admin/reports")) return "reports";
  if (pathname.startsWith("/admin/analytics")) return "analytics";
  if (pathname.startsWith("/admin/inventory")) return "inventory";
  if (pathname.startsWith("/admin/invoices")) return "sales";
  if (pathname.startsWith("/admin/credit-sales")) return "sales";
  if (pathname.startsWith("/admin/warehouses")) return "warehouses";
  if (pathname.startsWith("/admin/stores")) return "stores";
  if (pathname.startsWith("/admin/purchase-orders")) return "inventory";
  if (pathname.startsWith("/admin/debit-credit-notes")) return "inventory";
  return null;
}
