"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminHref } from "@/lib/admin-routes";
import {
  authService,
  useAuthStore,
  type BusinessMembership,
} from "@/lib/auth";
import {
  INDUSTRY_OPTIONS,
  type IndustryId,
} from "@/lib/industry";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown";

/**
 * Switch between businesses under one login.
 * Each business has a fixed industry and isolated catalog/CRM/sales.
 */
export function BusinessSwitcher() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const applyActiveBusiness = useAuthStore((s) => s.applyActiveBusiness);
  const [businesses, setBusinesses] = React.useState<BusinessMembership[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newIndustry, setNewIndustry] =
    React.useState<IndustryId>("auto_tyre");
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await authService.listBusinesses();
      setBusinesses(list);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load businesses",
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    void load();
  }, [load, user?.organizationId]);

  const active =
    businesses.find((b) => b.isActive) ??
    businesses.find((b) => b.organizationId === user?.organizationId);

  const industryLabel = (id: string) =>
    INDUSTRY_OPTIONS.find((o) => o.id === id)?.label ?? id;

  const handleSwitch = async (organizationId: string) => {
    if (organizationId === user?.organizationId) return;
    setSwitchingId(organizationId);
    try {
      const next = await authService.switchBusiness(organizationId);
      applyActiveBusiness(next);
      toast.success(`Switched to ${next.organizationName ?? "business"}`);
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not switch business",
      );
    } finally {
      setSwitchingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      toast.error("Enter a business name");
      return;
    }
    setCreating(true);
    try {
      const next = await authService.createBusiness({
        name,
        industry: newIndustry,
      });
      applyActiveBusiness(next);
      setAdding(false);
      setNewName("");
      setNewIndustry("auto_tyre");
      const label = next.organizationName ?? name;
      toast.success(`${label} is ready`, {
        description:
          "Choose one shop or godown + shops, then finish the rest of setup.",
        duration: 8000,
      });
      await load();
      router.push(`${adminHref("/settings")}?setup=new`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create business",
      );
    } finally {
      setCreating(false);
    }
  };

  if (!user) return null;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void load();
        if (!open) setAdding(false);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 max-w-[220px] px-3 py-2 rounded-lg",
            "bg-white/[0.05] border border-[var(--border-default)]",
            "text-[var(--text-primary)] text-sm",
            "hover:bg-white/[0.08] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
          )}
          aria-label="Switch business"
        >
          <Building2 className="w-4 h-4 shrink-0 text-[var(--brand)] stroke-[1.5]" />
          <span className="truncate font-medium">
            {user.organizationName || "Business"}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0 text-[var(--text-muted)] stroke-[1.5]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <div>
            <p className="font-semibold text-[var(--text-primary)]">
              Your businesses
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 font-normal">
              Each shop type stays separate — switch to change active business
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading && businesses.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : (
          businesses.map((b) => {
            const isActive = b.isActive || b.organizationId === user.organizationId;
            const busy = switchingId === b.organizationId;
            return (
              <DropdownMenuItem
                key={b.organizationId}
                disabled={busy || isActive}
                onClick={() => void handleSwitch(b.organizationId)}
                className="flex items-start gap-2 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{b.name}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {industryLabel(b.industry)} · {b.role}
                  </p>
                </div>
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
                ) : isActive ? (
                  <Check className="w-4 h-4 text-[var(--brand)] shrink-0 mt-0.5" />
                ) : null}
              </DropdownMenuItem>
            );
          })
        )}
        {!active && businesses.length === 0 && !loading ? (
          <p className="px-2 py-2 text-xs text-[var(--text-muted)]">
            No businesses yet
          </p>
        ) : null}
        <DropdownMenuSeparator />
        {adding ? (
          <form onSubmit={handleCreate} className="px-2 py-2 space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Business name"
              autoFocus
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.06] border border-[var(--border-default)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
            />
            <select
              value={newIndustry}
              onChange={(e) => setNewIndustry(e.target.value as IndustryId)}
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.06] border border-[var(--border-default)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
            >
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="flex-1 px-2 py-1.5 rounded-md bg-[var(--brand)]/20 text-[var(--brand)] text-xs font-medium hover:bg-[var(--brand)]/30 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create & set up"}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="px-2 py-1.5 rounded-md text-xs text-[var(--text-muted)] hover:bg-white/[0.05]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setAdding(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add another business
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
