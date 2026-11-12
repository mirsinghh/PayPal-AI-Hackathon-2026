"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { activePulses, agentActivity, rejectionLabel, STATUS_LABEL, type Pulse, type SellerState } from "@/lib/negotiation-view";
import { duration, EASE, ease, spring } from "@/lib/motion";
import { arc, arcPath, arcPoint, type Arc, type Pt } from "@/lib/stage-geometry";
import { useInView } from "@/lib/use-motion-env";
import { useParallax } from "@/lib/use-parallax";
import { formatEur } from "@/shared/format";
import { SELLER_BRANDS } from "@/shared/sellers";
import { SELLER_IDS, type NegotiationEvent, type SellerId } from "@/shared/contracts/types";
import { AnimatedMoney } from "@/components/AnimatedMoney";
import { DotGrid } from "@/components/DotGrid";
import { IconCheck, IconX } from "@/components/icons";
import { SellerMark } from "@/components/SellerMark";
import { TypingDots } from "@/components/ui";

/** Node positions as a percentage of the stage. Same composition from 375 px up; chips scale with the container. */
const BUYER = { x: 50, y: 50 };
const SLOTS: Record<SellerId, Pt> = {
  nova: { x: 25, y: 14 },
  orbit: { x: 75, y: 14 },
  prism: { x: 25, y: 86 },
  vertex: { x: 75, y: 86 },
};
/** Concrete colours (not CSS variables) so Motion can interpolate edge state changes. Mirrors the tokens in globals.css. */
const EDGE = { idle: "#d4d4d8", busy: "#003087", winner: "#15803d" } as const;
/** A marker stays on screen exactly as long as it travels, so it never lingers after arriving. */
const PULSE_WINDOW_MS = duration.pulse * 1000;

interface StageProps {
  sellers: SellerState[];
  /** All events visible so far (used for message markers). */
  events: NegotiationEvent[];
  elapsed: number;
  selectedId: SellerId | null;
  onSelect: (id: SellerId | null) => void;
  /** The buyer agent is still working (live run in progress / replay not finished). */
  active: boolean;
  /** Which kind of run this is, for the accessible description. */
  live: boolean;
  /** "sample" = the read-only home-page replay: nodes are not buttons and the map is smaller. */
  variant?: "interactive" | "sample";
}

/**
 * The agent stage. State lives in attributes (SKILL §2.13): `data-speaker` on the buyer node and `data-status`
 * on each store, derived only from recorded events, and CSS reacts to them. Edges are arcs drawn in real pixels from
 * the measured stage size; markers travel exactly along those arcs with transforms. The one ambient loop (the ring
 * around the buyer) is CSS and pauses when the stage is off screen.
 */
export const Stage = memo(function Stage({ sellers, events, elapsed, selectedId, onSelect, active, live, variant = "interactive" }: StageProps) {
  const sample = variant === "sample";
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  useParallax(box);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pulses = useMemo(() => activePulses(events, elapsed, PULSE_WINDOW_MS), [events, elapsed]);
  const speaker = useMemo(() => agentActivity(pulses), [pulses]);
  const bySeller = useMemo(() => new Map(sellers.map((s) => [s.id, s])), [sellers]);
  const winner = sellers.find((s) => s.winner) ?? null;

  const px = (p: Pt): Pt => ({ x: (p.x / 100) * (size?.w ?? 0), y: (p.y / 100) * (size?.h ?? 0) });
  const arcs = useMemo(() => {
    const out = {} as Record<SellerId, Arc>;
    if (!size) return out;
    const a = { x: (BUYER.x / 100) * size.w, y: (BUYER.y / 100) * size.h };
    for (const id of SELLER_IDS) out[id] = arc(a, { x: (SLOTS[id].x / 100) * size.w, y: (SLOTS[id].y / 100) * size.h });
    return out;
  }, [size]);

  const caption =
    speaker.state === "asking" && speaker.sellerId
      ? `Asking ${SELLER_BRANDS[speaker.sellerId].brand}`
      : speaker.state === "receiving" && speaker.sellerId
        ? `Offer from ${SELLER_BRANDS[speaker.sellerId].brand}`
        : "Your buyer agent";

  return (
    <div
      ref={box}
      role="group"
      data-inview={inView}
      aria-label={
        sample
          ? "Sample negotiation map: a buyer agent in the centre and four simulated stores around it, replaying a pre-recorded run of the rule engine."
          : live
            ? "Negotiation map: your buyer agent in the centre, four demo stores around it. Select a store for its offer and history."
            : "Negotiation map: your buyer agent in the centre, four simulated stores around it. Select a store for its offer and history."
      }
      className={`relative w-full overflow-hidden rounded-lg border border-line bg-surface ${sample ? "aspect-[5/4] sm:aspect-[16/11]" : "aspect-[4/5] sm:aspect-[16/10]"}`}
    >
      {/* Background layers drift against the foreground (pointer parallax): that offset is what reads as depth. */}
      <div aria-hidden className="parallax-bg pointer-events-none absolute -inset-5" style={{ ["--depth" as string]: 8 }}>
        <DotGrid />
      </div>
      {active && (
        <div aria-hidden className="parallax-bg pointer-events-none absolute inset-0" style={{ ["--depth" as string]: 14 }}>
          <span className="sonar" />
          <span className="sonar" />
          <span className="sonar" />
        </div>
      )}

      {/* Orbit rings and arc edges, in real pixels. Nothing is drawn until the stage has been measured. */}
      {size && (
        <svg aria-hidden className="absolute inset-0" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
          {[18, 34].map((r) => (
            <ellipse key={r} cx={px(BUYER).x} cy={px(BUYER).y} rx={(r * 0.86 * size.w) / 100} ry={(r * size.h) / 100} fill="none" stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="2 5" />
          ))}

          {SELLER_IDS.map((id) => {
            const s = bySeller.get(id);
            const a = arcs[id];
            if (!s || !a) return null;
            const d = arcPath(a);
            const busy = s.awaitingReply || pulses.some((x) => x.sellerId === id);
            const stroke = s.winner ? EDGE.winner : busy ? EDGE.busy : EDGE.idle;
            if (!s.discovered) return <path key={id} d={d} fill="none" stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="1 5" />;
            if (s.status === "set_aside") return <path key={id} d={d} fill="none" stroke={stroke} strokeWidth={1.25} strokeDasharray="4 5" opacity={0.7} />;
            return (
              <motion.path
                key={id}
                d={d}
                fill="none"
                strokeLinecap="round"
                // The edge draws itself out of the buyer when the store joins (stroke dash only: no layout work).
                initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: winner && !s.winner ? 0.45 : 1, stroke, strokeWidth: s.winner ? 3 : busy ? 2 : 1.5 }}
                transition={{ pathLength: ease(duration.enter), default: ease(duration.state) }}
              />
            );
          })}
        </svg>
      )}

      {/* Message markers travel along the drawn arcs, one per recorded event, moved with transforms. */}
      {size && !reduce && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {pulses.map((pl) => {
            const a = arcs[pl.sellerId];
            if (!a) return null;
            const ev = events.find((e) => e.eventId === pl.key);
            const priceRaw = ev ? (ev.payload.newPriceCents ?? ev.payload.initialPriceCents) : null;
            const price = typeof priceRaw === "number" ? priceRaw : null;
            const landing = pl.direction === "out" ? a.b : a.a;
            return (
              <div key={pl.key}>
                <Marker arc={a} pulse={pl} price={price} />
                {/* One-shot ripple where the message lands, timed to its arrival. */}
                <span className="ripple" style={{ left: landing.x, top: landing.y, animationDelay: `${(duration.pulse * 0.78).toFixed(2)}s` }} />
              </div>
            );
          })}
        </div>
      )}

      {/* Buyer agent */}
      <div
        data-speaker={speaker.state}
        className="group absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
        style={{ left: `${BUYER.x}%`, top: `${BUYER.y}%` }}
      >
        <div className="relative">
          {active && <span aria-hidden className="ring-out absolute inset-0 rounded-full bg-primary" />}
          <span aria-hidden className="orb-ring" />
          <span aria-hidden className="orb-ring" />
          <div className="relative flex size-16 items-center justify-center rounded-full bg-primary text-white shadow-pop transition-transform duration-(--d2) ease-out-soft group-data-[speaker=asking]:scale-[1.06] group-data-[speaker=receiving]:scale-[1.04] sm:size-[4.5rem]">
            <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <circle cx="10" cy="10" r="2.4" fill="currentColor" stroke="none" />
              <path d="M3.5 4.5 8 8.4M16.5 4.5 12 8.4M3.5 15.5 8 11.6M16.5 15.5 12 11.6" />
              <circle cx="3.5" cy="4.5" r="1.3" />
              <circle cx="16.5" cy="4.5" r="1.3" />
              <circle cx="3.5" cy="15.5" r="1.3" />
              <circle cx="16.5" cy="15.5" r="1.3" />
            </svg>
          </div>
        </div>
        {/* Re-mounted by key on every change, so the swap-in keyframe replays (CSS animates, no exit state to stall). */}
        <p key={caption} className="swap-in h-6 whitespace-nowrap rounded-md bg-surface/90 px-1.5 text-caption font-medium leading-6">
          {caption}
        </p>
      </div>

      {/* Seller nodes */}
      {SELLER_IDS.map((id) => {
        const s = bySeller.get(id);
        if (!s) return null;
        const slot = SLOTS[id];
        return (
          <div key={id} className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 ${sample ? "w-[44%] sm:w-[40%] sm:max-w-[210px]" : "w-[45%] sm:w-[236px]"}`} style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
            <SellerNode s={s} selected={selectedId === id} dimmed={!!winner && !s.winner} readOnly={sample} onSelect={() => onSelect(selectedId === id ? null : id)} />
          </div>
        );
      })}
    </div>
  );
});

/** A message in flight. Position is computed from the arc each frame and written to transforms. */
function Marker({ arc: a, pulse, price }: { arc: Arc; pulse: Pulse; price: number | null }) {
  const start = pulse.direction === "out" ? a.a : a.b;
  const x = useMotionValue(start.x);
  const y = useMotionValue(start.y);
  const opacity = useMotionValue(0);
  const scale = useMotionValue(0.7);

  useEffect(() => {
    const ctrl = animate(0, 1, {
      duration: duration.pulse,
      ease: EASE,
      onUpdate: (t) => {
        const u = pulse.direction === "out" ? t : 1 - t;
        const p = arcPoint(a, u);
        x.set(p.x);
        y.set(p.y);
        opacity.set(t < 0.12 ? t / 0.12 : t > 0.8 ? (1 - t) / 0.2 : 1);
        scale.set(0.7 + 0.3 * Math.min(1, t / 0.2));
      },
    });
    return () => ctrl.stop();
    // The marker belongs to one recorded event; the arc is stable for its short life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.span className="absolute left-0 top-0 z-10" style={{ x, y, opacity, scale }}>
      <span className="block -translate-x-1/2 -translate-y-1/2">
        {pulse.direction === "out" ? (
          <span className="block size-3 rounded-full bg-primary shadow-[0_0_0_4px_rgb(0_48_135/0.14)]" />
        ) : (
          <span className="tabular flex items-center gap-1 rounded-md border border-primary bg-surface px-1.5 py-0.5 text-caption font-medium text-primary shadow-xs">
            <span className="size-1.5 rounded-full border border-primary" />
            {price !== null ? formatEur(price) : SELLER_BRANDS[pulse.sellerId].brand}
          </span>
        )}
      </span>
    </motion.span>
  );
}

function SellerNode({ s, selected, dimmed, onSelect, readOnly = false }: { s: SellerState; selected: boolean; dimmed: boolean; onSelect: () => void; readOnly?: boolean }) {
  if (!s.discovered) {
    return (
      <div data-status="waiting" className="flex min-h-[4.25rem] items-center gap-2.5 rounded-lg border border-dashed border-line-strong bg-canvas/80 p-2.5 text-ink-2">
        <span aria-hidden className="size-8 shrink-0 rounded-md border border-dashed border-line-strong" />
        <p className="text-small">Waiting for a store…</p>
      </div>
    );
  }

  const label = [
    s.brand,
    s.priceCents !== null ? formatEur(s.priceCents) : "no offer yet",
    s.status === "set_aside" ? `set aside, ${rejectionLabel(s.rejectedReason)}` : STATUS_LABEL[s.status],
  ].join(", ");

  const Node = readOnly ? motion.div : motion.button;
  const interactive = readOnly
    ? { role: "group", "aria-label": label }
    : { type: "button" as const, onClick: onSelect, "aria-pressed": selected, "aria-label": `${label}. Select to view details.` };
  return (
    <Node
      data-status={s.status}
      {...(interactive as object)}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: s.status === "set_aside" ? 0.72 : dimmed ? 0.78 : 1, scale: s.winner ? 1.03 : 1 }}
      whileHover={readOnly ? undefined : { y: -1 }}
      whileTap={readOnly ? undefined : { scale: 0.98 }}
      transition={spring.snappy}
      className={`relative block w-full rounded-lg border bg-surface p-2.5 text-left shadow-xs transition-[border-color,box-shadow] duration-(--d1) sm:p-3 ${
        s.winner ? "border-success ring-1 ring-success" : selected ? "border-primary ring-1 ring-primary" : "border-line-strong hover:border-ink-2/50"
      }`}
    >
      <span className="flex items-center gap-2">
        <SellerMark id={s.id} size={28} muted={s.status === "set_aside"} />
        <span className="min-w-0 flex-1 truncate text-small font-medium">{s.brand}</span>
        {s.winner && (
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-white">
            <IconCheck size={12} />
            <span className="sr-only">Best match</span>
          </span>
        )}
      </span>
      <span className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-caption text-ink-2">
          {s.status === "set_aside" && <IconX size={12} className="shrink-0" />}
          <span className="truncate">{s.status === "set_aside" ? rejectionLabel(s.rejectedReason) : STATUS_LABEL[s.status]}</span>
          {s.awaitingReply && <TypingDots label="Waiting for this store to reply" />}
        </span>
        {s.priceCents !== null && (
          <span className="flex shrink-0 items-baseline gap-1.5 leading-tight sm:flex-col sm:items-end sm:gap-0">
            {s.previousCents !== null && <span className="tabular text-caption text-ink-2 line-through">{formatEur(s.previousCents)}</span>}
            <AnimatedMoney cents={s.priceCents} className="text-body font-semibold" />
          </span>
        )}
      </span>
    </Node>
  );
}

