import type { ReactNode } from "react";
import Link from "next/link";
import { IconAlert, IconCheck, IconInfo, IconX } from "@/components/icons";

/** Flat surface with a hairline border. No shadow, no nested-card styling. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-surface ${className}`}>{children}</section>;
}

type Tone = "success" | "danger" | "warning" | "info" | "muted" | "primary";

const BADGE_TONES: Record<Tone, string> = {
  success: "border-success-line bg-success-soft text-success",
  danger: "border-danger-line bg-danger-soft text-danger",
  warning: "border-warning-line bg-warning-soft text-warning",
  info: "border-line bg-subtle text-ink-2",
  muted: "border-line bg-subtle text-ink-2",
  primary: "border-primary/20 bg-primary-soft text-primary",
};

/** Status chip. Always carries text (and optionally an icon), never colour alone. */
export function Badge({ tone = "muted", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-caption font-medium whitespace-nowrap ${BADGE_TONES[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

const btnBase =
  "group inline-flex min-h-[var(--btn-h,2.75rem)] items-center justify-center gap-2 rounded-md px-[var(--btn-px,1.25rem)] text-small font-medium whitespace-nowrap transition-[background-color,border-color,color,transform,box-shadow] duration-(--d1) ease-out-soft active:scale-[0.98] active:duration-75 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";
export const btn = btnBase;
/* Hover lifts 1px with a brand-tinted shadow (never pure black). */
export const btnPrimary = `${btnBase} bg-primary text-white shadow-xs hover:-translate-y-px hover:bg-primary-hover hover:shadow-[0_6px_14px_-6px_rgb(0_48_135/0.5)] disabled:hover:translate-y-0 disabled:hover:shadow-xs`;
/** Arrow icons inside buttons nudge 3px on hover. */
export const arrowNudge = "transition-transform duration-(--d1) ease-out-soft group-hover:translate-x-[3px]";
/** Size modifiers set CSS variables, so they never fight the base padding for specificity. */
export const btnLarge = "[--btn-h:3rem] [--btn-px:1.5rem] text-body";
export const btnCompact = "[--btn-px:1rem]";
export const btnSecondary = `${btnBase} border border-line-strong bg-surface text-ink hover:bg-subtle`;
export const btnGhost = `${btnBase} text-ink-2 hover:bg-subtle hover:text-ink`;

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="spinner" width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Three-dot "typing" indicator. Only render it for a real recorded state (a live agent was asked and has not
 * replied yet). Never as decoration, never in the rule-based simulation.
 */
export function TypingDots({ label }: { label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-1 text-ink-2">
      {[0, 1, 2].map((k) => (
        <span key={k} aria-hidden className="typing-dot" style={{ "--k": k } as React.CSSProperties} />
      ))}
    </span>
  );
}

const BANNER: Record<"info" | "warning" | "danger" | "success", { cls: string; icon: ReactNode }> = {
  info: { cls: "border-line bg-subtle text-ink-2", icon: <IconInfo size={16} /> },
  warning: { cls: "border-warning-line bg-warning-soft text-warning", icon: <IconAlert size={16} /> },
  danger: { cls: "border-danger-line bg-danger-soft text-danger", icon: <IconX size={16} /> },
  success: { cls: "border-success-line bg-success-soft text-success", icon: <IconCheck size={16} /> },
};

export function StatusBanner({ tone, children }: { tone: "info" | "warning" | "danger" | "success"; children: ReactNode }) {
  const t = BANNER[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-small ${t.cls}`}
    >
      <span className="mt-0.5 shrink-0">{t.icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Small section label used above groups of content. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-caption font-medium text-ink-2">{children}</p>;
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="text-primary">
        <Spinner size={22} />
      </span>
      <p className="text-small text-ink-2">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-5 py-20 text-center">
      <StatusBanner tone="danger">{message}</StatusBanner>
      <div className="flex flex-wrap justify-center gap-3">
        {onRetry && (
          <button onClick={onRetry} className={btnSecondary}>
            Retry
          </button>
        )}
        <Link href="/" className={btnPrimary}>
          Start a new request
        </Link>
      </div>
    </div>
  );
}

/** Key/value row used in breakdowns: label left, tabular value right. */
export function Row({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "text-body font-semibold" : "text-small"}`}>
      <dt className={strong ? "text-ink" : "text-ink-2"}>{label}</dt>
      <dd className="tabular text-right">{value}</dd>
    </div>
  );
}
