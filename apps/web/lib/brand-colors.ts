/**
 * Quake brand palette — only these hues may appear in the UI.
 * Charts / multi-series use brass shades + semantic accents.
 */
export const BRAND = {
  ink: "#0c0d10",
  page: "#111318",
  elevated: "#1c1d22",
  text: "#f3eee4",
  brand: "#c4a574",
  brandHover: "#d4b88a",
  brandDeep: "#8f7349",
  brandSoft: "#b8956a",
  brandLight: "#e0cba0",
  success: "#3f9d7a",
  warning: "#d4a054",
  danger: "#c45c5c",
  muted: "#8a867c",
  secondary: "#c5c0b5",
} as const;

/** Canonical Quake mark — use for UI, favicon, and PWA icons */
export const QUAKE_LOGO_SRC = "/assets/2d/Quake_Logo.png";
export const QUAKE_LOGO_WIDTH = 1105;
export const QUAKE_LOGO_HEIGHT = 755;

/** Multi-series charts — brass family only (+ semantics when needed) */
export const CHART_SERIES = [
  BRAND.brand,
  BRAND.brandHover,
  BRAND.brandDeep,
  BRAND.brandSoft,
  BRAND.brandLight,
  BRAND.success,
  BRAND.warning,
  BRAND.danger,
  BRAND.brand,
  BRAND.brandHover,
] as const;

export const CHART = {
  axis: BRAND.muted,
  grid: "rgba(243, 238, 228, 0.08)",
  tooltipBg: BRAND.elevated,
  tooltipText: BRAND.text,
  primary: BRAND.brand,
  secondary: BRAND.brandHover,
  tertiary: BRAND.brandDeep,
  success: BRAND.success,
  warning: BRAND.warning,
  danger: BRAND.danger,
} as const;
