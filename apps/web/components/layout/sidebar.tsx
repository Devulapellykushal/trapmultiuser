"use client";

import { useThemeStore } from "@/hooks/use-theme";
import { useAuthStore } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
    BarChart3,
    Building2,
    ChevronLeft,
    ChevronRight,
    // ClipboardList,
    // CreditCard,
    FileText,
    LayoutDashboard,
    // LineChart,
    LogOut,
    Moon,
    Package,
    // Receipt,
    Settings,
    ShoppingCart,
    // Store,
    Sun,
    // Users,
    UserRound,
    X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { ADMIN_BASE, adminHref } from "@/lib/admin-routes";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

/** Shared nav list for sidebar and command palette. */
export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { label: "Dashboard", href: ADMIN_BASE, icon: LayoutDashboard },
  { label: "POS", href: "/pos", icon: ShoppingCart },
  {
    label: "Warehouses",
    href: adminHref("/warehouses"),
    icon: Building2,
    adminOnly: true,
  },
  { label: "Inventory", href: adminHref("/inventory"), icon: Package },
  // { label: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList },
  // { label: "Debit/Credit Notes", href: "/debit-credit-notes", icon: Receipt },
  // { label: "Credit Sales", href: "/credit-sales", icon: CreditCard },
  // { label: "Stores", href: "/stores", icon: Store, adminOnly: true },
  // {
  //   label: "Analytics",
  //   href: "/analytics",
  //   icon: LineChart,
  //   adminOnly: true,
  // },
  { label: "Customers", href: adminHref("/customers"), icon: UserRound },
  { label: "Sales", href: adminHref("/invoices"), icon: FileText },
  { label: "Reports", href: adminHref("/reports"), icon: BarChart3, adminOnly: true },
  // { label: "Users", href: "/users", icon: Users, adminOnly: true },
  // { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Settings", href: adminHref("/settings"), icon: Settings },
];

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
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const { theme, toggleTheme } = useThemeStore();

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

  // Filter nav items based on role
  const filteredNavItems = React.useMemo(() => {
    if (userRole === "ADMIN") return SIDEBAR_NAV_ITEMS;
    // STAFF can only see non-admin items
    return SIDEBAR_NAV_ITEMS.filter((item) => !item.adminOnly);
  }, [userRole]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-[var(--border-default)]">
        <Link href={ADMIN_BASE} className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center shrink-0">
            <img
              src="/assets/2d/aio.png"
              alt="Quake"
              className="w-8 h-8 object-contain"
            />
          </div>
          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="font-semibold text-lg text-[var(--text-primary)] tracking-tight whitespace-nowrap"
            >
              Quake
            </motion.span>
          )}
        </Link>
        
        {/* Mobile close button */}
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

      {/* Navigation */}
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

      {/* Logout Button */}
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

        {/* Theme Toggle */}
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

      {/* Collapse Toggle - Desktop only */}
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
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={onMobileClose}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Mobile Sidebar */}
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

      {/* Desktop Sidebar */}
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
