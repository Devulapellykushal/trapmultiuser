"use client";

/**
 * Theme Hook - Manages application theme with persistence.
 * Uses CSS custom properties and data-theme attribute.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Zustand store with localStorage persistence
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      setTheme: (theme: Theme) => {
        set({ theme });
        applyTheme(theme);
      },
      toggleTheme: () => {
        const newTheme = get().theme === "dark" ? "light" : "dark";
        set({ theme: newTheme });
        applyTheme(newTheme);
      },
    }),
    {
      name: "Quake-theme",
      onRehydrateStorage: () => {
        // This callback is called after rehydration completes
        return (state) => {
          if (state) {
            applyTheme(state.theme);
          }
        };
      },
    }
  )
);

// Apply theme to document
function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

// Hook to initialize theme on mount (prevents flash)
export function useThemeInit() {
  const theme = useThemeStore((state) => state.theme);
  
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  
  return theme;
}

// Convenience exports
export { useThemeStore as useTheme };
