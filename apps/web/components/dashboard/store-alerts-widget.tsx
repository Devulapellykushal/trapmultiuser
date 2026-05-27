"use client";

import * as React from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { adminHref } from "@/lib/admin-routes";

/**
 * Low-stock summary across stores. Not wired on the main dashboard yet
 * (see roadmap); import where store alerts should appear.
 */
export function StoreAlertsWidget() {
  const [alerts, setAlerts] = React.useState<{
    totalAlerts: number;
    stores: Array<{
      storeId: string;
      storeName: string;
      storeCode: string;
      lowStockCount: number;
    }>;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchAlerts() {
      try {
        const { storesService } = await import("@/services");
        const data = await storesService.getLowStockAlerts();
        setAlerts(data);
      } catch (err) {
        console.error("Failed to fetch store alerts:", err);
      } finally {
        setLoading(false);
      }
    }
    void fetchAlerts();
  }, []);

  if (loading) {
    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-5">Store Alerts</h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-pulse text-white/40">Loading...</div>
        </div>
      </div>
    );
  }

  if (!alerts || alerts.totalAlerts === 0) {
    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-5">Store Alerts</h2>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="p-3 rounded-full bg-emerald-500/10 mb-3">
            <Package className="w-6 h-6 text-emerald-400" />
          </div>
          <p className="text-white/60 text-sm">All stores are well stocked</p>
          <Link
            href={adminHref("/stores")}
            className="text-[#C6A15B] text-sm mt-2 hover:underline"
          >
            View all stores →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/5 backdrop-blur-sm rounded-xl border border-amber-500/20 p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">Store Alerts</h2>
        <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
          {alerts.totalAlerts} alert(s)
        </span>
      </div>
      <div className="space-y-3">
        {alerts.stores.slice(0, 3).map((store) => (
          <Link
            key={store.storeId}
            href={`${adminHref("/stores")}/${store.storeId}`}
            className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-amber-500/10">
                <Package className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white group-hover:text-amber-300 transition-colors">
                  {store.storeName}
                </p>
                <p className="text-xs text-white/40">{store.storeCode}</p>
              </div>
            </div>
            <span className="text-amber-400 text-sm font-medium">
              {store.lowStockCount} low
            </span>
          </Link>
        ))}
        {alerts.stores.length > 3 && (
          <Link
            href={adminHref("/stores")}
            className="block text-center text-sm text-[#C6A15B] hover:underline py-2"
          >
            View all {alerts.stores.length} stores with alerts →
          </Link>
        )}
      </div>
    </div>
  );
}
