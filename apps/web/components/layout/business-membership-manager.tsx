"use client";

import * as React from "react";
import { Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import {
  authService,
  useAuthStore,
  type BusinessMembership,
} from "@/lib/auth";
import { INDUSTRY_OPTIONS } from "@/lib/industry";

/**
 * List memberships + leave/unlink (Settings).
 * Leaving removes access only — catalog stays on the org.
 */
export function BusinessMembershipManager() {
  const user = useAuthStore((s) => s.user);
  const applyActiveBusiness = useAuthStore((s) => s.applyActiveBusiness);
  const [businesses, setBusinesses] = React.useState<BusinessMembership[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [leavingId, setLeavingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setBusinesses(await authService.listBusinesses());
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

  const industryLabel = (id: string) =>
    INDUSTRY_OPTIONS.find((o) => o.id === id)?.label ?? id;

  const canLeave = businesses.length > 1;

  const handleLeave = async (b: BusinessMembership) => {
    if (!canLeave) {
      toast.error("Add another business before leaving this one.");
      return;
    }
    const ok = window.confirm(
      `Leave “${b.name}”?\n\n` +
        `You will lose access to that workspace. ` +
        `Its inventory and sales stay on the business — they are not deleted. ` +
        (b.isActive
          ? `\nYou will be switched to another business.`
          : ""),
    );
    if (!ok) return;

    setLeavingId(b.organizationId);
    try {
      const next = await authService.leaveBusiness(b.organizationId);
      applyActiveBusiness(next);
      toast.success(`Left ${b.name}`, {
        description: next.organizationName
          ? `Now using ${next.organizationName}.`
          : undefined,
      });
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not leave business",
      );
    } finally {
      setLeavingId(null);
    }
  };

  if (loading && businesses.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#8a867c] py-1">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading businesses…
      </div>
    );
  }

  if (businesses.length === 0) return null;

  return (
    <div className="space-y-3 pt-2 border-t border-white/[0.06]">
      <div>
        <p className="text-sm font-medium text-[#f3eee4]">Your businesses</p>
        <p className="text-xs text-[#8a867c] mt-0.5">
          Leave unlinks your login from that shop. Data is not wiped. You must
          keep at least one business.
        </p>
      </div>
      <ul className="space-y-2">
        {businesses.map((b) => {
          const isActive =
            b.isActive || b.organizationId === user?.organizationId;
          const busy = leavingId === b.organizationId;
          return (
            <li
              key={b.organizationId}
              className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#f3eee4] truncate">
                  {b.name}
                  {isActive ? (
                    <span className="ml-2 text-xs text-[#c4a574]">Active</span>
                  ) : null}
                </p>
                <p className="text-xs text-[#8a867c]">
                  {industryLabel(b.industry)} · {b.role}
                </p>
              </div>
              <button
                type="button"
                disabled={!canLeave || busy}
                title={
                  canLeave
                    ? "Leave / unlink this business"
                    : "Cannot leave your only business"
                }
                onClick={() => void handleLeave(b)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-[#c97a7a] hover:bg-[#c97a7a]/10 disabled:opacity-40 disabled:pointer-events-none"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Unlink className="w-3.5 h-3.5" />
                )}
                Leave
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
