/**
 * Warehouse Selector Component
 *
 * PHASE 17: Global dashboard filtering
 */
"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, ChevronDown, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { inventoryService, Warehouse } from "@/services";
import { inventoryKeys } from "@/hooks";

interface WarehouseSelectorProps {
  value: string | null;
  onChange: (warehouseId: string | null) => void;
  className?: string;
  showAllOption?: boolean;
  placeholder?: string;
}

export function WarehouseSelector({
  value,
  onChange,
  className = "",
  showAllOption = true,
  placeholder = "All Warehouses",
}: WarehouseSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Fetch warehouses
  const { data: warehouses, isLoading } = useQuery({
    queryKey: inventoryKeys.warehouses(),
    queryFn: () => inventoryService.getWarehouses(),
    staleTime: 300000, // 5 minutes
  });

  // Close on outside click
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedWarehouse = warehouses?.find((w: Warehouse) => w.id === value);
  const displayText = selectedWarehouse?.name || placeholder;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-50"
      >
        <Building2 className="w-4 h-4 text-white/40" />
        <span className="max-w-[120px] truncate">{displayText}</span>
        <ChevronDown
          className={`w-4 h-4 text-white/40 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 mt-2 w-56 popover-panel rounded-xl z-[80] py-1"
          >
            {/* All option - only if showAllOption is true */}
            {showAllOption && (
              <>
                <button
                  onClick={() => {
                    onChange(null);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                >
                  <span>{placeholder}</span>
                  {!value && <Check className="w-4 h-4 text-[#c4a574]" />}
                </button>

                {/* Divider */}
                <div className="my-1 border-t border-white/10" />
              </>
            )}

            {/* Warehouse list */}
            {warehouses?.map((warehouse: Warehouse) => (
              <button
                key={warehouse.id}
                onClick={() => {
                  onChange(warehouse.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
              >
                <div className="flex flex-col items-start">
                  <span>{warehouse.name}</span>
                  {warehouse.address && (
                    <span className="text-xs text-white/40">
                      {warehouse.address}
                    </span>
                  )}
                </div>
                {value === warehouse.id && (
                  <Check className="w-4 h-4 text-[#c4a574]" />
                )}
              </button>
            ))}

            {(!warehouses || warehouses.length === 0) && !isLoading && (
              <div className="px-3 py-2 text-sm text-white/40">
                No warehouses found
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default WarehouseSelector;
