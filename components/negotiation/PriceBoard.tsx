"use client";

import { motion, useReducedMotion } from "motion/react";
import { memo, useEffect, useRef, useState } from "react";
import { rejectionLabel, type SellerState } from "@/lib/negotiation-view";
import { duration, ease, spring } from "@/lib/motion";
import { priceX } from "@/lib/stage-geometry";
import { formatEur } from "@/shared/format";
import type { SellerId } from "@/shared/contracts/types";
import { AnimatedMoney } from "@/components/AnimatedMoney";
import { SellerMark } from "@/components/SellerMark";

const COLOR = { line: "#d4d4d8", primary: "#003087", success: "#15803d", muted: "#a1a1aa" } as const;
const ROW_H = 26;
/** Whole euros on the axis (€300), exact cents only where they carry meaning (the prices themselves). */
const eur0 = (cents: number) => (cents % 100 === 0 ? `€${cents / 100}` : formatEur(cents));

/**
 * Price board: how each store's price moved against your budget. The hollow dot is where the store opened, the filled
 * dot is its current price, and the line between them is the concession it made. Every mark comes from a recorded
 * opening or counter-offer; the scale is fixed to your budget so nothing rescales (or jumps) as events arrive.
 */
export const PriceBoard = memo(function PriceBoard({
  sellers,
  budgetCents,
  selectedId,
  onSelect,
}: {
  sellers: SellerState[];
  budgetCents: number;
  selectedId: SellerId | null;
  onSelect: (id: SellerId | null) => void;
}) {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const read = () => setW(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lo = Math.round(budgetCents * 0.7);
  const hi = Math.round(budgetCents * 1.2);
  const xBudget = w ? priceX(budgetCents, lo, hi, w, 0) : 0;

  return (
    <section aria-labelledby="board-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="board-title" className="eyebrow">
          Price board
        </h2>
        <p className="text-caption text-ink-2">Hollow dot: opening price. Filled dot: current price.</p>
      </div>

      <div className="relative mt-4">
        {/* Shared track used to measure the width of every row, with the budget marker spanning all of them. */}
        <div ref={track} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bottom-6">
          {w > 0 && (
            <>
              <span className="absolute inset-y-0 border-l border-dashed border-ink-2" style={{ left: xBudget }} />
              <span className="eyebrow absolute -top-1 -translate-y-full whitespace-nowrap bg-canvas pr-1" style={{ left: Math.min(xBudget, Math.max(0, w - 130)) }}>
                Your budget · {eur0(budgetCents)}
              </span>
            </>
          )}
        </div>

        <ul className="space-y-3 pt-5">
          {sellers.map((s) => {
            const on = selectedId === s.id;
            const open = s.openingCents !== null && w ? priceX(s.openingCents, lo, hi, w) : null;
            const cur = s.priceCents !== null && w ? priceX(s.priceCents, lo, hi, w) : null;
            const dim = s.status === "set_aside";
            const stroke = s.winner ? COLOR.success : dim ? COLOR.muted : COLOR.primary;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!s.discovered}
                  aria-pressed={on}
                  onClick={() => onSelect(on ? null : s.id)}
                  className={`block w-full rounded-md text-left transition-colors duration-(--d1) enabled:hover:bg-subtle ${on ? "bg-subtle" : ""} ${dim ? "opacity-70" : ""}`}
                >
                  <span className="flex items-center justify-between gap-3 px-1">
                    <span className="flex min-w-0 items-center gap-2 text-small font-medium">
                      {s.discovered ? <SellerMark id={s.id} size={18} muted={dim} /> : <span aria-hidden className="size-[18px] rounded-sm border border-dashed border-line-strong" />}
                      <span className="truncate">{s.discovered ? s.brand : "Waiting for a store…"}</span>
                    </span>
                    <span className="shrink-0 text-small">
                      {s.priceCents !== null ? (
                        <span className="flex items-baseline gap-2">
                          {s.previousCents !== null && <span className="tabular text-caption text-ink-2 line-through">{formatEur(s.previousCents)}</span>}
                          <AnimatedMoney cents={s.priceCents} className="font-semibold" />
                        </span>
                      ) : s.status === "set_aside" ? (
                        <span className="text-caption text-ink-2">{rejectionLabel(s.rejectedReason)}</span>
                      ) : s.discovered ? (
                        <span className="text-caption text-ink-2">No offer yet</span>
                      ) : null}
                    </span>
                  </span>
                  <svg aria-hidden width="100%" height={ROW_H} className="block" viewBox={w ? `0 0 ${w} ${ROW_H}` : undefined}>
                    <line x1={0} y1={ROW_H / 2} x2={w || 1} y2={ROW_H / 2} stroke={COLOR.line} strokeWidth={1} strokeDasharray={s.priceCents === null ? "2 5" : undefined} />
                    {w > 0 && open !== null && cur !== null && (
                      <>
                        <motion.line
                          y1={ROW_H / 2}
                          y2={ROW_H / 2}
                          stroke={stroke}
                          strokeWidth={2}
                          strokeLinecap="round"
                          initial={false}
                          animate={{ x1: cur, x2: open }}
                          transition={reduce ? { duration: 0 } : spring.soft}
                        />
                        <circle cx={open} cy={ROW_H / 2} r={4.5} fill="var(--canvas)" stroke={COLOR.muted} strokeWidth={1.5} />
                        <motion.circle
                          cy={ROW_H / 2}
                          r={s.winner ? 7 : 5.5}
                          fill={stroke}
                          stroke="#fff"
                          strokeWidth={2}
                          initial={reduce ? false : { cx: open, opacity: 0 }}
                          animate={{ cx: cur, opacity: 1 }}
                          transition={reduce ? { duration: 0 } : { cx: spring.soft, opacity: ease(duration.micro) }}
                        />
                      </>
                    )}
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="eyebrow mt-1 flex justify-between">
        <span>{eur0(lo)}</span>
        <span>{eur0(hi)}</span>
      </p>
    </section>
  );
});
