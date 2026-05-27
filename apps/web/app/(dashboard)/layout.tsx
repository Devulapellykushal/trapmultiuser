"use client";

import * as React from "react";
import { Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Sidebar, TopBar } from "@/components/layout";
import { CommandPalette } from "@/components/layout/command-palette";
import { useAuth } from "@/lib/auth";
import { Toaster } from "sonner";

type DashboardRouteConfig = {
  title: string;
  subtitle?: string;
  showWarehouse?: boolean;
  showDateRange?: boolean;
  adminOnly?: boolean;
  managerOrAdmin?: boolean;
};

const routeTitles: Record<string, DashboardRouteConfig> = {
  "/": { title: "Dashboard", subtitle: "Overview of your business" },
  "/warehouses": {
    title: "Warehouses",
    subtitle: "Manage warehouse locations",
    adminOnly: true,
  },
  "/stores": {
    title: "Stores",
    subtitle: "Manage retail locations",
    adminOnly: true,
  },
  "/inventory": {
    title: "Inventory",
    subtitle: "Manage products and stock",
    showWarehouse: true,
  },
  "/purchase-orders": {
    title: "Purchase Orders",
    subtitle: "Receive stock from suppliers",
  },
  "/debit-credit-notes": {
    title: "Debit / Credit Notes",
    subtitle: "Adjustments and returns",
  },
  "/credit-sales": {
    title: "Credit Sales",
    subtitle: "Sales on credit and collections",
  },
  "/analytics": {
    title: "Analytics",
    subtitle: "Inventory, sales & performance insights",
    adminOnly: true,
  },
  "/reports": {
    title: "Reports",
    subtitle: "Dashboards & Visual Analytics",
    showDateRange: true,
    managerOrAdmin: true,
  },
  "/reports/inventory": {
    title: "Inventory Report",
    subtitle: "Stock levels & aging",
    showDateRange: true,
    managerOrAdmin: true,
  },
  "/reports/sales": {
    title: "Sales Report",
    subtitle: "Revenue & product performance",
    showDateRange: true,
    managerOrAdmin: true,
  },
  "/reports/returns": {
    title: "Returns Report",
    subtitle: "Refunds & adjustments",
    showDateRange: true,
    managerOrAdmin: true,
    adminOnly: true,
  },
  "/reports/profit": {
    title: "Profit & Tax",
    subtitle: "Margins & GST",
    showDateRange: true,
    managerOrAdmin: true,
    adminOnly: true,
  },
  "/reports/category": {
    title: "Category Report",
    subtitle: "Sales by product category",
    showDateRange: true,
    managerOrAdmin: true,
  },
  "/reports/brand": {
    title: "Brand Report",
    subtitle: "Sales by product brand",
    showDateRange: true,
    managerOrAdmin: true,
  },
  "/reports/size": {
    title: "Variant options",
    subtitle: "Sales by variant dimension (stored as size in API)",
    showDateRange: true,
    managerOrAdmin: true,
  },
  "/reports/supplier": {
    title: "Supplier Report",
    subtitle: "Purchases by supplier",
    showDateRange: true,
    managerOrAdmin: true,
  },
  "/reports/supplier-sales": {
    title: "Supplier Sales",
    subtitle: "Products sold by supplier",
    showDateRange: true,
    managerOrAdmin: true,
  },
  "/reports/warehouse": {
    title: "Warehouse Report",
    subtitle: "Sales by store location",
    showDateRange: true,
    managerOrAdmin: true,
  },
  "/invoices": { title: "Sales", subtitle: "Invoices and receipts" },
  "/customers": {
    title: "Customers",
    subtitle: "Customer directory",
  },
  "/settings": { title: "Settings", subtitle: "System configuration" },
  "/users": {
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

function resolveRouteConfig(pathname: string): DashboardRouteConfig {
  const exact = routeTitles[pathname];
  if (exact) return exact;

  if (pathname === "/reports" || pathname.startsWith("/reports/")) {
    return REPORT_FALLBACK;
  }

  if (pathname.startsWith("/stores/")) {
    return {
      title: "Store details",
      subtitle: "Profile, stock and alerts",
      adminOnly: true,
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
  const { isAuthenticated, isLoading, user, isAdmin } = useAuth();

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

  const routeConfig = resolveRouteConfig(pathname);

  // Redirect to login if not authenticated
  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Redirect STAFF from admin-only routes
  React.useEffect(() => {
    if (!isLoading && isAuthenticated && routeConfig.adminOnly && !isAdmin) {
      router.push("/");
    }
  }, [isLoading, isAuthenticated, isAdmin, routeConfig.adminOnly, router]);

  // Close mobile sidebar on route change
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Handle responsive collapse
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

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-primary)] mx-auto" />
          <p className="mt-4 text-[var(--text-muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)]">
      {/* Toast notifications */}
      <Toaster
        position="top-right"
        theme="system"
        toastOptions={{
          style: {
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          },
        }}
      />

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        userRole={user?.role ?? null}
      />

      {/* Sidebar */}
      <Sidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        isMobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        userRole={user?.role}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <TopBar
          title={routeConfig.title}
          subtitle={routeConfig.subtitle}
          onMenuClick={() => setMobileOpen(true)}
          onSearchClick={() => setCommandOpen(true)}
          showWarehouseSelector={routeConfig.showWarehouse}
          showDateRange={routeConfig.showDateRange}
          user={user}
        />

        {/* Page Content */}
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
