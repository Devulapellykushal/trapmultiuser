/**
 * Store Selector Component
 *
 * For selecting stores in POS and other interfaces
 */
"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Store, ChevronDown, Check, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { storesService, StoreListItem } from "@/services";

interface StoreSelectorProps {
  value: string | null;
  onChange: (storeId: string | null) => void;
  className?: string;
  showAllOption?: boolean;
  placeholder?: string;
}

export function StoreSelector({
  value,
  onChange,
  className = "",
  showAllOption = true,
  placeholder = "Select Store",
}: StoreSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Fetch active stores
  const { data: stores, isLoading } = useQuery({
    queryKey: ["stores", { isActive: true }],
    queryFn: () => storesService.getStores({ isActive: true }),
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

  const selectedStore = stores?.find((s: StoreListItem) => s.id === value);
  const displayText =
    selectedStore?.name || (showAllOption ? "All Stores" : placeholder);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-50"
      >
        <Store className="w-4 h-4 text-emerald-400" />
        <span className="max-w-[140px] truncate">{displayText}</span>
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
            className="absolute right-0 mt-2 w-64 popover-panel rounded-xl z-[80] py-1 max-h-80 overflow-y-auto"
          >
            {/* All option */}
            {showAllOption && (
              <>
                <button
                  onClick={() => {
                    onChange(null);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                >
                  <span>All Stores</span>
                  {!value && <Check className="w-4 h-4 text-emerald-400" />}
                </button>
                <div className="my-1 border-t border-white/10" />
              </>
            )}

            {/* Store list */}
            {stores?.map((store: StoreListItem) => (
              <button
                key={store.id}
                onClick={() => {
                  onChange(store.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium">{store.name}</span>
                  <div className="flex items-center gap-1 text-xs text-white/40">
                    <MapPin className="w-3 h-3" />
                    <span>{store.city}</span>
                    <span className="text-white/20">•</span>
                    <span className="font-mono">{store.code}</span>
                  </div>
                </div>
                {value === store.id && (
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                )}
              </button>
            ))}

            {(!stores || stores.length === 0) && !isLoading && (
              <div className="px-3 py-4 text-sm text-white/40 text-center">
                <Store className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No stores found</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default StoreSelector;
