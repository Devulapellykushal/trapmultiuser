"use client";

import { QUAKE_LOGO_SRC } from "@/lib/brand-colors";
import { usePlatformAuthStore } from "@/lib/auth/platform-auth.store";
import {
  mergeEnabledServices,
  SERVICE_KEYS,
  SERVICE_LABELS,
  type ServiceKey,
} from "@/lib/enabled-services";
import {
  superadminService,
  type SuperadminOrgDetail,
  type SuperadminOrgListItem,
  type SuperadminOrgMember,
} from "@/services/superadmin.service";
import { Loader2, LogOut, Search, Shield, Users } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast, Toaster } from "sonner";

type Tab = "organizations" | "users";

export default function SuperadminPage() {
  const router = useRouter();
  const user = usePlatformAuthStore((s) => s.user);
  const isAuthenticated = usePlatformAuthStore((s) => s.isAuthenticated);
  const isLoading = usePlatformAuthStore((s) => s.isLoading);
  const hasHydrated = usePlatformAuthStore((s) => s.hasHydrated);
  const hasBootstrapped = usePlatformAuthStore((s) => s.hasBootstrapped);
  const logout = usePlatformAuthStore((s) => s.logout);

  const [tab, setTab] = React.useState<Tab>("organizations");
  const [search, setSearch] = React.useState("");
  const [orgs, setOrgs] = React.useState<SuperadminOrgListItem[]>([]);
  const [users, setUsers] = React.useState<SuperadminOrgMember[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<SuperadminOrgDetail | null>(null);
  const [listLoading, setListLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState<ServiceKey | null>(null);
  const [labels, setLabels] =
    React.useState<Record<string, string>>(SERVICE_LABELS);

  React.useEffect(() => {
    if (!hasHydrated) return;
    if (!hasBootstrapped || isLoading) return;
    if (!isAuthenticated || !user?.isSuperuser) {
      router.replace("/superadmin/login");
    }
  }, [
    hasHydrated,
    hasBootstrapped,
    isLoading,
    isAuthenticated,
    user?.isSuperuser,
    router,
  ]);

  const loadOrgs = React.useCallback(async (q?: string) => {
    setListLoading(true);
    try {
      const res = await superadminService.listOrganizations(q);
      setOrgs(res.results ?? []);
      if (res.serviceLabels) {
        setLabels({ ...SERVICE_LABELS, ...res.serviceLabels });
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load organizations",
      );
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadUsers = React.useCallback(async (q?: string) => {
    setListLoading(true);
    try {
      const res = await superadminService.listUsers(q);
      setUsers(res.results ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setListLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!user?.isSuperuser) return;
    const t = setTimeout(() => {
      if (tab === "organizations") void loadOrgs(search);
      else void loadUsers(search);
    }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [user?.isSuperuser, search, tab, loadOrgs, loadUsers]);

  React.useEffect(() => {
    if (!selectedId || !user?.isSuperuser) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void superadminService
      .getOrganization(selectedId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          if (d.serviceLabels) {
            setLabels({ ...SERVICE_LABELS, ...d.serviceLabels });
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Failed to load org",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, user?.isSuperuser]);

  const services = mergeEnabledServices(detail?.enabledServices);

  const toggleService = async (key: ServiceKey, next: boolean) => {
    if (!detail) return;
    const prev = { ...services };
    setDetail({
      ...detail,
      enabledServices: { ...services, [key]: next },
    });
    setOrgs((list) =>
      list.map((o) =>
        o.id === detail.id
          ? { ...o, enabledServices: { ...services, [key]: next } }
          : o,
      ),
    );
    setSavingKey(key);
    try {
      const res = await superadminService.patchServices(detail.id, {
        [key]: next,
      });
      setDetail((d) =>
        d
          ? {
              ...d,
              enabledServices: res.enabledServices ?? {
                ...services,
                [key]: next,
              },
            }
          : d,
      );
      toast.success(
        `${labels[key] ?? key} ${next ? "enabled" : "disabled"} for ${detail.name}`,
      );
    } catch (err) {
      setDetail((d) => (d ? { ...d, enabledServices: prev } : d));
      setOrgs((list) =>
        list.map((o) =>
          o.id === detail.id ? { ...o, enabledServices: prev } : o,
        ),
      );
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSavingKey(null);
    }
  };

  const openUserOrg = (member: SuperadminOrgMember) => {
    if (!member.organizationId) {
      toast.message("Platform account — not tied to a tenant organization");
      return;
    }
    setTab("organizations");
    setSearch("");
    setSelectedId(member.organizationId);
  };

  if (!hasHydrated || !hasBootstrapped || isLoading || !user?.isSuperuser) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <Toaster
        position="top-right"
        theme="system"
        richColors
        toastOptions={{
          className: "quake-toast",
          style: {
            background: "var(--bg-modal)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          },
        }}
      />

      <header className="border-b border-[var(--border-default)] bg-[var(--bg-surface)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Image
              src={QUAKE_LOGO_SRC}
              alt="Quake"
              width={48}
              height={40}
              className="h-10 w-auto object-contain"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-xl font-semibold tracking-wide">
                  Superadmin
                </h1>
                <Shield
                  className="h-4 w-4 text-[var(--brand)] shrink-0"
                  aria-hidden
                />
              </div>
              <p className="text-xs text-[var(--text-muted)] truncate">
                {user.email} · organizations & registered users
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                await logout();
                // logout hard-redirects to /superadmin/login
              }}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--brand)] transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <aside className="flex flex-col gap-3">
          <div className="flex rounded-lg border border-[var(--border-default)] p-0.5 bg-[var(--bg-elevated)]">
            <button
              type="button"
              onClick={() => setTab("organizations")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                tab === "organizations"
                  ? "bg-[var(--brand)]/20 text-[var(--brand)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Organizations
            </button>
            <button
              type="button"
              onClick={() => setTab("users")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                tab === "users"
                  ? "bg-[var(--brand)]/20 text-[var(--brand)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              All users
            </button>
          </div>

          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "organizations"
                  ? "Search orgs or email…"
                  : "Search users or org…"
              }
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/50"
            />
          </label>

          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden flex-1 min-h-[20rem]">
            {listLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--brand)]" />
              </div>
            ) : tab === "organizations" ? (
              orgs.length === 0 ? (
                <p className="p-4 text-sm text-[var(--text-muted)]">
                  No organizations found.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border-default)] max-h-[70vh] overflow-y-auto">
                  {orgs.map((org) => {
                    const active = org.id === selectedId;
                    return (
                      <li key={org.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(org.id)}
                          className={`w-full text-left px-3 py-3 transition-colors ${
                            active
                              ? "bg-[var(--brand)]/15 border-l-2 border-l-[var(--brand)]"
                              : "hover:bg-[var(--bg-elevated)] border-l-2 border-l-transparent"
                          }`}
                        >
                          <div className="text-sm font-medium truncate">
                            {org.name}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                            {org.ownerEmail ?? org.slug} · {org.userCount} user
                            {org.userCount === 1 ? "" : "s"}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : users.length === 0 ? (
              <p className="p-4 text-sm text-[var(--text-muted)]">
                No users found.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border-default)] max-h-[70vh] overflow-y-auto">
                {users.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => openUserOrg(u)}
                      className="w-full text-left px-3 py-3 hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {u.name}
                        </span>
                        {u.isSuperuser ? (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-[var(--brand)]/20 text-[var(--brand)]">
                            Platform
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                        {u.email}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                        {u.organizationName ?? "No organization"} · {u.role}
                        {!u.isActive ? " · inactive" : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 min-h-[24rem]">
          {!selectedId ? (
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center text-center text-[var(--text-muted)]">
              {tab === "users" ? (
                <>
                  <Users className="mb-3 h-10 w-10 opacity-40" />
                  <p className="text-sm">
                    Select a user to open their organization and manage
                    services.
                  </p>
                </>
              ) : (
                <>
                  <Shield className="mb-3 h-10 w-10 opacity-40" />
                  <p className="text-sm">
                    Select an organization to manage services and members.
                  </p>
                </>
              )}
            </div>
          ) : detailLoading && !detail ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--brand)]" />
            </div>
          ) : detail ? (
            <div className="space-y-8">
              <div>
                <h2 className="font-display text-2xl font-semibold">
                  {detail.name}
                </h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {detail.slug} · owner {detail.ownerEmail ?? "—"}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium uppercase tracking-wider text-[var(--text-muted)] mb-3">
                  Enabled services
                </h3>
                <ul className="space-y-2">
                  {SERVICE_KEYS.map((key) => {
                    const on = services[key];
                    const busy = savingKey === key;
                    return (
                      <li
                        key={key}
                        className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]/60 px-4 py-3"
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {labels[key] ?? SERVICE_LABELS[key]}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] font-mono">
                            {key}
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          disabled={busy}
                          onClick={() => void toggleService(key, !on)}
                          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/60 disabled:opacity-60 ${
                            on
                              ? "bg-[var(--brand)]"
                              : "bg-[var(--border-hover)]"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                              on ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                          {busy ? (
                            <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-[var(--bg-primary)]" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-medium uppercase tracking-wider text-[var(--text-muted)] mb-3">
                  Members ({detail.members?.length ?? 0})
                </h3>
                <div className="overflow-x-auto rounded-lg border border-[var(--border-default)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-default)] bg-[var(--bg-elevated)] text-left text-xs text-[var(--text-muted)]">
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Role</th>
                        <th className="px-3 py-2 font-medium">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.members ?? []).map((m) => (
                        <tr
                          key={m.id}
                          className="border-b border-[var(--border-default)] last:border-0"
                        >
                          <td className="px-3 py-2">{m.name}</td>
                          <td className="px-3 py-2 text-[var(--text-secondary)]">
                            {m.email}
                          </td>
                          <td className="px-3 py-2">{m.role}</td>
                          <td className="px-3 py-2">
                            {m.isActive ? "Yes" : "No"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
