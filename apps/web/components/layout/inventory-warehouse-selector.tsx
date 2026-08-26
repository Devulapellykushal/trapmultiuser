"use client";

import * as React from "react";
import { Building2, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWarehouses, useLocationLabels } from "@/hooks";
import { useInventoryWarehouseFilterStore } from "@/hooks/use-inventory-warehouse-filter";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown";

export function InventoryWarehouseSelector() {
  const { data: warehouses, isLoading, isError } = useWarehouses();
  const { labels } = useLocationLabels();
  const warehouseId = useInventoryWarehouseFilterStore((s) => s.warehouseId);
  const setWarehouseId = useInventoryWarehouseFilterStore((s) => s.setWarehouseId);

  const list = warehouses ?? [];

  // 0 or 1 godown: no filter (no "All godowns" noise)
  React.useEffect(() => {
    if (list.length <= 1 && warehouseId) {
      setWarehouseId("");
    }
  }, [list.length, warehouseId, setWarehouseId]);

  if (!isLoading && list.length <= 1) {
    return null;
  }

  if (isLoading && list.length === 0) {
    return (
      <button
        type="button"
        disabled
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.05] border border-[var(--border-default)] text-[var(--text-muted)] text-sm"
      >
        <Loader2 className="w-4 h-4 animate-spin stroke-[1.5]" />
        Loading…
      </button>
    );
  }

  const selected =
    warehouseId === "" ? null : list.find((w) => String(w.id) === warehouseId);

  const label =
    warehouseId === ""
      ? labels.filterAll
      : selected?.name ?? labels.warehouseSingularTitle;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.05] border border-[var(--border-default)] text-[var(--text-primary)] text-sm hover:bg-white/[0.08] transition-colors max-w-[min(18rem,calc(100vw-12rem))]"
          aria-label={labels.filterLabel}
        >
          <Building2 className="w-4 h-4 shrink-0 text-[var(--text-secondary)] stroke-[1.5]" />
          <span className="truncate">{label}</span>
          <ChevronDown className="w-4 h-4 shrink-0 text-[var(--text-muted)] stroke-[1.5]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[12rem]">
        <DropdownMenuLabel>{labels.filterLabel}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => setWarehouseId("")}
          className={cn(warehouseId === "" && "bg-[var(--accent-primary)]/15")}
        >
          {labels.filterAll}
        </DropdownMenuItem>
        {isError && (
          <DropdownMenuItem disabled className="text-[var(--danger)]">
            Could not load locations
          </DropdownMenuItem>
        )}
        {list.map((w) => {
          const id = String(w.id);
          const active = warehouseId === id;
          return (
            <DropdownMenuItem
              key={id}
              onSelect={() => setWarehouseId(id)}
              className={cn(active && "bg-[var(--accent-primary)]/15")}
            >
              <span className="truncate">{w.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
