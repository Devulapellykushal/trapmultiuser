"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/** Thin top bar — instant feedback while Next.js navigates / compiles a route. */
export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = React.useState(false);
  const prevPath = React.useRef(pathname);

  React.useEffect(() => {
    if (prevPath.current !== pathname) {
      setActive(false);
      prevPath.current = pathname;
    }
  }, [pathname]);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#")) return;
      if (href === pathname) return;
      setActive(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  if (!active) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-0.5 overflow-hidden pointer-events-none"
      aria-hidden
    >
      <div className="h-full w-1/3 bg-[var(--brand)] animate-[navigation-progress_1.2s_ease-in-out_infinite]" />
    </div>
  );
}
