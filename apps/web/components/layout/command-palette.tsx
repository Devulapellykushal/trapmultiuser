"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getSidebarNavItems } from "@/components/layout/sidebar";
import { useLocationLabels } from "@/hooks/use-business-setup";
import { adminHref } from "@/lib/admin-routes";
import { useAuthStore } from "@/lib/auth";
import { isServiceEnabled, type EnabledServices } from "@/lib/enabled-services";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole?: "ADMIN" | "STAFF" | null;
}

export function CommandPalette({
  open,
  onOpenChange,
  userRole,
}: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const { mode } = useLocationLabels();
  const enabledServices = useAuthStore((s) => s.user?.enabledServices) as
    | EnabledServices
    | undefined;

  React.useEffect(() => {
    if (open) {
      setQuery("");
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const allNav = getSidebarNavItems(mode);
  const navItems = allNav.filter((i) => {
    if (userRole !== "ADMIN" && i.adminOnly) return false;
    if (i.serviceKey && !isServiceEnabled(enabledServices, i.serviceKey)) {
      return false;
    }
    return true;
  });

  const q = query.trim().toLowerCase();
  const filteredNav = q
    ? navItems.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.href.toLowerCase().includes(q),
      )
    : navItems;

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const searchInventory = () => {
    if (!query.trim()) return;
    const search = encodeURIComponent(query.trim());
    onOpenChange(false);
    router.push(`${adminHref("/inventory")}?search=${search}`);
  };

  const handleInventoryEnter = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      searchInventory();
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[100]",
            "modal-scrim",
            "data-[state=open]:animate-fade-in",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-[min(14vh,120px)] z-[101] w-[calc(100%-2rem)] max-w-xl",
            "-translate-x-1/2",
            "rounded-xl modal-panel",
            "outline-none overflow-hidden",
            "max-h-[min(70vh,520px)] flex flex-col",
          )}
          onPointerDownOutside={() => onOpenChange(false)}
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            Search and navigate
          </DialogPrimitive.Title>
          <div className="flex items-center gap-2 px-3 py-3 border-b border-[var(--border-default)]">
            <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInventoryEnter}
              placeholder="Search inventory or jump to page…"
              className={cn(
                "flex-1 min-w-0 bg-transparent border-0",
                "text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:ring-0",
              )}
            />
            <kbd className="hidden sm:inline shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-default)] text-[var(--text-muted)]">
              Esc
            </kbd>
          </div>

          <div className="flex-1 overflow-y-auto p-2 text-sm">
            {query.trim() && (
              <button
                type="button"
                onClick={searchInventory}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg mb-2",
                  "bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/25",
                  "text-[var(--text-primary)] hover:bg-[var(--accent-primary)]/18 transition-colors",
                )}
              >
                <span className="font-medium">Search inventory for </span>
                <span className="font-mono text-[var(--accent-primary)]">
                  “{query.trim()}”
                </span>
                <span className="block text-xs text-[var(--text-muted)] mt-1">
                  Press Enter
                </span>
              </button>
            )}
            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Pages
            </p>
            <ul className="space-y-0.5">
              {filteredNav.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <button
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left",
                        "text-[var(--text-secondary)] hover:bg-white/[0.06]",
                        "hover:text-[var(--text-primary)] transition-colors",
                      )}
                      onClick={() => go(item.href)}
                    >
                      <Icon className="w-4 h-4 shrink-0 opacity-80" />
                      <span>{item.label}</span>
                      <span className="ml-auto text-[10px] text-[var(--text-muted)] font-mono truncate max-w-[40%]">
                        {item.href}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {q && filteredNav.length === 0 && (
              <p className="px-3 py-4 text-xs text-[var(--text-muted)] text-center">
                No pages match that text. Use the inventory search action above,
                or press Enter in the search field.
              </p>
            )}
          </div>
          <div className="border-t border-[var(--border-default)] px-3 py-2 text-[10px] text-[var(--text-muted)] text-center">
            Tip: ⌘K or Ctrl+K opens this anytime
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
