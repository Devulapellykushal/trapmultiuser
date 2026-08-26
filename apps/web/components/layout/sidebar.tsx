"use client";

import { useThemeStore } from "@/hooks/use-theme";
import { useLocationLabels } from "@/hooks/use-business-setup";
import { useAuthStore } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { ADMIN_BASE, adminHref } from "@/lib/admin-routes";
import { QUAKE_LOGO_SRC } from "@/lib/brand-colors";
import type { InventoryLocationMode } from "@/lib/business-location";
import { locationLabels } from "@/lib/business-location";
import { isServiceEnabled, type EnabledServices } from "@/lib/enabled-services";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  /** Used to filter by business stock setup / org entitlements */
  id?: "warehouses" | "stores" | "pos" | "inventory" | "customers" | "sales" | "reports" | string;
  /** Organization.enabled_services key; omit for always-on (Dashboard, Settings) */
  serviceKey?: "pos" | "warehouses" | "stores" | "inventory" | "customers" | "sales" | "reports" | "analytics";
}

/** Build nav for the current business setup (plain-language labels). */
export function getSidebarNavItems(
  mode: InventoryLocationMode = "SINGLE_SHOP",
): SidebarNavItem[] {
  const nouns = locationLabels(mode);
  const items: SidebarNavItem[] = [
    { label: "Dashboard", href: ADMIN_BASE, icon: LayoutDashboard },
    {
      id: "pos",
      serviceKey: "pos",
      label: "POS",
      href: "/pos",
      icon: ShoppingCart,
    },
    {
      id: "warehouses",
      serviceKey: "warehouses",
      label: nouns.warehouseNav,
      href: adminHref("/warehouses"),
      icon: Building2,
      adminOnly: true,
    },
  ];

  if (mode === "GODOWN_AND_SHOPS") {
    items.push({
      id: "stores",
      serviceKey: "stores",
      label: nouns.storeNav,
      href: adminHref("/stores"),
      icon: Store,
      adminOnly: true,
    });
  }

  items.push(
    {
      id: "inventory",
      serviceKey: "inventory",
      label: "Inventory",
      href: adminHref("/inventory"),
      icon: Package,
    },
    {
      id: "customers",
      serviceKey: "customers",
      label: "Customers",
      href: adminHref("/customers"),
      icon: UserRound,
    },
    {
      id: "sales",
      serviceKey: "sales",
      label: "Sales",
      href: adminHref("/invoices"),
      icon: FileText,
    },
    {
      id: "reports",
      serviceKey: "reports",
      label: "Reports",
      href: adminHref("/reports"),
      icon: BarChart3,
      adminOnly: true,
    },
    { label: "Settings", href: adminHref("/settings"), icon: Settings },
  );

  return items;
}

/** @deprecated Prefer getSidebarNavItems(mode) — kept for command palette fallback. */
export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] =
  getSidebarNavItems("SINGLE_SHOP");

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  userRole?: "ADMIN" | "STAFF" | null;
}

export function Sidebar({
  isCollapsed,
  onToggle,
  isMobileOpen = false,
  onMobileClose,
  userRole,
}: SidebarProps) {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);
  const { theme, toggleTheme } = useThemeStore();
  const { mode } = useLocationLabels();
  const enabledServices = useAuthStore((s) => s.user?.enabledServices) as
    | EnabledServices
    | undefined;

  // Handle escape key for mobile
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileOpen && onMobileClose) {
        onMobileClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isMobileOpen, onMobileClose]);

  const isActive = (href: string) => {
    if (href === ADMIN_BASE) {
      return pathname === ADMIN_BASE || pathname === `${ADMIN_BASE}/`;
    }
    if (href === "/pos") return pathname.startsWith("/pos");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const filteredNavItems = React.useMemo(() => {
    let items = getSidebarNavItems(mode);
    if (userRole !== "ADMIN") {
      items = items.filter((item) => !item.adminOnly);
    }
    return items.filter((item) => {
      if (!item.serviceKey) return true;
      return isServiceEnabled(enabledServices, item.serviceKey);
    });
  }, [userRole, mode, enabledServices]);

  const handleLogout = async () => {
    await logout();
    // logout hard-redirects to /login
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-[var(--border-default)]">
        <Link
          href={ADMIN_BASE}
          className="flex items-center gap-2.5 min-w-0"
          aria-label="Quake home"
        >
          <img
            src={QUAKE_LOGO_SRC}
            alt=""
            className={`object-contain shrink-0 ${
              isCollapsed ? "h-9 w-9" : "h-9 w-[3.35rem]"
            }`}
          />
          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="font-display font-semibold text-xl text-[var(--text-primary)] tracking-wide whitespace-nowrap"
            >
              Quake
            </motion.span>
          )}
        </Link>

        {isMobileOpen && onMobileClose && (
          <button
            onClick={onMobileClose}
            className="lg:hidden p-2 rounded-lg hover:bg-white/[0.05] text-[var(--text-secondary)] transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-lg",
                "transition-all duration-200 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
                "min-h-[48px]",
                active
                  ? "bg-[color:var(--accent-primary)]/15 text-[var(--accent-primary)] border-l-[3px] border-[var(--accent-primary)] -ml-px"
                  : "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "w-5 h-5 flex-shrink-0 stroke-[1.5]",
                  active ? "text-[var(--accent-primary)]" : "",
                )}
              />
              {!isCollapsed && (
                <span className="text-sm font-medium whitespace-nowrap">
                  {item.label}
                </span>
              )}
              {active && !isCollapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[var(--border-default)]">
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-3 rounded-lg",
            "text-[var(--danger)] hover:bg-[color:var(--danger-muted)]",
            "transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]",
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0 stroke-[1.5]" />
          {!isCollapsed && <span className="text-sm font-medium">Logout</span>}
        </button>

        <button
          onClick={toggleTheme}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-3 rounded-lg mt-1",
            "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
            "transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
          )}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {theme === "dark" ? (
            <Sun className="w-5 h-5 flex-shrink-0 stroke-[1.5]" />
          ) : (
            <Moon className="w-5 h-5 flex-shrink-0 stroke-[1.5]" />
          )}
          {!isCollapsed && (
            <span className="text-sm font-medium">
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </span>
          )}
        </button>
      </div>

      <div className="hidden lg:block p-4 border-t border-[var(--border-default)]">
        <button
          onClick={onToggle}
          className={cn(
            "flex items-center justify-center w-full py-2.5 px-3 rounded-lg",
            "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
            "transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
          )}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5 stroke-[1.5]" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5 stroke-[1.5] mr-2" />
              <span className="text-sm font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 modal-scrim lg:hidden"
            onClick={onMobileClose}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMobileOpen && (
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed top-0 left-0 z-50 w-72 h-full bg-[var(--bg-surface)] backdrop-blur-xl border-r border-[var(--border-default)] lg:hidden"
          >
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 76 : 256 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "hidden lg:flex flex-col h-screen",
          "bg-[var(--bg-surface)] backdrop-blur-xl",
          "border-r border-[var(--border-default)]",
          "sticky top-0",
        )}
      >
        {sidebarContent}
      </motion.aside>
    </>
  );
}
