import Image from "next/image";
import { BaseLink } from "./BaseLink";
import type { ReactNode } from "react";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { SellerId } from "@/shared/contracts/types";
import { IconAlert, IconCheck, IconImage, IconInfo, IconX } from "./icons";

/* ---------- Buttons (class helpers, so <button> and <Link> share one look) ---------- */
type BtnKind = "primary" | "secondary" | "ghost";
type BtnSize = "sm" | "md" | "lg";
export const btn = (kind: BtnKind = "primary", size: BtnSize = "md", extra = ""): string =>
  `v3-btn v3-btn--${kind}${size === "lg" ? " v3-btn--lg" : size === "sm" ? " v3-btn--sm" : ""}${extra ? ` ${extra}` : ""}`;

/* ---------- Chips ---------- */
export type ChipTone = "neutral" | "primary" | "accent" | "success" | "warn" | "danger";
export function Chip({ tone = "neutral", icon, children, className = "" }: { tone?: ChipTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  const t = tone === "neutral" ? "" : ` v3-chip--${tone}`;
  return (
    <span className={`v3-chip${t} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

/* ---------- Notices: state is always text first; colour and icon only support it ---------- */
const NOTICE: Record<"info" | "warn" | "danger" | "success", { cls: string; icon: ReactNode }> = {
  info: { cls: "border-v3-line bg-v3-soft2 text-v3-ink", icon: <IconInfo size={18} /> },
  warn: { cls: "border-v3-warn-line bg-v3-warn-soft text-v3-warn", icon: <IconAlert size={18} /> },
  danger: { cls: "border-v3-danger-line bg-v3-danger-soft text-v3-danger", icon: <IconX size={18} /> },
  success: { cls: "border-v3-success-line bg-v3-success-soft text-v3-success", icon: <IconCheck size={18} /> },
};
export function Notice({ tone = "info", title, children, className = "" }: { tone?: keyof typeof NOTICE; title?: string; children: ReactNode; className?: string }) {
  const n = NOTICE[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex items-start gap-3 rounded-v3-md border px-4 py-3 text-[0.9rem] leading-snug ${n.cls} ${className}`}>
      <span className="mt-0.5 shrink-0">{n.icon}</span>
      <div className="min-w-0">
        {title && <p className="font-bold">{title}</p>}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg className="v3-spin" width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Three dots for a *recorded* waiting state only (a live agent was asked and has not answered). */
export function TypingDots({ label }: { label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-1 text-v3-ink2">
      {[0, 1, 2].map((k) => (
        <span key={k} aria-hidden className="v3-typing-dot" style={{ "--k": k } as React.CSSProperties} />
      ))}
    </span>
  );
}

/* ---------- Page-level states ---------- */
export function LoadingScreen({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div role="status" className="mx-auto flex max-w-md flex-col items-center gap-5 px-4 py-24 text-center">
      {children}
      <p className="flex items-center gap-2.5 font-semibold text-v3-ink2">
        <span className="text-v3-primary-ink">
          <Spinner size={20} />
        </span>
        {label}
      </p>
    </div>
  );
}

export function ErrorScreen({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-5 px-4 py-20 text-center">
      {children}
      <Notice tone="danger" className="text-left">
        {message}
      </Notice>
      <div className="flex flex-wrap justify-center gap-3">
        {onRetry && (
          <button onClick={onRetry} className={btn("secondary", "md")}>
            Try again
          </button>
        )}
        <BaseLink to="/brief" className={btn("primary", "md")}>
          Start a new mission
        </BaseLink>
      </div>
    </div>
  );
}

/* ---------- Store identity (original monograms; no real brands) ---------- */
export function StoreMark({ id, size = 36, muted = false }: { id: SellerId; size?: number; muted?: boolean }) {
  const b = SELLER_BRANDS[id];
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] font-extrabold tracking-tight text-white"
      style={{ background: b.color, width: size, height: size, fontSize: Math.round(size * 0.38), opacity: muted ? 0.5 : 1, filter: muted ? "grayscale(0.5)" : undefined }}
    >
      {b.monogram}
    </span>
  );
}

/** Awning colour per store. Re-uses the public mark colour; decorative. */
export const awningOf = (id: SellerId): React.CSSProperties => ({ ["--awning" as string]: SELLER_BRANDS[id].color });

/* ---------- Product image: reserves its box so nothing shifts when it loads ---------- */
export function ProductImage({ src, alt, sizes = "96px", className = "", priority = false }: { src: string | null; alt: string; sizes?: string; className?: string; priority?: boolean }) {
  return (
    <div className={`relative aspect-square shrink-0 overflow-hidden rounded-v3-md border border-v3-line bg-v3-soft2 ${className}`}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} unoptimized priority={priority} className="object-contain p-2" />
      ) : (
        <div role="img" aria-label={`No image available for ${alt}`} className="flex h-full w-full flex-col items-center justify-center gap-1 text-v3-ink2">
          <IconImage size={24} />
          <span className="text-xs font-semibold">No image</span>
        </div>
      )}
    </div>
  );
}

/** Label/value row for receipts and summaries. */
export function Row({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "text-lg font-extrabold" : "text-[0.95rem]"}`}>
      <dt className={strong ? "" : "text-v3-ink2"}>{label}</dt>
      <dd className="v3-num text-right font-semibold">{value}</dd>
    </div>
  );
}
