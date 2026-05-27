"use client";

import { Building2, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWarehouses } from "@/hooks";
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
  const warehouseId = useInventoryWarehouseFilterStore((s) => s.warehouseId);
  const setWarehouseId = useInventoryWarehouseFilterStore((s) => s.setWarehouseId);

  const list = warehouses ?? [];
  const selected =
    warehouseId === "" ? null : list.find((w) => String(w.id) === warehouseId);

  const label =
    isLoading && list.length === 0
      ? "Loading warehouses…"
      : warehouseId === ""
        ? "All warehouses"
        : selected?.name ?? "Warehouse";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.05] border border-[var(--border-default)] text-[var(--text-primary)] text-sm hover:bg-white/[0.08] transition-colors max-w-[min(18rem,calc(100vw-12rem))]"
          aria-label="Filter inventory by warehouse"
        >
          <Building2 className="w-4 h-4 shrink-0 text-[var(--text-secondary)] stroke-[1.5]" />
          <span className="truncate">{label}</span>
          {isLoading && list.length === 0 ? (
            <Loader2 className="w-4 h-4 shrink-0 text-[var(--text-muted)] animate-spin stroke-[1.5]" />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0 text-[var(--text-muted)] stroke-[1.5]" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[12rem]">
        <DropdownMenuLabel>Filter by warehouse</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => setWarehouseId("")}
          className={cn(warehouseId === "" && "bg-[var(--accent-primary)]/15")}
        >
          All warehouses
        </DropdownMenuItem>
        {isError && (
          <DropdownMenuItem disabled className="text-[var(--danger)]">
            Could not load warehouses
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
        {isLoading && list.length === 0 && !isError && (
          <DropdownMenuItem disabled className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin stroke-[1.5]" />
            Loading…
          </DropdownMenuItem>
        )}
        {!isLoading && !isError && list.length === 0 && (
          <DropdownMenuItem disabled>No warehouses yet</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
