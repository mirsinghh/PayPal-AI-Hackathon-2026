"use client";

import Link from "next/link";
import { AgentDPose } from "@/components/v3/mascot/AgentD";

// The purchase flow, derived from the route.
export const FLOW = [
  { path: "/brief", label: "Mission" },
  { path: "/negotiation", label: "Negotiation" },
  { path: "/deals", label: "Review" },
  { path: "/checkout", label: "Pay" },
] as const;

export function Logo() {
  return (
    <Link href="/" aria-label="AgentDeal home" className="group flex items-center gap-2.5 rounded-v3-md">
      <span aria-hidden className="grid size-10 place-items-center overflow-hidden rounded-[12px] border border-v3-line bg-v3-soft transition-transform duration-(--v3-d2) group-hover:-rotate-3">
        <AgentDPose sprite="idle" size={34} />
      </span>
      <span className="font-v3-head text-[1.35rem] font-extrabold tracking-tight">AgentDeal</span>
      <span className="v3-chip v3-chip--accent !py-0.5 !text-[0.7rem]">V5</span>
    </Link>
  );
}

/** The purchase flow in four steps. Informational: derived from the route, never a way to skip ahead. */
export function FlowProgress({ index }: { index: number }) {
  return (
    <nav aria-label="Purchase progress">
      <p className="text-sm font-semibold text-v3-ink2 md:hidden">
        Step {index + 1} of {FLOW.length} · <span className="text-v3-ink">{FLOW[index].label}</span>
      </p>
      <ol className="hidden items-center gap-1.5 md:flex">
        {FLOW.map((s, i) => {
          const state = i < index ? "done" : i === index ? "current" : "todo";
          return (
            <li key={s.path} aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className={`h-0.5 w-6 rounded-full ${i <= index ? "bg-v3-primary" : "bg-v3-line-strong"}`} />}
              <span className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold ${state === "current" ? "bg-v3-soft text-v3-ink" : "text-v3-ink2"}`}>
                <span
                  aria-hidden
                  className={`grid size-6 place-items-center rounded-full text-xs font-extrabold ${state === "current" ? "bg-v3-primary text-white" : state === "done" ? "bg-v3-soft text-v3-primary-ink" : "border border-v3-line-strong text-v3-ink2"}`}
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                {s.label}
                {state === "done" && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
