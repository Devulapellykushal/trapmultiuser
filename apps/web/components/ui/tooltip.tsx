"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  disabled?: boolean;
}

export function Tooltip({ 
  content, 
  children, 
  position = "top",
  disabled = false 
}: TooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  if (disabled) {
    return <>{children}</>;
  }

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-[#111318] border-x-transparent border-b-transparent",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-[#111318] border-x-transparent border-t-transparent",
    left: "left-full top-1/2 -translate-y-1/2 border-l-[#111318] border-y-transparent border-r-transparent",
    right: "right-full top-1/2 -translate-y-1/2 border-r-[#111318] border-y-transparent border-l-transparent",
  };

  return (
    <div 
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className={`absolute z-50 ${positionClasses[position]}`}
          >
            <div className="px-3 py-2 rounded-lg bg-[#111318] border border-white/[0.15] shadow-xl">
              <p className="text-xs text-[#f3eee4] whitespace-nowrap">{content}</p>
            </div>
            {/* Arrow */}
            <div 
              className={`absolute w-0 h-0 border-[6px] ${arrowClasses[position]}`}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Convenience wrapper for disabled buttons with tooltips
interface DisabledButtonProps {
  children: React.ReactNode;
  tooltip: string;
  className?: string;
}

export function DisabledButton({ children, tooltip, className = "" }: DisabledButtonProps) {
  return (
    <Tooltip content={tooltip}>
      <button
        disabled
        className={`
          cursor-not-allowed opacity-50
          ${className}
        `}
      >
        {children}
      </button>
    </Tooltip>
  );
}
