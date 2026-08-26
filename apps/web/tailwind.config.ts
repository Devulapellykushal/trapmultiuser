import type { Config } from "tailwindcss";

/** rgb(var(--x) / <alpha-value>) — lets opacity modifiers use brand tokens only */
const alpha = (cssVar: string) => `rgb(var(${cssVar}) / <alpha-value>)`;

const scale = (cssVar: string) => ({
  50: alpha(cssVar),
  100: alpha(cssVar),
  200: alpha(cssVar),
  300: alpha(cssVar),
  400: alpha(cssVar),
  500: alpha(cssVar),
  600: alpha(cssVar),
  700: alpha(cssVar),
  800: alpha(cssVar),
  900: alpha(cssVar),
  950: alpha(cssVar),
});

const brandScale = scale("--brand-rgb");
const successScale = scale("--success-rgb");
const warningScale = scale("--warning-rgb");
const dangerScale = scale("--danger-rgb");

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "../client/src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "var(--bg-primary)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
          overlay: "var(--bg-overlay)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        accent: {
          primary: "var(--accent-primary)",
          "primary-hover": "var(--accent-primary-hover)",
          secondary: "var(--accent-secondary)",
          "secondary-hover": "var(--accent-secondary-hover)",
        },
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          deep: "var(--brand-deep)",
          muted: "var(--brand-muted)",
          contrast: "var(--brand-contrast)",
        },
        success: {
          DEFAULT: "var(--success)",
          muted: "var(--success-muted)",
          ...successScale,
        },
        warning: {
          DEFAULT: "var(--warning)",
          muted: "var(--warning-muted)",
          ...warningScale,
        },
        danger: {
          DEFAULT: "var(--danger)",
          muted: "var(--danger-muted)",
          ...dangerScale,
        },
        border: {
          DEFAULT: "var(--border-default)",
          hover: "var(--border-hover)",
          focus: "var(--border-focus)",
        },

        /* —— Hard lock: every Tailwind hue → brand palette only —— */
        emerald: successScale,
        green: successScale,
        lime: successScale,
        teal: successScale,
        amber: warningScale,
        yellow: warningScale,
        orange: warningScale,
        red: dangerScale,
        rose: dangerScale,
        blue: brandScale,
        indigo: brandScale,
        violet: brandScale,
        purple: brandScale,
        fuchsia: brandScale,
        pink: brandScale,
        cyan: brandScale,
        sky: brandScale,

        /* Neutrals → ink / ivory */
        zinc: {
          50: alpha("--text-rgb"),
          100: alpha("--text-rgb"),
          200: alpha("--text-rgb"),
          300: alpha("--text-rgb"),
          400: alpha("--text-rgb"),
          500: alpha("--text-rgb"),
          600: alpha("--elevated-rgb"),
          700: alpha("--elevated-rgb"),
          800: alpha("--page-rgb"),
          900: alpha("--ink-rgb"),
          950: alpha("--ink-rgb"),
        },
        slate: {
          50: alpha("--text-rgb"),
          100: alpha("--text-rgb"),
          200: alpha("--text-rgb"),
          300: alpha("--text-rgb"),
          400: alpha("--text-rgb"),
          500: alpha("--text-rgb"),
          600: alpha("--elevated-rgb"),
          700: alpha("--elevated-rgb"),
          800: alpha("--page-rgb"),
          900: alpha("--ink-rgb"),
          950: alpha("--ink-rgb"),
        },
        gray: {
          50: alpha("--text-rgb"),
          100: alpha("--text-rgb"),
          200: alpha("--text-rgb"),
          300: alpha("--text-rgb"),
          400: alpha("--text-rgb"),
          500: alpha("--text-rgb"),
          600: alpha("--elevated-rgb"),
          700: alpha("--elevated-rgb"),
          800: alpha("--page-rgb"),
          900: alpha("--ink-rgb"),
          950: alpha("--ink-rgb"),
        },
        neutral: {
          50: alpha("--text-rgb"),
          100: alpha("--text-rgb"),
          200: alpha("--text-rgb"),
          300: alpha("--text-rgb"),
          400: alpha("--text-rgb"),
          500: alpha("--text-rgb"),
          600: alpha("--elevated-rgb"),
          700: alpha("--elevated-rgb"),
          800: alpha("--page-rgb"),
          900: alpha("--ink-rgb"),
          950: alpha("--ink-rgb"),
        },
        stone: {
          50: alpha("--text-rgb"),
          100: alpha("--text-rgb"),
          200: alpha("--text-rgb"),
          300: alpha("--text-rgb"),
          400: alpha("--text-rgb"),
          500: alpha("--text-rgb"),
          600: alpha("--elevated-rgb"),
          700: alpha("--elevated-rgb"),
          800: alpha("--page-rgb"),
          900: alpha("--ink-rgb"),
          950: alpha("--ink-rgb"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        "heading-xl": ["2.5rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        "heading-lg": ["1.875rem", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        "heading-md": ["1.5rem", { lineHeight: "1.3" }],
        "heading-sm": ["1.25rem", { lineHeight: "1.4" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6" }],
        body: ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5" }],
        caption: ["0.75rem", { lineHeight: "1.4" }],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        glow: "var(--shadow-glow)",
      },
      backdropBlur: {
        glass: "var(--glass-blur)",
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        medium: "var(--motion-medium)",
        slow: "var(--motion-slow)",
      },
      transitionTimingFunction: {
        smooth: "var(--motion-easing)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "slide-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-down": {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in var(--motion-medium) var(--motion-easing)",
        "fade-out": "fade-out var(--motion-medium) var(--motion-easing)",
        "slide-up": "slide-up var(--motion-medium) var(--motion-easing)",
        "slide-down": "slide-down var(--motion-medium) var(--motion-easing)",
        "scale-in": "scale-in var(--motion-medium) var(--motion-easing)",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
