"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { mountLandingClassicChrome } from "@studio/app/mount-landing-classic-chrome.jsx";
import { mountLandingEffects } from "@studio/app/mount-landing-effects.jsx";

import "@studio/styles/globals.scss";

const ADMIN_LOGIN = "/login?next=%2Fadmin";

function applyLandingHome() {
  const main = document.querySelector("main.landing-root");
  const visuals = document.querySelector("#landing-visuals-root");
  const heroShell = document.querySelector("#landing-hero-shell");
  if (!main || !visuals) return;

  main.classList.remove("landing-root--next-mode");
  main.classList.remove("landing-root--cinematic-transition");
  main.setAttribute("data-landing-mode", "home");
  heroShell?.classList.remove("landing-hero--transitioning");
  visuals.classList.remove("landing-visuals--transitioning");
  visuals.classList.add("hidden");
  visuals.classList.remove("flex");
  window.dispatchEvent(new CustomEvent("studio:landing-path"));
}

declare global {
  interface Window {
    __navigateLandingPath?: (path: string) => void;
    __enterNextExperience?: () => void;
  }
}

/** Full-screen studio landing (ported from Vite `apps/client`). Post-login admin: `/login?next=%2Fadmin`. */
export function StudioLandingShell() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const initialized = useRef(false);

  useLayoutEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      window.__navigateLandingPath = (path: string) => {
        const p = path || "/";
        if (p === "/next" || p.startsWith("/next/")) {
          router.replace("/");
          return;
        }
        router.push(p);
      };
      window.__enterNextExperience = () => {
        router.push(ADMIN_LOGIN);
      };
      mountLandingClassicChrome();
      mountLandingEffects();
    }
    if (pathname === "/next" || pathname === "/next/") {
      router.replace("/");
    }
    applyLandingHome();
    requestAnimationFrame(() => {
      document
        .querySelector("main.landing-root")
        ?.classList.remove("landing-root--boot-hidden");
    });
  }, [pathname, router]);

  return (
    <main
      className="landing-root landing-root--boot-hidden relative flex min-h-dvh flex-col overflow-x-hidden overflow-y-auto scroll-smooth bg-black text-white [scrollbar-gutter:stable] snap-y snap-mandatory"
      suppressHydrationWarning
    >
      <div id="landing-chrome-root" />

      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_0%,rgba(255,255,255,0.06),transparent)]" />
      </div>

      <div
        id="landing-hero-shell"
        className="relative z-10 flex min-h-dvh shrink-0 snap-start snap-always flex-col"
      >
        <section
          id="landing-hero-section"
          className="relative flex min-h-0 min-h-dvh flex-1 flex-col items-center justify-center px-5 pb-32 pt-20 sm:px-10 sm:pb-40 sm:pt-16 pointer-events-auto"
        >
          <div
            id="hero-floating-lines-root"
            className="pointer-events-none absolute inset-0 z-0 min-h-full opacity-[0.55]"
            aria-hidden
          />
          <div
            className="pointer-events-auto relative z-10 flex max-w-2xl flex-col items-center text-center"
            style={{
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            }}
          >
            <h1
              className="text-4xl font-normal italic leading-tight tracking-tight text-white sm:text-5xl md:text-6xl"
              style={{
                fontFamily:
                  "'Playfair Display', Georgia, 'Times New Roman', serif",
              }}
            >
              Quake
            </h1>
            <div className="mt-8 space-y-1.5 text-[0.65rem] font-medium uppercase leading-relaxed tracking-[0.18em] text-white sm:text-xs sm:tracking-[0.2em]">
              <p>Inventory you can trust,</p>
              <p>Warehouses, stock levels,</p>
              <p>Sales &amp; fulfilment</p>
            </div>
            <p className="mt-10 max-w-md text-sm font-light leading-relaxed text-white/70 sm:text-base">
              Run your catalogue, multi-warehouse stock, purchase orders, POS,
              and invoicing from one place — built for teams who move real
              product every day.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white">
              <a
                href={ADMIN_LOGIN}
                className="border-b border-white/50 pb-1 transition hover:border-white"
              >
                Sign in to admin
              </a>
            </div>
          </div>
        </section>
      </div>

      <div
        id="landing-visuals-root"
        className="landing-visuals-root relative z-10 hidden shrink-0 flex-col"
      />

      <div
        id="landing-cursor-root"
        className="pointer-events-none fixed inset-0 z-[35]"
        aria-hidden
      />

      <footer className="relative z-10 shrink-0 snap-start border-t border-white/10 bg-black px-5 py-5 text-xs text-white/50 sm:px-8">
        <span>
          Quake — inventory, warehouses, and sales in one workspace · Hold
          background to jump to sign-in
        </span>
      </footer>
    </main>
  );
}
