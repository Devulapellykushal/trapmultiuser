"use client";

import * as React from "react";
import { Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Sidebar, TopBar } from "@/components/layout";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { CommandPalette } from "@/components/layout/command-palette";
import { useAuth } from "@/lib/auth";
import { useLocationLabels, useWarehouses } from "@/hooks";
import { Toaster, toast } from "sonner";
import { ADMIN_BASE } from "@/lib/admin-routes";
import type { InventoryLocationMode } from "@/lib/business-location";
import { locationLabels } from "@/lib/business-location";
import {
  isServiceEnabled,
  serviceKeyForPath,
} from "@/lib/enabled-services";

type DashboardRouteConfig = {
  title: string;
  subtitle?: string;
  showWarehouse?: boolean;
  showDateRange?: boolean;
  adminOnly?: boolean;
  managerOrAdmin?: boolean;
};

const routeTitles: Record<string, DashboardRouteConfig> = {
  [ADMIN_BASE]: { title: "Dashboard", subtitle: "Overview of your business" },
  [`${ADMIN_BASE}/warehouses`]: {
    title: "Warehouses",
    subtitle: "Manage warehouse locations",
    adminOnly: true,
  },
  [`${ADMIN_BASE}/stores`]: {
    title: "Stores",
    subtitle: "Manage retail locations",
    adminOnly: true,
  },
  [`${ADMIN_BASE}/inventory`]: {
    title: "Inventory",
    subtitle: "Manage products and stock",
    showWarehouse: true,
  },
  [`${ADMIN_BASE}/purchase-orders`]: {
    title: "Purchase Orders",
    subtitle: "Receive stock from suppliers",
  },
  [`${ADMIN_BASE}/debit-credit-notes`]: {
    title: "Debit / Credit Notes",
    subtitle: "Adjustments and returns",
  },
  [`${ADMIN_BASE}/credit-sales`]: {
    title: "Credit Sales",
    subtitle: "Sales on credit and collections",
  },
  [`${ADMIN_BASE}/analytics`]: {
    title: "Analytics",
    subtitle: "Inventory, sales & performance insights",
    adminOnly: true,
  },
  [`${ADMIN_BASE}/reports`]: {
    title: "Reports",
    subtitle: "Dashboards & Visual Analytics",
    showDateRange: true,
    managerOrAdmin: true,
  },
  [`${ADMIN_BASE}/reports/inventory`]: {
    title: "Inventory Report",
    subtitle: "Stock levels & aging",
    showDateRange: true,
    managerOrAdmin: true,
  },
  [`${ADMIN_BASE}/reports/sales`]: {
    title: "Sales Report",
    subtitle: "Revenue & product performance",
    showDateRange: true,
    managerOrAdmin: true,
  },
  [`${ADMIN_BASE}/reports/returns`]: {
    title: "Returns Report",
    subtitle: "Refunds & adjustments",
    showDateRange: true,
    managerOrAdmin: true,
    adminOnly: true,
  },
  [`${ADMIN_BASE}/reports/profit`]: {
    title: "Profit & Tax",
    subtitle: "Margins & GST",
    showDateRange: true,
    managerOrAdmin: true,
    adminOnly: true,
  },
  [`${ADMIN_BASE}/reports/category`]: {
    title: "Category Report",
    subtitle: "Sales by product category",
    showDateRange: true,
    managerOrAdmin: true,
  },
  [`${ADMIN_BASE}/reports/brand`]: {
    title: "Brand Report",
    subtitle: "Sales by product brand",
    showDateRange: true,
    managerOrAdmin: true,
  },
  [`${ADMIN_BASE}/reports/size`]: {
    title: "Variant options",
    subtitle: "Sales by variant dimension (stored as size in API)",
    showDateRange: true,
    managerOrAdmin: true,
  },
  [`${ADMIN_BASE}/reports/supplier`]: {
    title: "Supplier Report",
    subtitle: "Purchases by supplier",
    showDateRange: true,
    managerOrAdmin: true,
  },
  [`${ADMIN_BASE}/reports/supplier-sales`]: {
    title: "Supplier Sales",
    subtitle: "Products sold by supplier",
    showDateRange: true,
    managerOrAdmin: true,
  },
  [`${ADMIN_BASE}/reports/warehouse`]: {
    title: "Warehouse Report",
    subtitle: "Sales by store location",
    showDateRange: true,
    managerOrAdmin: true,
  },
  [`${ADMIN_BASE}/invoices`]: { title: "Sales", subtitle: "Invoices and receipts" },
  [`${ADMIN_BASE}/customers`]: {
    title: "Customers",
    subtitle: "Directory, segments & outreach",
  },
  [`${ADMIN_BASE}/customers/segments`]: {
    title: "Segments",
    subtitle: "Ready lists for WhatsApp and Meta",
  },
  [`${ADMIN_BASE}/customers/outreach`]: {
    title: "Outreach",
    subtitle: "Templates, WhatsApp, Meta channels",
  },
  [`${ADMIN_BASE}/settings`]: { title: "Settings", subtitle: "System configuration" },
  [`${ADMIN_BASE}/users`]: {
    title: "User Management",
    subtitle: "Manage staff and admin accounts",
    adminOnly: true,
  },
};

const REPORT_FALLBACK: DashboardRouteConfig = {
  title: "Reports",
  subtitle: "Dashboards & Visual Analytics",
  showDateRange: true,
  managerOrAdmin: true,
};

const reportsPrefix = `${ADMIN_BASE}/reports`;

function resolveRouteConfig(
  pathname: string,
  mode: InventoryLocationMode,
  godownCount: number,
): DashboardRouteConfig {
  const nouns = locationLabels(mode);
  const exact = routeTitles[pathname];

  if (pathname === `${ADMIN_BASE}/warehouses`) {
    return {
      title: nouns.warehousePluralTitle,
      subtitle: nouns.warehousePageSubtitle,
      adminOnly: true,
    };
  }

  if (pathname === `${ADMIN_BASE}/stores`) {
    return {
      title: nouns.storePluralTitle,
      subtitle: nouns.storePageSubtitle,
      adminOnly: true,
    };
  }

  if (pathname === `${ADMIN_BASE}/reports/warehouse`) {
    return {
      title: mode === "GODOWN_AND_SHOPS" ? "Godown / shop report" : "Shop report",
      subtitle:
        mode === "GODOWN_AND_SHOPS"
          ? "Sales by godown and shop"
          : "Sales for your shop",
      showDateRange: true,
      managerOrAdmin: true,
    };
  }

  if (pathname === `${ADMIN_BASE}/inventory`) {
    return {
      title: "Inventory",
      subtitle: "Products and stock",
      // Filter only when 2+ godowns exist (no "All godowns" for a single godown)
      showWarehouse: godownCount > 1,
    };
  }

  if (exact) return exact;

  if (pathname === reportsPrefix || pathname.startsWith(`${reportsPrefix}/`)) {
    return REPORT_FALLBACK;
  }

  if (pathname.startsWith(`${ADMIN_BASE}/stores/`)) {
    return {
      title: `${nouns.storeSingularTitle} details`,
      subtitle: "Profile, stock and alerts",
      adminOnly: true,
    };
  }

  if (
    pathname.startsWith(`${ADMIN_BASE}/customers/`) &&
    pathname !== `${ADMIN_BASE}/customers/segments` &&
    pathname !== `${ADMIN_BASE}/customers/outreach`
  ) {
    return {
      title: "Customer",
      subtitle: "Profile and channels",
    };
  }

  return { title: "Page" };
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, user, isAdmin, hasHydrated, hasBootstrapped } =
    useAuth();
  const { mode } = useLocationLabels();
  const { data: warehouses = [] } = useWarehouses();
  const godownCount = warehouses.length;

  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const routeConfig = resolveRouteConfig(pathname, mode, godownCount);

  React.useEffect(() => {
    if (hasHydrated && hasBootstrapped && !isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [hasHydrated, hasBootstrapped, isLoading, isAuthenticated, router]);

  React.useEffect(() => {
    if (
      hasHydrated &&
      hasBootstrapped &&
      !isLoading &&
      isAuthenticated &&
      routeConfig.adminOnly &&
      !isAdmin
    ) {
      router.push(ADMIN_BASE);
    }
  }, [
    hasHydrated,
    hasBootstrapped,
    isLoading,
    isAuthenticated,
    isAdmin,
    routeConfig.adminOnly,
    router,
  ]);

  React.useEffect(() => {
    if (
      !hasHydrated ||
      !hasBootstrapped ||
      isLoading ||
      !isAuthenticated ||
      !user
    ) {
      return;
    }
    const key = serviceKeyForPath(pathname);
    if (!key) return;
    if (isServiceEnabled(user.enabledServices, key)) return;
    toast.error("This module is not enabled for your organization.");
    router.replace(ADMIN_BASE);
  }, [
    hasHydrated,
    hasBootstrapped,
    isLoading,
    isAuthenticated,
    user,
    pathname,
    router,
  ]);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const showShell = isAuthenticated && Boolean(user);

  if (!hasHydrated || !hasBootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-primary)]" />
      </div>
    );
  }

  if (isLoading && !showShell) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-primary)] mx-auto" />
          <p className="mt-4 text-[var(--text-muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!showShell) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)]">
      <NavigationProgress />
      <Toaster
        position="top-right"
        theme="system"
        richColors
        closeButton
        toastOptions={{
          className: "quake-toast",
          style: {
            background: "var(--bg-modal)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          },
        }}
      />

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        userRole={user?.role ?? null}
      />

      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        isMobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        userRole={user?.role}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title={routeConfig.title}
          subtitle={routeConfig.subtitle}
          onMenuClick={() => setMobileOpen(true)}
          onSearchClick={() => setCommandOpen(true)}
          showWarehouseSelector={routeConfig.showWarehouse}
          showDateRange={routeConfig.showDateRange}
          user={user}
        />

        <main className="flex-1 overflow-auto">
          <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-6">
            <Suspense
              fallback={
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-primary)]" />
                </div>
              }
            >
              {children}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
