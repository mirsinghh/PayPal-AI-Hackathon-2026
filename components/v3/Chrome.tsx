"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppBase } from "@/lib/v3/base";
import { AgentDPose } from "@/components/v3/mascot/AgentD";
import { btn } from "@/components/v3/ui";
import { IconArrow } from "@/components/v3/icons";

// Paths are relative to where the UI is mounted (/v3 or /v4, see lib/v3/base.tsx).
export const FLOW = [
  { path: "/brief", label: "Mission" },
  { path: "/negotiation", label: "Negotiation" },
  { path: "/deals", label: "Review" },
  { path: "/checkout", label: "Pay" },
] as const;

export function Logo({ base }: { base: string }) {
  const version = base.slice(1).toUpperCase();
  return (
    <Link href={base} aria-label={`AgentDeal ${version} home`} className="group flex items-center gap-2.5 rounded-v3-md">
      <span aria-hidden className="grid size-10 place-items-center overflow-hidden rounded-[12px] border border-v3-line bg-v3-soft transition-transform duration-(--v3-d2) group-hover:-rotate-3">
        <AgentDPose sprite="idle" size={34} />
      </span>
      <span className="font-v3-head text-[1.35rem] font-extrabold tracking-tight">AgentDeal</span>
      <span className="v3-chip v3-chip--accent !py-0.5 !text-[0.7rem]">{version}</span>
    </Link>
  );
}

export function V3HeaderFallback() {
  return <div aria-hidden className="h-[72px] border-b border-v3-line" />;
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

export function V3Header() {
  const path = usePathname();
  const base = useAppBase();
  const rel = path.startsWith(base) ? path.slice(base.length) || "/" : path;
  let flowIndex = FLOW.findIndex((s) => rel === s.path || rel.startsWith(`${s.path}/`));
  // V4's entry screen is the brief itself (/v4), so the bare mount point is step 1 there.
  if (flowIndex < 0 && base === "/v4" && rel === "/") flowIndex = 0;
  const onHome = base === "/v3" && path === "/v3";
  return (
    <header className="sticky top-0 z-40 border-b border-v3-line bg-v3-bg/90 backdrop-blur supports-[backdrop-filter]:bg-v3-bg/80">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo base={base} />
        {flowIndex >= 0 ? (
          <FlowProgress index={flowIndex} />
        ) : (
          <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
            {onHome &&
              [
                ["#how", "How it works"],
                ["#demo", "Watch a demo"],
                ["#approval", "You decide"],
                ["#paypal", "PayPal Sandbox"],
              ].map(([href, label]) => (
                <a key={href} href={href} className="rounded-v3-md px-3 py-2 text-[0.95rem] font-semibold text-v3-ink2 transition-colors duration-(--v3-d1) hover:bg-v3-soft2 hover:text-v3-ink">
                  {label}
                </a>
              ))}
            <Link href={`${base}/activity`} className="rounded-v3-md px-3 py-2 text-[0.95rem] font-semibold text-v3-ink2 transition-colors duration-(--v3-d1) hover:bg-v3-soft2 hover:text-v3-ink">
              My activity
            </Link>
          </nav>
        )}
        {flowIndex < 0 && (
          <Link href={`${base}/brief`} className={btn("primary", "sm")}>
            Start negotiating <IconArrow size={16} />
          </Link>
        )}
      </div>
    </header>
  );
}
