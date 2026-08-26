"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ 
  message = "Something went wrong", 
  onRetry 
}: ErrorStateProps) {
  return (
    <div className="py-12 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#c45c5c]/10 mb-4">
        <AlertTriangle className="w-7 h-7 text-[#c45c5c]" />
      </div>
      <h3 className="text-lg font-semibold text-[#f3eee4] mb-2">Error</h3>
      <p className="text-sm text-[#c5c0b5] mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-[#f3eee4] hover:bg-white/[0.08] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      )}
    </div>
  );
}
