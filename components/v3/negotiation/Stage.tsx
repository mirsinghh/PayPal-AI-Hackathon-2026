"use client";

import { useEffect, useRef } from "react";
import { deliveryLabel, warrantyLabel } from "@/lib/offer-view";
import type { SellerState } from "@/lib/negotiation-view";
import { formatEur } from "@/shared/format";
import type { SellerId } from "@/shared/contracts/types";
import { WALK_MS, type Indicator } from "@/lib/v3/mascot/event-map";
import { positionOf } from "@/lib/v3/mascot/director";
import { isSellerId, spotX, stallPresentation, walkingLeft } from "@/lib/v3/stage";
import { useReducedMotionPref } from "@/lib/use-motion-env";
import { AgentDActor, type DirectorHandle } from "@/components/v3/mascot/AgentD";
import { Chip, StoreMark, TypingDots, awningOf } from "@/components/v3/ui";
import { IconAlert, IconPackage, IconShield, IconTruck } from "@/components/v3/icons";

export interface StageProps {
  sellers: SellerState[];
  director: DirectorHandle;
  /** What Agent D is saying right now (an activity sentence derived from the latest recorded event). */
  status: string;
  indicator: Indicator | null;
  selectedId: SellerId | null;
  onSelect: (id: SellerId | null) => void;
  live: boolean;
  /** Landing-page demo: fewer details per store. */
  compact?: boolean;
  /** Pauses ambient animation when the stage is off screen / tab hidden (set by the owner). */
  ambient?: boolean;
  /** Replay speed chosen by the user (1x/2x/4x). Agent D's cadence and walks follow it, so the mascot stays in step with the timeline; live runs are always 1x. */
  speed?: number;
}

/**
 * Agent D's workshop: four store stalls and the street Agent D walks along. Everything here is a view of the
 * persisted events (via deriveSellers + the director); the stage has no data of its own.
 */
export function Stage({ sellers, director, status, indicator, selectedId, onSelect, live, compact = false, ambient = true, speed = 1 }: StageProps) {
  const pace = Math.max(speed, 1);
  const spot = positionOf(director.state);
  const scroller = useRef<HTMLUListElement>(null);
  const reduced = useReducedMotionPref();

  // On small screens the stalls scroll sideways: keep the store Agent D is visiting in view (scrolls the strip only).
  useEffect(() => {
    const strip = scroller.current;
    if (!strip || !isSellerId(spot) || strip.scrollWidth <= strip.clientWidth + 4) return;
    const el = strip.querySelector<HTMLElement>(`[data-seller="${spot}"]`);
    if (el) strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.clientWidth) / 2, behavior: reduced ? "auto" : "smooth" });
  }, [spot, reduced]);

  return (
    <section aria-label="Agent D's negotiation stage" data-live={ambient} className="v3-card v3-scene-sky relative overflow-clip">
      <div aria-hidden className="v3-dots pointer-events-none absolute inset-0 opacity-50" />
      <div className="v3-rail relative flex flex-col gap-3 p-3 sm:p-5" style={{ ["--v3-walk" as string]: `${WALK_MS / pace}ms` }}>
        {/* Agent D: a sticky bar on narrow screens, a street under the stalls on wide ones. */}
        <div className="relative order-1 sticky top-[76px] z-20 -mx-3 -mt-3 rounded-t-v3-lg bg-v3-soft/90 px-3 pt-3 backdrop-blur @2xl:static @2xl:order-2 @2xl:m-0 @2xl:min-h-[290px] @2xl:bg-transparent @2xl:p-0 @2xl:backdrop-blur-none sm:-mx-5 sm:-mt-5 sm:px-5 sm:pt-5">
          <div
            className="v3-mover flex flex-row items-end gap-3 @2xl:flex-col @2xl:items-center @2xl:gap-1"
            style={{ ["--spot-x" as string]: spotX(spot) }}
            data-spot={spot ?? "center"}
          >
            <div aria-hidden className="v3-bubble order-2 max-w-[19rem] @2xl:order-1 @2xl:mb-1">
              {status}
            </div>
            <div className="order-1 flex flex-col items-center @2xl:order-2">
              <AgentDActor director={director} size="clamp(104px, 24cqw, 200px)" label="Agent D" flip={walkingLeft(director.state)} speed={pace} />
              <span aria-hidden className="v3-shadow-blob -mt-2" />
            </div>
          </div>
          <div aria-hidden className="v3-ground absolute inset-x-0 bottom-0 hidden h-2 @2xl:block" />
          {indicator && (
            <div role="status" className="v3-pop absolute right-2 top-2 z-10 max-w-[16rem] sm:right-4 sm:top-4">
              <Chip tone="warn" icon={<IconAlert size={14} />} className="!whitespace-normal">
                {indicator.label}
              </Chip>
            </div>
          )}
        </div>

        <ul ref={scroller} className="v3-snap order-2 pb-2 @2xl:order-1 @2xl:pb-0" aria-label="The four demo stores">
          {sellers.map((s) => (
            <Stall key={s.id} s={s} active={spot === s.id} selected={selectedId === s.id} onSelect={onSelect} live={live} compact={compact} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function Stall({ s, active, selected, onSelect, live, compact }: { s: SellerState; active: boolean; selected: boolean; onSelect: (id: SellerId | null) => void; live: boolean; compact: boolean }) {
  const p = stallPresentation(s);
  const dropped = s.previousCents !== null && s.priceCents !== null && s.priceCents < s.previousCents;
  const o = s.offer;
  const shipping = o ? (o.catalog ? (o.catalog.shippingCents === 0 ? "Free shipping" : `${formatEur(o.catalog.shippingCents)} shipping`) : o.freeShipping ? "Free shipping" : "Paid shipping") : null;
  const eligibility = s.rejectedReason
    ? { text: s.rejectedReason === "over_budget" ? "Not eligible: over your budget" : s.rejectedReason === "out_of_stock" ? "Not eligible: out of stock" : "Not eligible: failed policy check", tone: "warn" as const }
    : s.score !== null
      ? { text: `Eligible · scored ${s.score}/100`, tone: "success" as const }
      : null;

  return (
    <li data-seller={s.id} className="min-w-0">
      <button
        type="button"
        id={`stall-${s.id}`}
        onClick={() => onSelect(selected ? null : s.id)}
        aria-pressed={selected}
        className="v3-stall block h-full w-full cursor-pointer text-left"
        data-active={active}
        data-state={s.status}
        style={awningOf(s.id)}
      >
        <span className="v3-awning block" aria-hidden />
        <span className="relative block p-3.5 @2xl:p-4">
          {active && s.status !== "waiting" && <span aria-hidden className="v3-ping right-4 top-4" key={`${s.id}-${s.history.length}`} />}
          <span className="flex items-center gap-3 @2xl:flex-col @2xl:items-start @2xl:gap-2">
            <StoreMark id={s.id} size={36} muted={s.status === "waiting" || s.status === "set_aside"} />
            <span className="min-w-0">
              <span className="block font-v3-head text-[1.05rem] font-bold leading-tight">{s.brand}</span>
              {!compact && <span className="mt-0.5 block text-xs leading-snug text-v3-ink2">{s.tagline}</span>}
            </span>
          </span>

          <span className="mt-3 flex flex-wrap items-center gap-2">
            <Chip tone={p.tone}>{p.label}</Chip>
            {s.awaitingReply && <TypingDots label={`${s.brand} is replying`} />}
          </span>

          <span className="mt-3 block min-h-[3.4rem]">
            {s.priceCents !== null ? (
              <>
                <span key={s.priceCents} className={`v3-num font-v3-head text-[clamp(1.35rem,2.3cqw,1.75rem)] font-extrabold leading-none ${dropped ? "v3-flash" : "v3-pop"} inline-block px-1 -mx-1`}>
                  {formatEur(s.priceCents)}
                </span>
                <span className="v3-num mt-1.5 block text-xs text-v3-ink2">
                  {dropped ? (
                    <>
                      <span className="line-through">{formatEur(s.previousCents as number)}</span> · opened {formatEur(s.openingCents ?? s.previousCents ?? s.priceCents)}
                    </>
                  ) : s.openingCents !== null && s.openingCents !== s.priceCents ? (
                    <>Opened {formatEur(s.openingCents)}</>
                  ) : (
                    <>Opening offer</>
                  )}
                </span>
              </>
            ) : (
              <span className="text-sm font-semibold text-v3-ink2">
                <span aria-hidden>—</span>
                <span className="sr-only">No offer yet.</span> {s.status === "waiting" ? "Waiting for Agent D" : "No price yet"}
              </span>
            )}
          </span>

          {!compact && o && (
            <span className="mt-3 flex flex-col gap-1.5 border-t border-v3-line pt-3 text-xs font-semibold text-v3-ink2">
              <span className="flex items-center gap-1.5"><IconTruck size={14} /> {deliveryLabel(o.deliveryDays)} delivery</span>
              <span className="flex items-center gap-1.5"><IconShield size={14} /> {warrantyLabel(o.warrantyMonths)} warranty</span>
              <span className="flex items-center gap-1.5"><IconPackage size={14} /> {shipping}</span>
            </span>
          )}

          {!compact && (
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              {eligibility && <Chip tone={eligibility.tone} className="!whitespace-normal">{eligibility.text}</Chip>}
              {live && (s.source === "gemini" || s.source === "groq") && <Chip tone="primary">AI reply</Chip>}
              {live && s.source === "rules_fallback" && <Chip tone="warn">Rules fallback</Chip>}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
