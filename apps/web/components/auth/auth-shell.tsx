"use client";

import {
  QUAKE_LOGO_HEIGHT,
  QUAKE_LOGO_SRC,
  QUAKE_LOGO_WIDTH,
} from "@/lib/brand-colors";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex flex-1 min-h-dvh items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="fixed left-4 top-4 z-20 inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-secondary)] shadow-sm backdrop-blur-md transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/60"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Back to home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex h-20 w-[7.25rem] items-center justify-center sm:h-24 sm:w-[8.5rem]">
            <Image
              src={QUAKE_LOGO_SRC}
              alt="Quake"
              width={QUAKE_LOGO_WIDTH}
              height={QUAKE_LOGO_HEIGHT}
              className="h-full w-full object-contain drop-shadow-md"
              priority
            />
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Inventory Management System
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] backdrop-blur-xl shadow-lg overflow-hidden">
          <div className="p-6">
            <h2 className="font-display text-xl font-semibold text-[var(--text-primary)] mb-1">
              {title}
            </h2>
            {subtitle ? (
              <p className="text-sm text-[var(--text-muted)] mb-6">{subtitle}</p>
            ) : (
              <div className="mb-6" />
            )}
            {children}
          </div>
          {footer ? (
            <div className="px-6 py-4 border-t border-[var(--border-default)] bg-[var(--bg-page)]/50 text-center text-sm text-[var(--text-muted)]">
              {footer}
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
