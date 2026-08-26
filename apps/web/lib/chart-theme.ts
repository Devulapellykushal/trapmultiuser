"use client";

import { useSyncExternalStore } from "react";
import { useThemeStore, type Theme } from "@/hooks/use-theme";

export type ChartThemeTokens = {
  axis: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipMuted: string;
  cursor: string;
  primary: string;
  secondary: string;
  success: string;
};

const DARK: ChartThemeTokens = {
  axis: "rgba(243, 238, 228, 0.5)",
  grid: "rgba(243, 238, 228, 0.1)",
  tooltipBg: "rgba(17, 19, 24, 0.96)",
  tooltipBorder: "rgba(243, 238, 228, 0.1)",
  tooltipText: "#f3eee4",
  tooltipMuted: "rgba(243, 238, 228, 0.6)",
  cursor: "rgba(196, 165, 116, 0.15)",
  primary: "#c4a574",
  secondary: "#d4b88a",
  success: "#3f9d7a",
};

const LIGHT: ChartThemeTokens = {
  axis: "rgba(12, 13, 16, 0.48)",
  grid: "rgba(12, 13, 16, 0.08)",
  tooltipBg: "rgba(255, 255, 255, 0.98)",
  tooltipBorder: "rgba(12, 13, 16, 0.1)",
  tooltipText: "#0c0d10",
  tooltipMuted: "rgba(12, 13, 16, 0.55)",
  cursor: "rgba(154, 123, 82, 0.12)",
  primary: "#9a7b52",
  secondary: "#8f7349",
  success: "#3f9d7a",
};

export function chartThemeFor(theme: Theme): ChartThemeTokens {
  return theme === "light" ? LIGHT : DARK;
}

function subscribeTheme(onStoreChange: () => void) {
  const el = document.documentElement;
  const obs = new MutationObserver(onStoreChange);
  obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

function readDomTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

/** Theme-aware chart colors — updates when light/dark toggles. */
export function useChartTheme(): ChartThemeTokens {
  const storeTheme = useThemeStore((s) => s.theme);
  const domTheme = useSyncExternalStore(
    subscribeTheme,
    readDomTheme,
    () => "dark" as Theme,
  );
  return chartThemeFor(storeTheme || domTheme);
}
