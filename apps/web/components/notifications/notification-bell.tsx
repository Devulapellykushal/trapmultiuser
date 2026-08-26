"use client";

import * as React from "react";
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Package,
  ShoppingCart,
  Truck,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { adminHref } from "@/lib/admin-routes";
import {
  getNotifications,
  getLowStockProducts,
  markNotificationsRead,
  type LowStockItem,
  type Notification,
} from "@/services/notifications.service";

interface NotificationBellProps {
  className?: string;
}

const NOTIFICATION_TYPE_ICONS: Record<string, React.ReactNode> = {
  LOW_STOCK: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  RESTOCK_REMINDER: <Package className="w-4 h-4 text-blue-500" />,
  SALE_COMPLETED: <ShoppingCart className="w-4 h-4 text-green-500" />,
  PO_RECEIVED: <Truck className="w-4 h-4 text-purple-500" />,
  SYSTEM: <Bell className="w-4 h-4 text-gray-500" />,
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "border-l-red-500",
  HIGH: "border-l-orange-500",
  MEDIUM: "border-l-amber-500",
  LOW: "border-l-green-500",
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function groupLowStockByWarehouse(items: LowStockItem[]): [string, LowStockItem[]][] {
  const map = new Map<string, LowStockItem[]>();
  for (const item of items) {
    const key = item.warehouse_name?.trim() || "Unknown warehouse";
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  const urgencyOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  for (const [, list] of map) {
    list.sort((a, b) => {
      const ua = urgencyOrder[a.urgency] ?? 9;
      const ub = urgencyOrder[b.urgency] ?? 9;
      if (ua !== ub) return ua - ub;
      return a.name.localeCompare(b.name);
    });
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [lowStockItems, setLowStockItems] = React.useState<LowStockItem[]>([]);
  const [lowStockCount, setLowStockCount] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [lowStockError, setLowStockError] = React.useState<string | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = React.useState<{
    top: number;
    right: number;
  } | null>(null);

  const updatePanelPos = React.useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    updatePanelPos();
    window.addEventListener("resize", updatePanelPos);
    window.addEventListener("scroll", updatePanelPos, true);
    return () => {
      window.removeEventListener("resize", updatePanelPos);
      window.removeEventListener("scroll", updatePanelPos, true);
    };
  }, [isOpen, updatePanelPos]);

  const fetchPanelData = React.useCallback(async () => {
    setLoadError(null);
    setLowStockError(null);
    setLoading(true);
    const [notifOutcome, stockOutcome] = await Promise.allSettled([
      getNotifications({ limit: 20 }),
      getLowStockProducts(),
    ]);

    if (notifOutcome.status === "fulfilled") {
      const notifRes = notifOutcome.value;
      const items = Array.isArray(notifRes.notifications)
        ? notifRes.notifications
        : [];
      setNotifications(items);
      setUnreadCount(
        typeof notifRes.unread_count === "number" ? notifRes.unread_count : 0,
      );
    } else {
      console.error("Failed to fetch notifications:", notifOutcome.reason);
      setLoadError(
        "Could not load notifications. Check connection and retry.",
      );
      setNotifications([]);
      setUnreadCount(0);
    }

    if (stockOutcome.status === "fulfilled") {
      const stockRes = stockOutcome.value;
      const stockItems = Array.isArray(stockRes.items) ? stockRes.items : [];
      setLowStockItems(stockItems);
      setLowStockCount(
        typeof stockRes.count === "number" ? stockRes.count : stockItems.length,
      );
    } else {
      console.error("Failed to fetch low stock:", stockOutcome.reason);
      setLowStockError("Could not load stock alerts.");
      setLowStockItems([]);
      setLowStockCount(0);
    }

    setLoading(false);
  }, []);

  React.useEffect(() => {
    void fetchPanelData();
    const interval = setInterval(() => void fetchPanelData(), 30000);
    return () => clearInterval(interval);
  }, [fetchPanelData]);

  React.useEffect(() => {
    if (isOpen) {
      void fetchPanelData();
    }
  }, [isOpen, fetchPanelData]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const inTrigger = dropdownRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inTrigger && !inPanel) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationsRead([id]);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const result = await markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(result.unread_count);
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  };

  const hasStockAlerts = lowStockCount > 0;
  const groupedStock = React.useMemo(
    () => groupLowStockByWarehouse(lowStockItems.slice(0, 40)),
    [lowStockItems],
  );

  const showEmpty =
    !loadError &&
    !lowStockError &&
    !loading &&
    notifications.length === 0 &&
    !hasStockAlerts;

  const showInitialSpinner =
    loading &&
    !hasStockAlerts &&
    notifications.length === 0 &&
    !lowStockError &&
    !loadError;

  const hasMainContent =
    notifications.length > 0 || hasStockAlerts;

  const showFailurePlaceholder =
    !loading &&
    !showInitialSpinner &&
    !showEmpty &&
    !hasMainContent;

  const attentionLabel =
    unreadCount > 0 && hasStockAlerts
      ? `${unreadCount} unread, ${lowStockCount} stock`
      : unreadCount > 0
        ? `${unreadCount} unread`
        : hasStockAlerts
          ? `${lowStockCount} stock alert${lowStockCount === 1 ? "" : "s"}`
          : "Notifications";

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-2.5 rounded-lg",
          "bg-white/[0.05] border border-[var(--border-default)]",
          "text-[var(--text-secondary)] hover:bg-white/[0.08] hover:text-[var(--text-primary)]",
          "transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a574]",
        )}
        aria-label={`Notifications (${attentionLabel})`}
        aria-expanded={isOpen}
      >
        <Bell className="w-5 h-5 stroke-[1.5]" />

        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute -top-1 -right-1",
              "flex items-center justify-center",
              "min-w-[18px] h-[18px] px-1",
              "text-xs font-semibold text-white",
              "bg-[#c45c5c] rounded-full",
              "ring-2 ring-[var(--bg-surface)]",
            )}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}

        {(hasStockAlerts || lowStockError) && unreadCount === 0 && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5",
              "flex h-[10px] w-[10px] rounded-full",
              lowStockError ? "bg-[var(--text-muted)]" : "bg-amber-500",
              "ring-2 ring-[var(--bg-surface)]",
            )}
            aria-hidden
          />
        )}

        {hasStockAlerts && unreadCount > 0 && (
          <span
            className={cn(
              "absolute bottom-0 right-0.5 translate-y-0.5",
              "h-2 w-2 rounded-full bg-amber-500",
              "ring-2 ring-[var(--bg-surface)]",
            )}
            title={`${lowStockCount} low or out-of-stock line(s) across warehouses`}
            aria-hidden
          />
        )}
      </button>

      {isOpen &&
        panelPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            className={cn(
              "fixed z-[80]",
              "w-[min(100vw-1.5rem,24rem)] max-h-[min(100vh-6rem,32rem)]",
              "bg-[var(--bg-modal)] border border-[var(--border-default)] rounded-xl",
              "shadow-2xl shadow-black/50",
              "overflow-hidden flex flex-col",
            )}
            style={{ top: panelPos.top, right: panelPos.right }}
          >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)] shrink-0 bg-[var(--bg-modal)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="flex items-center gap-1 text-xs text-[#c4a574] hover:text-[#d4b88a] transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 bg-[var(--bg-modal)]">
            {loadError && (
              <div className="mx-3 mt-3 mb-1 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="leading-snug">{loadError}</p>
                  <button
                    type="button"
                    onClick={() => void fetchPanelData()}
                    className="font-medium text-[#d4b88a] hover:text-[#c4a574] transition-colors"
                  >
                    Retry messages
                  </button>
                </div>
              </div>
            )}

            {lowStockError && !hasStockAlerts && (
              <div className="mx-3 mt-2 mb-1 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <Package className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="leading-snug">{lowStockError}</p>
                  <button
                    type="button"
                    onClick={() => void fetchPanelData()}
                    className="font-medium text-amber-200 hover:text-amber-50 transition-colors"
                  >
                    Retry stock alerts
                  </button>
                </div>
              </div>
            )}

            {showInitialSpinner ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="w-6 h-6 border-2 border-[#c4a574] border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-[var(--text-muted)]">Loading…</p>
              </div>
            ) : showEmpty ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <Bell className="w-10 h-10 text-[var(--text-muted)] mb-2" />
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  All clear
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 text-center leading-relaxed max-w-[16rem]">
                  No system messages and no low-stock lines across warehouses.
                </p>
              </div>
            ) : showFailurePlaceholder ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-8">
                <p className="text-center text-xs text-[var(--text-secondary)]">
                  Nothing to show yet. Use the retry actions above if something
                  failed to load.
                </p>
                <button
                  type="button"
                  onClick={() => void fetchPanelData()}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#c4a574]/15 text-[#c4a574] hover:bg-[#c4a574]/25 transition-colors"
                >
                  Refresh panel
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-default)]">
                {hasStockAlerts && (
                  <div className="bg-[var(--bg-surface)]">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-default)]/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)] truncate">
                          Stock across warehouses
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 shrink-0">
                        {lowStockCount}
                      </span>
                    </div>
                    <div className="max-h-[260px] overflow-y-auto">
                      {groupedStock.map(([warehouse, rows]) => (
                        <div key={warehouse}>
                          <div className="sticky top-0 z-[1] flex items-center gap-1.5 px-4 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-default)]">
                            <Warehouse className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                            <span className="text-[11px] font-medium text-[var(--text-muted)] truncate">
                              {warehouse}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] ml-auto tabular-nums">
                              {rows.length}
                            </span>
                          </div>
                          {rows.map((item) => {
                            const out = item.current_stock <= 0;
                            const dot = out ? "bg-red-500" : "bg-amber-500";
                            return (
                              <div
                                key={`${item.id}-${item.warehouse_id}`}
                                className="flex gap-2.5 px-4 py-2.5 hover:bg-[var(--border-default)]/20 border-b border-[var(--border-default)]/40 last:border-0"
                              >
                                <span
                                  className={cn(
                                    "mt-1.5 h-2 w-2 rounded-full shrink-0",
                                    dot,
                                  )}
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-[var(--text-primary)] leading-snug line-clamp-2">
                                    {item.name}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                    <span className="text-[11px] text-[var(--text-muted)] font-mono">
                                      {item.sku || "—"}
                                    </span>
                                    {item.variant_details ? (
                                      <span className="text-[11px] text-[var(--text-muted)]">
                                        {item.variant_details}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                    <span
                                      className={cn(
                                        "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                                        out
                                          ? "bg-red-500/15 text-red-400"
                                          : "bg-amber-500/12 text-amber-500",
                                      )}
                                    >
                                      {out ? "Out of stock" : "Low stock"}
                                    </span>
                                    <span className="text-[11px] tabular-nums text-[var(--text-secondary)]">
                                      {item.current_stock} / {item.reorder_threshold}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    {lowStockCount > 40 && (
                      <p className="text-[10px] text-[var(--text-muted)] px-4 py-2 border-t border-[var(--border-default)]/40">
                        Showing 40 of {lowStockCount} lines. Open Inventory for
                        the full list.
                      </p>
                    )}
                  </div>
                )}

                {notifications.length > 0 && (
                  <div>
                    {hasStockAlerts && (
                      <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] bg-[var(--bg-surface)]/40">
                        Messages
                      </div>
                    )}
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={cn(
                          "flex items-start gap-3 px-4 py-3",
                          "border-l-2",
                          PRIORITY_COLORS[notification.priority] ||
                            "border-l-transparent",
                          !notification.is_read && "bg-[var(--bg-surface)]/40",
                          "hover:bg-[var(--border-default)]/20 transition-colors cursor-pointer",
                        )}
                        onClick={() =>
                          !notification.is_read &&
                          void handleMarkRead(notification.id)
                        }
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {NOTIFICATION_TYPE_ICONS[
                            notification.notification_type
                          ] || <Bell className="w-4 h-4 text-gray-500" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-sm font-medium truncate",
                              notification.is_read
                                ? "text-[var(--text-secondary)]"
                                : "text-[var(--text-primary)]",
                            )}
                          >
                            {notification.title}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          {notification.notification_type === "LOW_STOCK" && (
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">
                                Stock: {notification.current_stock}/
                                {notification.threshold}
                              </span>
                              {notification.warehouse_name && (
                                <span className="text-xs text-[var(--text-muted)]">
                                  {notification.warehouse_name}
                                </span>
                              )}
                            </div>
                          )}
                          <p className="text-xs text-[var(--text-muted)] mt-1">
                            {formatTimeAgo(notification.created_at)}
                          </p>
                        </div>

                        {!notification.is_read && (
                          <div className="flex-shrink-0">
                            <div className="w-2 h-2 rounded-full bg-[#c4a574]" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {(notifications.length > 0 ||
            hasStockAlerts ||
            lowStockError) && (
            <div className="px-4 py-2 border-t border-[var(--border-default)] flex flex-col gap-1.5 shrink-0">
              {(hasStockAlerts || lowStockError) && (
                <Link
                  href={adminHref("/inventory")}
                  className="block text-center text-xs text-amber-500/90 hover:text-amber-400 transition-colors font-medium"
                >
                  Open inventory
                </Link>
              )}
              {notifications.length > 0 && (
                <Link
                  href={adminHref("/settings")}
                  className="block text-center text-xs text-[#c4a574] hover:text-[#d4b88a] transition-colors"
                >
                  Notification settings
                </Link>
              )}
            </div>
          )}
          </div>,
          document.body,
        )}
    </div>
  );
}
