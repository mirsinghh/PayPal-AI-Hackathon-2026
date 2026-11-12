import { SELLER_BRANDS } from "@/shared/sellers";
import type { SellerId } from "@/shared/contracts/types";

/** Original monogram for each fictional merchant (no third-party logos). Decorative: the name always sits next to it. */
export function SellerMark({ id, size = 32, muted = false }: { id: SellerId; size?: number; muted?: boolean }) {
  const p = SELLER_BRANDS[id];
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-tight text-white transition-[filter,opacity] duration-(--d2)"
      style={{
        background: p.color,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.37),
        opacity: muted ? 0.45 : 1,
        filter: muted ? "grayscale(0.6)" : undefined,
      }}
    >
      {p.monogram}
    </span>
  );
}

/** The buyer's own agent. Navy mark so it reads as "you", distinct from every merchant. */
export function BuyerMark({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary text-white"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
        <circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />
        <circle cx="3.5" cy="4.5" r="1.4" />
        <circle cx="16.5" cy="4.5" r="1.4" />
        <circle cx="3.5" cy="15.5" r="1.4" />
        <circle cx="16.5" cy="15.5" r="1.4" />
        <path d="m4.6 5.5 3.6 3.2M15.4 5.5l-3.6 3.2M4.6 14.5l3.6-3.2M15.4 14.5l-3.6-3.2" />
      </svg>
    </span>
  );
}
