"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Menu,
  ChevronDown,
  Search,
  Calendar,
  UserCircle2,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { User as AuthUser, useAuthStore } from "@/lib/auth";
import { adminHref } from "@/lib/admin-routes";
import { NotificationBell } from "@/components/notifications";
import { InventoryWarehouseSelector } from "./inventory-warehouse-selector";
import { BusinessSwitcher } from "./business-switcher";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown";

interface TopBarProps {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
  /** Opens global search / command palette (⌘K / Ctrl+K). */
  onSearchClick?: () => void;
  showWarehouseSelector?: boolean;
  showDateRange?: boolean;
  user?: AuthUser | null;
}

export function TopBar({
  title,
  subtitle,
  onMenuClick,
  onSearchClick,
  showWarehouseSelector = false,
  showDateRange = false,
  user,
}: TopBarProps) {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  const handleSignOut = async () => {
    await logout();
    // logout hard-redirects to /login
  };

  const handleSettings = () => {
    router.push(adminHref("/settings"));
  };

  const displayName = user ? `${user.firstName} ${user.lastName}` : "User";
  const displayEmail = user?.email || "";
  return (
    <header
      className={cn(
        "sticky top-0 z-30",
        "flex items-center justify-between",
        "h-16 px-4 lg:px-6",
        "bg-[var(--bg-surface)] backdrop-blur-xl",
        "border-b border-[var(--border-default)]",
      )}
    >
      {/* Left Section */}
      <div className="flex items-center gap-4">
        {/* Mobile Menu Button */}
        <button
          onClick={onMenuClick}
          className={cn(
            "lg:hidden p-2.5 -ml-2 rounded-lg",
            "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
            "transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
          )}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5 stroke-[1.5]" />
        </button>

        {/* Page Title */}
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-[var(--text-muted)] mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Center Section - Optional Controls */}
      <div className="hidden md:flex items-center gap-3">
        {/* Warehouse Selector Placeholder */}
        {showWarehouseSelector && <InventoryWarehouseSelector />}

        {/* Date Range Placeholder */}
        {showDateRange && (
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.05] border border-[var(--border-default)] text-[var(--text-primary)] text-sm hover:bg-white/[0.08] transition-colors">
            <Calendar className="w-4 h-4 text-[var(--text-secondary)] stroke-[1.5]" />
            <span>Last 30 Days</span>
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)] stroke-[1.5]" />
          </button>
        )}
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        <BusinessSwitcher />

        {/* Search */}
        <button
          type="button"
          onClick={() => onSearchClick?.()}
          className={cn(
            "sm:hidden p-2.5 rounded-lg",
            "bg-white/[0.05] border border-[var(--border-default)]",
            "text-[var(--text-secondary)] hover:bg-white/[0.08] hover:text-[var(--text-primary)] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
          )}
          aria-label="Search and navigate"
        >
          <Search className="w-5 h-5 stroke-[1.5]" />
        </button>
        <button
          type="button"
          onClick={() => onSearchClick?.()}
          className={cn(
            "hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg",
            "bg-white/[0.05] border border-[var(--border-default)]",
            "text-[var(--text-muted)] text-sm",
            "hover:bg-white/[0.08] hover:border-white/[0.12] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
          )}
          aria-label="Search and navigate"
        >
          <Search className="w-4 h-4 stroke-[1.5]" />
          <span className="hidden lg:inline">Search...</span>
          <kbd className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.08] text-xs text-[var(--text-secondary)]">
            ⌘K
          </kbd>
        </button>

        {/* Notification Bell */}
        <NotificationBell />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-2 p-1.5 rounded-lg",
                "hover:bg-white/[0.05] transition-colors duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
              )}
            >
              <div className="w-8 h-8 rounded-full bg-[var(--brand-muted)] flex items-center justify-center ring-2 ring-[var(--brand)]/30">
                <UserCircle2 className="w-5 h-5 text-[var(--brand)]" />
              </div>
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)] hidden sm:block stroke-[1.5]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{displayName}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{displayEmail}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSettings}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSettings}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-[var(--danger)]"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
