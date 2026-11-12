"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { availableNav } from "@/lib/nav";

const STEPS = [
  { id: "", label: "Brief" },
  { id: "negotiation", label: "Negotiate" },
  { id: "deals", label: "Review" },
  { id: "checkout", label: "Pay" },
] as const;

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-white">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="10" cy="10" r="2.4" fill="currentColor" stroke="none" />
          <path d="M3 4.5 8 8.5M17 4.5 12 8.5M3 15.5 8 11.5M17 15.5 12 11.5" />
        </svg>
      </span>
      <span className="text-h3 font-semibold tracking-tight">AgentDeal</span>
    </span>
  );
}

/** Where the user is in the purchase flow. Derived from the route, informational only (not links). */
function FlowProgress() {
  const path = usePathname();
  // "Brief" is the home page: always completed once a session exists.
  const idx = STEPS.findIndex((s) => s.id !== "" && path.startsWith(`/${s.id}`));
  if (idx < 0) return null;
  return (
    <nav aria-label="Purchase progress" className="flex items-center">
      <p className="text-small text-ink-2 sm:hidden">
        Step {idx + 1} of {STEPS.length} · <span className="font-medium text-ink">{STEPS[idx].label}</span>
      </p>
      <ol className="hidden items-center gap-1 sm:flex">
        {STEPS.map((s, i) => {
          const state = i < idx ? "done" : i === idx ? "current" : "todo";
          return (
            <li key={s.id} aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden className="relative h-px w-6 overflow-hidden bg-line-strong">
                  <span className={`absolute inset-0 origin-left bg-primary transition-transform duration-(--d2) ease-out-soft ${i <= idx ? "scale-x-100" : "scale-x-0"}`} />
                </span>
              )}
              <span
                className={`flex items-center gap-2 rounded-md px-2 py-1 text-small ${
                  state === "current" ? "font-medium text-ink" : state === "done" ? "text-ink-2" : "text-ink-2"
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-flex size-5 items-center justify-center rounded-full text-caption font-medium tabular ${
                    state === "current"
                      ? "bg-primary text-white"
                      : state === "done"
                        ? "bg-primary-soft text-primary"
                        : "border border-line-strong text-ink-2"
                  }`}
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                {s.label}
                {state === "done" && <span className="sr-only"> (completed)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function AppHeader() {
  const items = availableNav();
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" aria-label="AgentDeal home" className="rounded-md">
            <Logo />
          </Link>
          {/* Rendered only once there is more than one available destination (see lib/nav.ts). */}
          {items.length > 1 && (
            <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
              {items.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  aria-current={path === n.href ? "page" : undefined}
                  className="rounded-md px-3 py-1.5 text-small text-ink-2 hover:bg-subtle hover:text-ink aria-[current=page]:font-medium aria-[current=page]:text-ink"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <FlowProgress />
        <span className="hidden items-center gap-2 text-caption text-ink-2 md:flex">
          <span aria-hidden className="size-1.5 rounded-full bg-warning" />
          PayPal Sandbox · demo data
        </span>
      </div>
    </header>
  );
}
