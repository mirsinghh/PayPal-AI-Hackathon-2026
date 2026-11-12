"use client";

import { useEffect, useRef, useState } from "react";
import { usePageVisible, useInView, useReducedMotionPref } from "@/lib/use-motion-env";
import { formatEur } from "@/shared/format";
import { SAMPLE_NEGOTIATION } from "@/shared/sample-negotiation";
import { SELLER_BRANDS } from "@/shared/sellers";
import type { AgentDVisualState } from "@/lib/v3/mascot/manifest";
import { usePreloadAgentD } from "@/lib/v3/mascot/hooks";
import { AgentD } from "@/components/v3/mascot/AgentD";
import { PixelCloud, PixelCoin, PixelSpark, PixelStore } from "@/components/v3/PixelArt";
import { Chip, StoreMark } from "@/components/v3/ui";

/*
 * The hero scene is a *scripted illustration* of one pre-recorded sample (the frozen rule-engine run in
 * shared/sample-negotiation.ts). It is labelled as such on screen and never presented as live store activity.
 * Prices come from that recorded run, so they are real numbers from the real engine, just not the visitor's request.
 */
const offer = SAMPLE_NEGOTIATION.offers[0]; // Brisa Outlet
const OPEN = formatEur(offer.initialPriceCents);
const FINAL = formatEur(offer.finalPriceCents);
const SAVED = formatEur(offer.initialPriceCents - offer.finalPriceCents);
const MISSION = `${SAMPLE_NEGOTIATION.intent.productQuery}, up to ${formatEur(SAMPLE_NEGOTIATION.intent.budgetCents)}`;

interface Step {
  state: AgentDVisualState;
  /** Where Agent D stands, % of the scene width. */
  x: number;
  ms: number;
  say: string;
  /** Offer card: hidden, opening price, or the lowered price. */
  card: "none" | "open" | "final";
  /** Running back to the left: mirror the sprite. */
  flip?: boolean;
}

const STEPS: Step[] = [
  { state: "thinking", x: 18, ms: 2600, say: `Mission: ${MISSION}.`, card: "none" },
  { state: "running", x: 52, ms: 1300, say: "Off to a store…", card: "none" },
  { state: "searching", x: 52, ms: 2000, say: "Checking the price…", card: "open" },
  { state: "offer_received", x: 52, ms: 1500, say: `${SELLER_BRANDS.nova.brand} opened at ${OPEN}.`, card: "open" },
  { state: "counteroffer", x: 52, ms: 2400, say: "Can you do better?", card: "open" },
  { state: "discount", x: 52, ms: 1800, say: `Lower: ${FINAL}!`, card: "final" },
  { state: "success", x: 52, ms: 2800, say: "Best offer found. You decide.", card: "final" },
  { state: "running", x: 18, ms: 1300, say: "Back to my desk…", card: "none", flip: true },
];
const LAST = STEPS.length - 1;
/** Reduced motion shows the finished composition instead of the loop. */
const STATIC_STEP = STEPS[LAST - 1];

/** Agent D runs to a store, reads a price, negotiates and celebrates. Pauses off screen / hidden tab; static under reduced motion. */
export function HeroScene() {
  usePreloadAgentD(["thinking", "running", "searching", "offer_received", "counteroffer", "discount", "success"]);
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root);
  const visible = usePageVisible();
  const reduce = useReducedMotionPref();
  const [i, setI] = useState(0);
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    if (reduce || !inView || !visible) return;
    const t = window.setTimeout(() => {
      if (i === LAST) {
        setI(0);
        setLoop((l) => l + 1);
      } else setI(i + 1);
    }, STEPS[i].ms);
    return () => window.clearTimeout(t);
  }, [i, reduce, inView, visible]);

  const step = reduce ? STATIC_STEP : STEPS[i];
  const live = inView && visible;

  return (
    <div
      ref={root}
      data-live={live}
      className="v3-card v3-scene-sky relative isolate aspect-[5/4] min-h-[360px] overflow-clip sm:min-h-[420px]"
      style={{ containerType: "inline-size" }}
      role="region"
      aria-label="Demo scene: Agent D negotiating a sample deal"
    >
      <div aria-hidden className="v3-dots absolute inset-0 opacity-60" />

      {/* Pixel scenery: clouds drift slowly, the store stands on the right. Decorative. */}
      <PixelCloud className="v3-drift absolute left-0 top-[8%] w-24 opacity-90" style={{ ["--drift" as string]: "70s", ["--delay" as string]: "-20s" }} />
      <PixelCloud className="v3-drift absolute left-0 top-[24%] w-16 opacity-80" style={{ ["--drift" as string]: "95s", ["--delay" as string]: "-60s" }} />
      <PixelCloud className="v3-drift absolute left-0 top-[3%] w-20 opacity-70" style={{ ["--drift" as string]: "110s", ["--delay" as string]: "-5s" }} />
      <div aria-hidden className="absolute bottom-[17%] right-[6%] w-[30%] max-w-[190px]">
        <PixelStore awning={SELLER_BRANDS.nova.color} className="w-full" />
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-center text-xs font-extrabold text-v3-ink">
          <StoreMark id="nova" size={18} /> {SELLER_BRANDS.nova.brand}
        </p>
      </div>
      <div aria-hidden className="v3-ground absolute inset-x-0 bottom-0 h-[17%]" />
      <PixelCoin className="v3-float absolute bottom-[22%] left-[34%] w-5" />
      <PixelSpark className="v3-float absolute left-[8%] top-[42%] w-4" style={{ animationDelay: "-2s" }} />

      {/* Floating offer card: real numbers from the pre-recorded run. */}
      {step.card !== "none" && (
        <div key={step.card} className="v3-pop absolute right-[5%] top-[12%] w-[44%] max-w-[240px] rounded-v3-md border border-v3-line bg-v3-surface p-3 shadow-v3-lift">
          <p className="flex items-center gap-1.5 text-xs font-bold text-v3-ink2">
            <StoreMark id="nova" size={18} /> {SELLER_BRANDS.nova.brand}
          </p>
          <p className="v3-num mt-1.5 font-v3-head text-[1.55rem] font-extrabold leading-none">{step.card === "open" ? OPEN : FINAL}</p>
          <p className="mt-1.5 text-xs font-semibold text-v3-ink2">
            {step.card === "open" ? (
              "Opening offer"
            ) : (
              <>
                <span className="line-through">{OPEN}</span> · <span className="text-v3-success">{SAVED} lower</span>
              </>
            )}
          </p>
        </div>
      )}

      {/* Agent D: transform-only movement; the sprite plays the pack's own animations. */}
      <div
        className="absolute bottom-[9%] left-0 flex flex-col items-center"
        style={{ translate: `calc(${step.x}cqw - 50%) 0`, transition: reduce ? "none" : "translate 1100ms var(--v3-ease)" }}
      >
        <div key={`${loop}-${i}`} aria-hidden className="v3-bubble v3-pop mb-1 max-w-[15rem] text-center text-[0.8rem]">
          {step.say}
        </div>
        <AgentD state={step.state} runKey={`${loop}-${i}`} size="clamp(128px, 34cqw, 220px)" label={null} flip={!!step.flip} priority />
        <span aria-hidden className="v3-shadow-blob -mt-3" />
      </div>

      <p className="sr-only" role="status">
        {step.say}
      </p>
      <Chip tone="neutral" className="absolute bottom-3 left-3 z-10 !bg-v3-surface/95 !text-[0.72rem]">
        Pre-recorded demo scene · not live store activity
      </Chip>
    </div>
  );
}
