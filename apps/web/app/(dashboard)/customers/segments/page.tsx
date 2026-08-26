"use client";

import * as React from "react";
import {
  Building2,
  CalendarPlus,
  CreditCard,
  Loader2,
  Repeat,
  TimerOff,
  Users,
} from "lucide-react";
import { PageTransition } from "@/components/layout";
import { useCustomerSegments } from "@/hooks/use-customers";
import { useIndustryProfile } from "@/lib/industry";
import type { CustomerSegmentCounts } from "@/services/customers.service";

interface SegmentDef {
  id: keyof CustomerSegmentCounts;
  title: string;
  description: string;
  icon: React.ElementType;
  live: boolean;
}

export default function CustomerSegmentsPage() {
  const industry = useIndustryProfile();
  const { data: counts, isLoading, isError, refetch } = useCustomerSegments();

  const segmentDefs: SegmentDef[] = [
    {
      id: "allActive",
      title: "All active",
      description: "Everyone marked active in the directory.",
      icon: Users,
      live: true,
    },
    {
      id: "creditOutstanding",
      title: "Credit outstanding",
      description: "Buyers with an open credit balance on invoices.",
      icon: CreditCard,
      live: true,
    },
    {
      id: "repeatBuyers",
      title: "Repeat buyers",
      description: "Two or more linked completed sales.",
      icon: Repeat,
      live: true,
    },
    {
      id: "fleetGstin",
      title: industry.crm.gstSegmentLabel,
      description: industry.crm.gstSegmentHint,
      icon: Building2,
      live: true,
    },
    {
      id: "lapsed90d",
      title: "Lapsed 90 days",
      description: "Had sales before, none in the last three months.",
      icon: TimerOff,
      live: true,
    },
    {
      id: "newThisMonth",
      title: "New this month",
      description: "Added to the directory in the current month.",
      icon: CalendarPlus,
      live: true,
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
            Segments
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Live lists from your CRM + sales — blast wiring next
          </p>
        </div>

        {isError ? (
          <p className="text-sm text-[var(--danger)]">
            Couldn’t load segment counts.{" "}
            <button
              type="button"
              onClick={() => refetch()}
              className="underline text-[var(--brand)]"
            >
              Retry
            </button>
          </p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {segmentDefs.map((seg) => {
            const Icon = seg.icon;
            const count = counts?.[seg.id];
            return (
              <div
                key={seg.id}
                className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 flex flex-col gap-4 hover:border-[var(--brand)]/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="p-2 rounded-xl bg-[var(--brand-muted)]">
                    <Icon className="w-4 h-4 text-[var(--brand)]" />
                  </div>
                  <span className="text-2xl font-semibold tabular-nums text-[var(--text-primary)] min-h-[2rem] flex items-center">
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
                    ) : count === undefined ? (
                      <span className="text-[var(--text-muted)]">—</span>
                    ) : (
                      count
                    )}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      {seg.title}
                    </h2>
                    {seg.live ? (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--success-muted)] text-[var(--success)] font-semibold">
                        Live
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {seg.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-auto pt-1">
                  <button
                    type="button"
                    disabled
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-default)] text-[var(--text-muted)] cursor-not-allowed"
                  >
                    Start WhatsApp blast
                  </button>
                  <button
                    type="button"
                    disabled
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-default)] text-[var(--text-muted)] cursor-not-allowed"
                  >
                    Export for Meta
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PageTransition>
  );
}
